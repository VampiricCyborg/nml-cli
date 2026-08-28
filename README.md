# plumb

`plumb` independently verifies “tests pass” claims made in git commits by re-running the project’s tests and writing a shareable receipt.

## The problem

AI coding agents routinely report success (“tests pass”, “added auth”, “fixed the bug”) without anything independently checking those claims against the actual system. This is a trust problem: “done” may mean verified or merely asserted.

## How it works

1. Extract a narrow tests-pass claim from a git commit message.
2. Ignore agent-reported output and re-run the real test command from the git root.
3. Compare the claim with the fresh result and write a JSON receipt under `.plumb/`.

When `package.json` contains `scripts.test`, the command defaults to `npm test`; otherwise pass `--test-cmd` explicitly. The git root is detected automatically from nested directories.

## Prior art / how this differs

This is an incremental extension of an established evidence-and-gating pattern, not a new category.

- [MartinLoop](https://martinloop.com/) is a shipped CLI/MCP tool for agent budgets, verification gates, rollback/stop rules, and signed per-run receipts. `plumb` is narrower: it targets individual developers and hackathon teams, extracts a claim from an existing commit, and emits a simple per-claim receipt.
- [HORKOS](https://github.com/VeritasForge/demiurge) is part of the Demiurge ecosystem and provides deterministic Claude Code evidence-audit hooks. `plumb` is a standalone git-focused CLI with commit-message claim extraction and a fresh test check.
- [EviBound](https://arxiv.org/abs/2511.05524) is an academic framework for autonomous research agents using approval and MLflow-backed evidence gates. `plumb` targets local software repositories and one claim type: “tests pass”.

The narrow difference is individual/hackathon-focused usage, commit-message claim extraction, and one claim type end-to-end.

## Install and quickstart

Requires Node.js 20+ and git.

```sh
git clone <repository-url>
cd plumb-cli
npm install
npm run build
npm link
plumb check
```

From any directory inside a repository, `plumb check` checks `HEAD` with inferred `npm test`. Use an explicit command when needed:

```sh
plumb check --test-cmd "python -m pytest"
plumb check --range main..feature-branch
plumb check --range origin/main..HEAD --json
```

Range mode checks only commits containing supported claims. Receipts are written to `.plumb/<short-sha>.json`.

Install the optional pre-push check and remove it later with:

```sh
plumb install-hook
plumb uninstall-hook
```

A `false_claim` blocks the push. Git’s explicit override remains available: `git push --no-verify`.

## Verdicts and receipts

- `verified`: a high-confidence tests-pass claim followed by a passing fresh test run.
- `false_claim`: a high-confidence claim followed by a failed or timed-out test run.
- `low_confidence_claim`: indirect language such as “CI is passing”.
- `no_claim`: no supported claim; range mode skips receipt creation for these commits.

`--json` includes the commit, claim, test result, raw output, exit code, duration, verdict, and timestamp.

## Demo

The cross-platform POSIX demo is [scripts/demo-false-claim.sh](scripts/demo-false-claim.sh). A Windows PowerShell equivalent is [scripts/demo-false-claim.ps1](scripts/demo-false-claim.ps1).

```sh
npm run build
sh scripts/demo-false-claim.sh
```

Both scripts create a temporary repository, make an agent-authored commit claiming “tests pass”, deliberately fail the test command, and show the `false_claim` verdict.

## Current scope and explicit non-goals

**In scope (MVP):**

- Parse claims from a single source type first — a git commit message or PR description (not full chat logs initially; that’s harder and more novel, save for v2).
- Support one claim type end-to-end: **“tests pass.”** Independently re-run the actual test suite fresh (ignore any reported output) and compare to the claim.
- Output a simple structured receipt: claim → verified/failed → evidence (raw test output or exit code).
- CLI tool, single language/framework target (Node.js/npm projects) for v1.

**Out of scope (MVP):**

- General claim types like “added auth” or “fixed the bug” (requires mapping arbitrary natural-language claims to arbitrary checks — hard, save for v2+).
- Budget/spend governance (MartinLoop’s territory).
- Compliance/audit trail, cryptographic signing, multi-agent orchestration.
- IDE/agent-hook integration (Claude Code hooks, Cursor rules) — start as a standalone CLI, integrate later if it proves useful.
- Multi-language support beyond the first target stack.

**Explicit non-goal:** re-implementing MartinLoop, EviBound, or HORKOS. If 70% of the MVP is already covered by an existing open-source tool, extend/fork/build on it and say so rather than quietly reinventing it.

## Roadmap / deferred work

- **General claim types:** deferred until real usage validates demand and safe mappings to checks.
- **Chat-log parsing:** deferred because commit messages are the smallest reproducible source boundary; transcripts are noisier and provider-specific.
- **Budget governance:** deferred because spend caps, rollback, compliance, and multi-agent operations are MartinLoop-style territory outside this MVP’s individual-builder focus.
- **IDE/agent integrations:** deferred until standalone CLI and pre-push usage validate demand.

## Development

```sh
npm install
npm run build
npm run lint
npm test
```

CI runs build, lint, and tests on pushes and pull requests.
