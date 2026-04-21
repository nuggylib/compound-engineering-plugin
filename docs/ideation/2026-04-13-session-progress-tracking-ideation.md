---
date: 2026-04-13
topic: session-progress-tracking
focus: lightweight automated progress tracking for multi-session git projects
---

# Ideation: Session Progress Tracking

## Codebase Context

The compound-engineering plugin manages 30 token-efficiency ideas across 7 phases and ~22 planned sessions. Progress tracking is hand-maintained in a meta-plan markdown file. Pain points: no session checkpoint mechanism, plan-to-execution status drift, worktree isolation loses context. Existing tools (session-historian, pm-checking-whats-next) are retrospective, not forward-looking.

Key institutional learnings: (1) status fields must be load-bearing, not advisory; (2) re-read state at session boundaries; (3) tracking docs must be discoverable via instruction files; (4) workflows are stateful, not linear.

**User constraint (Round 2):** Zero new infrastructure. Zero manual discipline. Must piggyback on existing artifacts (git, plan files, CLAUDE.md). The agent and hooks do the work.

## Ranked Ideas

### 1. CLAUDE.md Checkpoint Protocol
**Description:** 3 lines in CLAUDE.md: read checkpoint at session start, write checkpoint at session end, format as structured markdown. The agent IS the automation.
**Rationale:** Zero infrastructure. Single markdown file. Survives compaction. Works in any git repo.
**Downsides:** Agent might forget under heavy compaction. Quality depends on summarization.
**Confidence:** 92%
**Complexity:** Trivially Low
**Status:** Explored -- selected for plugin implementation

### 2. Plan Checkbox Auto-Completion
**Description:** 1 CLAUDE.md instruction: after completing a plan unit, check its checkbox and append completion date. Plans self-track.
**Rationale:** Plans already have checkboxes. The only missing piece is the instruction.
**Downsides:** Only works with plan documents that have checkboxes.
**Confidence:** 90%
**Complexity:** Trivially Low
**Status:** Explored -- selected for plugin implementation

### 3. Stop Hook Checkpoint Reminder
**Description:** Claude Code Stop hook that warns if checkpoint is stale. Safety net for the CLAUDE.md instruction.
**Rationale:** Hooks fire automatically. Pure shell one-liner.
**Downsides:** Can only remind, not write.
**Confidence:** 80%
**Complexity:** Low
**Status:** Explored -- selected for plugin implementation (upgraded to Stop hook that triggers checkpoint write)

### 4. Commit Message Plan Anchoring
**Description:** Convention: include `[unit:X]` in commits completing plan units. Git log becomes the progress dashboard.
**Rationale:** The work IS the tracking. Commits are durable.
**Downsides:** Only tracks completions, not in-progress.
**Confidence:** 85%
**Complexity:** Trivially Low
**Status:** Explored -- selected for plugin implementation

### 5. Meta-Plan Auto-Sync Instruction
**Description:** After completing a brainstorm or plan, update the corresponding row in the meta-plan tracking table.
**Rationale:** Meta-plan staleness is the problem. One instruction fixes it.
**Downsides:** Only for projects with meta-plans.
**Confidence:** 88%
**Complexity:** Trivially Low
**Status:** Explored -- selected for plugin implementation

### 6. Branch-to-Plan Discovery
**Description:** At session start, check branch name and search docs/plans/ for matching files. Branch name IS the discovery key.
**Rationale:** Connects existing artifacts with zero new infrastructure.
**Downsides:** Relies on meaningful branch names.
**Confidence:** 82%
**Complexity:** Trivially Low
**Status:** Explored -- selected for plugin implementation

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Cross-Project Progress Federation | Too much infrastructure |
| 2 | Session Budget Estimator | Requires runtime telemetry |
| 3 | Progress-Aware Agent Routing | Requires plugin architecture changes |
| 4 | Git Branch Topology as Tracker | Forces branching strategy changes |
| 5 | Plan-as-Makefile/DAG | Over-engineers the problem |
| 6 | Self-Reconciling Plan Documents | Too much machinery |
| 7 | Dependency-Aware Next-Action Ranker | Requires parsing infrastructure |
| 8 | Git-Native Progress Query Layer | Requires new scripts |
| 9 | Velocity Metrics | Meta-tracking, not core tracking |
| 10 | Worktree-Aware Progress Bridge | Niche; deferred to v2 |

## Session Log
- 2026-04-13: Initial ideation -- 40 candidates from 5 agents, 6 survived. User rejected first round (too much infrastructure, too much discipline). Re-ideated with hard constraint: zero infrastructure, zero discipline. All 6 survivors selected for plugin implementation as standalone "waypoint" plugin.
