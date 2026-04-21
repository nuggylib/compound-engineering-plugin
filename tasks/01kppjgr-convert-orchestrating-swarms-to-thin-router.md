---
id: "01kppjgr"
title: "Convert orchestrating-swarms to thin router"
status: completed
priority: high
effort: large
type: improvement
parent: "01kppn7z"
dependencies: []
tags: ["token-efficiency", "thin-router"]
touches: ["compound-engineering"]
context: ["docs/plans/2026-04-19-003-refactor-queryable-reference-libraries-plan.md"]
created_at: 2026-04-20
completed_at: 2026-04-20
---

# Convert orchestrating-swarms to thin router

## Objective

Transform `plugins/compound-engineering/skills/orchestrating-swarms/SKILL.md` (35,574B) from a flat encyclopedia into a thin router (~3,800B) with intake menu and routing table. Extract 9 sections to new reference files. Highest-value conversion in the batch. This is Unit 2 of the Queryable Reference Libraries plan.

## Tasks

- [x] Read current SKILL.md (35,574B) and map all sections
- [x] Create abbreviated Primitives table (~500B, definitions only, no diagrams) for `<essential_principles>`
- [x] Create abbreviated Two Ways key difference table (~300B) for `<essential_principles>`
- [x] Extract full Primitives with diagrams (lines 13-94, 2,672B) to `references/primitives.md`
- [x] Extract Built-in Agent Types (lines 236-312, 2,022B) to `references/builtin-agent-types.md`
- [x] Extract Plugin Agent Types (lines 315-421, 3,385B) to `references/plugin-agent-types.md`
- [x] Extract Task System Integration (lines 432-519, 2,105B) to `references/task-system.md`
- [x] Extract Orchestration Patterns (lines 528-783, 7,769B) to `references/orchestration-patterns.md`
- [x] Extract Environment Variables (lines 786-809, 566B) to `references/environment-variables.md`
- [x] Extract Spawn Backends (lines 812-1079, 7,402B) to `references/spawn-backends.md`
- [x] Extract Error Handling (lines 1082-1141, 1,820B) to `references/error-handling.md`
- [x] Extract Best Practices + Quick Reference (lines 1150-1246, 2,322B) to `references/best-practices.md`
- [x] Incorporate Core Architecture (lines 114-172) into `references/orchestration-patterns.md`
- [x] Build intake menu (12 numbered options covering 9 new + 3 existing reference files)
- [x] Build routing table with keyword mappings for each topic
- [x] Build section index listing all 12 reference files with rich descriptors
- [x] Preserve `disable-model-invocation: true` in frontmatter
- [x] Add routing, fallback, and cross-cutting instructions
- [x] Verify SKILL.md under 5,000B
- [x] Run `bun test` and `bun run release:validate`
- [x] Update meta-plan tracking table with execution status
- [x] Update plugin README if skill behavior or reference layout changed

## Acceptance Criteria

- SKILL.md under 5,000B
- All 9 extracted sections exist in reference files with complete content
- `disable-model-invocation: true` preserved in frontmatter
- Abbreviated Primitives (~500B) covers all 8 terms; full version in `references/primitives.md`
- Routing table maps numbered inputs and keyword queries to correct reference files
- 3 existing reference stubs (tool-call-reference, message-formats, advanced-patterns) correctly referenced
- Cross-cutting queries route to 2-3 references
- Unmatched queries trigger intake menu fallback
- `bun test` passes
- `bun run release:validate` passes

## Workflow

Use the compound engineering workflow skills for brainstorming, planning, and working on this task.
