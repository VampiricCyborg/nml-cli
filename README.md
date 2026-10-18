# nml

![CI](https://github.com/VampiricCyborg/nml-cli/actions/workflows/ci.yml/badge.svg)
![node](https://img.shields.io/badge/node-%3E%3D20-blue)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

`nml` independently verifies “tests pass” claims made in Git commits. It reads the commit message, detects a supported claim with deterministic rules, runs the tests against that exact commit, and writes a shareable receipt instead of trusting a coding agent’s report.

## Install

Requires Node.js 20 or newer and Git.

```bash
npm install -g @madhav_ms/nml-cli
```

For contributors:

```bash
git clone https://github.com/VampiricCyborg/nml-cli.git
cd nml-cli
npm install
npm run build
npm link
```

## Quickstart

From any directory inside a Git repository:

```bash
nml check
```

If the target commit has a `package.json` test script, nml infers `npm test`.
Use another test command when needed:

```bash
nml check --test-cmd "python -m pytest"
```

By default, each claimed commit is checked in a fresh detached Git worktree at
that commit. The current working tree is not used, so later edits cannot change
the verdict. A worktree starts without dependencies. For Node projects with a
`package-lock.json`, nml automatically runs `npm ci`; provide another setup
command when needed:

```bash
nml check --setup-cmd "npm install"
```

Check a specific commit or a range:

```bash
nml check --commit HEAD
nml check --range main..feature-branch
nml check --range origin/main..HEAD --json
```

Use `--in-place` only when intentionally verifying the current checkout. nml
returns `inconclusive` if its HEAD differs from the target or the tree is dirty.
Use `--strict` to make inconclusive results exit nonzero too.

## Verdicts and receipts

- `verified`: a high-confidence claim was followed by a fresh test run exiting 0.
- `false_claim`: a high-confidence claim was followed by a completed test run with a non-zero exit code.
- `low_confidence_claim`: indirect status language was detected; the result is recorded but not promoted to a definitive claim.
- `inconclusive`: checkout, setup, timeout, command execution, or working-tree validation prevented a fair verdict. This does not mean the tests failed.
- `no_claim`: no supported claim was found. Range mode skips these commits.

Use `--json` for machine-readable output. Schema version 1 receipts include:

- the full commit SHA and extracted claim;
- checkout mode and SHA;
- nml version and runtime environment;
- command, exit code, duration, output, and timeout state;
- verdict and an inconclusive reason when applicable.

The commit SHA, claim, checkout mode/SHA, nml version, and verdict are stable
for the same inputs. Timestamp, duration, captured output, and environment can
vary between runs. A receipt is evidence of one run, not a cryptographic
signature.

## Pre-push hook

Install the managed hook inside a repository:

```bash
nml install-hook
git push origin feature-branch
```

The hook blocks pushes only when a commit produces `false_claim`. Inconclusive
results do not block by default. Git’s normal bypass remains available:

```bash
git push --no-verify
```

Remove the managed hook with `nml uninstall-hook`.

## Security and trust boundary

`nml` runs the configured test and setup commands as arbitrary code with the
permissions of the current user. Only run it on repositories you trust. A
subprocess and detached worktree are not a security sandbox: commands may have
network, filesystem, and other side effects. Never interpolate an untrusted
commit message, ref, or repository file into a shell command; pass commands
explicitly through `--test-cmd` and `--setup-cmd`.

## Supported now

- Deterministic tests-pass claim detection in Git commit messages.
- Exact-commit verification in detached worktrees.
- Optional dependency setup and explicit inconclusive verdicts.
- Versioned JSON receipts and human-readable or JSON CLI output.
- Single-commit and range checks plus an optional pre-push hook.
- Node.js/npm projects by default, with custom commands supported.

## Not supported yet

- Claims other than tests-pass, chat-log parsing, or arbitrary feature verification.
- Languages and package managers without an explicitly supplied command.
- Budget governance, compliance signing, multi-agent orchestration, or sandboxing.
- LLM-based verdicts. Detector comparisons are evaluation-only work; the default verdict path remains deterministic.

## Why not just CI?

CI answers “do tests pass?” after code is pushed. nml checks what a commit says
about its tests against that exact commit before you push, and it also works in
repositories without CI. Whether this catches enough false claims to matter in
normal usage is still unproven.

## Validation

The parser development benchmark contains 24 regression examples: 12 genuine
claims, 6 goal statements, and 6 false positives. The current development run
is precision 1.000, recall 1.000, F1 1.000 (12 true positives, 0 false
positives, 0 false negatives). These examples were used during the parser fix,
so this is a regression measurement rather than a held-out estimate.

The held-out file contains candidate examples and is intentionally skipped by
the runner until a human confirms every label. Recall in real-world use is
unknown. A small self-run check across 23 personal repositories (338 commits)
flagged 13 genuine claims; some Dart/Flutter claims could not be reproduced
without their SDKs. This is not a user study, and no false claim has yet been
found in the wild.

Run the benchmark with:

```bash
npm run bench
```

## Demo

The scripts directory contains a reproducible demo that creates a temporary
repository with a commit claiming “tests pass”, makes its test fail, and shows
the resulting `false_claim` verdict.

```bash
npm run build
bash scripts/demo-false-claim.sh
# Windows PowerShell:
powershell -ExecutionPolicy Bypass -File .\scripts\demo-false-claim.ps1
```

## Development

```bash
npm install
npm run build
npm run lint
npm test
```

CI runs build, lint, and test checks on pushes and pull requests.

## Prior art

nml builds on an established evidence-and-gating pattern; it does not claim to
invent that category. MartinLoop, HORKOS, and EviBound are acknowledged as
related work. nml is narrower: it targets individual developers and small
teams, extracts a claim from a commit message, and produces a receipt for one
deterministic claim type.

## License

MIT
