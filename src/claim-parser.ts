export type ClaimType = 'tests_pass' | 'none';
export type ClaimConfidence = 'high' | 'low';

export interface TestsPassClaim {
  type: 'tests_pass';
  matchedText: string;
  sourceText: string;
  confidence: ClaimConfidence;
}

export interface NoClaim {
  type: 'none';
}

export type Claim = TestsPassClaim | NoClaim;

type ClaimPattern = { pattern: RegExp; confidence: ClaimConfidence };

// What may follow "pass/passes/passing" for it to read as a *status* ("tests
// pass now", "tests passing on node 8", "tests pass, time for a PR") rather
// than a verb with an object ("test passing parameter", "tests pass the
// method", "the test passes invalid values"). An allow-list is deliberate:
// anything not recognised as a status continuation is NOT treated as a claim.
const STATUS_END =
  '(?=[ \\t]*(?:\\r?\\n|$|[.,;:!?)\\]…✅✓–—-])|\\s+(?:now|again|here|locally|fine|cleanly|successfully|everywhere|too|as\\s+well|this\\s+time|on|in|under|with|without|using|for|after|before|against|across|at|once|since|and|but)\\b)';

// "tests pass" / "all tests are passing" and singular forms.
const TESTS_PASS = new RegExp(
  '\\b(?:all\\s+)?tests?\\s+(?:are\\s+)?pass(?:es|ed|ing)?\\b' + STATUS_END,
  'gi',
);

// A conditional ("if tests are passing…") is not a claim about this commit.
const CONDITIONAL_PREFIX = /\b(?:if|unless|until|whether|when)\s+(?:the\s+)?$/i;

// An imperative or goal ("make the tests pass", "get tests passing") describes
// the intent of a change, not a result, so it is only ever low confidence.
const GOAL_PREFIX =
  /\b(?:make|makes|made|making|get|gets|got|getting|fix|fixes|fixed|fixing|help|helps)\s+(?:(?:the|all|these|those|our|regular|remaining|failing)\s+)*$/i;

// Other explicit test-result language is high confidence. CI/status shorthand
// is intentionally low confidence because it may describe more than test results.
const otherPatterns: ClaimPattern[] = [
  {
    pattern: /\btest\s+suite\s+pass(?:es|ed|ing)?\b/i,
    confidence: 'high',
  },
  { pattern: /✅\s*tests?\b/i, confidence: 'high' },
  { pattern: /\bCI\s+(?:is\s+)?pass(?:es|ed|ing)?\b/i, confidence: 'low' },
  { pattern: /\ball\s+green\b/i, confidence: 'low' },
];

function makeClaim(
  sourceText: string,
  matchedText: string,
  confidence: ClaimConfidence,
): TestsPassClaim {
  return { type: 'tests_pass', matchedText, sourceText, confidence };
}

export function extractClaim(sourceText: string): Claim {
  let lowCandidate: TestsPassClaim | undefined;

  for (const match of sourceText.matchAll(TESTS_PASS)) {
    const prefix = sourceText.slice(0, match.index);
    if (CONDITIONAL_PREFIX.test(prefix)) continue;
    if (GOAL_PREFIX.test(prefix)) {
      lowCandidate ??= makeClaim(sourceText, match[0], 'low');
      continue;
    }
    return makeClaim(sourceText, match[0], 'high');
  }

  for (const { pattern, confidence } of otherPatterns) {
    const match = pattern.exec(sourceText);
    if (match?.[0]) {
      if (confidence === 'high') return makeClaim(sourceText, match[0], 'high');
      lowCandidate ??= makeClaim(sourceText, match[0], 'low');
    }
  }

  return lowCandidate ?? { type: 'none' };
}

export function formatClaimSummary(claim: Claim): string {
  if (claim.type === 'none') return 'No “tests pass” claim detected.';
  return [
    'Claim detected: tests pass',
    `Matched text: ${claim.matchedText}`,
    `Confidence: ${claim.confidence}`,
  ].join('\n');
}
