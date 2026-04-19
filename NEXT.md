Continue the token-improvements work on the compound-engineering plugin.
Branch: token-improvements. Use compound engineering workflows.

## What's done this session

Ideas #19+#27 (Schelling/negative-space, 36KB saved) and #18 (Kolmogorov compression, 91KB saved) are executed and committed. Combined: ~127KB reduction across 20 review agents and 5 skills.

Idea #4 (Script-First Extraction) is executed but not yet committed. Three skills refactored:
- git-clean-gone-branches: `delete` subcommand added to existing clean-gone script, SKILL.md Step 3 replaced (-163B)
- git-commit-push-pr: new `scripts/resolve-context.sh` extracts default branch + base branch + PR detection cascades from Steps 1+6 (-379B)
- ce-review: new `scripts/resolve-pr-base.sh` extracts PR-path fork-safe remote resolution (-950B)
- 18 golden-output tests added, shared test helpers extracted to `tests/helpers/setup-test-repo.ts`
- Total SKILL.md reduction: ~1,492B (below plan's 8,050B projection -- replacement invocation instructions consume much of the freed space, but carrying cost still improves because deterministic shell moves out of context window)

## What's next

1. Commit idea #4 work
2. Return to the meta-plan at `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md` to pick the next batch. Batches 1-2 (ideas #9, #6, #5, #10, #7, #3, #8, #2, #21) are independent and ready.

## Key files

- Meta-plan: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md`
- #4 plan: `docs/plans/2026-04-18-008-refactor-script-first-extraction-plan.md`
- #18 final report: `.context/compression/final-report.md`
- Ablation framework: `scripts/ablation/run.ts`
- Ablation noise floor finding: `.context/compression/phase-1-validation.md` (noise floor 0.47, plan threshold 0.95 unreachable with single-run evals -- fix before next ablation-gated work)
