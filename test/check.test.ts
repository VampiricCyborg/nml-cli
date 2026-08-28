import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCommit } from '../src/check.js';

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
});
