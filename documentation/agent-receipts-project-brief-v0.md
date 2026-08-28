# Project Brief: Claim Verification for Vibe-Coded / Agent-Built Projects

*Working name: "Receipts" — draft v1*

---

## 1. Problem Statement

AI coding agents routinely report success ("tests pass ✅", "added auth", "fixed the bug") without anything independently checking that claim against the actual state of the system. The person or team relying on the agent has no cheap, fast way to know whether "done" means *verified* or just *asserted*.

This is not a code-quality problem (linting, security scanning) — it's a **trust problem**: the gap between what an agent *says* it did and what it *actually* did. That gap is exactly what causes shipped bugs, false "tests pass" claims, and wasted review time when a human has to manually re-check work the agent already claimed to have checked.

## 2. Existing Solutions — What I Found

The space is **more crowded and more mature than it first looked**. This is not a greenfield idea; it's an active, fast-moving niche with real (if young) products already shipping the core mechanic.

| Project | What it actually does | Maturity |
|---|---|---|
| **EviBound** (arXiv, Nov 2025) | Academic framework for autonomous *research* agents. Dual gates (pre-execution schema approval + post-execution MLflow-API evidence check) block claims not backed by a queryable run ID and artifact check. Reduced hallucinated "done" claims from 100%→0% in their benchmark. | Research paper, not a shipped dev tool; tightly coupled to MLflow/research workflows. |
| **MartinLoop** | A real, shipped, open-source (Apache-2.0) CLI/MCP tool: wraps Claude Code/Codex/Gemini runs in a budget cap, an independent verifier gate (e.g. `--verify "npm test"`), rollback-on-failure, and a **signed JSONL "receipt"** per run showing spend, verifier result, and an explicit `EVIDENCE_BOUNDARY` marker when proof is incomplete. Has npm package, Product Hunt launch, ~45 GitHub stars, is actively iterating. | Live product, closest existing analogue to the "receipts" idea — budget/verify/receipt loop is essentially already built. |
| **HORKOS** (Claude Code hooks variant) | Deterministic, zero-LLM-call evidence-audit hooks for Claude Code; a "stop hook" that blocks completion without proof. Part of a broader "Demiurge" house-of-tools project. | Small, active, hobbyist-scale. |
| **"Proof-gate" (one-file)**, **Casper**, **"Proof of Done" manifesto** | Multiple small, single-purpose Claude Code/Cursor/Codex hooks/skills that block an agent's "done" signal until a check runs. Several converge on the same "proof-of-done" GitHub topic. | Numerous, fragmented, low individual traction, but the *pattern* (stop-hook + evidence) is clearly a recognized, repeated idea, not a novel insight. |
| **agent-device** (Callstack) | Gives agents a live feedback loop for *mobile app* verification — real device/simulator inspection, not chat-claim re-checking, but same "let the agent prove it via the real system" philosophy. Used by Expensify, Shopify. | Mature, backed, in production use. |
| **pluribus-context** | Verifies *context/rules files* loaded correctly across agent tools (fidelity/load evidence), not code claims. Adjacent, not a direct competitor. | Active, npm-published. |
| **AgentBound** (arXiv) | Cryptographically signed, countersigned receipts for agent *actions* generally (broader governance framing, not code-specific). | Research/framework, not a coding tool. |

**Revised read on saturation:** the original 8–9/10 "novelty" estimate for "evidence-backed verification" was optimistic. The *stop-hook-plus-evidence-check* pattern for coding agents already exists in multiple shipped and semi-shipped forms (MartinLoop most notably). What's **not** yet consolidated:

- A tool aimed at **individual vibe-coders / hackathon teams** rather than enterprise agent-ops or research pipelines (MartinLoop and EviBound both skew toward teams/orgs governing spend and compliance).
- A tool centered on **natural-language claim extraction** (parsing "I added auth and tests pass" out of a commit message or chat transcript, then mapping each claim to a specific check) rather than a single blanket `--verify` command per run.
- A tool with a **simple, shareable, human-readable pass/fail receipt per claim**, not per run — closer to a PR-review artifact than an ops dashboard.

This narrows, but does not eliminate, the gap. The honest framing: this is an **incremental, well-scoped extension of an existing, validated pattern** — not a new category.

## 3. Audience

**Primary:** Solo developers and small teams shipping AI-agent-generated code fast — hackathon participants, indie hackers, "vibe coders" — who currently have no cheap way to sanity-check an agent's self-report before merging or demoing.

**Secondary:** Reviewers/teammates/judges who receive AI-agent-built work from someone else and want a fast trust signal without re-reading the whole diff.

**Explicitly not the primary audience (already served):** enterprise engineering orgs needing spend governance, compliance/audit trails, or multi-agent-ops observability — MartinLoop, EviBound-style frameworks, and AgentBound already target this segment more directly.

## 4. Scope

**In scope (MVP):**
- Parse claims from a single source type first — a git commit message or PR description (not full chat logs initially; that's harder and more novel, save for v2).
- Support one claim type end-to-end: **"tests pass."** Independently re-run the actual test suite fresh (ignore any reported output) and compare to the claim.
- Output a simple structured receipt: claim → verified/failed → evidence (raw test output or exit code).
- CLI tool, single language/framework target (e.g., Node.js/npm projects) for v1.

**Out of scope (MVP):**
- General claim types like "added auth" or "fixed the bug" (requires mapping arbitrary natural-language claims to arbitrary checks — hard, save for v2+).
- Budget/spend governance (MartinLoop's territory).
- Compliance/audit trail, cryptographic signing, multi-agent orchestration.
- IDE/agent-hook integration (Claude Code hooks, Cursor rules) — start as a standalone CLI, integrate later if it proves useful.
- Multi-language support beyond the first target stack.

**Explicit non-goal:** re-implementing MartinLoop, EviBound, or HORKOS. If, after reviewing their source, 70% of the MVP is already covered by an existing open-source tool, the right move is to extend/fork/build on top of it and clearly say so — not quietly reinvent it.

## 5. The 5W1H

**Who**
- Who builds it: one solo developer (portfolio project).
- Who uses it: individual devs and small teams working with AI coding agents, hackathon teams, PR reviewers.
- Who else is in this space: MartinLoop (Vakeesan Mahalingam / Keesan12), EviBound (Ruiying Chen, arXiv), HORKOS/Demiurge maintainers, Casper and proof-gate hobby maintainers — all worth crediting/differentiating against explicitly in any writeup.

**What**
- A CLI tool that extracts a claim from a commit/PR description and independently re-verifies it against the real system, starting narrowly with "tests actually pass," producing a simple pass/fail evidence receipt.

**When**
- Runs at PR-creation time or pre-merge (git hook or manual CLI invocation) — a checkpoint moment, not continuous monitoring.
- Project timeline: scope the MVP (single claim type, single stack) to be buildable and demoable within a few weeks solo, per the doc's own advice to start narrow.

**Where**
- Local dev environment / CI, operating on a git repo. No hosted service needed for MVP — keeps infra cost and scope near zero.

**Why**
- Because current agent workflows let "done" be self-reported with no independent check, and the closest existing tools (MartinLoop, EviBound) target org-level spend/governance or research pipelines rather than the individual builder who just wants "did my agent actually do what it said."
- As a portfolio project: demonstrates systems thinking (deterministic verification vs. LLM-graded trust) and direct relevance to a hiring theme in agentic-coding infrastructure, rather than another chat-wrapper project.

**How**
1. Extract claim(s) from a commit message / PR description using a narrow, rule-based or lightly-LLM-assisted parser — scoped first to detecting "tests pass"-type claims only.
2. Re-run the actual test suite fresh, ignoring any agent-reported results.
3. Compare claim to real outcome; emit a structured pass/fail receipt (JSON + human-readable summary).
4. Validate demand before over-building: ask hackathon/vibe-coder contacts directly whether they'd run a tool that says "prove it" before they ship — test the skepticism-as-a-feature framing on real people first.
5. Before/while building, read MartinLoop's and HORKOS's source directly to confirm what's already solved vs. what's genuinely left to build.
