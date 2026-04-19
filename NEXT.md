Continue the token-improvements work on the compound-engineering plugin.
Branch: token-improvements. Use compound engineering workflows.

## What's done this session

- Planned and executed #28 (Cartographic Zoom)
  - Plan: `docs/plans/2026-04-19-001-refactor-cartographic-zoom-plan.md`
  - 7 units across 6 orchestrators + AGENTS.md codification
  - Replaced inline agent descriptions with 4-column cartouche tables
  - Extracted detailed criteria/prompts to `references/` files
  - ~65% reduction in inline agent description bytes (~23KB -> ~8KB)
  - Added fallback instructions for reference file read failures (review fix)
  - All tests pass, release:validate passes
- Fixed P1/P2 findings on #11 (Compact Returns Generalization) requirements doc
  - P1.1: Corrected schema size (3.5KB, was 1.3KB), recalculated cost tables (before: ~84-91.5KB, after: ~16-21KB, savings: ~63-75KB)
  - P1.2: Simplified R2 -- agents Read document from original path, no per-run copy needed
  - P1.3: Removed R7/S5 -- evidence not rendered in presentation output
  - P1.4: Added artifact-matching protocol to R6 (reviewer name + array index)
  - P2: Added priority tiers, fixed R9 fallback (full inline on artifact write failure), reframed S2 as fixed-input test, R12 to nice-to-have
- Brainstormed #28 (Cartographic Zoom / Cartouches)
  - Requirements doc: `docs/brainstorms/2026-04-19-cartographic-zoom-requirements.md`
  - 6 orchestrators in scope, ~29KB inline agent descriptions -> ~8-10KB cartouche tables (65-72% reduction)
- Brainstormed #1 (Queryable Reference Libraries)
  - Requirements doc: `docs/brainstorms/2026-04-19-queryable-reference-libraries-requirements.md`
  - 3 encyclopedia skills (orchestrating-swarms, agent-native-architecture, dspy-ruby). 75KB SKILL.md -> ~14KB thin routers (~81% reduction)
- Brainstormed #15 (Module Unbundling)
  - Requirements doc: `docs/brainstorms/2026-04-19-module-unbundling-requirements.md`
  - 5 modules proposed (core, git, review, frameworks, extras). Core-only: 86% -> 57% always-loaded budget
- Updated meta-plan tracking table: all 4 batch 5 brainstorms marked done

## What's next

### Immediate: Plan remaining batch 5 ideas

#28 is now planned and executed. Next: #11 (Compact Returns), #1 (Queryable Reference Libraries), #15 (Module Unbundling). Run `/ce:plan` for each.

### Then: Execute batch 5

After all 4 plans are complete, execute in plan order.

### Decision point after batch 5

Per meta-plan: "Is #15 module unbundling worth the complexity? Check if Phases 1-3 savings are sufficient."

## Key files

- Meta-plan: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md`
- #11 requirements: `docs/brainstorms/2026-04-19-compact-returns-generalization-requirements.md`
- #28 requirements: `docs/brainstorms/2026-04-19-cartographic-zoom-requirements.md`
- #1 requirements: `docs/brainstorms/2026-04-19-queryable-reference-libraries-requirements.md`
- #15 requirements: `docs/brainstorms/2026-04-19-module-unbundling-requirements.md`
- Ablation framework: `scripts/ablation/run.ts`
