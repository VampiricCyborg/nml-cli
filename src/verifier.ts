import { access, stat } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import process from 'node:process';

export interface VerificationResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  passed: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  timestamp: string;
  timedOut: boolean;
}

export class VerificationError extends Error {}

async function validateCwd(cwd: string): Promise<void> {
  try {
    await access(cwd);
    if (!(await stat(cwd)).isDirectory()) {
      throw new VerificationError(`Working directory is not a directory: ${cwd}`);
    }
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw new VerificationError(`Working directory does not exist or is inaccessible: ${cwd}`);
  }
}

function killProcessTree(child: ReturnType<typeof spawn>): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    child.kill();
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // The process may already have exited between child.kill and taskkill.
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

export async function verifyCommand(
  command: string,
  cwd: string = process.cwd(),
  timeoutMs = 300_000,
): Promise<VerificationResult> {
  if (!command.trim()) throw new VerificationError('Command must not be empty.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new VerificationError('Timeout must be greater than zero.');
  }
  await validateCwd(cwd);
  const timestamp = new Date().toISOString();
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    child.stdout?.on('data', (chunk: Buffer | string) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer | string) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      stderr += `\nCommand timed out after ${timeoutMs}ms.\n`;
      killProcessTree(child);
      // Do not wait for a descendant that may keep stdio handles open after
      // the process tree has been terminated.
      finish(null);
    }, timeoutMs);
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode,
        passed: exitCode === 0 && !timedOut,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timestamp,
        timedOut,
      });
    };
    child.once('error', (error: NodeJS.ErrnoException) => {
      stderr += `Unable to execute command: ${error.message}\n`;
      finish(null);
    });
    child.once('close', (exitCode) => finish(exitCode));
  });
}

export function formatSummary(result: VerificationResult): string {
  const status = result.timedOut ? 'FAILED (timeout)' : result.passed ? 'PASSED' : 'FAILED';
  return [
    `Result: ${status}`,
    `Command: ${result.command}`,
    `Working directory: ${result.cwd}`,
    `Exit code: ${result.exitCode ?? 'not available'}`,
    `Duration: ${result.durationMs}ms`,
    `Timestamp: ${result.timestamp}`,
    `Timed out: ${result.timedOut}`,
    result.stdout ? `\nstdout:\n${result.stdout.trimEnd()}` : '',
    result.stderr ? `\nstderr:\n${result.stderr.trimEnd()}` : '',
  ].filter(Boolean).join('\n');
}
