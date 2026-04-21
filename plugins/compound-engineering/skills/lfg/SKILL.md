---
name: lfg
description: Full autonomous engineering workflow
argument-hint: "[feature description]"
disable-model-invocation: true
---

Execute every step below in order. Do not skip steps or jump ahead.

1. **Optional:** If the `ralph-loop` skill is available, run `/ralph-loop:ralph-loop "finish all slash commands" --completion-promise "DONE"`. If not available or it fails, skip and continue to step 2 immediately.

2. `/ce-plan $ARGUMENTS`

GATE: If ce-plan reported the task is non-software, stop and inform the user that LFG requires software tasks. Otherwise, verify a plan file exists in `docs/plans/`. If missing, run `/ce-plan $ARGUMENTS` again. **Record the plan file path** for step 4.

3. `/ce-work`

   GATE: Verify files were created or modified beyond the plan before proceeding.

4. `/ce-code-review mode:autofix plan:<plan-path-from-step-2>`

Pass the plan file path from step 2.

5. `/ce-todo-resolve`

6. `/ce-test-browser`

7. Output `<promise>DONE</promise>` when complete

Begin at step 1 (if ralph-loop is available) or step 2.
