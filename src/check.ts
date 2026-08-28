import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import { extractClaim, type Claim } from './claim-parser.js';
import { type VerificationResult, verifyCommand } from './verifier.js';

const execFileAsync = promisify(execFile);

export type CheckVerdict =
  'verified' | 'false_claim' | 'no_claim' | 'low_confidence_claim';

export interface CheckReceipt {
  commit: string;
  claim: Claim;
  verification: VerificationResult | null;
  verdict: CheckVerdict;
  timestamp: string;
}

export interface CheckOptions {
  commit?: string;
  testCmd?: string;
  cwd?: string;
  timeoutMs?: number;
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

  if (claim.type === 'none') {
    verdict = 'no_claim';
  } else {
    const testCmd = options.testCmd ?? (await inferTestCommand(cwd));
    if (!testCmd) {
      throw new Error('Unable to infer a test command. Pass --test-cmd explicitly.');
    }
    verification = await verify(testCmd, cwd, options.timeoutMs);
    verdict =
      claim.confidence === 'low'
        ? 'low_confidence_claim'
        : verification.passed
          ? 'verified'
          : 'false_claim';
  }

  const receipt: CheckReceipt = {
    commit,
    claim,
    verification,
    verdict,
    timestamp: new Date().toISOString(),
  };
  const receiptDir = join(cwd, '.plumb');
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
  } else {
    lines.push(`Verdict: ${receipt.verdict}`);
  }
  lines.push(
    `Receipt: .plumb/${receipt.commit.slice(0, 7)}.json`,
    `Timestamp: ${receipt.timestamp}`,
  );
  return lines.join('\n');
}

function formatClaim(claim: Claim): string {
  return claim.type === 'none'
    ? 'none detected'
    : `tests_pass (${claim.confidence}; matched "${claim.matchedText}")`;
}
