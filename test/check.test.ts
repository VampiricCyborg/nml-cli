import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCommit, checkRange, findGitRoot, inferTestCommand } from '../src/check.js';

const temporaryRepos: string[] = [];

async function makeRepo(message: string): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'plub-check-'));
  temporaryRepos.push(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {
    cwd: repo,
  });
  execFileSync('git', ['config', 'user.name', 'Plub Test'], { cwd: repo });
  await writeFile(join(repo, 'file.txt'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
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
    expect(
      JSON.parse(
        await readFile(
          join(repo, '.plub', `${receipt.commit.slice(0, 7)}.json`),
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
});
