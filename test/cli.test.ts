import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyCommand } from '../src/verifier.js';

const fixtures = resolve('test/fixtures');

describe('verifyCommand', () => {
  it('reports a passing command', async () => {
    const result = await verifyCommand('npm test', resolve(fixtures, 'passing-project'));
    expect(result).toMatchObject({ exitCode: 0, passed: true, timedOut: false });
    expect(result.stdout).toContain('passing fixture');
  });
  it('reports a failing command and captures stderr', async () => {
    const result = await verifyCommand('npm test', resolve(fixtures, 'failing-project'));
    expect(result).toMatchObject({ exitCode: 1, passed: false, timedOut: false });
    expect(result.stderr).toContain('failing fixture');
  });
  it('kills a hanging command at the timeout', async () => {
    const startedAt = Date.now();
    const result = await verifyCommand('npm test', resolve(fixtures, 'hanging-project'), 500);
    expect(result).toMatchObject({ passed: false, timedOut: true });
    expect(result.durationMs).toBeGreaterThanOrEqual(400);
    expect(result.durationMs).toBeLessThan(5000);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
  it('fails clearly for a command that cannot be executed', async () => {
    const result = await verifyCommand('not-a-real-command', '.');
    expect(result.passed).toBe(false);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
