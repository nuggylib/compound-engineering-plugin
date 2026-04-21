---
id: "01kppjtp"
title: "Plan Module Unbundling (#15)"
status: completed
priority: high
effort: medium
type: feature
parent: "01kppn87"
dependencies: ["01kppjh1"]
tags: ["token-efficiency", "architecture"]
touches: ["docs"]
context: ["docs/brainstorms/2026-04-19-module-unbundling-requirements.md", "docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md"]
created_at: 2026-04-20
completed_at: 2026-04-20
---

# Plan Module Unbundling (#15)

## Objective

Run `/ce:plan` on idea #15 (Module Unbundling) to create an implementation plan from the existing brainstorm. This splits the compound-engineering plugin into 5 modules (core, git, review, frameworks, extras) so core-only installs reduce always-loaded budget from 86% to 57%. Batch 5 of meta-plan. Blocked until #1 (Queryable Reference Libraries) execution completes.

## Tasks

- [x] Review brainstorm: `docs/brainstorms/2026-04-19-module-unbundling-requirements.md`
- [x] Evaluate decision point: "Is #15 module unbundling worth the complexity?"
- [ ] ~~If justified, run `/ce:plan` to create implementation plan~~ Skipped: deferred
- [ ] ~~Get plan reviewed and refined~~ Skipped: deferred
- [x] Run `taskmd validate` to verify task dependencies
- [x] Update meta-plan tracking table with plan status

## Decision (2026-04-20)

**Deferred.** Prior phases (1-4 + Batch 5 #1, #11, #28) reduced carrying cost significantly but did not reduce the always-loaded budget (still 86%). Module unbundling would reduce it to ~57% for core-only users, but the complexity (namespace changes across ~20 files, 5 marketplace entries, converter testing for 10 targets, release automation for 5 components) is not justified now. The 86% budget is not blocking any current work. Revisit if new capabilities push the budget near 100% or if Claude Code adds native module support.

## Acceptance Criteria

- Decision documented: proceed or skip
- If proceeding: plan file created at `docs/plans/` with implementation units
- Plan accounts for multi-plugin architecture using existing plugin system
- Dependencies on prior phases acknowledged

## Workflow

Use the compound engineering workflow skills for brainstorming, planning, and working on this task.
