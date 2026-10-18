import { describe, expect, it } from 'vitest';
import { extractClaim } from '../src/claim-parser.js';

// Regression cases taken from real commits in public repositories (express,
// requests, httpx, fastify, commander.js, pluggy, click). These were used to
// FIX the parser, so they are a regression set, not a held-out benchmark.
const falsePositives: Array<[string, string]> = [
  ['commander.js 7a0baab', 'Test passing parameter to allowUnknownOptions'],
  [
    'express cada9f6',
    "If tests are passing and everything works, don't let things change",
  ],
  ['fastify 47185b8', 'test: fix typo in tap test pass message'],
  ['httpx ab41a5d', 'Test passing explicit backend separately'],
  ['pluggy 0194e63', 'The test passes invalid values to the instance'],
  ['requests 4aa4f82', 'Make the tests pass the method to Request'],
];

const genuine: Array<[string, string]> = [
  ['express bac22ca', 'all tests pass now'],
  ['express 73d2603', 'updated specs and example apps\nall tests passing\n'],
  ['express 9d09637', 'Tests pass under node --version v0.1.24'],
  ['express 0796c1d', 'ignore connect method so tests pass in 0.11.'],
  ['requests ca85b4e', 'Tests pass this time.'],
  ['requests f01694e', 'All tests pass, time for a PR.'],
  ['httpx 42c6686', 'Updated URL class, tests pass'],
  ['fastify 3083a56', 'Updated deps and tests passing on node 8.'],
  ['own: neurascan', '85 tests pass; ruff is clean.'],
];

const goals: Array<[string, string]> = [
  ['click 14c9b1a', 'Made tests pass on 3.x'],
  ['requests c25a72e', 'Make the regular tests pass'],
  ['requests e68dd5d', 'Get tests passing on Python 3.'],
  ['httpx 3b9060e', 'Make the test pass'],
];

describe('claim parser: real-world regressions', () => {
  it.each(falsePositives)('does not flag %s', (_id, msg) => {
    expect(extractClaim(msg)).toEqual({ type: 'none' });
  });
  it.each(genuine)('keeps %s as a high-confidence claim', (_id, msg) => {
    expect(extractClaim(msg)).toMatchObject({
      type: 'tests_pass',
      confidence: 'high',
    });
  });
  it.each(goals)('treats goal wording %s as low confidence', (_id, msg) => {
    expect(extractClaim(msg)).toMatchObject({
      type: 'tests_pass',
      confidence: 'low',
    });
  });
  it('prefers a later high-confidence claim over an earlier goal', () => {
    expect(
      extractClaim('Make the tests pass\n\nall tests pass now'),
    ).toMatchObject({
      confidence: 'high',
    });
  });
});
