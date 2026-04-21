Continue the token-improvements work on the compound-engineering plugin.
Branch: token-improvements. Use compound engineering workflows.

## What's done

- Rebased token-improvements onto origin/main (2026-04-21)
  - 52 commits replayed, ~49 files with both-sides changes
  - Key resolutions: accepted main's `ce-` prefix rename across all skills/agents,
    kept branch's token-trimmed descriptions and condensed boilerplate,
    redirected 4 document-review commits to new `ce-doc-review/` path,
    accepted deletions for removed skills (claude-permissions-optimizer, orchestrating-swarms, proof),
    combined branch's guardrails/staleness checks with main's metadataErrors in validate.ts
  - 1 commit skipped: orchestrating-swarms extraction (skill deleted on main)
  - Backup branch: token-improvements-backup (pre-rebase state)
- Executed #28 (Cartographic Zoom)
- Executed #11 (Compact Returns Generalization)
- Executed #1 (Queryable Reference Libraries) -- 3 encyclopedia skills converted to thin routers
- Deferred #15 (Module Unbundling) -- complexity not justified

## What's next

### Decide: Create a rebase/merge conflict resolution skill?

Session surfaced clear patterns that could become a skill (`ce-rebase` or similar):

**Patterns identified:**
1. Predictable conflict taxonomy: modify/delete (renamed/removed files), frontmatter-only (parallel metadata edits), content conflicts (real divergence), file-location conflicts (directory renames)
2. Repeatable resolution strategies: accept deletions for removed components, take branch version for branch's feature work, take main's naming/structural changes, redirect changes when paths were renamed
3. Safety protocol: backup branch, commit-by-commit progression, marker verification after each batch
4. Systematic find-replace: any rename on main (e.g., `ce:` -> `ce-`) creates bulk fixup needs across all branch conflicts

**Open questions:**
- Is this frequent enough to justify the token carrying cost of a full skill?
- Would a documented solution in `docs/solutions/` (lighter weight, discoverable by ce-learnings-researcher) serve better?
- If a skill: should it automate the python conflict-resolution script, or stay advisory?

### Token-improvements continuation

Review whether further token optimization work remains after #1 and the rebase. Check:
- Meta-plan: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md`
- Whether the rebase introduced any regressions (run `bun test` and `bun run release:validate`)

## Key files

- Meta-plan: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md`
- #28 plan (done): `docs/plans/2026-04-19-001-refactor-cartographic-zoom-plan.md`
- #11 plan (done): `docs/plans/2026-04-19-002-refactor-compact-returns-generalization-plan.md`
- #1 plan (done): `docs/plans/2026-04-19-003-refactor-queryable-reference-libraries-plan.md`
- Ablation framework: `scripts/ablation/run.ts`
