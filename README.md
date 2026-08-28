# plub

`plub` independently verifies “tests pass” claims made in git commits by re-running the project’s tests and writing a shareable receipt.

## The problem

AI coding agents routinely report success — “tests pass”, “added auth”, “fixed the bug” — without anything independently checking that claim against the actual state of the system. The person or team relying on the agent has no cheap, fast way to know whether “done” means verified or just asserted.

This is not primarily a code-quality problem. It is a trust problem: the gap between what an agent says it did and what it actually did. That gap causes shipped bugs and wasted review time when a human has to manually re-check work the agent already claimed to have checked.

## How it works

The MVP loop is deliberately deterministic:

1. Extract a narrow tests-pass claim from a git commit message.
2. Ignore any test output reported by the agent.
3. Re-run the real test command from the repository root.
4. Compare the claim with the fresh result and write a JSON receipt under `.plub/`.

The default test command is `npm test` when the repository’s `package.json` contains a `scripts.test` entry. Otherwise, pass `--test-cmd` explicitly. `plub` finds the git root automatically when invoked from a nested directory.

## Prior art / how this differs

This project builds on an established evidence-and-gating pattern; it does not claim to invent that category.

- [MartinLoop](https://martinloop.com/) is a shipped CLI/MCP tool for running coding agents with budgets, verification gates, rollback/stop rules, and signed per-run receipts. `plub` is narrower and aimed at an individual developer or hackathon team: it starts from an existing git commit, extracts a claim from its message, and emits a simple receipt for that claim rather than governing an agent run or spend.
- [HORKOS](https://github.com/VeritasForge/demiurge) is part of the Demiurge tooling ecosystem and uses deterministic Claude Code evidence-audit hooks to block completion without proof. `plub` is a standalone git-focused CLI: its current integration is a pre-push hook, and its narrow differentiator is commit-message claim extraction plus a fresh test check.
- [EviBound](https://arxiv.org/abs/2511.05524) is an academic governance framework for autonomous research agents, using approval and post-execution evidence gates tied to queryable artifacts such as MLflow runs. `plub` targets local software repositories and a single claim type, “tests pass,” rather than research workflow governance.

The practical scope difference is intentionally small: individual/hackathon-focused usage, commit-message claim extraction, and one claim type end-to-end. This is an incremental extension of a validated pattern, not a new category.

## Install

Requires Node.js 20 or newer and git.

```sh
git clone <repository-url>
cd vibe-coder
npm install
npm run build
npm link
```

For a local checkout without linking, use `node dist/cli.js` in the examples below.

## Quickstart

From any directory inside a git repository:

```sh
plub check
```

If `package.json` has a test script, `plub` infers `npm test`. To provide another command:

```sh
plub check --test-cmd "python -m pytest"
```

Check a single ref or all commits introduced by a branch:

```sh
plub check --commit HEAD
plub check --range main..feature-branch
plub check --range origin/main..HEAD --json
```

Commits without a tests-pass claim are skipped in range mode. Each claimed commit gets a receipt in `.plub/<short-sha>.json`.

Install the optional pre-push check:

```sh
plub install-hook
git push origin feature-branch
```

The hook checks commits about to be pushed and blocks a push when a claim produces `false_claim`. Git’s normal bypass remains available for an intentional override:

```sh
git push --no-verify
```

Remove the managed hook with:

```sh
plub uninstall-hook
```

## Verdicts and receipts

- `verified`: a high-confidence tests-pass claim was followed by a passing fresh test run.
- `false_claim`: a high-confidence claim was followed by a failing or timed-out test run.
- `low_confidence_claim`: indirect language such as “CI is passing” was detected; the test result is recorded but the wording is intentionally not treated as a definitive claim.
- `no_claim`: no supported claim was found. In range mode, these commits do not create receipts.

Use `--json` for machine-readable output. Receipts include the commit SHA, extracted claim, test command/result, raw stdout/stderr, exit code, duration, verdict, and timestamp.

## Demo

The reproducible before/after terminal demo is [scripts/demo-false-claim.ps1](scripts/demo-false-claim.ps1). After building, run:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\demo-false-claim.ps1
```

It creates a temporary repository, makes an agent-authored commit claiming “tests pass”, deliberately makes the test command fail, and shows `plub` returning `false_claim`.

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

**Explicit non-goal:** re-implementing MartinLoop, EviBound, or HORKOS. If, after reviewing their source, 70% of the MVP is already covered by an existing open-source tool, the right move is to extend/fork/build on top of it and clearly say so — not quietly reinvent it.

## Roadmap / deferred work

- **General claim types:** deferred until real usage shows that claims beyond “tests pass” are frequent and can be mapped to checks safely. Arbitrary claims such as “added auth” or “fixed the bug” need a substantially broader evidence model.
- **Chat-log parsing:** deferred because commit-message extraction is the smallest useful source boundary. Chat transcripts are noisier, provider-specific, and harder to associate with one reproducible repository state.
- **Budget governance:** deferred because spend caps, rollback, compliance, and multi-agent operations are already central to tools such as MartinLoop and outside this MVP’s individual-builder focus.
- **IDE/agent integrations:** deferred until the standalone CLI and pre-push workflow validate demand; the next obvious integration should be chosen from observed usage rather than assumed.

## Development

```sh
npm install
npm run build
npm run lint
npm test
```

CI runs the same build, lint, and test checks on pushes and pull requests.
