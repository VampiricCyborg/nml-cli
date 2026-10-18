import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCommit, checkRange, findGitRoot, inferTestCommand } from '../src/check.js';

const temporaryRepos: string[] = [];

async function makeRepo(message: string): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'nml-check-'));
  temporaryRepos.push(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {
    cwd: repo,
  });
  execFileSync('git', ['config', 'user.name', 'NML Test'], { cwd: repo });
  await writeFile(join(repo, 'file.txt'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', message], { cwd: repo });
  return repo;
}

async function makeTestRepo(message: string, testSource: string): Promise<string> {
  const repo = await makeRepo(message);
  await writeFile(join(repo, 'test.js'), testSource);
  execFileSync('git', ['add', 'test.js'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'add committed test'], { cwd: repo });
  execFileSync('git', ['reset', '--soft', 'HEAD^'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', message], { cwd: repo });
  return repo;
}

afterEach(async () => {
  await Promise.all(
    temporaryRepos
      .splice(0)
      .map((repo) => rm(repo, { recursive: true, force: true })),
  );
});

describe('checkCommit', () => {
  it('finds the repository root and infers npm test from package.json', async () => {
    const repo = await makeRepo('implement feature; all tests pass');
    await writeFile(join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
    const nested = join(repo, 'nested');
    await (await import('node:fs/promises')).mkdir(nested);
    expect(await findGitRoot(nested)).toBe(repo);
    expect(await inferTestCommand(repo)).toBe('npm test');
    const receipt = await checkCommit({ cwd: nested }, async (command, cwd) => ({
      command,
      cwd,
      exitCode: 0,
      passed: true,
      stdout: '',
      stderr: '',
      durationMs: 1,
      timestamp: new Date().toISOString(),
      timedOut: false,
    }));
    expect(receipt.verdict).toBe('verified');
  });

  it('returns verified when the claimed test command passes', async () => {
    const repo = await makeRepo('implement feature; all tests pass');
    const receipt = await checkCommit({
      testCmd: 'node -e "process.exit(0)"',
      cwd: repo,
    });

    expect(receipt.verdict).toBe('verified');
    expect(receipt.verification?.passed).toBe(true);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      nmlVersion: '0.2.0',
      checkout: { mode: 'worktree', sha: receipt.commit },
      environment: { node: process.version, platform: process.platform },
    });
    expect(
      JSON.parse(
        await readFile(
          join(repo, '.nml', `${receipt.commit.slice(0, 7)}.json`),
          'utf8',
        ),
      ),
    ).toEqual(receipt);
  });

  it('returns false_claim and records the failed independent run', async () => {
    const repo = await makeRepo('implement feature; tests pass');
    const receipt = await checkCommit({
      testCmd: 'node -e "process.exit(1)"',
      cwd: repo,
    });

    expect(receipt.verdict).toBe('false_claim');
    expect(receipt.verification?.passed).toBe(false);
  });

  it('returns no_claim and never invokes the verifier', async () => {
    const repo = await makeRepo('implement feature without test status');
    let verifierCalled = false;
    const receipt = await checkCommit(
      { testCmd: 'node -e "process.exit(1)"', cwd: repo },
      async () => {
        verifierCalled = true;
        throw new Error('verifier should not run for no claim');
      },
    );

    expect(receipt.verdict).toBe('no_claim');
    expect(receipt.verification).toBeNull();
    expect(verifierCalled).toBe(false);
  });

  it('checks only claimed commits in a range', async () => {
    const repo = await makeRepo('base change');
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    await writeFile(join(repo, 'file.txt'), 'claimed\n');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'feature; tests pass'], { cwd: repo });
    const feature = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    await writeFile(join(repo, 'file.txt'), 'other\n');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'unrelated change'], { cwd: repo });
    const receipts = await checkRange(`${base}..${feature}`, { cwd: repo, testCmd: 'ignored' }, async () => ({
      command: 'ignored', cwd: repo, exitCode: 0, passed: true, stdout: '', stderr: '', durationMs: 1,
      timestamp: new Date().toISOString(), timedOut: false,
    }));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].commit).toBe(feature);
  });

  it('verifies the committed tests instead of a modified working tree', async () => {
    const repo = await makeTestRepo('implementation; all tests pass', 'process.exit(1)\n');
    await writeFile(join(repo, 'test.js'), 'process.exit(0)\n');

    const receipt = await checkCommit({ cwd: repo, testCmd: 'node test.js' });

    expect(receipt.verdict).toBe('false_claim');
    expect(receipt.checkout).toEqual({ mode: 'worktree', sha: receipt.commit });
  });

  it('verifies a passing committed test even when the working tree is broken', async () => {
    const repo = await makeTestRepo('implementation; all tests pass', 'process.exit(0)\n');
    await writeFile(join(repo, 'test.js'), 'process.exit(1)\n');

    const receipt = await checkCommit({ cwd: repo, testCmd: 'node test.js' });

    expect(receipt.verdict).toBe('verified');
  });

  it('returns inconclusive for timeout and leaves no linked worktree', async () => {
    const repo = await makeTestRepo('implementation; all tests pass', 'setInterval(() => {}, 1000)\n');

    const receipt = await checkCommit({ cwd: repo, testCmd: 'node test.js', timeoutMs: 300 });
    const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim().split(/^worktree /m).filter(Boolean);

    expect(receipt).toMatchObject({
      verdict: 'inconclusive',
      reason: 'timeout',
      verification: { reason: 'timeout' },
    });
    expect(worktrees).toHaveLength(1);
  });

  it('returns inconclusive when the test command cannot be found', async () => {
    const repo = await makeRepo('implementation; all tests pass');

    const receipt = await checkCommit({ cwd: repo, testCmd: 'nml-command-that-does-not-exist' });

    expect(receipt).toMatchObject({ verdict: 'inconclusive', reason: 'command_not_found' });
  });

  it('returns inconclusive when dependency setup fails', async () => {
    const repo = await makeTestRepo('implementation; all tests pass', 'process.exit(0)\n');

    const receipt = await checkCommit({
      cwd: repo,
      testCmd: 'node test.js',
      setupCmd: 'node -e "process.exit(1)"',
    });

    expect(receipt).toMatchObject({
      verdict: 'inconclusive',
      reason: 'setup_failed',
      verification: { reason: 'setup_failed', passed: false },
    });
  });

  it('can explicitly verify in place and rejects a mismatched checkout', async () => {
    const repo = await makeRepo('implementation; all tests pass');
    await writeFile(join(repo, 'file.txt'), 'changed\n');

    const receipt = await checkCommit({ cwd: repo, inPlace: true, testCmd: 'node -e "process.exit(0)"' });

    expect(receipt).toMatchObject({
      verdict: 'inconclusive',
      reason: 'working_tree_mismatch',
      checkout: { mode: 'working-tree' },
    });
  });
});
