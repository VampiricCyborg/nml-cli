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

// Explicit test-result language is high confidence. CI/status shorthand is
// intentionally low confidence because it may describe more than test results.
const claimPatterns: ClaimPattern[] = [
  {
    pattern: /\b(?:all\s+)?tests?\s+(?:are\s+)?pass(?:es|ed|ing)?\b(?!\s+through\b)/i,
    confidence: 'high',
  },
  {
    pattern: /\btest\s+suite\s+pass(?:es|ed|ing)?\b/i,
    confidence: 'high',
  },
  { pattern: /✅\s*tests?\b/i, confidence: 'high' },
  { pattern: /\bCI\s+(?:is\s+)?pass(?:es|ed|ing)?\b/i, confidence: 'low' },
  { pattern: /\ball\s+green\b/i, confidence: 'low' },
];

export function extractClaim(sourceText: string): Claim {
  for (const { pattern, confidence } of claimPatterns) {
    const match = pattern.exec(sourceText);
    if (match?.[0]) {
      return {
        type: 'tests_pass',
        matchedText: match[0],
        sourceText,
        confidence,
      };
    }
  }
  return { type: 'none' };
}

export function formatClaimSummary(claim: Claim): string {
  if (claim.type === 'none') return 'No “tests pass” claim detected.';
  return [
    'Claim detected: tests pass',
    `Matched text: ${claim.matchedText}`,
    `Confidence: ${claim.confidence}`,
  ].join('\n');
}
