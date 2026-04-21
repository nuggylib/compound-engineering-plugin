---
id: "01kppjgw"
title: "Convert dspy-ruby to thin router"
status: pending
priority: high
effort: large
type: improvement
parent: "01kppn7z"
dependencies: []
tags: ["token-efficiency", "thin-router"]
context: ["docs/plans/2026-04-19-003-refactor-queryable-reference-libraries-plan.md"]
created_at: 2026-04-20
---

# Convert dspy-ruby to thin router

## Objective

Transform `plugins/compound-engineering/skills/dspy-ruby/SKILL.md` (21,472B) from an inline quick-reference into a thin router (~4,520B) with intake menu and routing table. Extract 15 sections into 5 consolidated reference files following information-type boundaries. This is Unit 3 of the Queryable Reference Libraries plan.

## Tasks

- [ ] Read current SKILL.md (21,472B) and map all sections
- [ ] Create abbreviated Core Concepts (~500B, concept names + 1-line descriptions, no code)
- [ ] Consolidate and extract to `references/getting-started.md` (Quick Start + Provider Adapters + Schema Formats + Storage + Version, ~2.9KB)
- [ ] Consolidate and extract to `references/runtime.md` (Events System + Lifecycle Callbacks + Fiber-Local LM Context, ~2.4KB)
- [ ] Consolidate and extract to `references/rails-patterns.md` (Rails Integration + Schema-Driven Signatures + Tool Patterns, ~5.2KB)
- [ ] Consolidate and extract to `references/evaluation.md` (Evaluation Framework + GEPA Optimization + Typed Context Pattern, ~2.0KB)
- [ ] Extract to `references/testing.md` (Testing section, ~1.3KB)
- [ ] Route Observability queries to existing `references/observability.md` (no new file)
- [ ] Abbreviate "Guidelines for Claude" (2,724B -> ~750B cross-cutting in router, topic-specific to reference files)
- [ ] Build intake menu (8-10 numbered options)
- [ ] Build routing table with keyword mappings
- [ ] Build section index listing all reference files (5 existing + 5 new) and 3 assets
- [ ] Keep Overview, Key URLs, and Version in router
- [ ] Add routing, fallback, and cross-cutting instructions
- [ ] Verify SKILL.md under 5,000B
- [ ] Run `bun test` and `bun run release:validate`
- [ ] Update meta-plan tracking table with execution status
- [ ] Update plugin README if skill behavior or reference layout changed

## Acceptance Criteria

- SKILL.md under 5,000B
- All 15 extracted sections exist across 5 consolidated reference files
- Consolidated files follow information-type boundaries (getting-started, runtime, rails-patterns, evaluation, testing)
- Existing reference files (core-concepts, toolsets, providers, optimization, observability) unchanged
- Existing assets (module-template.rb, config-template.rb, signature-template.rb) referenced in routing
- Cross-cutting "Guidelines for Claude" preserved in router; topic-specific guidelines in reference files
- Routing table maps keyword queries to correct references
- Cross-cutting queries route to 2-3 references
- Unmatched queries trigger intake menu fallback
- `bun test` passes
- `bun run release:validate` passes

## Workflow

Use the compound engineering workflow skills for brainstorming, planning, and working on this task.
