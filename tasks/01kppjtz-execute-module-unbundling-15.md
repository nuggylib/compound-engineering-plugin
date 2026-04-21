---
id: "01kppjtz"
title: "Execute Module Unbundling (#15)"
status: blocked
priority: medium
effort: large
type: feature
parent: "01kppn87"
dependencies: ["01kppjtp"]
tags: ["token-efficiency", "architecture"]
context: ["docs/brainstorms/2026-04-19-module-unbundling-requirements.md"]
created_at: 2026-04-20
---

# Execute Module Unbundling (#15)

## Objective

Execute the Module Unbundling plan once created and approved. Split compound-engineering into 5 modules: core, git, review, frameworks, extras. Core-only install reduces always-loaded budget from 86% to 57%.

## Tasks

- [ ] Execute plan units (TBD after planning)
- [ ] Verify module boundaries are correct
- [ ] Validate each module works independently
- [ ] Run `bun test` and `bun run release:validate`
- [ ] Update meta-plan tracking table with execution status
- [ ] Update plugin README with new module structure
- [ ] Update AGENTS.md if plugin architecture section needs revision

## Acceptance Criteria

- 5 independent plugin modules exist
- Core-only install works with reduced always-loaded budget
- All tests pass
- `bun run release:validate` passes

## Workflow

Use the compound engineering workflow skills for brainstorming, planning, and working on this task.
