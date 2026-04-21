---
date: 2026-04-16
topic: diff-proportional-scaling
idea: 3
phase: 2
status: brainstormed
---

# Diff-Proportional Reviewer Scaling

## Problem Frame

The ce-review skill dispatches reviewer sub-agents based on diff content, not diff size. A 10-line typo fix in a README triggers the same always-on roster (4 persona agents + 2 CE agents) as a 500-line cross-stack refactor. If the typo fix happens to touch a file near a route definition, the orchestrator's content-based selection may also trigger security, api-contract, and stack-specific reviewers, potentially dispatching 9-12 agents for a trivial change.

Each sub-agent receives a prompt built from:

| Component | Size | Per-reviewer? |
|-----------|------|---------------|
| Subagent template (scaffold, output contract, confidence rubric, rules) | ~7.3 KB | Yes (duplicated per agent) |
| Diff-scope rules | ~1.8 KB | Yes (duplicated per agent) |
| Findings schema | ~6.6 KB | Yes (duplicated per agent) |
| Persona file | ~2.7-8.0 KB (median ~3.5 KB) | Yes (unique per agent) |
| Diff content | Variable | Yes (duplicated per agent) |
| Intent summary + file list + PR metadata | ~0.5-2 KB | Yes (duplicated per agent) |

The shared overhead per reviewer (template + scope + schema) is ~15.7 KB before persona and diff content. For a 10-line diff (~300 bytes of actual diff content), dispatching 8 reviewers means paying ~130 KB of prompt overhead to review 300 bytes of changes -- a 430x overhead-to-content ratio. The optimal dispatch granularity guideline (sub-agent prompt overhead should be 1/10th to 1/50th of working context) is violated by 40-200x on small diffs.

The cost is not just tokens. Each sub-agent occupies a parallel execution slot, writes an artifact file, and returns findings that must be validated, deduplicated, and confidence-gated in Stage 5. For trivial diffs, most conditional reviewers return empty findings arrays -- burning compute to confirm there is nothing to find.

## Current State

### Reviewer categories and counts

The persona catalog defines 4 layers of reviewers with 21 total agents:

| Layer | Count | Agents | Selection logic |
|-------|-------|--------|-----------------|
| Always-on personas | 4 | correctness, testing, maintainability, project-standards | Every review, unconditionally |
| CE always-on agents | 2 | agent-native-reviewer, learnings-researcher | Every review, unconditionally |
| Cross-cutting conditional | 8 | security, performance, api-contract, data-migrations, reliability, adversarial, cli-readiness, previous-comments | Orchestrator judgment per diff content |
| Stack-specific conditional | 5 | dhh-rails, kieran-rails, kieran-python, kieran-typescript, julik-frontend-races | Orchestrator judgment per diff content |
| CE conditional | 2 | schema-drift-detector, deployment-verification-agent | Migration files present |

Minimum dispatch: 6 agents (4 always-on personas + 2 CE always-on).
Maximum dispatch: 21 agents (all layers).
Typical dispatch: 8-12 agents (6 always-on + 2-6 conditional).

### How conditional selection works today

Stage 3 of SKILL.md instructs the orchestrator to read the diff and file list, then decide for each conditional persona whether the diff warrants it. Key details:

- Selection is "agent judgment, not keyword matching" (persona catalog, selection rule #2).
- Stack-specific reviewers are "additive" -- they supplement, not replace, cross-cutting reviewers.
- File-type awareness exists: "For diffs that only change instruction-prose files, skip adversarial unless the prose describes auth, payment, or data-mutation behavior."
- Adversarial has a line-count threshold: ">=50 changed lines of executable code."
- `previous-comments` is PR-only: skipped for standalone branch reviews.
- The orchestrator announces the team before spawning but does not wait for confirmation.

### What does NOT exist

- No diff-size awareness in reviewer selection. The orchestrator never counts diff lines to modulate the number of reviewers.
- No cap on total reviewers dispatched. If 15 conditionals match, 15 are spawned.
- No priority ordering among conditional reviewers. When multiple conditionals match, all are included -- there is no mechanism to choose a subset.
- No token-budget reasoning in the dispatch decision. The orchestrator does not consider the aggregate cost of spawning N reviewers.

### Token cost by diff size (modeled)

Assumptions: shared overhead per reviewer = ~16 KB (template + scope + schema + median persona); diff content is duplicated per reviewer; CE always-on agents have similar overhead.

| Diff size | Lines | Diff bytes | Reviewers (typical) | Total prompt cost | Overhead ratio |
|-----------|-------|------------|---------------------|-------------------|----------------|
| Trivial | 1-10 | ~300 B | 8 (6 always + 2 cond) | ~131 KB | 437x |
| Small | 10-50 | ~1.5 KB | 8-10 | ~140-175 KB | 93-117x |
| Medium | 50-200 | ~6 KB | 10-12 | ~220-264 KB | 37-44x |
| Large | 200-500 | ~15 KB | 12-14 | ~372-434 KB | 25-29x |
| Very large | 500+ | ~30 KB | 14-17 | ~644-782 KB | 21-26x |

The overhead ratio improves as diff size increases because the fixed per-reviewer cost becomes a smaller fraction of the total. Capping reviewers on small diffs addresses the worst ratios.

## Requirements

**R1. Diff-size tiers.** The orchestrator must classify the diff into size tiers based on the count of changed lines (additions + deletions). Only executable code lines count toward the tier -- test files, generated files, lockfiles, and instruction-prose Markdown are excluded, consistent with the existing adversarial reviewer's line-counting rule. Tier boundaries:

| Tier | Changed lines | Max conditional reviewers |
|------|---------------|--------------------------|
| Trivial | < 50 | 2 |
| Small | 50-199 | 4 |
| Medium | 200-499 | 6 |
| Large | 500+ | No cap |

These caps apply to conditional reviewers only. The 6 always-on agents (4 personas + 2 CE agents) are never capped.

**R2. Always-on agents are uncapped.** The 4 always-on persona agents (correctness, testing, maintainability, project-standards) and 2 CE always-on agents (agent-native-reviewer, learnings-researcher) must be dispatched on every review regardless of diff size. The diff-proportional cap applies only to the conditional layers.

**R3. Priority ordering for conditional reviewers.** When more conditional reviewers match than the tier cap allows, the orchestrator must select the highest-priority subset. Priority is determined by two factors:

1. **Category priority** (higher categories always outrank lower ones):
   - **Tier 1 -- Content-triggered cross-cutting:** security, reliability, data-migrations, adversarial. These detect risks that no other reviewer category covers. If the diff touches auth middleware and the cap is 2, security must be included even if api-contract and 3 stack-specific reviewers also matched.
   - **Tier 2 -- Structure-triggered cross-cutting:** performance, api-contract, cli-readiness, previous-comments. These detect important but less catastrophic issues.
   - **Tier 3 -- Stack-specific:** dhh-rails, kieran-rails, kieran-python, kieran-typescript, julik-frontend-races. These provide stack-idiomatic feedback that the cross-cutting reviewers partially cover from a generalist perspective.
   - **Tier 4 -- CE conditional:** schema-drift-detector, deployment-verification-agent. These are migration-specific and typically co-occur with data-migrations (already Tier 1).

2. **Content relevance within a tier** (tiebreaker when a tier has more matches than remaining slots): The orchestrator uses its existing judgment about how strongly the diff relates to each reviewer's domain. A diff that heavily modifies auth middleware gives security a higher content-relevance score than a diff that incidentally imports a permission constant.

**R4. Pipeline separation preservation.** The cap must never eliminate an entire review category when that category's trigger condition is met. Specifically:

- If any Tier 1 cross-cutting reviewer's trigger condition is met and the cap has remaining slots, at least one Tier 1 reviewer must be included.
- If the diff touches multiple stacks (e.g., Rails + Python + TypeScript), at least one stack-specific reviewer should be included when slots remain after higher-priority reviewers are placed. The orchestrator selects the stack-specific reviewer whose stack has the most changed lines.
- CE conditional agents (schema-drift-detector, deployment-verification-agent) are domain-specific and low-frequency. When triggered, they should be included unless the cap is already exhausted by higher-priority reviewers. If a trivial diff somehow includes a migration file, the data-migrations reviewer (Tier 1) takes priority over the CE conditional agents.

**R5. Transparent cap reporting.** When the cap excludes reviewers that would otherwise have been selected, the orchestrator must report this in the team announcement:

```text
Review team (cap: 2 conditional for <50 line diff):
- correctness (always)
- testing (always)
- maintainability (always)
- project-standards (always)
- agent-native-reviewer (always)
- learnings-researcher (always)
- security -- new endpoint in routes.rb accepts user-provided redirect URL
- reliability -- retry logic added to payment webhook handler
- [capped] api-contract -- new route definition (priority 2, below cap)
- [capped] kieran-rails -- Rails controller changes (priority 3, below cap)
```

This transparency ensures the user knows what was excluded and can rerun with an override if needed.

**R6. Cap override mechanism.** The user must be able to bypass the diff-proportional cap for a specific review invocation. The mechanism should be a new argument token: `cap:none` or `cap:N` (where N is the desired max conditional reviewers). Examples:

- `ce:review cap:none` -- disable capping, dispatch all matching reviewers
- `ce:review cap:4` -- set the conditional cap to 4 regardless of diff size

This provides an escape hatch when the user knows the diff is high-risk despite being small.

**R7. Line counting specification.** The line count used for tier classification must match the adversarial reviewer's existing definition: count changed lines in diff hunks (additions + deletions), excluding:

- Test files (files in `test/`, `tests/`, `spec/`, `__tests__/` directories, or files matching `*_test.*`, `*.test.*`, `*.spec.*` patterns)
- Generated files (files in `generated/`, `gen/`, or with generated-file markers)
- Lockfiles (`package-lock.json`, `yarn.lock`, `Gemfile.lock`, `bun.lockb`, `Cargo.lock`, `poetry.lock`, `go.sum`)
- Instruction-prose Markdown (`.md` files in skill, agent, or reference directories -- consistent with the existing adversarial file-type awareness rule)

The count should be computed once during Stage 1 (scope detection) and passed to Stage 3 (reviewer selection) as metadata alongside the file list and diff.

**R8. Mode compatibility.** Diff-proportional scaling must work identically across all four review modes (interactive, autofix, report-only, headless). The cap is a dispatch-time decision that precedes mode-specific post-review behavior. No mode should bypass or override the cap unless the user explicitly passes `cap:none`.

**R9. CE conditional agent handling.** CE conditional agents (schema-drift-detector, deployment-verification-agent) count toward the conditional cap. They are Tier 4 in priority ordering. When a diff includes migration files on a trivial diff, the data-migrations persona (Tier 1) takes priority. If slots remain after Tier 1-3 placement, CE conditional agents fill remaining slots. If the cap is exhausted, CE conditionals are capped with the `[capped]` annotation.

**R10. Adversarial threshold interaction.** The adversarial reviewer already has a line-count threshold (>=50 changed executable lines). Under diff-proportional scaling, a diff under 50 lines would never trigger adversarial regardless of the cap. This is consistent -- the adversarial reviewer's own threshold already handles small-diff exclusion. No special interaction logic is needed. For diffs at 50+ lines that trigger adversarial, the reviewer competes at Tier 1 priority for conditional slots.

## Implementation Location

The change is confined to Stage 3 of `plugins/compound-engineering/skills/ce-review/SKILL.md`. No new files, no new scripts, no schema changes. The implementation consists of:

1. **Line-count computation** added to Stage 1 output (one additional metadata line, e.g., `EXECUTABLE_LINES: 42`).
2. **Tier classification** added to Stage 3, before reviewer selection begins.
3. **Priority-ordered selection** replacing the current unbounded "for each conditional, decide yes/no" with "for each conditional, decide yes/no, then rank and cap."
4. **Team announcement update** to include the cap and any `[capped]` reviewers.
5. **Argument token** `cap:none` / `cap:N` added to the argument parsing table in SKILL.md.

No changes to persona files, subagent template, findings schema, or post-dispatch stages (4-6).

## Constraints

**C1. Always-on agents are sacred.** The 6 always-on agents must never be affected by the cap. This is non-negotiable.

**C2. Pipeline separation.** The cap reduces reviewer count but must not eliminate entire review categories. If a 20-line diff touches auth + Python + database migrations, and the cap is 2, the orchestrator must include at least security (Tier 1) and data-migrations (Tier 1). The Python stack-specific reviewer is capped, not the cross-cutting ones.

**C3. No new dependencies.** The implementation is a prose change to SKILL.md. No scripts, no build steps, no new reference files.

**C4. Backward compatibility of output.** The review output format (Stage 6) is unchanged. Findings are still grouped by severity in pipe-delimited tables. The only visible difference is the team announcement listing `[capped]` reviewers and the cap metadata.

**C5. No behavioral regression on large diffs.** Diffs of 500+ lines must dispatch all matching reviewers exactly as they do today. The cap is a ceiling, not a floor -- if a 600-line diff only matches 3 conditionals, all 3 are dispatched.

**C6. Idempotent with existing selection rules.** The cap is applied after the existing selection logic. First, each conditional reviewer is evaluated for relevance (existing behavior). Then, the resulting set is ranked and capped (new behavior). The cap never adds a reviewer -- it only removes lower-priority ones from an already-selected set.

**C7. Consistent line counting.** The executable-line count must use the same exclusion rules as the adversarial reviewer's existing depth calibration. Introducing a second, different line-counting method would create confusion and maintenance burden.

## Edge Cases

**E1. Multi-stack trivial diff.** A 20-line diff modifies 3 files: a Rails controller (8 lines), a Python script (6 lines), and a TypeScript component (6 lines). All 3 stack-specific reviewers match. The cap is 2 conditional reviewers. Resolution: No cross-cutting reviewers matched beyond the always-on set, so both slots go to stack-specific reviewers. The orchestrator picks the 2 stacks with the most changed lines. The third stack-specific reviewer is capped.

**E2. High-risk trivial diff.** A 15-line diff adds `skip_before_action :authenticate_user` to a Rails controller. Security (Tier 1) and kieran-rails (Tier 3) both match. The cap is 2. Resolution: Security takes slot 1 (Tier 1 priority). kieran-rails takes slot 2 (only other match). Both are dispatched.

**E3. Migration-only trivial diff.** A 30-line diff adds a database migration and updates schema.rb. data-migrations (Tier 1, cross-cutting conditional), schema-drift-detector (Tier 4, CE conditional), and deployment-verification-agent (Tier 4, CE conditional) all match. The cap is 2. Resolution: data-migrations takes slot 1 (Tier 1). One CE conditional agent takes slot 2 (schema-drift-detector is higher value for a schema-change-only diff). deployment-verification-agent is capped.

**E4. Zero conditional matches.** A 5-line documentation-only diff matches no conditional reviewers. The cap of 2 is irrelevant -- only the 6 always-on agents are dispatched. This is already the current behavior; no change.

**E5. Cap override on small diff.** A user runs `ce:review cap:none` on a 10-line diff. All matching reviewers are dispatched regardless of diff size. The team announcement omits the cap line. This is equivalent to current behavior.

**E6. Adversarial at boundary.** A 50-line diff triggers adversarial (>= 50 executable lines). The tier is "Small" (50-199 lines), cap is 4 conditional. Adversarial competes at Tier 1 priority alongside any other Tier 1 matches. If security and data-migrations also match, all 3 Tier 1 reviewers take slots 1-3, leaving 1 slot for Tier 2-4.

**E7. previous-comments on a PR review.** A 30-line PR diff has existing review comments. previous-comments (Tier 2) matches, along with security (Tier 1). The cap is 2. Resolution: security takes slot 1 (Tier 1), previous-comments takes slot 2 (Tier 2). Both are dispatched.

**E8. All tiers saturated.** A 150-line diff matches security, reliability, adversarial (Tier 1), performance, api-contract (Tier 2), kieran-rails, kieran-typescript (Tier 3). The cap is 4. Resolution: security, reliability, adversarial fill slots 1-3 (Tier 1). performance takes slot 4 (Tier 2, higher priority than api-contract by content relevance if the diff is more performance-sensitive). api-contract and both stack-specific reviewers are capped.

## Risks

**R-1. Priority ordering disagreement.** The tier assignments (which reviewers are Tier 1 vs Tier 2) are judgment calls. A reasonable person could argue that api-contract should be Tier 1 for API-heavy projects, or that performance should outrank reliability. **Mitigation:** The tier assignments are documented in SKILL.md and can be adjusted. The priority system is a starting point, not a permanent fixture. The `cap:none` override provides an immediate escape hatch.

**R-2. Missed critical finding on small diff.** A capped reviewer would have found a P0 issue that the included reviewers missed. This is the fundamental risk of capping. **Mitigation:** The always-on correctness reviewer catches most logic bugs regardless. Tier 1 priority ensures security and reliability are never capped when they match. The `[capped]` annotation in the team announcement signals to the user that reviewers were excluded. For high-stakes small diffs, users can pass `cap:none`.

**R-3. Line-count gaming.** A developer could split a large change into small PRs to avoid triggering more reviewers. **Mitigation:** This is a human process issue, not a tooling problem. The always-on reviewers still catch most issues. Additionally, reviewers that match based on content (security, reliability) are Tier 1 and will be included regardless of diff size as long as the cap is not exhausted by other Tier 1 matches.

**R-4. Inconsistent counting across platforms.** The line-counting logic is prose in SKILL.md, interpreted by the orchestrating model. Different models may count differently. **Mitigation:** The count does not need to be exact -- it classifies into 4 broad tiers (< 50, 50-199, 200-499, 500+). A 10% variance in counting does not change the tier for most diffs. Boundary cases (48 vs 52 lines) might shift tiers but the difference between 2 and 4 conditional slots is not catastrophic.

**R-5. CE conditional agents starved.** CE conditional agents (Tier 4) are almost never included on trivial diffs because higher-priority reviewers consume the cap first. **Mitigation:** CE conditional agents are migration-specific and co-occur with data-migrations (Tier 1). On migration-only diffs, few other conditionals match, so CE agents naturally fit within the cap. The realistic scenario where CE agents are starved is rare.

## Success Criteria

**S1. Token savings on small diffs.** A review of a < 50-line diff dispatches at most 8 total agents (6 always-on + 2 conditional), down from the current typical 8-12. On a diff that would have triggered 4+ conditional reviewers, the savings are ~64-96 KB of sub-agent prompt overhead (4+ reviewers x ~16 KB each).

**S2. No regression on large diffs.** A review of a 500+ line diff dispatches the same reviewers as it would without diff-proportional scaling.

**S3. Security and reliability never capped when triggered.** On any diff size where security or reliability match, they are included in the dispatched set (assuming the cap has not been fully consumed by other Tier 1 reviewers, which requires 3+ Tier 1 matches on a trivial diff -- an extremely rare scenario).

**S4. Cap transparency.** Every capped review includes the cap metadata in the team announcement, and every excluded reviewer is listed with `[capped]` so the user can assess coverage.

**S5. Override works.** `cap:none` restores full uncapped behavior for any single review invocation.

**S6. Unchanged output quality on medium and large diffs.** Reviews of 200+ line diffs show no detectable change in finding count, severity distribution, or false-positive rate compared to uncapped reviews.

## Estimated Savings

Savings depend on the distribution of diff sizes in actual usage. Modeling against typical development patterns:

| Diff size | % of reviews (est.) | Current conditional reviewers | Capped conditional reviewers | Per-review savings |
|-----------|---------------------|-------------------------------|------------------------------|--------------------|
| Trivial (< 50 lines) | ~40% | 2-6 | 2 | 0-64 KB |
| Small (50-199 lines) | ~30% | 3-8 | 4 | 0-64 KB |
| Medium (200-499 lines) | ~20% | 4-10 | 6 | 0-64 KB |
| Large (500+ lines) | ~10% | 5-12 | No cap | 0 |

**Weighted average savings per review:** ~25-45 KB of sub-agent prompt overhead, realized primarily on the ~40% of reviews that are trivial diffs.

**Annual context budget impact:** For a developer running ~10 reviews per week, ~4 are trivial. At ~40 KB average savings per trivial review, that is ~160 KB/week or ~8 MB/year of reduced sub-agent prompt spend. The savings manifest as faster review completion (fewer parallel agents to wait for), lower API cost (fewer sub-agent calls), and reduced noise (fewer empty-findings returns to merge/dedup).

The primary value proposition is not raw token savings but improved overhead-to-content ratio on small diffs -- moving from 400x+ overhead to ~100x, which is still above the 10-50x optimal range but a meaningful improvement achievable with a single conditional in the dispatch logic.
