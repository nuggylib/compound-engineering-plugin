---
title: "refactor: Diff-Proportional Reviewer Scaling for ce-review"
type: refactor
status: planned
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-diff-proportional-scaling-requirements.md
---

# refactor: Diff-Proportional Reviewer Scaling for ce-review

## Overview

Add diff-proportional reviewer caps to ce-review so that the number of conditional reviewers scales with diff size. A 10-line typo fix dispatches at most 2 conditional reviewers (8 total) instead of the current unbounded 6-12. The change is confined to `plugins/compound-engineering/skills/ce-review/SKILL.md` -- prose edits only, no new files, no scripts, no schema changes.

## Problem Frame

The orchestrator dispatches conditional reviewers based on diff content but ignores diff size. A trivial diff triggers the same reviewer roster as a 500-line refactor. Each reviewer carries ~16 KB of prompt overhead (template + scope rules + schema + persona), so dispatching 8 reviewers for a 300-byte diff produces a 430x overhead-to-content ratio. Capping conditional reviewers proportional to diff size addresses the worst ratios without affecting large-diff coverage.

(see origin: `docs/brainstorms/2026-04-16-diff-proportional-scaling-requirements.md`)

## Requirements Trace

| Req | Summary | Addressed by |
|-----|---------|-------------|
| R1 | Diff-size tiers (4 tiers based on executable changed lines) | Unit 2 (tier classification in Stage 1), Unit 3 (tier table in Stage 3) |
| R2 | Always-on agents are uncapped | Unit 3 (explicit statement in Stage 3) |
| R3 | Priority ordering for conditional reviewers (4-tier priority) | Unit 3 (priority system in Stage 3) |
| R4 | Pipeline separation preservation (no category elimination) | Unit 3 (category preservation rule in Stage 3) |
| R5 | Transparent cap reporting with `[capped]` annotations | Unit 4 (team announcement update) |
| R6 | Cap override mechanism (`cap:none` / `cap:N`) | Unit 1 (argument token) |
| R7 | Line counting specification (matching adversarial rules) | Unit 2 (line-count computation in Stage 1) |
| R8 | Mode compatibility (all 4 modes) | Unit 5 (mode compatibility verification) |
| R9 | CE conditional agent handling (Tier 4 priority) | Unit 3 (CE conditional placement in priority table) |
| R10 | Adversarial threshold interaction (>=50 line threshold preserved) | Unit 3 (note in tier classification) |

## Scope Boundaries

### In Scope

- `plugins/compound-engineering/skills/ce-review/SKILL.md` (the only file modified)
- Adding `cap:none` / `cap:N` argument token to the Argument Parsing table (line 23-29)
- Adding executable line-count computation to Stage 1 output (after line 175)
- Adding tier classification and priority-ordered selection to Stage 3 (lines 339-370)
- Updating the team announcement example to include cap metadata and `[capped]` annotations
- Adding a mode compatibility note

### Out of Scope

- Persona files (no changes to individual reviewer agents)
- Subagent template, diff-scope rules, findings schema (unchanged)
- Post-dispatch stages (Stages 4, 5, 6 content unchanged beyond the team announcement in the Stage 6 header)
- New files, scripts, or reference documents
- Other skills

## Context & Research

### Relevant Code and Patterns

- **ce-review SKILL.md**: 714 lines. The file to modify.
- **Argument Parsing table**: Lines 23-29, currently 5 token rows (`mode:autofix`, `mode:report-only`, `mode:headless`, `base:`, `plan:`).
- **Stage 1 output**: Lines 159-293. Diff range, file list, and diff are computed here. The output block at line 175 (`echo "BASE:$BASE" && echo "FILES:" && ...`) is the canonical output format repeated across all 4 scope paths (base arg, PR, branch, standalone).
- **Stage 3**: Lines 339-370. Reviewer selection logic. Currently unbounded -- every conditional that matches is selected. The team announcement example at lines 355-368 shows the current format.
- **Adversarial line-count threshold**: Line 345 already references executable-code line counting: "Count only executable code lines toward line-count thresholds." The adversarial agent (line 126) specifies ">=50 changed non-test/non-generated/non-lockfile lines." The new tier classification reuses this same counting method.
- **Existing file-type awareness**: Line 345 already establishes the pattern of excluding non-executable files from line counts.

### Institutional Learnings

- **On-demand loading** (idea #7, just completed): Converted 5 `@`-inlined references to stage-specific reads, establishing the pattern of progressive loading. This change is complementary -- it reduces the number of agents receiving the loaded content.
- **Carrying cost budgeting** (idea #20): Token cost compounds per tool call. Reducing the number of sub-agents directly reduces the number of tool calls that carry the orchestrator's context.

## Key Technical Decisions

### Five units, not one

Despite being a single-file change, the edits touch 4 distinct sections of SKILL.md (argument table, Stage 1, Stage 3, team announcement). Splitting into units makes verification granular and allows the implementer to verify each section independently before moving to the next.

### Line-count computation in Stage 1, not Stage 3

The brainstorm specifies computing the count during Stage 1 and passing it as metadata. This is correct because Stage 1 already processes the diff output and Stage 3 should not re-parse the diff. A single `EXECUTABLE_LINES: N` metadata line in the Stage 1 output keeps the tier classification in Stage 3 simple.

### Priority ordering as a new subsection in Stage 3

The priority system is the most complex addition. Rather than weaving it into the existing selection paragraph, add it as a clearly delineated subsection after the existing selection logic. This preserves the existing content-based selection (which determines the initial match set) and adds the cap/rank/trim step as a second pass.

### Team announcement is the only Stage 6 change

The Stage 6 header already includes "reviewer team with per-conditional justifications" (line 490). The cap metadata and `[capped]` annotations extend this naturally. No structural change to the report template is needed.

### No changes to persona files or subagent template

The cap operates at the dispatch level. Personas that are dispatched receive the same prompt as before. Personas that are capped are simply not dispatched. The change is entirely in the orchestrator's selection logic.

## Implementation Units

### Unit 1: Add `cap:` argument token

**Goal:** Add the `cap:none` / `cap:N` override token to the Argument Parsing table.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Argument Parsing table (lines 23-29)

**Changes:**

*1a. Add a new row to the token table (after the `plan:` row at line 29):*

| Token | Example | Effect |
|-------|---------|--------|
| `cap:none` or `cap:N` | `cap:none` or `cap:4` | Override the diff-proportional conditional reviewer cap. `cap:none` disables capping; `cap:N` sets the max conditional reviewers to N |

*1b. Add validation note after "Conflicting mode flags" paragraph (after line 33):*

Add a paragraph explaining `cap:` validation: `cap:N` requires N to be a positive integer. `cap:0` is invalid (it would eliminate all conditional reviewers). If `cap:` has an invalid value, stop and report the error. `cap:` does not conflict with any mode flag.

**Verification:**

- [ ] `grep -c 'cap:none' plugins/compound-engineering/skills/ce-review/SKILL.md` returns >= 2 (table row + validation)
- [ ] `grep -c 'cap:N' plugins/compound-engineering/skills/ce-review/SKILL.md` returns >= 2
- [ ] The table has 6 token rows (was 5)

---

### Unit 2: Add executable line-count computation to Stage 1

**Goal:** Add a line-count computation step to Stage 1 that counts executable changed lines (additions + deletions), excluding test files, generated files, lockfiles, and instruction-prose Markdown. Output the count as `EXECUTABLE_LINES: N` metadata.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Stage 1, after the diff output instructions but before Stage 2

**Changes:**

*2a. Add a new paragraph after the "Untracked file handling" paragraph (after line 293, before Stage 2 at line 295):*

Add a subsection titled **"Executable line counting"** that instructs the orchestrator to:

1. Count changed lines (additions + deletions) from the diff output, including only executable code files.
2. Exclude the same file categories the adversarial reviewer excludes:
   - Test files (files in `test/`, `tests/`, `spec/`, `__tests__/` directories, or files matching `*_test.*`, `*.test.*`, `*.spec.*` patterns)
   - Generated files (files in `generated/`, `gen/`, or with generated-file markers)
   - Lockfiles (`package-lock.json`, `yarn.lock`, `Gemfile.lock`, `bun.lockb`, `Cargo.lock`, `poetry.lock`, `go.sum`)
   - Instruction-prose Markdown (`.md` files in skill, agent, or reference directories)
3. Record the count as `EXECUTABLE_LINES: N` in the Stage 1 metadata, alongside `BASE:`, `FILES:`, and `DIFF:`.
4. State that this count uses the same exclusion rules as the adversarial reviewer's depth calibration (line 126, line 345) to maintain a single definition of "executable changed lines."

**Verification:**

- [ ] `grep -c 'EXECUTABLE_LINES' plugins/compound-engineering/skills/ce-review/SKILL.md` returns >= 1
- [ ] The exclusion list matches the adversarial reviewer's list at line 126 and the file-type awareness rule at line 345
- [ ] The count instruction appears between Stage 1 content and Stage 2

---

### Unit 3: Add tier classification and priority-ordered selection to Stage 3

**Goal:** Add diff-size tier classification, conditional reviewer cap, and priority-ordered selection as a second pass after the existing content-based selection. This is the core logic unit.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Stage 3 (lines 339-370), inserted after the existing selection logic (after line 351, before "Announce the team" at line 353)

**Changes:**

*3a. Add tier classification subsection:*

After the CE conditional agent check (line 351) and before the team announcement (line 353), insert a new subsection titled **"Diff-proportional cap"** containing:

A tier table:

| Tier | Changed executable lines | Max conditional reviewers |
|------|--------------------------|---------------------------|
| Trivial | < 50 | 2 |
| Small | 50-199 | 4 |
| Medium | 200-499 | 6 |
| Large | 500+ | No cap |

Instruction: Use the `EXECUTABLE_LINES` count from Stage 1 to classify the diff into a tier. If the user passed `cap:none`, skip tier classification and dispatch all matching conditionals. If the user passed `cap:N`, use N as the max conditional reviewers regardless of tier.

*3b. Add priority ordering subsection:*

When more conditional reviewers match than the tier cap allows, rank and select using this priority system. The existing content-based selection (deciding whether each conditional matches) runs first and is unchanged. The cap is applied as a second pass that trims the already-selected set.

**Priority tiers (higher tiers always outrank lower):**

| Priority | Category | Reviewers |
|----------|----------|-----------|
| Tier 1 -- Content-triggered cross-cutting | Highest risk, no alternative coverage | security, reliability, data-migrations, adversarial |
| Tier 2 -- Structure-triggered cross-cutting | Important but less catastrophic | performance, api-contract, cli-readiness, previous-comments |
| Tier 3 -- Stack-specific | Stack-idiomatic, partially covered by cross-cutting | dhh-rails, kieran-rails, kieran-python, kieran-typescript, julik-frontend-races |
| Tier 4 -- CE conditional | Migration-specific, co-occur with data-migrations | schema-drift-detector, deployment-verification-agent |

**Selection algorithm:**

1. Start with the set of all conditional reviewers that matched during content-based selection.
2. If the set size is within the cap, dispatch all. Stop.
3. Otherwise, fill slots by priority tier (Tier 1 first, then 2, 3, 4). Within a tier, use content-relevance judgment (how strongly the diff relates to each reviewer's domain) as a tiebreaker.
4. Mark remaining matched-but-excluded reviewers as `[capped]`.

*3c. Add category preservation rule:*

State the pipeline separation constraint: the cap must not eliminate an entire review category when that category's trigger condition is met. Specifically:

- If any Tier 1 reviewer matched and slots remain, at least one Tier 1 reviewer must be included.
- If the diff touches multiple stacks, at least one stack-specific reviewer should be included when slots remain after higher-priority placement. Select the stack with the most changed lines.
- CE conditional agents (Tier 4) fill remaining slots after Tiers 1-3. If the cap is exhausted by higher-priority reviewers, CE conditionals are capped.

*3d. Add note about always-on agents:*

State explicitly: The 6 always-on agents (4 persona + 2 CE) are never subject to the cap. The cap applies only to the conditional layers (cross-cutting, stack-specific, CE conditional).

*3e. Add adversarial interaction note:*

State: The adversarial reviewer already has its own >=50 executable-line threshold. Under the trivial tier (< 50 lines), adversarial would not match regardless of the cap. For diffs at 50+ lines where adversarial triggers, it competes at Tier 1 priority for conditional slots. No special interaction logic is needed.

**Verification:**

- [ ] The tier table appears in Stage 3 between existing selection logic and the team announcement
- [ ] All 15 conditional reviewers (8 cross-cutting + 5 stack-specific + 2 CE conditional) appear in exactly one priority tier
- [ ] The selection algorithm describes a two-pass process: existing content-based match first, then rank-and-cap
- [ ] Always-on agents are explicitly excluded from the cap
- [ ] `cap:none` and `cap:N` overrides are referenced
- [ ] The adversarial >=50 line interaction is noted
- [ ] `bun test` passes
- [ ] `bun run release:validate` passes

---

### Unit 4: Update team announcement with cap metadata

**Goal:** Update the team announcement example in Stage 3 to show the cap metadata line and `[capped]` annotations for excluded reviewers.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Stage 3, the team announcement code block (lines 355-368)

**Changes:**

*4a. Replace the existing team announcement example:*

Replace the current code block (lines 355-368) with a new example that shows:

1. A cap metadata line in the header: `Review team (cap: 2 conditional for <50 line diff):` (for capped reviews) or the existing `Review team:` (for uncapped/large diffs).
2. Always-on agents listed with `(always)` as before.
3. Selected conditional agents with justifications as before.
4. Capped conditional agents listed with `[capped]` prefix, their justification, and the reason they were excluded (priority tier, below cap).

Example:

```
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

*4b. Add note about cap:none announcement format:*

When `cap:none` is active or the diff is Large tier (500+ lines), omit the cap metadata from the header -- use the plain `Review team:` format with no `[capped]` entries.

**Verification:**

- [ ] The team announcement example includes `cap:` in the header
- [ ] At least one `[capped]` entry appears in the example
- [ ] The `cap:none` / large-diff format note is present
- [ ] The example shows both always-on and conditional reviewers

---

### Unit 5: Add mode compatibility verification

**Goal:** Add an explicit statement that diff-proportional scaling works identically across all four review modes. The cap is a dispatch-time decision that precedes mode-specific behavior.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Stage 3, within the diff-proportional cap subsection added by Unit 3

**Changes:**

*5a. Add a mode compatibility paragraph:*

At the end of the diff-proportional cap subsection (after the selection algorithm and category preservation rules), add:

**Mode compatibility:** Diff-proportional scaling applies identically in interactive, autofix, report-only, and headless modes. The cap is evaluated at dispatch time in Stage 3, before mode-specific post-review behavior in Stage 6+. No mode bypasses or overrides the cap unless the user explicitly passes `cap:none`.

**Verification:**

- [ ] All 4 mode names are mentioned in the compatibility statement
- [ ] The statement is positioned within Stage 3 (not Stage 6 or After Review)
- [ ] No mode-specific cap exceptions exist

## Open Questions

### Resolved During Planning

- **Should the line count be a shell computation or prose instruction?** Prose instruction. The orchestrator counts lines from the diff output it already has. Adding a shell script would violate constraint C3 (no new dependencies) and is unnecessary -- the count does not need to be exact, just within the right tier.

- **Should the tier table be in a reference file or inline?** Inline. The table is 5 lines and is consumed once during Stage 3. Extracting it to `references/` would add a file read for negligible carrying cost savings.

- **Should Unit 3 be split further (tier table, priority table, algorithm)?** No. These are interdependent -- the priority ordering cannot be verified without the tier table, and the algorithm cannot be verified without both. One unit keeps them coherent.

## Verification Plan

### Per-Unit Verification

Each unit includes its own verification checklist above. Additionally, after all units are applied:

1. `grep 'cap:none' plugins/compound-engineering/skills/ce-review/SKILL.md` returns matches in: argument table, Stage 3 tier classification, team announcement note
2. `grep 'EXECUTABLE_LINES' plugins/compound-engineering/skills/ce-review/SKILL.md` returns matches in: Stage 1, Stage 3 tier classification
3. `grep '\[capped\]' plugins/compound-engineering/skills/ce-review/SKILL.md` returns matches in: team announcement example
4. The argument table has 6 rows (was 5)
5. Stage 3 contains the tier table, priority table, selection algorithm, category preservation rule, and mode compatibility statement
6. The team announcement example shows cap metadata in the header
7. `bun test` passes
8. `bun run release:validate` passes

### Behavioral Equivalence for Large Diffs

For diffs >= 500 executable lines, the behavior must be identical to current behavior:
- All matching conditionals are dispatched (no cap)
- The team announcement uses the plain `Review team:` format
- No `[capped]` entries appear

### Behavioral Equivalence with `cap:none`

When the user passes `cap:none`, behavior must be identical to current behavior regardless of diff size.

### Edge Case Verification

Verify the plan covers the 8 edge cases from the brainstorm:

| Edge case | Covered by |
|-----------|-----------|
| E1. Multi-stack trivial diff | Unit 3 (category preservation: pick stack with most changed lines) |
| E2. High-risk trivial diff | Unit 3 (Tier 1 priority: security before stack-specific) |
| E3. Migration-only trivial diff | Unit 3 (Tier 1 data-migrations before Tier 4 CE conditional) |
| E4. Zero conditional matches | Unit 3 (cap is irrelevant when 0 conditionals match) |
| E5. Cap override on small diff | Unit 1 (`cap:none` argument) + Unit 3 (skip tier classification) |
| E6. Adversarial at boundary | Unit 3 (adversarial interaction note + Tier 1 priority) |
| E7. previous-comments on PR | Unit 3 (Tier 2 priority for previous-comments) |
| E8. All tiers saturated | Unit 3 (fill by priority tier, cap excess) |

## Execution Order

Units must be applied in order: 1 -> 2 -> 3 -> 4 -> 5. Unit 3 depends on Unit 2 (references `EXECUTABLE_LINES`). Unit 4 depends on Unit 3 (uses the cap system). Unit 5 is a small addition to Unit 3's content.

Estimated duration: 2-4 hours. One commit touching one file.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-diff-proportional-scaling-requirements.md](docs/brainstorms/2026-04-16-diff-proportional-scaling-requirements.md)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- **AGENTS.md compliance checklist:** [plugins/compound-engineering/AGENTS.md](plugins/compound-engineering/AGENTS.md)
- **On-demand loading plan (format reference):** [docs/plans/2026-04-16-001-refactor-on-demand-loading-plan.md](docs/plans/2026-04-16-001-refactor-on-demand-loading-plan.md)
