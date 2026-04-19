Continue the token-improvements work on the compound-engineering plugin.
Branch: token-improvements. Use compound engineering workflows.

## What's done this session

Ideas #19+#27 (Schelling/negative-space, 36KB saved) and #18 (Kolmogorov compression, 91KB saved) are executed and committed. Combined: ~127KB reduction across 20 review agents and 5 skills.

## What's next

Execute idea #4 (Script-First Extraction). The plan is ready at `docs/plans/2026-04-18-008-refactor-script-first-extraction-plan.md`. Read the plan and proceed with execution.

After #4, return to the meta-plan at `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md` to pick the next batch. Batches 1-2 (ideas #9, #6, #5, #10, #7, #3, #8, #2, #21) are independent and ready.

## Key files

- Meta-plan: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md`
- #4 plan: `docs/plans/2026-04-18-008-refactor-script-first-extraction-plan.md`
- #18 final report: `.context/compression/final-report.md`
- Ablation framework: `scripts/ablation/run.ts`
- Ablation noise floor finding: `.context/compression/phase-1-validation.md` (noise floor 0.47, plan threshold 0.95 unreachable with single-run evals -- fix before next ablation-gated work)
