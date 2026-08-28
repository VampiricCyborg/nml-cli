import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractClaim } from '../src/claim-parser.js';
import { verifyCommand } from '../src/verifier.js';

const fixtures = resolve('test/fixtures');

describe('extractClaim', () => {
  it('detects an explicit tests-pass claim with high confidence', () => {
    expect(extractClaim('fixed the login bug, all tests pass now')).toEqual({
      type: 'tests_pass',
      matchedText: 'all tests pass',
      sourceText: 'fixed the login bug, all tests pass now',
      confidence: 'high',
    });
  });
  it('does not detect unrelated work', () => {
    expect(extractClaim('refactored the auth module')).toEqual({ type: 'none' });
  });
  it('does not promote vague language into a test claim', () => {
    expect(extractClaim('should be working now')).toEqual({ type: 'none' });
    expect(extractClaim('looks fixed')).toEqual({ type: 'none' });
  });
  it('handles empty and very long input without a false positive', () => {
    expect(extractClaim('')).toEqual({ type: 'none' });
    expect(extractClaim('ordinary text '.repeat(10000))).toEqual({ type: 'none' });
  });
  it('does not mistake “tests pass through” for a test result', () => {
    expect(extractClaim('tests pass through this middleware')).toEqual({ type: 'none' });
  });
  it('classifies indirect status language as low confidence', () => {
    expect(extractClaim('CI passing and all green')).toMatchObject({
      type: 'tests_pass',
      confidence: 'low',
    });
  });
});

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
