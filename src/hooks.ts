import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { findGitRoot } from './check.js';

const execFileAsync = promisify(execFile);
const marker = '# nml pre-push hook (managed)';

const hookContents = `#!/bin/sh
${marker}
set -u

while read -r local_ref local_sha remote_ref remote_sha
do
  case "$remote_sha" in
    0000000000000000000000000000000000000000) range="$local_sha^..$local_sha" ;;
    *) range="$remote_sha..$local_sha" ;;
  esac
  if ! nml check --range "$range"; then
    echo "nml: push blocked because a commit contains a false_claim." >&2
    echo "nml: override only when necessary with: git push --no-verify" >&2
    exit 1
  fi
done
exit 0
`;

async function hookPath(repoRoot: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: repoRoot });
  const path = stdout.trim();
  const hooksDir = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') ? path : join(repoRoot, path);
  return join(hooksDir, 'pre-push');
}

export async function installHook(start = process.cwd()): Promise<string> {
  const repoRoot = await findGitRoot(start);
  const path = await hookPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  try {
    const existing = await readFile(path, 'utf8');
    if (!existing.includes(marker)) throw new Error(`A pre-push hook already exists at ${path}; refusing to overwrite it.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('refusing to overwrite')) throw error;
  }
  await writeFile(path, hookContents, 'utf8');
  if (process.platform !== 'win32') await chmod(path, 0o755);
  return path;
}

export async function uninstallHook(start = process.cwd()): Promise<string> {
  const repoRoot = await findGitRoot(start);
  const path = await hookPath(repoRoot);
  try {
    const existing = await readFile(path, 'utf8');
    if (!existing.includes(marker)) throw new Error(`The pre-push hook at ${path} is not managed by nml; refusing to remove it.`);
    await rm(path);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('refusing to remove') || (error as NodeJS.ErrnoException).code !== 'ENOENT')) throw error;
  }
  return path;
}
