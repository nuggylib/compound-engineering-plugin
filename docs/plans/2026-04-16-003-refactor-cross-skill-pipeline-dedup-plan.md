---
title: "refactor: Cross-Skill Instruction Dedup + Pipeline Semantic Dedup"
type: refactor
status: planned
date: 2026-04-16
origin:
  - docs/brainstorms/2026-04-16-cross-skill-instruction-dedup-requirements.md
  - docs/brainstorms/2026-04-16-pipeline-semantic-dedup-requirements.md
---

# refactor: Cross-Skill Instruction Dedup + Pipeline Semantic Dedup

## Overview

This plan combines two related token efficiency ideas:

- **Idea #8 (Cross-Skill Instruction Dedup):** Remove category (b) native tool guidance duplication from 17 files that restate what AGENTS.md already covers; retain category (a) question-tool boilerplate per-file with a new canonical AGENTS.md section and staleness check.
- **Idea #21 (Pipeline Semantic Dedup):** Mitigate critical instruction interference between pipeline skills (especially the "NEVER CODE" vs "implement" conflict between ce:plan and ce:work), compress 6 identified semantic redundancies across the brainstorm-plan-work-review-compound pipeline, and produce the carrying-waste manifest needed by ideas #13 and #17.

Combined, this work addresses the 39% performance drop risk from conflicting instructions under compaction, saves ~5,300-7,800 bytes of redundant content, and produces two durable maintenance artifacts (cross-reference matrix and carrying-waste manifest).

## Problem Frame

The compound-engineering plugin's pipeline skills were authored independently and accumulate ~153 KB of content when co-loaded. Two categories of waste result:

1. **Verbatim boilerplate duplication:** 30 occurrences of native tool guidance across 17 files restate the AGENTS.md "Tool Selection in Agents and Skills" checklist. (Idea #8, category b)
2. **Semantic redundancy:** Different text teaching the same constraint across pipeline skills -- test discipline, execution posture, Slack routing, scope classification, pattern following, and domain classification. ~6,400 bytes of semantic overlap across 5 pipeline skills. (Idea #21, category 1)
3. **Instruction interference:** Instructions correct within their phase but conflicting when co-loaded, especially under compaction. The "NEVER CODE!" (ce:plan) vs "implement following existing conventions" (ce:work) conflict is the single most dangerous cross-skill interaction. (Idea #21, category 2)
4. **Carrying waste:** ~23,200 bytes of phase-specific content that persists beyond its useful phase -- ce:plan's research infrastructure during ce:work, the plan template during execution, etc. This waste has no immediate removal mechanism but requires an inventory for ideas #13 and #17. (Idea #21, category 3)

Question-tool boilerplate (idea #8, category a) is retained per-file as a deliberate portability decision. See Key Technical Decisions.

(See origins: `docs/brainstorms/2026-04-16-cross-skill-instruction-dedup-requirements.md`, `docs/brainstorms/2026-04-16-pipeline-semantic-dedup-requirements.md`)

## Requirements Trace

| Req | Source | Summary | Addressed by |
|-----|--------|---------|-------------|
| #8-R1 | #8 | Document design decision (Option D) | Key Technical Decisions |
| #8-R2 | #8 | Add canonical "Cross-Platform Interaction Convention" section to AGENTS.md | Unit 1 |
| #8-R3 | #8 | Verify centralized content reachable on each target platform | Unit 2 (contextual verification per file) |
| #8-R5 | #8 | Update AGENTS.md Skill Compliance Checklist | Unit 1 |
| #8-R6 | #8 | Add staleness check to release:validate | Unit 5 |
| #8-R7 | #8 | Measure byte-level savings | Unit 2, Unit 4 (post-verification) |
| #8-R8 | #8 | Validate cross-platform conversion for Codex and Kiro | Verification Plan |
| #8-R9 | #8 | No behavioral regression for question-tool skills | Verification Plan |
| #21-R2 | #21 | Determine canonical owner for each shared constraint | Unit 4 |
| #21-R3 | #21 | Compress intentional reinforcement to compact references | Unit 4 |
| #21-R5 | #21 | Add phase-scoping language for compaction-vulnerable conflicts | Unit 3 |
| #21-R6 | #21 | Redesign "NEVER CODE vs implement" boundary language | Unit 3 |
| #21-R7 | #21 | Produce per-skill carrying-waste manifest | Unit 7 |
| #21-R9 | #21 | Validate interference mitigations preserve behavioral equivalence | Unit 3 (verification) |
| #21-R10 | #21 | Produce cross-reference matrix | Unit 6 |

Requirements #8-R4 (build-time injection) is not applicable -- Option D was chosen, deferring build-time injection. Requirement #21-R1 (pairwise audit) and #21-R4 (interference audit) were completed in the brainstorm phase and their findings drive this plan. Requirement #21-R8 (with/without pipeline pattern) is evaluated per-finding in Unit 4.

## Scope Boundaries

### In Scope

- AGENTS.md updates (new section, checklist update)
- Removing native tool guidance duplication from agent and skill files
- Phase-scoping the critical ce:plan/ce:work interference
- Compressing 6 identified semantic redundancies in pipeline skills
- Adding a staleness check to release:validate
- Producing the cross-reference matrix artifact
- Producing the carrying-waste manifest artifact

### Out of Scope

- Question-tool boilerplate changes (category a retained per-file by design)
- Build-time injection infrastructure (deferred per #8 recommendation)
- Carrying-waste removal mechanism (requires #13 Phase Transition Markers or #17 JIT Specialization)
- Non-pipeline skill semantic dedup (only the 5 pipeline skills are in scope)
- Changes to skill frontmatter, output formats, or pipeline sequencing

### Deferred to Separate Tasks

- Carrying-waste eviction mechanism: idea #13 (Phase Transition Markers) or idea #17 (JIT Specialization)
- Empirical validation of interference impact: idea #14 (Ablation Framework)
- Semantic dedup for non-pipeline skills: future audit when pipeline dedup patterns are proven

## Context & Research

### Relevant Code and Patterns

**AGENTS.md existing sections:**

- "Tool Selection in Agents and Skills" (lines 131-142): 6-item checklist, comprehensive. This is the canonical reference that category (b) per-file copies duplicate.
- "Skill Compliance Checklist" (lines 72-174): Currently instructs authors to include question-tool boilerplate per-file. Needs a new "Cross-Platform Interaction Convention" section added and a reference from the checklist.

**Pipeline skill sizes (post-dead-content-audit):**

| Skill | Bytes | File |
|-------|-------|------|
| ce:brainstorm | 11,614 | `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` |
| ce:plan | 44,560 | `plugins/compound-engineering/skills/ce-plan/SKILL.md` |
| ce:work | 24,169 | `plugins/compound-engineering/skills/ce-work/SKILL.md` |
| ce:review | 48,405 | `plugins/compound-engineering/skills/ce-review/SKILL.md` |
| ce:compound | 24,508 | `plugins/compound-engineering/skills/ce-compound/SKILL.md` |

**Category (b) files to modify (native tool guidance duplication):**

Agents (10 files):

1. `agents/research/repo-research-analyst.md` -- lines 177-179 (3-line enumeration) + line 246 (Tool Selection summary)
2. `agents/research/framework-docs-researcher.md` -- line 89 (Tool Selection summary)
3. `agents/research/best-practices-researcher.md` -- lines 16, 21 (inline mentions) + line 112 (Tool Selection summary)
4. `agents/research/git-history-analyzer.md` -- line 9 (Tool Selection summary)
5. `agents/research/learnings-researcher.md` -- line 37 (bold instruction) + line 213 (reminder)
6. `agents/research/session-historian.md` -- lines 93, 186-187 (3 occurrences)
7. `agents/research/issue-intelligence-analyst.md` -- lines 196-197 (2-line block)
8. `agents/workflow/spec-flow-analyzer.md` -- lines 13-14 (2-line block)
9. `agents/review/project-standards-reviewer.md` -- line 20 (inline mention)
10. (AGENTS.md itself is the canonical source, not a removal target)

Skills (7 files):

11. `skills/ce-review/SKILL.md` -- lines 374, 376 (Stage 3b instructions)
12. `skills/ce-work/SKILL.md` -- line 47 (config read fallback hint)
13. `skills/ce-compound/SKILL.md` -- line 147 (Related Docs Finder search strategy)
14. `skills/ce-ideate/SKILL.md` -- line 100 (repo-research dispatch)
15. `skills/frontend-design/SKILL.md` -- line 38 (signal detection)
16. `skills/todo-create/SKILL.md` -- line 55 (tool preference block)
17. `skills/onboarding/SKILL.md` -- line 52 (inventory reading)

**Intentional variations to preserve (not removal candidates):**

- `ce-work/SKILL.md` line 47: "native file-read tool (e.g., Read in Claude Code, read_file in Codex)" -- Codex-specific hint in a config-read context. This is contextual, not a restatement of the AGENTS.md checklist.
- `ce-review/SKILL.md` lines 374-376: "Use native file-search tools to locate" / "Use native file-search (e.g., Glob)" -- These are action instructions within a specific workflow step, not general tool selection guidance. They tell the agent what to do at this point, not to prefer native tools in general. **Decision: Keep these.** They are load-bearing within Stage 3b.
- `learnings-researcher.md` line 37: "Use the native content-search tool (e.g., Grep in Claude Code) to find candidate files BEFORE reading any content." -- This is a critical search-strategy instruction, not general tool preference. It mandates a specific search-before-read workflow. **Decision: Keep this specific instruction.** Remove only the generic reminder at line 213.

**Reclassified removal candidates (17 files -> net removals):**

After reviewing each occurrence, the actual removals break down as:

- **Pure duplication of AGENTS.md** (remove): repo-research-analyst lines 177-179 + 246, framework-docs-researcher line 89, best-practices-researcher line 112, git-history-analyzer line 9, session-historian lines 186-187, issue-intelligence-analyst lines 196-197, spec-flow-analyzer lines 13-14, project-standards-reviewer line 20, frontend-design line 38, todo-create line 55, onboarding line 52, learnings-researcher line 213, ce-compound line 147, ce-ideate line 100
- **Contextual / load-bearing** (keep): ce-work line 47, ce-review lines 374+376, learnings-researcher line 37, best-practices-researcher lines 16+21, session-historian line 93

### Institutional Learnings

- **Dead content audit** (`docs/plans/2026-04-15-004-refactor-dead-content-audit-plan.md`): Condensed boilerplate to canonical forms. Explicitly deferred centralization to this work.
- **Register mismatch correction**: Applied specification register to top 7 skills. Pipeline skills already use condensed, imperative phrasing.

### External References

- Context hygiene taxonomy: conflicting instructions cause 39% performance degradation (ideation research source).

## Key Technical Decisions

### Option D: Differentiate by Category

**Category (a) -- question-tool boilerplate:** Retain condensed per-file copies. The question-tool reference is load-bearing, user-facing, and platform-critical. Skills copied to other platforms must carry their own question-tool guidance because AGENTS.md content does not travel with skills in most converted formats. Add the canonical form to AGENTS.md as a "Cross-Platform Interaction Convention" section for drift detection and new-skill authoring.

**Category (b) -- native tool guidance:** Remove from files where it duplicates AGENTS.md's "Tool Selection in Agents and Skills" section. Sub-agents receive AGENTS.md through the CLAUDE.md chain on Claude Code. Converted platforms inject their own tool-mapping blocks. Keep contextual variations (ce-work's Codex hint, learnings-researcher's search-before-read mandate).

**Rationale:** Zero infrastructure change, near-zero conversion risk, ~2,800-4,000 byte savings from category (b) with maintenance hygiene benefits. Build-time injection deferred -- ~3 KB incremental for category (a) does not justify the machinery.

### Phase-scoping replaces emphatic phrasing

The critical interference (2A: "NEVER CODE!" vs "implement") is addressed by embedding phase context directly in the instruction text, not by adding supplementary qualifiers. "NEVER CODE!" (11 words with context) becomes "During planning: do not write implementation code." (7 words). The phase qualifier survives compaction because it is part of the instruction itself. Net token count stays flat or decreases.

### Compact references for semantic redundancy

Where a downstream skill re-teaches a concept the upstream skill already established, replace the re-teaching with a compact reference that activates the model's memory of the upstream instruction. Example: replace ce:work's full "Test Scenario Completeness" four-category table with a compact sentence referencing the plan's test scenarios. The full content is retained only for standalone invocation paths (no upstream skill in context).

### Carrying-waste manifest is documentation, not implementation

The carrying-waste manifest (Unit 7) documents what content becomes irrelevant after each phase transition. It does not remove or modify that content -- removal requires #13 (Phase Transition Markers) or #17 (JIT Specialization). The manifest's value is as input to those future ideas and as documentation of the pipeline's context economics.

## Implementation Units

### Unit 1: AGENTS.md Updates

- [ ] **Unit 1: Add canonical section and update compliance checklist**

**Goal:** Establish the "Cross-Platform Interaction Convention" as the authoritative source for question-tool boilerplate, and update the compliance checklist to reference it.

**Requirements:** #8-R2, #8-R5

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/AGENTS.md`

**Approach:**

1. Add a new `### Cross-Platform Interaction Convention` section after the existing "Cross-Platform User Interaction" checklist items (after line 108). Content:

   ```markdown
   ### Cross-Platform Interaction Convention (Canonical Reference)

   This is the authoritative definition. Per-file copies in skills are portable summaries
   of this section. When adding or updating a skill's interaction method, copy from here.

   Use the platform's blocking question tool when available:
   - Claude Code: `AskUserQuestion`
   - Codex: `request_user_input`
   - Gemini: `ask_user`

   Fallback: present numbered options and wait for the user's reply before proceeding.
   ```

2. Update the "Cross-Platform User Interaction" checklist items (lines 107-108) to add a note referencing the canonical section:

   ```markdown
   - [ ] When a skill needs to ask the user a question, instruct use of the platform's blocking question tool and name the known equivalents (see Cross-Platform Interaction Convention above for the canonical list)
   - [ ] Include a fallback for environments without a question tool (present numbered options and wait for the user's reply before proceeding)
   ```

**Patterns to follow:** Existing AGENTS.md section structure and checklist formatting.

**Test scenarios:**
- Happy path: After edit, `grep 'Cross-Platform Interaction Convention' plugins/compound-engineering/AGENTS.md` returns the new section header.
- Happy path: Compliance checklist items reference the canonical section.
- Edge case: Existing skill compliance items are not duplicated or contradictory.

**Verification:**
- `bun run release:validate` passes.
- The new section is positioned logically between existing cross-platform guidance sections.

---

### Unit 2: Category (b) Native Tool Guidance Removal

- [ ] **Unit 2: Remove native tool guidance duplication from agents and skills**

**Goal:** Remove restated native tool guidance from files where it duplicates AGENTS.md's "Tool Selection" section. Preserve intentional contextual variations.

**Requirements:** #8-R3, #8-R7

**Dependencies:** Unit 1 (AGENTS.md must have the canonical section established first, though for category (b) the existing "Tool Selection" section is already canonical)

**Files (agents -- phase 2a, max 5 per sub-unit):**

*Sub-unit 2a (5 agent files):*
- Modify: `plugins/compound-engineering/agents/research/repo-research-analyst.md` -- remove lines 177-179 (3-line enumeration) and line 246 (Tool Selection summary line)
- Modify: `plugins/compound-engineering/agents/research/framework-docs-researcher.md` -- remove line 89 (Tool Selection summary)
- Modify: `plugins/compound-engineering/agents/research/best-practices-researcher.md` -- remove line 112 (Tool Selection summary). Keep lines 16 and 21 (contextual instructions for finding SKILL.md files)
- Modify: `plugins/compound-engineering/agents/research/git-history-analyzer.md` -- remove line 9 (Tool Selection summary)
- Modify: `plugins/compound-engineering/agents/research/learnings-researcher.md` -- remove line 213 (generic reminder). Keep line 37 (critical search-before-read mandate)

*Sub-unit 2b (5 agent files + first skill files):*
- Modify: `plugins/compound-engineering/agents/research/session-historian.md` -- remove lines 186-187 (generic tool guidance). Keep line 93 (contextual script execution instruction)
- Modify: `plugins/compound-engineering/agents/research/issue-intelligence-analyst.md` -- remove lines 196-197 (2-line generic block)
- Modify: `plugins/compound-engineering/agents/workflow/spec-flow-analyzer.md` -- remove lines 13-14 (2-line generic block)
- Modify: `plugins/compound-engineering/agents/review/project-standards-reviewer.md` -- remove line 20 (generic mention)
- Modify: `plugins/compound-engineering/skills/frontend-design/SKILL.md` -- remove line 38 (generic tool guidance sentence)

*Sub-unit 2c (remaining skill files):*
- Modify: `plugins/compound-engineering/skills/todo-create/SKILL.md` -- remove line 55 (tool preference blockquote)
- Modify: `plugins/compound-engineering/skills/onboarding/SKILL.md` -- remove/rephrase line 52 (generic native tool instruction)
- Modify: `plugins/compound-engineering/skills/ce-compound/SKILL.md` -- remove "(e.g., Grep in Claude Code)" platform hint at line 147, leaving the action instruction intact
- Modify: `plugins/compound-engineering/skills/ce-ideate/SKILL.md` -- remove "(e.g., `Glob` with pattern `*` or `*/*`)" platform hint at line 100, leaving the action instruction intact

**Files intentionally NOT modified (contextual variations preserved):**
- `skills/ce-work/SKILL.md` line 47: Codex-specific config-read hint
- `skills/ce-review/SKILL.md` lines 374, 376: Action instructions within Stage 3b workflow
- `agents/research/learnings-researcher.md` line 37: Critical search-before-read mandate
- `agents/research/best-practices-researcher.md` lines 16, 21: Contextual skill-finding instructions
- `agents/research/session-historian.md` line 93: Script execution instruction

**Approach:**

For each file, the removal is one of:
- **Full line removal**: When the line is a standalone "Tool Selection:" summary or a standalone "Use native X" reminder that adds nothing beyond AGENTS.md.
- **Platform hint removal**: When the line contains a load-bearing action instruction with an appended "(e.g., Glob in Claude Code)" platform hint. Remove only the hint, keep the instruction. Example: "Use the native content-search tool to pre-filter candidate files" stays; "(e.g., Grep in Claude Code)" is removed.
- **Block removal**: When 2-3 consecutive lines form a generic tool-guidance block.

Each removal must be verified against AGENTS.md to confirm the guidance is covered there.

**Patterns to follow:** The dead content audit's approach of verifying each removal is covered by a remaining canonical source.

**Test scenarios:**
- Happy path: After all removals, `grep -c 'Tool Selection.*Prefer native' plugins/compound-engineering/agents/**/*.md` returns 0.
- Happy path: Intentional variations are still present (`grep 'read_file in Codex' plugins/compound-engineering/skills/ce-work/SKILL.md` returns 1).
- Edge case: Files with mixed contextual and generic guidance retain only the contextual parts.
- Integration: `bun test` passes (agent file content changes do not break converter tests).

**Verification:**
- `bun test` passes.
- `bun run release:validate` passes.
- Spot-check 3 modified agent files to confirm surrounding content is intact.

**Estimated savings:** ~2,800-4,000 bytes across 14 files (10 agents, 4 skills with hint-only removals) plus 4 skill files with full line/block removals.

---

### Unit 3: Interference Mitigation (CRITICAL)

- [ ] **Unit 3: Phase-scope the ce:plan/ce:work instruction interference**

**Goal:** Eliminate the compaction-vulnerable "NEVER CODE vs implement" conflict and reduce ambiguity in 3 additional interference patterns, without increasing total token count.

**Requirements:** #21-R5, #21-R6, #21-R9

**Dependencies:** None (independent of Units 1-2)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`

**Approach:**

**2A (CRITICAL): "NEVER CODE" vs "implement"**

In `ce-plan/SKILL.md`, rewrite all 4 anti-implementation directives with phase-scoping:

| Current | Rewrite |
|---------|---------|
| Line 13: "This workflow produces a durable implementation plan. It does **not** implement code, run tests, or learn from execution-time results." | "This workflow produces a durable implementation plan. During planning, do not implement code, run tests, or learn from execution-time results." |
| Line 43: "**Decisions, not code** -- Capture approach, boundaries, files, dependencies, risks, and test scenarios. Do not pre-write implementation code or shell command choreography." | "**Decisions, not code** -- During planning: capture approach, boundaries, files, dependencies, risks, and test scenarios rather than pre-writing implementation code or shell command choreography." |
| Line 303: "**Do not** run tests, build the app, or probe runtime behavior in this phase." | "**During planning:** do not run tests, build the app, or probe runtime behavior." |
| Line 744: "NEVER CODE! Research, decide, and write the plan." | "During planning: research, decide, and write the plan -- do not write implementation code." |

In `ce-work/SKILL.md`, add activation context to pro-implementation directives:

| Current | Rewrite |
|---------|---------|
| Line 9: "Execute work efficiently while maintaining quality and finishing features." | "During execution: work efficiently while maintaining quality and finishing features." |
| Line 204: "implement following existing conventions" | "During execution: implement following existing conventions" |

**2B: "Ask questions" vs "Execute quickly"**

In `ce-plan/SKILL.md`:
- Line 163: "Do not continue planning while true blockers remain unresolved" -- Already phase-scoped by surrounding context ("If true product blockers remain"). No change needed.

In `ce-work/SKILL.md`:
- Line 349: "Get clarification once at the start, then execute" -- Add phase qualifier: "During execution: get clarification once at the start, then execute"
- Line 350: "Don't wait for perfect understanding - ask questions and move" -- Add phase qualifier: "During execution: ask questions and move rather than waiting for perfect understanding"

**2C: "Ask user" vs "Skip all questions"**

In `ce-review/SKILL.md`:
- Line 62: "Skip all user questions. Never use the platform question tool (AskUserQuestion / request_user_input / ask_user)" -- Add mode qualifier: "In headless mode: skip all user questions. Never use the platform question tool" (partially already scoped under "### Headless mode rules"; verify the section header provides sufficient scoping. If the "Never" appears after compaction without the header, it needs inline scoping.)
- **Decision after review:** The headless mode rules are already under a clearly labeled "### Headless mode rules" heading at line 60. The autofix rules are under "### Autofix mode rules" at line 47. Both are structurally scoped. The risk is that compaction drops the heading but retains the "Never" directive. Mitigation: prefix the key directive with its mode: "Headless: never use the platform question tool" / "Autofix: skip all user questions."

**2D: "Source of truth" vs "Guide"**

This is a low-severity consistency concern, not a true conflict. No rewrite needed. The plan-as-guide framing in ce:work is intentional and healthy.

**Test scenarios:**
- Happy path: After rewrites, `grep 'NEVER CODE' plugins/compound-engineering/skills/ce-plan/SKILL.md` returns 0 matches.
- Happy path: `grep 'During planning' plugins/compound-engineering/skills/ce-plan/SKILL.md` returns 4+ matches (one per rewritten directive).
- Happy path: `grep 'During execution' plugins/compound-engineering/skills/ce-work/SKILL.md` returns 3+ matches.
- Edge case: ce:plan invoked standalone (no ce:work in context) still clearly prohibits coding.
- Edge case: ce:work invoked standalone (no ce:plan in context) still clearly promotes implementation.
- Integration: Phase-scoped language survives conversion (`bun run convert --to codex` produces readable output).

**Verification:**
- Read both modified files to confirm no increase in total line count (phase-scoping replaces emphatic phrasing, not supplements it).
- `bun test` passes.
- `bun run release:validate` passes.

**Estimated savings:** Net neutral to slightly negative on bytes (rewrites replace existing text). Value is behavioral -- eliminating the 39% performance drop risk from conflicting instructions.

---

### Unit 4: Semantic Redundancy Compression

- [ ] **Unit 4: Compress 6 identified semantic redundancies across pipeline skills**

**Goal:** Replace re-teaching of upstream concepts with compact references that activate model memory of the upstream instruction, preserving standalone function.

**Requirements:** #21-R2, #21-R3

**Dependencies:** Unit 3 (interference mitigation should land first to avoid editing the same lines twice)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`

**Approach:**

Each finding is addressed with the "compact reference" pattern: replace the downstream re-teaching with a brief sentence that references the upstream skill's definition. The downstream skill retains enough context to work standalone.

**1A: Test Discipline (ce:plan + ce:work)**

Canonical owner: ce:plan (defines the four-category framework in Section 3.5).

In `ce-work/SKILL.md`, replace the "Test Scenario Completeness" table (lines 231-238, ~480 bytes) with:

```markdown
**Test Scenario Completeness** -- Before writing tests, verify the plan's test scenarios cover all applicable categories (happy path, edge cases, error/failure paths, integration). Supplement gaps from the unit's own context before writing tests.
```

This retains the instruction to supplement but removes the re-teaching of what each category means. When invoked standalone (bare prompt, no plan), ce:work's existing "Test Discovery" section still provides adequate test guidance.

Estimated savings: ~350 bytes.

**1B: Execution Posture (ce:plan + ce:work)**

Canonical owner: ce:plan (defines the concept in Section 1.1b and 3.5).

In `ce-work/SKILL.md`, the execution posture references (Phase 1 step 1, Phase 2 step 1) are already compact -- they say "When a unit carries an Execution note, honor it" without re-defining the concept. The 4-bullet "Guardrails for execution posture" block (lines 223-227) is execution-specific guidance, not a re-teaching. **No change needed.** The brainstorm analysis estimated ~800-1,200 bytes of redundancy, but on closer reading, ce:work's treatment is more compact than estimated and is execution-specific.

Estimated savings: 0 bytes (already compact).

**1C: Slack Context Routing (ce:brainstorm + ce:plan)**

Canonical owner: ce:brainstorm (first in pipeline sequence).

In `ce-plan/SKILL.md`, replace the Slack context block (lines 194-198, ~500 bytes) with:

```markdown
**Slack context** (opt-in) -- never auto-dispatch. Same routing as ce:brainstorm: dispatch `compound-engineering:research:slack-researcher` with the planning context summary when tools are available and the user asked; note availability otherwise.
```

This retains the dispatch target and the opt-in rule but removes the duplicated 3-condition routing table.

Estimated savings: ~300 bytes.

**1D: Scope Assessment Classification (ce:brainstorm + ce:plan)**

Canonical owner: ce:brainstorm (Phase 0.3).

In `ce-plan/SKILL.md`, the scope classification at Phase 0.6 (lines 167-173) uses nearly identical wording to ce:brainstorm's Phase 0.3. However, ce:plan must work standalone -- users invoke it without a prior brainstorm. The classification is self-contained and small (~180 bytes for the 3 items). **No change needed.** The cost of removing it (~180 bytes) is not worth the risk of degrading standalone function.

Estimated savings: 0 bytes (retained for standalone function).

**1E: "Follow Existing Patterns" (ce:plan + ce:work)**

Canonical owner: ce:plan (carries per-unit "Patterns to follow" fields).

In `ce-work/SKILL.md`, replace the "Follow Existing Patterns" section (lines 286-292, ~350 bytes) with:

```markdown
3. **Follow Existing Patterns**

   Read each unit's `Patterns to follow` references first. Match naming conventions and reuse existing components. When working from a bare prompt, grep for similar implementations.
```

This retains the core instruction and the bare-prompt fallback but removes the re-teaching of pattern-following principles that the plan already established per-unit.

Estimated savings: ~150 bytes.

**1F: Domain Classification Routing (ce:brainstorm + ce:plan)**

Canonical owner: ce:brainstorm (Phase 0.1b).

In `ce-plan/SKILL.md`, the domain classification at Phase 0.1b (lines 87-95) is nearly identical to ce:brainstorm's. However, like 1D, ce:plan must work standalone. The block is small (~350 bytes) and load-bearing for routing non-software requests. **No change needed.**

Estimated savings: 0 bytes (retained for standalone function).

**Summary of Unit 4 changes:**

| Finding | Action | Savings |
|---------|--------|---------|
| 1A: Test discipline | Compress ce:work table to compact reference | ~350 bytes |
| 1B: Execution posture | No change (already compact) | 0 |
| 1C: Slack routing | Compress ce:plan block to compact reference | ~300 bytes |
| 1D: Scope classification | No change (standalone function) | 0 |
| 1E: Follow patterns | Compress ce:work section to compact reference | ~150 bytes |
| 1F: Domain classification | No change (standalone function) | 0 |
| **Total** | | **~800 bytes** |

This is lower than the brainstorm's estimated ~2,500-3,800 bytes because closer reading revealed several blocks are already compact or essential for standalone function. The honest savings are ~800 bytes of semantic compression. The higher-value work is in Unit 3 (interference mitigation).

**Test scenarios:**
- Happy path: Compressed sections in ce:work retain the instruction intent (manual read verification).
- Edge case: ce:work invoked with a bare prompt (no plan) still provides adequate test, pattern, and Slack guidance.
- Edge case: ce:plan invoked standalone still has complete Slack routing, scope classification, and domain routing.
- Integration: `bun test` passes.

**Verification:**
- Read each modified file to confirm compressed references are clear and actionable.
- `bun run release:validate` passes.

---

### Unit 5: Staleness Check for Question-Tool Boilerplate

- [ ] **Unit 5: Add release:validate check for question-tool drift**

**Goal:** Detect drift between per-file question-tool occurrences and the canonical AGENTS.md definition.

**Requirements:** #8-R6

**Dependencies:** Unit 1 (canonical section must exist in AGENTS.md)

**Files:**
- Modify: Release validation script (identify the exact file by inspecting `package.json` `release:validate` script)
- Test: Corresponding test file

**Approach:**

Add a check to `release:validate` that:

1. Reads the canonical tool names from the AGENTS.md "Cross-Platform Interaction Convention" section.
2. Greps all `SKILL.md` files and reference `.md` files for the question-tool pattern (`AskUserQuestion.*request_user_input` or similar).
3. For each occurrence, verifies that the tool names match the canonical set. Flags any occurrence that names a tool not in the canonical set, or omits a tool that is in the canonical set.
4. Reports drift as a warning, not a blocking error (intentional variation exists, e.g., ce-review's headless mode suppresses the question tool entirely).

This is a lightweight regex check, not a semantic comparison. It catches the common case (someone adds a fourth platform's tool name to one file but not the canonical section, or vice versa).

**Patterns to follow:** Existing staleness checks in the validation script (e.g., description length check, budget check).

**Test scenarios:**
- Happy path: All current files pass (they use the same 3 tool names).
- Edge case: A file using only `AskUserQuestion` (without the others) is flagged as potential drift.
- Edge case: ce-review's "Never use the platform question tool" is not flagged (it does not name individual tools in the positive sense).
- Error path: A file naming a non-existent tool (e.g., `ask_question`) is flagged.

**Verification:**
- `bun test` passes.
- `bun run release:validate` passes with zero drift warnings on the current codebase.

---

### Unit 6: Cross-Reference Matrix (Artifact)

- [ ] **Unit 6: Produce the cross-reference matrix documenting pipeline skill constraints**

**Goal:** Create a durable maintenance artifact documenting all shared constraints across the 5 pipeline skills, their redundancy classification, interference classification, and recommended action.

**Requirements:** #21-R10

**Dependencies:** Units 3 and 4 (the matrix should reflect post-mitigation state)

**Files:**
- Create: `docs/references/pipeline-cross-reference-matrix.md`

**Approach:**

The matrix has these columns:

| Constraint | Skills | Redundancy Class | Interference Class | Bytes | Action Taken | Notes |
|-----------|--------|-----------------|-------------------|-------|-------------|-------|

Redundancy classes: `true-redundancy`, `intentional-reinforcement`, `phase-specialization`

Interference classes: `phase-scoped` (safe), `compaction-vulnerable` (mitigated in Unit 3), `none`

Populate from the brainstorm findings (1A-1F, 2A-2D) plus any additional constraints discovered during implementation.

This is a living document. Add a note at the top: "Update this matrix when adding or modifying pipeline skill constraints to prevent reintroduction of semantic redundancy."

**Patterns to follow:** Markdown table format consistent with other docs/references files.

**Test expectation:** None -- this is a documentation artifact, not code.

**Verification:**
- File exists and contains entries for all 10 findings (1A-1F, 2A-2D).
- Each entry has all columns populated.

---

### Unit 7: Carrying-Waste Manifest (Artifact)

- [ ] **Unit 7: Produce per-skill section relevance annotations for #13/#17 input**

**Goal:** Document which sections of each pipeline skill become irrelevant after that skill's phase completes, with byte sizes and downstream relevance annotations.

**Requirements:** #21-R7

**Dependencies:** None (can run in parallel with other units)

**Files:**
- Create: `docs/references/pipeline-carrying-waste-manifest.md`

**Approach:**

For each of the 5 pipeline skills, enumerate major sections with:

| Section | Bytes | Relevance Window | Downstream Relevance | Notes |
|---------|-------|-----------------|---------------------|-------|

Relevance windows: `brainstorm-only`, `plan-only`, `work-only`, `review-only`, `compound-only`, `pipeline-wide`

Downstream relevance: which later skills (if any) reference or depend on the content.

Pre-identified carrying waste from the brainstorm:

| Skill | Section | Bytes | Window |
|-------|---------|-------|--------|
| ce:plan | Phase 1 research infrastructure | ~10,000 | plan-only |
| ce:plan | Core Plan Template (Phase 4.2) | ~4,800 | plan-only |
| ce:brainstorm | Phase 1 collaborative dialogue instructions | ~2,000 | brainstorm-only |
| ce:work | Phase 1 step 2 branch setup | ~2,200 | work-only |
| ce:review | Mode detection and argument parsing | ~4,200 | review-only |
| **Total** | | **~23,200** | |

The manifest should also include sections that are pipeline-wide (relevant across phases) to give a complete picture.

Add a header note: "This manifest is input to idea #13 (Phase Transition Markers) and idea #17 (JIT Skill Specialization). It documents what content to evict or deprioritize at phase boundaries."

**Patterns to follow:** The brainstorm's Category 3 findings provide the initial data.

**Test expectation:** None -- this is a documentation artifact, not code.

**Verification:**
- File exists and contains entries for all 5 pipeline skills.
- Byte sizes are measured from the actual current files (not brainstorm estimates).
- Total carrying waste is calculated and matches the sum of per-section entries.

## Open Questions

### Resolved During Planning

- **Should category (b) removals be full-line or hint-only?** Resolved per-file. Some files have standalone generic guidance lines (full removal). Others embed tool hints within load-bearing action instructions (hint-only removal). See Unit 2 approach details.

- **Should scope classification (1D) and domain routing (1F) be compressed?** No. Both are small (~180-350 bytes each), essential for standalone function, and not worth the risk of degrading ce:plan's standalone invocation. The brainstorm overestimated their redundancy cost.

- **Should execution posture (1B) be compressed?** No. On closer reading, ce:work's execution posture references are already compact ("honor it") and execution-specific (guardrails). The brainstorm estimated ~800-1,200 bytes of redundancy, but the actual overlap is minimal.

- **Should the cross-reference matrix be a living document or one-time artifact?** Living document. The matrix's value is regression prevention -- it should be updated when pipeline skills change. One-time artifacts become stale and lose their value.

### Deferred to Implementation

- **Exact byte savings per file in Unit 2:** Will be measured during implementation by diffing file sizes before and after. The brainstorm estimate of ~2,800-4,000 bytes is a reasonable range.

- **Additional interference patterns not identified in the brainstorm:** The implementation should watch for any new conflicts discovered during the phase-scoping work (Unit 3). Add them to the cross-reference matrix.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Category (b) removal degrades tool selection on converted platforms | Converted platforms inject their own tool-mapping blocks; AGENTS.md guidance is supplementary. Verify with `bun run convert --to codex` post-implementation |
| Phase-scoping language degrades standalone skill behavior | Each rewrite is verified for standalone readability. "During planning: do not write implementation code" is clear even without co-loaded skills |
| Semantic compression in Unit 4 removes load-bearing instructions | Each compression is conservative (compact reference, not removal). Standalone invocation paths retain full content or adequate fallback |
| Staleness check in Unit 5 produces false positives | Check is advisory (warning, not blocking). Intentional variations are expected and documented |
| Carrying-waste byte estimates from brainstorm are inaccurate | Unit 7 measures from actual files, not brainstorm estimates. Discrepancies are documented |

## Verification Plan

### Per-Unit Verification

Each unit includes specific test scenarios and verification criteria. See individual units above.

### Cross-Platform Conversion Verification

After all units are complete:

1. `bun run convert --to codex` -- verify converted skills do not contain orphaned references to removed content.
2. `bun run convert --to kiro` -- verify steering files reflect AGENTS.md updates.
3. Spot-check 3 converted skill files (ce-plan, ce-work, ce-compound) for coherent tool guidance.

### Behavioral Equivalence Verification

For each modified pipeline skill, verify:

1. **Standalone invocation:** Skill produces correct behavior when invoked without any other pipeline skill in context.
2. **Pipeline invocation:** Skill produces correct behavior when invoked after its predecessor in the pipeline.
3. **Question-tool behavior:** Skills that ask questions still name the correct platform tools (category (a) retained per-file).
4. **Tool selection behavior:** Agents that explore codebases still prefer native tools (AGENTS.md provides the guidance; per-file copies removed but canonical source is inherited).

### Regression Tests

- `bun test` passes (697+ pass, 2 pre-existing failures in resolve-base-script).
- `bun run release:validate` passes.
- No new linting errors in modified files.

## Execution Order

| Order | Unit | Est. Duration | Files | Phase |
|-------|------|--------------|-------|-------|
| 1 | Unit 1: AGENTS.md updates | 15 min | 1 | Edit |
| 2 | Unit 3: Interference mitigation | 30 min | 2 | Edit |
| 3 | Unit 4: Semantic redundancy compression | 20 min | 3 | Edit |
| 4 | Unit 2a: Agent native tool removal (5 files) | 30 min | 5 | Edit |
| 5 | Unit 2b: Agent + skill native tool removal (5 files) | 30 min | 5 | Edit |
| 6 | Unit 2c: Remaining skill native tool removal (4 files) | 20 min | 4 | Edit |
| 7 | Unit 5: Staleness check | 30 min | 1-2 | Code |
| 8 | Unit 7: Carrying-waste manifest | 30 min | 1 | Artifact |
| 9 | Unit 6: Cross-reference matrix | 30 min | 1 | Artifact |

**Total estimated duration:** ~4 hours across ~28 files.

**Rationale for ordering:**

- Unit 1 first: establishes the canonical AGENTS.md section that Units 2 and 5 depend on.
- Unit 3 before Unit 4: interference mitigation is the highest-value work and should not be blocked by semantic compression. Also avoids editing the same lines twice in ce:plan and ce:work.
- Unit 2 after Units 3-4: category (b) removal is mechanical and benefits from the pipeline skill files already being in their final interference-mitigated, compression-applied state.
- Unit 5 after Units 1-2: staleness check needs the canonical section (Unit 1) and benefits from the final state of skill files (Unit 2).
- Units 6-7 last: artifact production requires the implementation work to be complete so the matrix and manifest reflect the final state.

## Sources & References

- **Origin documents:**
  - [docs/brainstorms/2026-04-16-cross-skill-instruction-dedup-requirements.md](docs/brainstorms/2026-04-16-cross-skill-instruction-dedup-requirements.md)
  - [docs/brainstorms/2026-04-16-pipeline-semantic-dedup-requirements.md](docs/brainstorms/2026-04-16-pipeline-semantic-dedup-requirements.md)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- **AGENTS.md compliance checklist:** [plugins/compound-engineering/AGENTS.md](plugins/compound-engineering/AGENTS.md)
- **Dead content audit plan:** [docs/plans/2026-04-15-004-refactor-dead-content-audit-plan.md](docs/plans/2026-04-15-004-refactor-dead-content-audit-plan.md)
- **On-demand loading plan (format reference):** [docs/plans/2026-04-16-001-refactor-on-demand-loading-plan.md](docs/plans/2026-04-16-001-refactor-on-demand-loading-plan.md)
