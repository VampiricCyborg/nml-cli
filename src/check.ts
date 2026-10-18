import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import process from 'node:process';
import packageJson from '../package.json' with { type: 'json' };
import { extractClaim, type Claim } from './claim-parser.js';
import { type VerificationResult, verifyCommand } from './verifier.js';

const execFileAsync = promisify(execFile);

export type CheckVerdict =
  | 'verified'
  | 'false_claim'
  | 'no_claim'
  | 'low_confidence_claim'
  | 'inconclusive';

export type InconclusiveReason =
  | 'timeout'
  | 'spawn_error'
  | 'command_not_found'
  | 'setup_failed'
  | 'checkout_failed'
  | 'working_tree_mismatch';

export interface CheckoutInfo {
  mode: 'worktree' | 'working-tree';
  sha: string;
}

export interface CheckReceipt {
  schemaVersion: 1;
  nmlVersion: string;
  commit: string;
  claim: Claim;
  verification: VerificationResult | null;
  verdict: CheckVerdict;
  reason?: InconclusiveReason;
  checkout: CheckoutInfo;
  environment: {
    node: string;
    platform: NodeJS.Platform;
  };
  timestamp: string;
}

export interface CheckOptions {
  commit?: string;
  testCmd?: string;
  cwd?: string;
  timeoutMs?: number;
  setupCmd?: string;
  inPlace?: boolean;
}

export type Verify = typeof verifyCommand;

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.trimEnd();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to inspect commit "${args.at(-1)}": ${message}`);
  }
}

/** Find the repository root, including when invoked from a nested directory. */
export async function findGitRoot(start = process.cwd()): Promise<string> {
  let current = resolve(start);
  while (true) {
    try {
      await access(join(current, '.git'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error(`Unable to find a git repository from "${start}".`);
      }
      current = parent;
    }
  }
}

/** The MVP convention is deliberately simple: a package test script means npm test. */
export async function inferTestCommand(repoRoot: string): Promise<string | undefined> {
  try {
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, unknown>;
    };
    return typeof packageJson.scripts?.test === 'string' ? 'npm test' : undefined;
  } catch {
    return undefined;
  }
}

async function hasFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function gitStatus(cwd: string): Promise<string> {
  return git(['status', '--porcelain'], cwd);
}

async function removeWorktree(repoRoot: string, worktreePath: string, parentPath: string): Promise<void> {
  try {
    await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
      timeout: 1000,
    });
  } catch {
    // A just-killed Windows process may briefly keep its cwd locked. The
    // forced removal below and prune still clean the registration.
  }
  await rm(parentPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await execFileAsync('git', ['worktree', 'prune'], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

export async function checkCommit(
  options: CheckOptions,
  verify: Verify = verifyCommand,
): Promise<CheckReceipt> {
  const cwd = await findGitRoot(options.cwd ?? process.cwd());
  const ref = options.commit ?? 'HEAD';
  const commit = await git(['rev-parse', ref], cwd);
  const message = await git(['log', '-1', '--format=%B', ref], cwd);
  const claim = extractClaim(message);
  let verification: VerificationResult | null = null;
  let verdict: CheckVerdict;
  let reason: InconclusiveReason | undefined;
  let checkout: CheckoutInfo = { mode: 'worktree', sha: commit };

  if (claim.type === 'none') {
    verdict = 'no_claim';
  } else {
    const testCmd = options.testCmd ?? (await inferTestCommand(cwd));
    if (!testCmd) {
      throw new Error('Unable to infer a test command. Pass --test-cmd explicitly.');
    }
    if (options.inPlace) {
      checkout = { mode: 'working-tree', sha: commit };
      const head = await git(['rev-parse', 'HEAD'], cwd);
      if (head !== commit || (await gitStatus(cwd)) !== '') {
        verdict = 'inconclusive';
        reason = 'working_tree_mismatch';
      } else {
        verification = await verify(testCmd, cwd, options.timeoutMs);
      }
    } else {
      const parentPath = await mkdtemp(join(tmpdir(), 'nml-worktree-'));
      const worktreePath = join(parentPath, 'checkout');
      let added = false;
      try {
        try {
          await execFileAsync('git', ['worktree', 'add', '--detach', worktreePath, commit], {
            cwd,
            maxBuffer: 1024 * 1024,
          });
          added = true;
        } catch {
          reason = 'checkout_failed';
        }
        if (added) {
          const setupCmd = options.setupCmd ?? (await hasFile(join(worktreePath, 'package-lock.json')) ? 'npm ci' : undefined);
          if (setupCmd) {
            const setup = await verify(setupCmd, worktreePath, options.timeoutMs);
            if (!setup.passed) {
              verification = { ...setup, reason: 'setup_failed' };
              reason = 'setup_failed';
            }
          }
          if (!reason) verification = await verify(testCmd, worktreePath, options.timeoutMs);
        }
      } finally {
        if (added) await removeWorktree(cwd, worktreePath, parentPath);
        else await rm(parentPath, { recursive: true, force: true });
      }
    }
    if (reason) verdict = 'inconclusive';
    else if (verification?.reason) {
      reason = verification.reason;
      verdict = 'inconclusive';
    } else {
      verdict = claim.confidence === 'low'
        ? 'low_confidence_claim'
        : verification?.passed
          ? 'verified'
          : 'false_claim';
    }
  }

  const receipt: CheckReceipt = {
    schemaVersion: 1,
    nmlVersion: packageJson.version,
    commit,
    claim,
    verification,
    verdict,
    ...(reason ? { reason } : {}),
    checkout,
    environment: {
      node: process.version,
      platform: process.platform,
    },
    timestamp: new Date().toISOString(),
  };
  const receiptDir = join(cwd, '.nml');
  await mkdir(receiptDir, { recursive: true });
  await writeFile(
    join(receiptDir, `${commit.slice(0, 7)}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
  return receipt;
}

export async function checkRange(
  range: string,
  options: Omit<CheckOptions, 'commit'>,
  verify: Verify = verifyCommand,
): Promise<CheckReceipt[]> {
  const cwd = await findGitRoot(options.cwd ?? process.cwd());
  const commits = (await git(['rev-list', '--reverse', range], cwd)).split('\n').filter(Boolean);
  const receipts: CheckReceipt[] = [];
  for (const commit of commits) {
    const message = await git(['log', '-1', '--format=%B', commit], cwd);
    if (extractClaim(message).type !== 'none') {
      receipts.push(await checkCommit({ ...options, commit, cwd }, verify));
    }
  }
  return receipts;
}

export function formatCheckRangeSummary(receipts: CheckReceipt[]): string {
  return receipts.length === 0
    ? 'No tests-pass claims found in the commit range.'
    : receipts.map(formatCheckSummary).join('\n\n');
}

export function formatCheckSummary(receipt: CheckReceipt): string {
  const lines = [
    `Commit: ${receipt.commit}`,
    `Claim: ${formatClaim(receipt.claim)}`,
  ];
  if (receipt.verification) {
    lines.push(
      `Verification: ${receipt.verification.passed ? 'PASSED' : 'FAILED'}`,
    );
  } else {
    lines.push('Verification: NOT RUN (no tests-pass claim)');
  }

  if (receipt.verdict === 'false_claim') {
    lines.push(
      '',
      '!!! FALSE CLAIM CAUGHT !!!',
      'The commit claimed tests pass, but the independent test run failed.',
      'Verdict: false_claim',
    );
  } else if (receipt.verdict === 'inconclusive') {
    lines.push(`Verdict: inconclusive (${receipt.reason ?? 'unknown reason'})`);
  } else {
    lines.push(`Verdict: ${receipt.verdict}`);
  }
  lines.push(
    `Receipt: .nml/${receipt.commit.slice(0, 7)}.json`,
    `Timestamp: ${receipt.timestamp}`,
  );
  return lines.join('\n');
}

function formatClaim(claim: Claim): string {
  return claim.type === 'none'
    ? 'none detected'
    : `tests_pass (${claim.confidence}; matched "${claim.matchedText}")`;
}
