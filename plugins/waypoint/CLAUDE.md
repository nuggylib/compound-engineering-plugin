# Waypoint

Automatic session checkpoints and progress tracking for multi-session projects.

## Session Start

1. If `.context/checkpoint.md` exists, read it before doing anything else. It is the previous session's handoff and contains what was done, what's next, and how to resume.
2. Check the current git branch name. Search `docs/plans/` for plan files whose name or title matches the branch. If a meta-plan exists (frontmatter `type: meta-plan`), read its tracking table to understand overall project state.

## During Work

- After completing a plan implementation unit, update its checkbox: `- [ ]` becomes `- [x]` with the completion date appended (e.g., `- [x] **Unit 1: ...** (2026-04-13)`).
- After completing a brainstorm or plan artifact, update the corresponding row in any meta-plan tracking table that references it.
- In commit messages that complete a plan unit, include `[unit:N]` where N is the unit number (e.g., `feat(carrying-cost): add heuristic engine [unit:1]`).

## Session End

A Stop hook will block you from ending until `.context/checkpoint.md` is written. Write it when you are done. Keep it under 40 lines. The checkpoint must have enough context for a fresh session to pick up without re-reading the entire codebase.
