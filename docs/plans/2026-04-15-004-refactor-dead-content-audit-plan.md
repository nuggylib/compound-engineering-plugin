---
title: "refactor: Dead Content Elimination Audit"
type: refactor
status: done
date: 2026-04-15
origin: docs/brainstorms/2026-04-15-dead-content-audit-requirements.md
---

# refactor: Dead Content Elimination Audit

## Overview

Systematically audit and remove dead content across the compound-engineering plugin's 173 content files (43 skills, 49 agents, 62 reference files, plus AGENTS.md). Dead content falls into six categories: repeated boilerplate, deprecated tool references, hardcoded date stamps, verbose code examples in references, oversized single files, and residual register-mismatch patterns. Execution is phased from mechanical (scriptable grep-and-fix) to judgment-heavy (code example reduction, register extension). Total estimated savings: 101-120 KB (6-7% of the 1.44 MB content corpus), with 37-51 KB guaranteed per-session (always-loaded content) and the remainder realized per-invocation (on-demand reference files).

## Problem Frame

Organic growth across 173 content files has accumulated multiple categories of dead weight:

- **34 cross-platform boilerplate occurrences** across 27 files (~11 KB) -- near-verbatim duplicates of the AGENTS.md compliance checklist question-tool sentence
- **24 native-tool-hint occurrences** across 15 files (~5.5 KB) -- similar per-file repetition of tool selection guidance
- **10 hardcoded date stamps** ("The current year is 2026") in 3 skills and 7 agents -- requires annual maintenance, redundant with model system context
- **2 deprecated `TodoWrite` references** in ce-work and ce-work-beta -- explicitly prohibited by the AGENTS.md checklist
- **164 KB in the top 10 code-heavy reference files** (54-69% code) -- full implementation examples where pattern skeletons would suffice
- **orchestrating-swarms at 47 KB / 1,697 lines** -- 62% code, with reference-grade content (message schemas, tool call signatures) that should be on-demand
- **36 skills not yet corrected for register mismatch** -- lower hedging density than the top 7 already corrected, but 5-8% estimated savings remain

The register-mismatch work (commit f14419b) saved 29,894 bytes from the top 7 skills. This audit targets different content categories (boilerplate, deprecated refs, code density) and extends register-mismatch to the remaining 36 skills at lighter touch. Combined with register-mismatch, total dead content elimination reaches ~131-150 KB (8-9% of corpus).

(see origin: `docs/brainstorms/2026-04-15-dead-content-audit-requirements.md`)

## Requirements Trace

| Req | Summary | Addressed by |
|-----|---------|-------------|
| R1 | Audit all 43 skills, classify paragraphs | Units 3-5 (phased by content category) |
| R2 | Audit all 49 agents | Unit 2 (date stamps, boilerplate), Unit 5 (register residual in agents) |
| R3 | Cross-platform question-tool dedup strategy | Unit 3 (boilerplate dedup) |
| R4 | Remove deprecated TodoWrite/TodoRead refs | Unit 1 (mechanical fix, 2 files) |
| R5 | Evaluate and remove date stamps | Unit 1 (mechanical removal, 10 files) |
| R6 | Audit top 10 code-heavy reference files | Unit 4 (code example reduction) |
| R7 | Extract reference content from orchestrating-swarms | Unit 4 (orchestrating-swarms extraction) |
| R8 | Register-mismatch on remaining 36 skills | Unit 5 (register-mismatch extension) |
| R9 | Staleness check in release:validate | Unit 6 (staleness gate) |
| R10 | Per-file audit ledger | Unit 7 (ledger production) |
| R11 | Behavioral equivalence validation | Verification Plan section; per-unit verification steps |

## Scope Boundaries

### In Scope

- All 43 `SKILL.md` files under `plugins/compound-engineering/skills/`
- All 49 agent `.md` files under `plugins/compound-engineering/agents/`
- Top 20 reference files by size (covers ~80% of reference bytes)
- `plugins/compound-engineering/AGENTS.md` (as source of boilerplate patterns and compliance rules)
- Wiring staleness checks into `scripts/release/validate.ts`

### Out of Scope

- Script files under `skills/*/scripts/` (executable code, not prose)
- Reference files under 100 lines (diminishing returns)
- `CHANGELOG.md`, `README.md`, `plugin.json`, `marketplace.json` (auto-generated or metadata)
- `plugins/coding-tutor/` (separate plugin, not part of this optimization)

### Deferred to Other Ideas

- **#8 Cross-Skill Instruction Dedup**: This plan removes per-file boilerplate repetitions. Idea #8 goes further by centralizing shared instructions in AGENTS.md with a build-time expansion mechanism. If #8 lands first, Unit 3's boilerplate dedup work is superseded. If this plan lands first, it establishes the per-file cleanup that #8 can then centralize.
- **#9 Description Trim**: Separate plan addressing the 10 skill descriptions exceeding the 250-char guideline. No overlap -- description frontmatter is out of scope here.
- **#26 Register Mismatch (remaining 36 skills)**: Unit 5 extends the methodology to remaining skills, but at lighter touch (5-8% vs 10.6%). The 7 already-corrected skills are not re-audited.
- **#6 Merge ce-work/beta**: If ce-work and ce-work-beta merge before this plan executes, the 2 deprecated TodoWrite fixes in Unit 1 collapse to 1, and the structural duplication noted in the register-mismatch cross-skill observations is resolved.

## Context & Research

### Relevant Code and Patterns

- **release:validate script**: `scripts/release/validate.ts` -- the hook point for staleness checks (Unit 6). Currently validates release-please config and metadata sync. Staleness checks are additive; they run alongside existing checks and contribute to the same exit code.
- **Metadata utilities**: `src/release/metadata.ts` -- `getCompoundEngineeringCounts()` walks the plugin tree. The staleness check can reuse the same directory walking pattern.
- **File utilities**: `src/utils/files.ts` -- `walkFiles()`, `readText()` for directory enumeration and file reads.
- **Frontmatter parser**: `src/utils/frontmatter.ts` -- `parseFrontmatter()` extracts YAML frontmatter. Needed for Unit 5 (register-mismatch) to separate body content.
- **AGENTS.md compliance checklist**: The source of truth for what constitutes "correct" boilerplate. Specifically:
  - Cross-platform question tool: "instruct use of the platform's blocking question tool and name the known equivalents"
  - Task tracking: "describe the intent and name the known equivalents"
  - Tool selection: "Describe tools by capability class with platform hints"
- **Register-mismatch methodology**: `docs/references/register-mismatch-correction-methodology.md` -- six pattern classes with detection heuristics and transformation rules. Unit 5 applies this to remaining skills.

### Institutional Learnings

- **Self-contained skill directories** (AGENTS.md): Each skill directory is an isolated unit. Boilerplate dedup cannot create cross-skill dependencies. The dedup strategy must keep minimal per-file versions or rely on AGENTS.md inheritance.
- **Cross-platform conversion** (AGENTS.md): Skills are copied as-is to Codex/Gemini targets. Any dedup strategy must survive `bun run convert --to codex`. If shared preambles don't survive conversion, keep a minimal per-file version.
- **Register-mismatch default-keep rule**: When classification is ambiguous, keep the content. False negatives (keeping unnecessary content) cost tokens; false positives (stripping compliance-aiding content) risk behavioral regression. The asymmetry favors keeping.

### Dead Content Inventory (Concrete File Lists)

**Date stamps (10 files):**
- `skills/ce-plan/SKILL.md`
- `skills/ce-ideate/SKILL.md`
- `skills/ce-brainstorm/SKILL.md`
- `agents/research/git-history-analyzer.md`
- `agents/research/slack-researcher.md`
- `agents/research/framework-docs-researcher.md`
- `agents/research/issue-intelligence-analyst.md`
- `agents/research/repo-research-analyst.md`
- `agents/research/best-practices-researcher.md`
- `agents/research/session-historian.md`

**Deprecated TodoWrite references (2 files):**
- `skills/ce-work/SKILL.md` (line 115)
- `skills/ce-work-beta/SKILL.md` (line 168)

Note: `agents/review/project-standards-reviewer.md` also mentions `TodoWrite` but in the context of detecting violations (it's a reviewer instruction to flag TodoWrite usage). This is not a deprecated reference -- it's the enforcement mechanism. Do not remove.

**Cross-platform question-tool boilerplate (27 files):**
See the 27 files returned by `AskUserQuestion.*request_user_input` grep. These include 22 SKILL.md files, 2 reference files, and AGENTS.md itself (which is the source pattern, not a removal target).

**Top 10 code-heavy reference files (>54% code, >100 lines):**
1. `every-style-editor/references/EVERY_WRITE_STYLE.md` (29 KB)
2. `agent-native-architecture/references/mobile-patterns.md` (26 KB)
3. `agent-native-architecture/references/shared-workspace-architecture.md` (21 KB)
4. `dspy-ruby/references/optimization.md` (19 KB)
5. `dspy-ruby/references/core-concepts.md` (18 KB)
6. `agent-native-architecture/references/architecture-patterns.md` (17 KB)
7. `agent-native-architecture/references/agent-native-testing.md` (17 KB)
8. `dspy-ruby/references/toolsets.md` (16 KB)
9. `agent-native-architecture/references/mcp-tool-design.md` (16 KB)
10. `dhh-rails-style/references/architecture.md` (13 KB)

## Key Technical Decisions

### Boilerplate Dedup Strategy: Condense Per-File, Don't Centralize

The brainstorm evaluated centralizing boilerplate in AGENTS.md. This plan takes the conservative approach: condense each per-file occurrence to a shorter canonical form rather than removing it entirely. Rationale:

1. **Self-contained skill constraint** (AGENTS.md): Skills are isolated units. A skill that assumes AGENTS.md provides the question-tool instruction will break when copied to another platform.
2. **Converter portability**: `bun run convert --to codex` copies SKILL.md files as-is. AGENTS.md content is not injected into individual skills during conversion.
3. **Deferred centralization**: Idea #8 (Cross-Skill Instruction Dedup) plans a build-time expansion mechanism that would solve this properly. This plan gets the 50-60% reduction from condensing verbose instances without depending on build infrastructure that doesn't exist yet.

**Condensed canonical forms (to be finalized during implementation):**

Current verbose form (~328 bytes):
```
Use the platform question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini CLI) to present the question to the user. If no question tool is available, present numbered options in chat and wait for the user's reply before proceeding.
```

Condensed form (~160 bytes):
```
Ask the user via the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: present numbered options and wait for a reply.
```

### Code Example Reduction: Pattern Skeletons, Not Deletion

For code-heavy reference files, condense full implementation examples to pattern skeletons (type signatures + structural comments, no implementation body). Keep one complete example per pattern; condense variants to skeletons. This preserves instructional value while removing 30%+ of code bytes.

Do not delete code examples entirely -- the reference files exist to teach patterns, and agents produce better code from concrete examples than from abstract descriptions.

### orchestrating-swarms: Extract, Don't Restructure

Extract message format schemas (JSON examples), tool call reference tables, and advanced patterns to `references/` files. Keep primitives, lifecycle, and orchestration instructions in SKILL.md. This skill has `disable-model-invocation: true` so it is never auto-triggered; extraction to references changes loading from "always when skill is invoked" to "agent reads reference on demand" -- a meaningful saving for the 62% code content.

### Register-Mismatch Extension: Batch by Size Descending

Apply the 6-pattern methodology from `docs/references/register-mismatch-correction-methodology.md` to remaining skills in batches of 5-7, sorted by size descending. Expected savings are 5-8% per file (lower than the 10.6% in the original top 7). Stop applying to a batch if 3+ consecutive skills yield <3% savings -- the remaining files are likely already well-optimized.

### Audit Methodology: Category-First, Not File-First

Audit by dead content category, not by file. This enables mechanical removals first (scriptable grep-and-replace for date stamps, deprecated refs) before moving to judgment-heavy work (code reduction, register correction). A file-first approach would interleave easy and hard decisions, making it harder to batch and review.

## Implementation Units

### Unit 1: Mechanical Pattern Removals (scriptable, no judgment)

**Goal:** Remove all instances of hardcoded date stamps and deprecated tool references. Zero ambiguity, zero behavioral risk.

**Requirements:** R4, R5

**Files to modify:**
- 10 files with date stamps (3 skills, 7 agents -- see inventory above)
- 2 files with deprecated TodoWrite references (ce-work, ce-work-beta)

**Approach:**

*Date stamps:*
- Remove the line `**Note: The current year is 2026.** Use this when dating plans and searching for recent documentation.` (and variants) from all 10 files.
- Models receive the current date through system context. The instruction to "use this when dating plans" is redundant -- the model will use the current date by default.
- Estimated savings: ~974 bytes.

*Deprecated tool references:*
- In `ce-work/SKILL.md` line 115 and `ce-work-beta/SKILL.md` line 168: replace `TodoWrite, task lists` with `TaskCreate/TaskUpdate/TaskList` per the AGENTS.md checklist.
- Do NOT modify `agents/review/project-standards-reviewer.md` -- its TodoWrite mention is an enforcement instruction, not a usage.
- Estimated savings: ~200 bytes (replacement, not deletion).

**Verification:**
- `grep -r "current year is" plugins/compound-engineering/skills/ plugins/compound-engineering/agents/` returns 0 matches
- `grep -r "TodoWrite" plugins/compound-engineering/skills/` returns 0 matches (agent reviewer still has its enforcement mention)
- `bun test` passes
- `bun run release:validate` passes

**Estimated savings:** ~1,174 bytes

---

### Unit 2: Cross-Platform Boilerplate Condensing

**Goal:** Condense verbose cross-platform question-tool boilerplate, native tool hints, tool selection footers, and permission mode boilerplate to shorter canonical forms.

**Requirements:** R3 (partial -- condense, not centralize)

**Files to modify:** ~40 files total (27 with question-tool boilerplate, 15 with native tool hints, 4 with tool selection footers, 3 with permission mode boilerplate -- some overlap)

**Approach:**

Process in three sub-batches based on boilerplate pattern:

*Sub-batch 2a: Cross-platform question-tool (27 files):*
- Grep for all instances of the question-tool sentence.
- Replace each with the condensed canonical form.
- Preserve the fallback instruction (behavioral -- defines what to do when no tool exists).
- Estimated savings: ~5,000 bytes (50% reduction from ~11 KB).

*Sub-batch 2b: Native tool hints (15 files):*
- Grep for "Use the native file-search/glob tool" and similar patterns.
- Condense to: "Use native file-search/content-search tools (e.g., Glob, Grep in Claude Code)."
- Estimated savings: ~2,700 bytes.

*Sub-batch 2c: Tool selection footers + permission mode + repo-relative warnings (11 files):*
- Condense tool selection footers and permission mode paragraphs.
- Estimated savings: ~1,500 bytes.

**Phasing:** Sub-batch 2a first (highest file count, most mechanical). 2b and 2c together (smaller, can be done in one pass).

**Verification:**
- Before/after byte count per file.
- `bun run convert --to codex` on a representative skill (e.g., ce-plan) -- verify the condensed boilerplate survives conversion.
- Manual read-through of 3 condensed files to confirm fallback instructions are preserved.
- `bun test` passes.

**Estimated savings:** ~9,200 bytes

---

### Unit 3: orchestrating-swarms Content Extraction

**Goal:** Extract reference-grade content from the 47 KB SKILL.md into `references/` files, reducing always-loaded content.

**Requirements:** R7

**Files to modify:**
- `skills/orchestrating-swarms/SKILL.md` (reduce from 47 KB)
- Create: `skills/orchestrating-swarms/references/message-formats.md`
- Create: `skills/orchestrating-swarms/references/tool-call-reference.md`
- Create: `skills/orchestrating-swarms/references/advanced-patterns.md`

**Approach:**

Keep in SKILL.md (core orchestration instructions):
- Primitives table and lifecycle diagrams (lines 1-95 -- essential for understanding the system)
- Table of Contents
- Core Architecture (spawn mechanisms, built-in agent types)
- Orchestration Patterns (high-level pattern descriptions, not full code examples)
- Error Handling (behavioral instructions)

Extract to references:
- **Message Formats section** (JSON examples of message types, structured message schemas) -> `references/message-formats.md`
- **TeammateTool Operations** (full tool call signatures and parameter tables) -> `references/tool-call-reference.md`
- **Complete Workflows section** (end-to-end code examples) -> `references/advanced-patterns.md`

At each extraction point in SKILL.md, leave a 1-3 line stub:
```markdown
### Message Formats
For message type schemas and structured message examples, read `references/message-formats.md`.
```

Also remove the version/date footer: `Based on Claude Code v2.1.19 - Tested and verified 2026-01-25`

**Verification:**
- SKILL.md size decreases by ~14,000 bytes.
- All extracted content is present in the new reference files.
- No instructional content was lost -- only moved behind on-demand loading.
- `bun run release:validate` passes (skill count unchanged, references are not counted).

**Estimated savings:** ~14,000 bytes (content moves from always-loaded to on-demand)

---

### Unit 4: Code Example Reduction in Reference Files

**Goal:** Condense verbose code examples in the top 10 code-heavy reference files, reducing on-demand loading cost.

**Requirements:** R6

**Files to modify:** Top 10 reference files by code density (see inventory above). Process in two sub-batches:

*Sub-batch 4a: agent-native-architecture references (5 files, ~100 KB total):*
- `mobile-patterns.md` (26 KB, 66% code)
- `shared-workspace-architecture.md` (21 KB, 65% code)
- `architecture-patterns.md` (17 KB, 60% code)
- `agent-native-testing.md` (17 KB, 69% code)
- `mcp-tool-design.md` (16 KB, 65% code)

*Sub-batch 4b: dspy-ruby + dhh-rails-style references (4 files, ~63 KB total):*
- `optimization.md` (19 KB, 54% code)
- `core-concepts.md` (18 KB, 56% code)
- `architecture.md` (13 KB, 55% code)
- `testing.md` (10 KB, 66% code)

*Sub-batch 4c: every-style-editor reference (1 file, 29 KB):*
- `EVERY_WRITE_STYLE.md` -- evaluate separately; this is a style guide, and code examples may be more essential than in architecture references.

**Approach per file:**
1. Classify each code block: pattern skeleton, full implementation, or configuration.
2. For full implementations where multiple blocks demonstrate the same pattern with minor variations: keep one complete example, condense the rest to pattern skeletons (type signature + structural comment).
3. For configuration blocks: keep as-is (usually compact already).
4. Target: reduce code content by ~30% per file.

**Verification:**
- Before/after byte count per file. Target: ~49,000 bytes total reduction across all 10 files.
- Manual review of 2 files per sub-batch to confirm pattern skeletons still convey the instructional intent.
- Spot-check: for one skill that uses these references (e.g., agent-native-architecture), invoke the skill and confirm reference loading still works.

**Estimated savings:** ~49,000 bytes (on-demand, not per-session)

---

### Unit 5: Register-Mismatch Extension to Remaining Skills

**Goal:** Apply the register-mismatch correction methodology to the remaining 36 uncorrected skills, prioritizing the largest files.

**Requirements:** R8

**Already corrected (do not re-audit):** ce-review, ce-compound-refresh, orchestrating-swarms, ce-plan, ce-work-beta, ce-compound, ce-work (7 skills, commit f14419b).

**Remaining 36 skills sorted by size (top 15 shown):**

| Skill | Size (bytes) |
|-------|-------------|
| ce-optimize | 35,929 |
| onboarding | 25,203 |
| ce-pr-description | 24,987 |
| dspy-ruby | 23,333 |
| agent-native-architecture | 22,430 |
| resolve-pr-feedback | 19,431 |
| frontend-design | 14,341 |
| ce-brainstorm | 14,192 |
| ce-debug | 13,154 |
| test-browser | 12,800 |
| ce-demo-reel | 11,500 |
| ce-sessions | 10,200 |
| ce-slack-research | 9,800 |
| dhh-rails-style | 8,900 |
| ce-setup | 7,600 |

**Phasing (5 batches of 7-8 skills):**

- **Batch 5a** (top 7 by size: ce-optimize through resolve-pr-feedback, ~165 KB total): Highest expected savings. Apply full 6-pattern methodology.
- **Batch 5b** (next 7: frontend-design through ce-sessions): Medium expected savings.
- **Batch 5c** (next 7): Diminishing returns expected. Apply lighter-touch audit.
- **Batch 5d** (next 7): Lighter touch. Stop-loss: if 3+ consecutive skills yield <3% savings, mark remaining skills as "below threshold" and stop.
- **Batch 5e** (final 8): Only audit if 5d showed continued savings.

**Methodology per skill:**
Apply the 6-pattern classification from `docs/references/register-mismatch-correction-methodology.md`:
1. Progressive explanation -- delete scaffolding
2. Redundant clarification -- delete restated sentences
3. Motivational framing -- delete justifications
4. Inline rationale -- delete understanding-only clauses
5. Hedging markers -- convert to imperative or "Optional:" prefix
6. Indirect speech acts -- convert to imperative

Use the default-keep tie-breaker for ambiguous cases.

**Verification:**
- Before/after byte count per batch. Target: 5-8% reduction per file.
- Diff review per file: confirm every removed sentence was non-behavioral.
- `bun test` passes after each batch.

**Estimated savings:** ~21,000-35,000 bytes

---

### Unit 6: Staleness Gate in release:validate

**Goal:** Wire lightweight staleness checks into `scripts/release/validate.ts` to prevent dead content from reaccumulating.

**Requirements:** R9

**Files to modify:**
- `scripts/release/validate.ts` (add staleness checks alongside existing config/metadata checks)
- Create: `src/release/staleness.ts` (staleness check logic, exported for testability)
- Create: `tests/staleness.test.ts`

**Approach:**

Add a `validateContentStaleness()` function in `src/release/staleness.ts` that checks:

1. **Hardcoded year references**: `grep -r "current year is \d{4}"` across skills and agents. Allow-list: none (no legitimate use case).
2. **Deprecated tool references**: Check against a maintained deny-list (`TodoWrite`, `TodoRead`). Allow-list: `agents/review/project-standards-reviewer.md` (enforcement context).
3. **Oversized skill files**: Warn (not fail) if any SKILL.md exceeds 40 KB without having `references/` files. This is advisory, not blocking.
4. **Boilerplate density**: Warn if the cross-platform question-tool sentence appears in more than 5 files. Threshold is configurable.

Integration into `validate.ts`:
- Import `validateContentStaleness()`.
- Run alongside existing `validateReleasePleaseConfig()` and `syncReleaseMetadata()`.
- Year stamps and deprecated tool references cause exit(1) (hard fail).
- Oversized files and boilerplate density cause warnings (soft fail -- printed but don't block release).

**Verification:**
- `bun test tests/staleness.test.ts` passes.
- Introduce a test file with "current year is 2025" -- `bun run release:validate` fails.
- Introduce a test file with "TodoWrite" -- `bun run release:validate` fails.
- `bun run release:validate` passes on the current (post-cleanup) codebase.

**Estimated savings:** 0 bytes directly. Prevents regression.

---

### Unit 7: Audit Ledger Production

**Goal:** Produce a machine-readable per-file audit ledger documenting every file audited, its dead content classification, and the action taken.

**Requirements:** R10

**Files to create:**
- `docs/audits/2026-04-15-dead-content-audit-ledger.yaml`

**Approach:**

After Units 1-5 complete, produce a YAML ledger with one entry per audited file:

```yaml
- file: skills/ce-plan/SKILL.md
  total_bytes_before: 45221
  total_bytes_after: 44800
  dead_content_bytes: 421
  categories:
    - type: date-stamp
      action: removed
      bytes: 98
    - type: question-tool-boilerplate
      action: condensed
      bytes: 168
    - type: register-mismatch
      action: corrected
      bytes: 155
  priority: P2
```

Categories: `date-stamp`, `deprecated-tool-ref`, `question-tool-boilerplate`, `native-tool-hint`, `tool-selection-footer`, `permission-mode-boilerplate`, `code-example-verbose`, `register-mismatch`, `structural-extraction`.

Actions: `removed`, `condensed`, `extracted`, `corrected`, `skipped` (below threshold).

Priority: P1 (always-loaded, high savings), P2 (always-loaded, moderate savings), P3 (on-demand or low savings).

**Verification:**
- Ledger covers all 173 content files (or documents why a file was skipped).
- Sum of `dead_content_bytes` across all entries is within 10% of the total bytes saved.
- Ledger is valid YAML (parseable by `js-yaml`).

---

## Open Questions

### Resolved During Planning

- **Should boilerplate be centralized in AGENTS.md or condensed per-file?** Condensed per-file. Centralization depends on build-time expansion infrastructure that doesn't exist yet (deferred to idea #8). Condensing gets 50-60% savings without new infrastructure.

- **Should the project-standards-reviewer TodoWrite mention be removed?** No. It is an enforcement instruction ("flag TodoWrite usage as a portability violation"), not a deprecated usage. It is the mechanism that prevents TodoWrite from appearing in other files.

- **Should register-mismatch extension cover agents too?** Agents are small (median ~80 lines, ~3 KB) and have lower hedging density. The expected savings per agent are <100 bytes. Register-mismatch extension in Unit 5 covers only the 36 remaining skills. Agent-level register work is deferred unless the Unit 5 stop-loss threshold is not triggered (suggesting more content to correct).

- **What is the stop-loss for register-mismatch extension?** If 3+ consecutive skills in a batch yield <3% savings, mark remaining skills as below threshold and stop. This prevents diminishing-returns work from consuming disproportionate time.

### Unresolved

- **What is the exact condensed form for each boilerplate pattern?** The plan specifies the approach (condense, not remove) and an example. Exact wording finalized during Unit 2 implementation after reviewing the full set of variations.

- **Should the orchestrating-swarms Mermaid diagrams stay in SKILL.md or move to references?** The 4 Mermaid diagrams (primitives, lifecycle, message flow, spawn backends) are compact (~150 lines total) and serve as structural overviews. Leaning toward keeping them in SKILL.md, but this is a judgment call during Unit 3.

- **Which every-style-editor code examples are reducible?** `EVERY_WRITE_STYLE.md` is a style guide with examples. Unlike architecture references, style guide examples may be more essential (the model needs to see the exact style, not a skeleton). Classified separately in Sub-batch 4c. May yield lower savings than other reference files.

## Verification Plan

### Per-Unit Verification

Each unit specifies its own verification steps. Common checks across all units:

1. **`bun test`** -- full test suite passes after each unit.
2. **`bun run release:validate`** -- passes after each unit.
3. **Before/after byte counts** -- measured per file, recorded in the audit ledger.
4. **Diff review** -- every removed or modified sentence reviewed for behavioral impact.

### Behavioral Equivalence Testing

For 5 representative skills (ce-plan, ce-review, ce-brainstorm, onboarding, orchestrating-swarms):
1. Capture the skill's output on a representative prompt *before* modifications.
2. Apply all modifications.
3. Run the same prompt against the modified skill.
4. Compare outputs: confirm equivalent behavioral instructions, no missing capabilities, no broken cross-platform fallbacks.

### Cross-Platform Conversion Validation

After Unit 2 (boilerplate condensing):
- Run `bun run convert --to codex` on 3 modified skills.
- Run `bun run convert --to gemini` on 3 modified skills.
- Verify condensed boilerplate is present in converted output.
- Verify no content is lost during conversion.

### Aggregate Metrics

After all units complete:
- Total bytes saved (always-loaded): target 37-51 KB.
- Total bytes saved (on-demand): target 49 KB.
- Total bytes saved (all): target 101-120 KB.
- Percentage of corpus: target 6-7%.
- Files modified: ~100-130 of 173.
- Zero `grep` matches for deprecated patterns (date stamps, TodoWrite in skills).

## Interaction with Other Ideas

| Idea | Interaction | Sequencing |
|------|-------------|-----------|
| #8 Cross-Skill Instruction Dedup | Unit 2 condenses boilerplate per-file; #8 centralizes it via build-time expansion. If #8 ships first, Unit 2 is superseded. If this ships first, #8 has cleaner per-file forms to centralize. | Independent. Either order works. |
| #9 Description Trim | No overlap. This plan does not touch skill description frontmatter. | Independent. |
| #6 Merge ce-work/beta | If #6 ships first, Unit 1 has 1 fewer TodoWrite fix and Unit 5 has 1 fewer file. The merged file may need its own register-mismatch pass. | Slightly easier if #6 ships first. |
| #10 Token Guardrails | Unit 6 adds staleness checks to release:validate. If #10 adds size-budget guardrails to the same script, coordinate to avoid conflicting exit-code logic. | Ship #10's size guardrails first; Unit 6 extends the same validation pipeline. |
| #26 Register Mismatch (done) | Unit 5 extends the same methodology to remaining skills. Does not re-audit the 7 already-corrected skills. Reuses the methodology doc as-is. | Dependent on #26 methodology (already complete). |
| #14 Ablation Framework | No dependency. This plan's removals are classified by content category (boilerplate, deprecated, code density), not by ablation testing. However, ablation data from #14 could retrospectively validate that removed content was truly non-behavioral. | Independent. Ablation data is a nice-to-have post-validation, not a prerequisite. |

## Execution Order and Phasing

Units are ordered from most mechanical to most judgment-heavy:

| Order | Unit | Est. Duration | Judgment Level | Files Touched |
|-------|------|--------------|----------------|---------------|
| 1st | Unit 1: Mechanical Removals | 30 min | None (scriptable) | 12 |
| 2nd | Unit 2: Boilerplate Condensing | 2-3 hours | Low (pattern match + condense) | ~40 |
| 3rd | Unit 3: orchestrating-swarms Extraction | 1-2 hours | Medium (decide what to extract) | 1 + 3 new |
| 4th | Unit 6: Staleness Gate | 2-3 hours | Low (script implementation) | 3 |
| 5th | Unit 4: Code Example Reduction | 4-6 hours | High (per-block classification) | 10 |
| 6th | Unit 5: Register-Mismatch Extension | 6-10 hours | High (per-sentence classification) | 36 (5 batches) |
| Last | Unit 7: Audit Ledger | 1-2 hours | None (aggregation) | 1 new |

**Total estimated effort:** 17-27 hours across multiple sessions.

**Session boundaries:** Each unit is a natural session boundary. Units 4 and 5 should be split across multiple sessions (sub-batches within each unit). Unit 6 can run in parallel with Units 3-5 since it only touches script files.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-15-dead-content-audit-requirements.md](docs/brainstorms/2026-04-15-dead-content-audit-requirements.md)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- **Register-mismatch methodology:** [docs/references/register-mismatch-correction-methodology.md](docs/references/register-mismatch-correction-methodology.md)
- **AGENTS.md compliance checklist:** [plugins/compound-engineering/AGENTS.md](plugins/compound-engineering/AGENTS.md)
- **Format reference:** [docs/plans/2026-04-13-002-feat-carrying-cost-budgeting-plan.md](docs/plans/2026-04-13-002-feat-carrying-cost-budgeting-plan.md)
- Release validate script: `scripts/release/validate.ts`
- File utilities: `src/utils/files.ts`
- Metadata utilities: `src/release/metadata.ts`
