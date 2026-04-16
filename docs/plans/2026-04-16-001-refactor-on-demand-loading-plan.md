---
title: "refactor: On-Demand Loading for ce-review References"
type: refactor
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-on-demand-loading-requirements.md
---

# refactor: On-Demand Loading for ce-review References

## Overview

Convert ce-review's 5 `@`-inlined reference files (28,991 bytes) from eager loading to stage-specific backtick-path reads. This eliminates ~29KB of carried context from Stages 1-2 entirely, and progressively loads content only at the stage where it is consumed. ce-review is the plugin's most tool-call-intensive skill (30-50+ calls), making carrying cost the dominant efficiency concern.

## Problem Frame

All 29KB of reference content loads at trigger time and persists through every subsequent message. The persona catalog is first needed at Stage 3, the dispatch files at Stage 4, and the output template at Stage 6. Stages 1-2 (scope detection, intent discovery) carry 29KB of unused content through 5-10 tool calls.

(see origin: `docs/brainstorms/2026-04-16-on-demand-loading-requirements.md`)

## Requirements Trace

| Req | Summary | Addressed by |
|-----|---------|-------------|
| R1 | Convert all 5 `@` inclusions to backtick-path reads | Unit 1 |
| R2 | Add stage-specific read instructions at consumption points | Unit 1 |
| R3 | Remove trailing "Included References" section | Unit 1 |
| R4 | Update "included below" body references to backtick paths | Unit 1 |
| R5 | Preserve sub-agent prompt assembly semantics | Unit 1 (verified in Unit 2) |
| R6 | Validate cross-references resolve correctly | Unit 2 |

## Scope Boundaries

### In Scope

- `plugins/compound-engineering/skills/ce-review/SKILL.md` (the only file modified)
- Updating 4 "included below" body references to backtick-path form
- Removing the `## Included References` section (lines 711-731)
- Adding 3 read instruction stubs (Stage 3, Stage 4, Stage 6)

### Out of Scope

- The 5 reference files themselves (content unchanged)
- ce-review frontmatter (unchanged)
- Other skills' reference loading patterns
- AGENTS.md compliance checklist wording (existing "Conditional and Late-Sequence Extraction" section already supports this)

## Context & Research

### Relevant Code and Patterns

- **ce-review SKILL.md**: 48,405 bytes, 731 lines. The `## Included References` section spans lines 711-731 with 5 `@` directives.
- **Body references**: Lines 104, 406, 409, 410, 482 use "included below" phrasing to point at the inlined content.
- **Stage structure**: Stage 3 (line 339), Stage 4 (line 380), Stage 6 (line 480).
- **Existing extraction pattern**: ce-plan, ce-brainstorm, ce-ideate, and document-review all use backtick-path references for on-demand loading. This is a proven pattern.
- **Compact returns**: Commit a5ce094 split findings into merge-tier (returned to orchestrator) and detail-tier (written to disk). The orchestrator no longer needs the full findings schema after Stage 4 dispatch.

### Institutional Learnings

- **Pass-paths learning** (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`): Validates that token costs compound across tool calls.
- **Conditional/late-sequence extraction** (AGENTS.md): Skills with many tool/agent calls should extract aggressively. ce-review's 30-50+ calls make it the strongest candidate.

## Key Technical Decisions

### Single unit, not phased

This is a single-file text edit with no code changes, no new files, and no schema changes. Splitting into multiple units would add overhead without reducing risk. One unit with thorough verification.

### Stage 4 files grouped in one read instruction

The subagent template, diff-scope rules, and findings schema are all consumed at Stage 4 for sub-agent prompt assembly. Rather than 3 separate read stubs, a single instruction block lists all 3 paths. This signals they are consumed together and reduces instruction overhead.

### "included below" -> backtick path, not "included above"

Body references currently say "the persona catalog included below." After removing the `## Included References` section, these references point nowhere. Update to backtick-path form: "the persona catalog in `references/persona-catalog.md`". This is more explicit and matches the established pattern.

## Implementation Units

### Unit 1: Convert @-inlines to stage-specific reads

**Goal:** Replace all 5 `@` inclusions with stage-specific backtick-path read instructions. Update body cross-references. Remove the Included References section.

**Files to modify:** `plugins/compound-engineering/skills/ce-review/SKILL.md` only.

**Changes:**

*1a. Update body references (4 locations):*

| Line | Current | New |
|------|---------|-----|
| 104 | "See the persona catalog included below for the full catalog." | "See `references/persona-catalog.md` for the full catalog." |
| 406 | "using the subagent template included below" | "using the subagent template in `references/subagent-template.md`" |
| 409 | "from the diff-scope reference included below" | "from `references/diff-scope.md`" |
| 410 | "from the findings schema included below" | "from `references/findings-schema.json`" |
| 482 | "from the review output template included below" | "from `references/review-output-template.md`" |

*1b. Add read instruction at Stage 3 (before line 341, after "### Stage 3: Select reviewers"):*

```markdown
Read `references/persona-catalog.md` for the full reviewer persona catalog with selection criteria.
```

*1c. Add read instruction at Stage 4 (before line 404, after "#### Spawning"):*

```markdown
Read `references/subagent-template.md`, `references/diff-scope.md`, and `references/findings-schema.json` for sub-agent prompt assembly.
```

*1d. Add read instruction at Stage 6 (after "### Stage 6: Synthesize and present", before the assembly instructions):*

```markdown
Read `references/review-output-template.md` for the report format template.
```

*1e. Remove the `## Included References` section (lines 709-731):*

Delete the horizontal rule, the `## Included References` header, and all 5 `@` inclusion blocks.

**Verification:**

- `grep -c '^@\./references/' plugins/compound-engineering/skills/ce-review/SKILL.md` returns 0
- `grep -c 'included below' plugins/compound-engineering/skills/ce-review/SKILL.md` returns 0
- `grep -c 'references/' plugins/compound-engineering/skills/ce-review/SKILL.md` shows backtick-path references at correct stages
- SKILL.md byte count decreases (the `@` directives themselves are small, ~200 bytes total, but the loaded-at-trigger footprint drops by ~29KB)
- `bun test` passes
- `bun run release:validate` passes

**Estimated savings:** 28,991 bytes removed from trigger-time load. Content loads progressively across Stages 3, 4, and 6 instead.

## Open Questions

### Resolved During Planning

- **Should diff-scope.md stay inlined given its small size (31 lines)?** No. Convert for consistency. The carrying cost argument applies even at 1.8KB given 30-50+ tool calls. One additional Read call is negligible.

- **Should Stage 4 files be read individually or as a batch?** Batch. Single instruction block listing all 3 paths. They are consumed together for the same purpose (sub-agent prompt assembly).

## Verification Plan

### Per-Unit Verification

1. `grep '^@\./references/' plugins/compound-engineering/skills/ce-review/SKILL.md` returns 0 matches
2. `grep 'included below' plugins/compound-engineering/skills/ce-review/SKILL.md` returns 0 matches
3. Each stage's read instruction appears at the correct location (Stage 3: before reviewer logic, Stage 4: before spawning, Stage 6: before report assembly)
4. `bun test` passes (697+ pass, 2 pre-existing failures in resolve-base-script)
5. `bun run release:validate` passes

### Behavioral Equivalence

The reference files are unchanged. Sub-agents receive identical prompt content. The only difference is when the orchestrator loads the content into its own context. No behavioral change is expected or desired.

## Execution Order

Single unit. Estimated duration: 30 minutes. One commit.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-on-demand-loading-requirements.md](docs/brainstorms/2026-04-16-on-demand-loading-requirements.md)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- **AGENTS.md compliance checklist:** [plugins/compound-engineering/AGENTS.md](plugins/compound-engineering/AGENTS.md)
