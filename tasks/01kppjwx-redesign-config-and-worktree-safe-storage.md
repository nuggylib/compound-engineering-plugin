---
id: "01kppjwx"
title: "Redesign config and worktree-safe storage"
status: pending
priority: medium
effort: large
type: improvement
dependencies: []
tags: ["config", "infrastructure"]
touches: ["compound-engineering", "docs"]
context: ["docs/plans/2026-03-25-002-refactor-config-storage-redesign-plan.md", "docs/brainstorms/2026-03-25-config-storage-redesign-requirements.md"]
created_at: 2026-04-20
---

# Redesign config and worktree-safe storage

## Objective

Replace legacy repo-local config and storage assumptions with a two-scope state model: `user_state_dir` for user-level CE state and per-project durable storage, `repo_state_dir` for repo-local CE config. Execute the 5-unit plan from `docs/plans/2026-03-25-002-refactor-config-storage-redesign-plan.md`. Independent of the token-efficiency roadmap.

## Tasks

- [ ] Unit 1: AGENTS.md config/storage contract section
- [ ] Unit 2: ce-setup/ce-doctor sync with new state model
- [ ] Unit 3: Todo path migration (dual-read compatibility)
- [ ] Unit 4: Artifact skills repoint to new per-run paths
- [ ] Unit 5: Converter/test surface cleanup (remove old contract references)
- [ ] Run `bun test` and `bun run release:validate`
- [ ] Update plugin README with new storage model
- [ ] Update AGENTS.md config/storage documentation if not covered by Unit 1

## Acceptance Criteria

- Two-scope state model operational (user_state_dir, repo_state_dir)
- Worktree-safe: linked worktrees map to same CE project via git identity
- `/ce-setup` is sole migration writer
- Legacy `compound-engineering.local.md` treated as migration input only
- Todo dual-read compatibility during drain period
- All tests pass
- `bun run release:validate` passes

## Workflow

Use the compound engineering workflow skills for brainstorming, planning, and working on this task.
