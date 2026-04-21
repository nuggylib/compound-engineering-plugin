---
id: "01kppj"
title: "Convert agent-native-architecture to thin router"
status: completed
priority: high
effort: medium
type: improvement
parent: "01kppn7z"
dependencies: []
tags: ["token-efficiency", "thin-router"]
touches: ["compound-engineering"]
context: ["docs/plans/2026-04-19-003-refactor-queryable-reference-libraries-plan.md"]
created_at: 2026-04-20
completed_at: 2026-04-20
---

# Convert agent-native-architecture to thin router

## Objective

Extract 5 inline sections from `plugins/compound-engineering/skills/agent-native-architecture/SKILL.md` (18,322B) into reference files, remove "Why Now" section, and restructure into a dhh-rails-style thin router targeting ~4,030B. This is Unit 1 of the Queryable Reference Libraries plan.

## Tasks

- [x] Read current SKILL.md and identify the 5 extraction targets
- [x] Extract Core Principles (lines 14-128, ~4,793B) to `references/core-principles.md`
- [x] Extract Architecture Checklist (lines 170-212, ~2,196B) to `references/architecture-checklist.md`
- [x] Extract Quick Start (lines 214-249, ~1,056B) to `references/quick-start.md`
- [x] Extract Anti-Patterns (lines 277-359, ~3,821B) to `references/anti-patterns.md`
- [x] Extract Success Criteria (lines 361-402, ~1,784B) to `references/success-criteria.md`
- [x] Remove "Why Now" section (lines 7-12, 462B)
- [x] Restructure SKILL.md with XML-tagged sections: `<objective>`, `<intake>`, `<routing>`, `<reference_index>`, `<behavioral_guidelines>`
- [x] Enhance existing routing table with keyword mappings
- [x] Expand reference_index to include all 19 reference files (14 existing + 5 new)
- [x] Add fallback and cross-cutting routing instructions
- [x] Verify SKILL.md under 5,000B
- [x] Run `bun test` and `bun run release:validate`
- [x] Update meta-plan tracking table with execution status
- [x] Update plugin README if skill behavior or reference layout changed

## Acceptance Criteria

- SKILL.md under 5,000B
- All 5 extracted sections exist in reference files with complete, unmodified content
- "Why Now" section removed, no other content deleted
- Routing table maps all 13 numbered inputs to correct reference files
- Routing table maps keyword queries to correct references
- Section index lists all 19 reference files (14 existing + 5 new)
- Cross-cutting queries route to 2+ references
- Unmatched queries trigger intake menu re-presentation
- `bun test` passes
- `bun run release:validate` passes

## Workflow

Use the compound engineering workflow skills for brainstorming, planning, and working on this task.
