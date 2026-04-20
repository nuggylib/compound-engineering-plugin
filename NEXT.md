Continue the token-improvements work on the compound-engineering plugin.
Branch: token-improvements. Use compound engineering workflows.

## What's done

- Executed #28 (Cartographic Zoom)
  - Plan: `docs/plans/2026-04-19-001-refactor-cartographic-zoom-plan.md`
  - 7 units across 6 orchestrators + AGENTS.md codification
  - Replaced inline agent descriptions with 4-column cartouche tables
  - Extracted detailed criteria/prompts to `references/` files (persona-routing.md, research-tasks.md, audit-prompts.md, dispatch-prompts.md)
  - Refactored persona-catalog.md (removed summary tables, retained detailed criteria + selection rules)
  - ~65% reduction in inline agent description bytes (~23KB -> ~8KB)
  - Added fallback instructions for reference file read failures (review fix)
  - Cartouche format codified in AGENTS.md Skill Compliance Checklist
  - All tests pass (780/782, 2 pre-existing), release:validate passes
- Executed #11 (Compact Returns Generalization)
  - Plan: `docs/plans/2026-04-19-002-refactor-compact-returns-generalization-plan.md`
  - 5 units: schema _meta, template restructure, SKILL.md dispatch, synthesis pipeline, AGENTS.md pattern docs
  - Write-once dispatch: shared content (template + schema) written to disk once per run, lean prompts per agent (~1.5KB vs ~8-25KB)
  - Compact returns: agents write full findings to artifact files, return only merge-tier fields (evidence omitted)
  - Replaced `@` inlines with backtick refs (~7.5KB/message saved)
  - Added evidence batch-load to synthesis pipeline for artifact-based dedup and headless output
  - Documented "Sub-Agent Communication Patterns" in AGENTS.md
  - Estimated savings: ~63-75KB per 5-agent document review session
  - Review finding fixed: suggested_fix optionality alignment across files
  - All tests pass (780/782, 2 pre-existing), release:validate passes
- Brainstormed all 4 batch 5 ideas (#28, #11, #1, #15)
- Fixed P1/P2 findings on #11 requirements doc

## What's next

### Immediate: Plan remaining batch 5 ideas

#28 and #11 are planned and executed. Next in plan order:
1. #1 (Queryable Reference Libraries) -- run `/ce:plan`
2. #15 (Module Unbundling) -- run `/ce:plan`

### Then: Execute remaining batch 5

After plans are complete, execute in plan order (#1 -> #15).

### Decision point after batch 5

Per meta-plan: "Is #15 module unbundling worth the complexity? Check if Phases 1-3 savings are sufficient."

## Key files

- Meta-plan: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md`
- #28 plan (done): `docs/plans/2026-04-19-001-refactor-cartographic-zoom-plan.md`
- #11 plan (done): `docs/plans/2026-04-19-002-refactor-compact-returns-generalization-plan.md`
- #1 requirements: `docs/brainstorms/2026-04-19-queryable-reference-libraries-requirements.md`
- #15 requirements: `docs/brainstorms/2026-04-19-module-unbundling-requirements.md`
- Ablation framework: `scripts/ablation/run.ts`
