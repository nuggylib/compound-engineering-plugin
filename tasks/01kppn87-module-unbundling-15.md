---
id: "01kppn87"
title: "Module Unbundling (#15)"
status: cancelled
priority: high
effort: large
type: feature
dependencies: ["01kppn7z"]
tags: ["token-efficiency", "architecture"]
context: ["docs/brainstorms/2026-04-19-module-unbundling-requirements.md"]
created_at: 2026-04-20
cancelled_at: 2026-04-20
---

# Module Unbundling (#15)

## Objective

Split compound-engineering plugin into 5 modules (core, git, review, frameworks, extras). Core-only install reduces always-loaded budget from 86% to 57%. Batch 5, Phase 4 of the token efficiency roadmap. Blocked until Queryable Reference Libraries (#1) execution completes.

## Tasks

- [ ] Plan Module Unbundling (01kppjtp)
- [ ] Execute Module Unbundling (01kppjtz)

- [ ] Run `bun test` and `bun run release:validate` after all units complete
- [ ] Update meta-plan tracking table with execution status
- [ ] Update plugin README and AGENTS.md with multi-module architecture

## Acceptance Criteria

- 5 independent plugin modules exist
- Core-only install works with reduced always-loaded budget
- All tests pass
- `bun run release:validate` passes
