---
title: "Pipeline Carrying-Waste Manifest"
type: reference
date: 2026-04-16
purpose: Input to idea #13 (Phase Transition Markers) and #17 (JIT Skill Specialization)
---

# Pipeline Carrying-Waste Manifest

This manifest documents what content to evict or deprioritize at phase boundaries. Update when pipeline skill content changes.

Byte sizes measured from current files on 2026-04-16.

## ce:brainstorm (11,614 bytes)

| Section | Bytes | Relevance Window | Downstream Relevance | Notes |
|---------|-------|-----------------|---------------------|-------|
| YAML frontmatter | 294 | pipeline-wide | Routing and identity | Tiny; always needed for dispatch |
| When to Use | 385 | brainstorm-only | None | Trigger-matching text; irrelevant once skill is active |
| Core Principles | 1,132 | brainstorm-only | None | Guides brainstorm behavior only |
| Interaction Rules | 501 | pipeline-wide | Shared with ce:plan | Question-asking discipline reused by planning |
| Output Guidance | 184 | brainstorm-only | None | Brief; negligible waste |
| Feature Description block | 322 | brainstorm-only | None | Argument injection template |
| Phase 0: Resume, Assess, and Route | 2,329 | brainstorm-only | None | Resume logic, domain classification, scope assessment |
| Phase 1: Understand the Idea | 3,825 | brainstorm-only | None | Context scan, pressure test, collaborative dialogue |
| Phase 1.3: Collaborative Dialogue | 793 | brainstorm-only | None | Subset of Phase 1; the interactive exploration instructions |
| Phase 2: Explore Approaches | 1,270 | brainstorm-only | None | Approach generation and evaluation |
| Phase 3: Capture the Requirements | 372 | brainstorm-only | None | Delegates to reference file |
| Phase 3.5: Document Review | 436 | brainstorm-only | None | Post-capture review trigger |
| Phase 4: Handoff | 180 | brainstorm-only | Triggers ce:plan | Small dispatch stub |

**Phase-only total: ~10,031 bytes (86% of file)**

## ce:plan (44,635 bytes)

| Section | Bytes | Relevance Window | Downstream Relevance | Notes |
|---------|-------|-----------------|---------------------|-------|
| YAML frontmatter + intro | 1,181 | pipeline-wide | Routing and identity | Describes plan vs brainstorm boundary |
| When to Use + Interaction + Feature + Core Principles + Plan Quality Bar | 3,825 | plan-only | None | Trigger matching and philosophical guidance |
| Phase 0: Resume, Source, and Scope | 7,437 | plan-only | None | Resume detection, source doc binding, depth classification |
| Phase 1: Gather Context | 7,820 | plan-only | None | Research agent dispatch, external research gating, flow analysis |
| Phase 1.1-1.3: Research infrastructure | 7,395 | plan-only | None | Local research, posture detection, external research decision and dispatch |
| Phase 1.4-1.5: Consolidation + flow analysis | 1,752 | plan-only | None | Research synthesis and edge-case analysis |
| Phase 2: Resolve Planning Questions | 785 | plan-only | None | Question triage before structuring |
| Phase 3: Structure the Plan | 7,142 | plan-only | None | Title/file naming, unit breakdown, technical design, output structure |
| Phase 4: Write the Plan | 9,165 | plan-only | None | Depth guidance, deep extensions, plan template, planning rules, visual communication |
| Phase 4.2: Core Plan Template (embedded markdown) | 5,719 | plan-only | None | Full plan template with frontmatter; largest single carrying-waste block |
| Phase 4.2: Main template code block | 4,821 | plan-only | None | Subset: the fenced markdown template |
| Phase 4.2: Deep extensions code block | 696 | plan-only | None | Subset: optional sections for deep plans |
| Phase 4.3: Planning Rules | 1,499 | plan-only | None | Formatting constraints for plan documents |
| Phase 5: Final Review, Write File, and Handoff | 7,172 | plan-only | None | Pre-write checks, confidence scoring, deepening, document review, handoff |
| Phase 5.1: Review Before Writing | 2,431 | plan-only | None | Validation checklist |
| Phase 5.3: Confidence Check and Deepening | 4,186 | plan-only | None | Depth classification, gate, deepening dispatch |

**Phase-only total: ~43,346 bytes (97% of file)**

## ce:work (24,240 bytes)

| Section | Bytes | Relevance Window | Downstream Relevance | Notes |
|---------|-------|-----------------|---------------------|-------|
| YAML frontmatter | 220 | pipeline-wide | Routing and identity | Tiny |
| Introduction | 310 | work-only | None | Brief description of purpose |
| Argument Parsing + Settings Resolution | 3,208 | work-only | None | Delegation token parsing, config resolution chain |
| Phase 0: Input Triage | 1,360 | work-only | None | Bare-prompt vs plan-file routing; complexity assessment |
| Phase 1 Step 1: Read Plan and Clarify | 1,441 | work-only | None | Plan reading instructions; irrelevant once plan is understood |
| Phase 1 Step 2: Setup Environment (branch setup) | 2,213 | work-only | None | Branch creation/worktree logic; irrelevant once environment exists |
| Phase 1 Step 3: Create Todo List | 912 | work-only | None | Task derivation from plan units |
| Phase 1 Step 4: Choose Execution Strategy | 2,462 | work-only | None | Delegation routing, inline vs subagent decision |
| Phase 2: Execute (task loop) | 8,725 | work-only | None | Core execution loop with test discovery, system-wide checks |
| Phase 2: Incremental Commits | (incl.) | work-only | None | Commit heuristics embedded in Phase 2 |
| Phase 3-4: Quality Check and Ship It | 277 | work-only | Triggers ce:review | Stub to reference file |
| Codex Delegation Mode | 256 | work-only | None | Stub to reference file |
| Key Principles | 955 | pipeline-wide | Shared philosophy | General execution philosophy; lightweight |
| Common Pitfalls to Avoid | 538 | work-only | None | Anti-pattern checklist |

**Phase-only total: ~22,702 bytes (94% of file)**

## ce:review (52,640 bytes)

| Section | Bytes | Relevance Window | Downstream Relevance | Notes |
|---------|-------|-----------------|---------------------|-------|
| YAML frontmatter | 271 | pipeline-wide | Routing and identity | Tiny |
| When to Use | 244 | review-only | None | Trigger text |
| Argument Parsing | 1,690 | review-only | None | Token extraction for mode, base, plan, cap |
| Mode Detection (incl. autofix, report-only, headless rules) | 4,917 | review-only | None | Mode tables and per-mode behavioral rules |
| Severity Scale | 505 | review-only | None | P0-P3 definitions |
| Action Routing | 1,306 | review-only | None | autofix_class routing table |
| Reviewers (persona catalog reference) | 3,183 | review-only | None | Always-on and conditional reviewer tables |
| Protected Artifacts | 528 | review-only | None | Path protection rules |
| Stage 1: Determine scope | 9,291 | review-only | None | Diff computation, base resolution, executable line counting |
| Stage 2 + 2b: Intent + Plan discovery | 3,165 | review-only | None | Intent summary, plan source detection |
| Stage 3 + 3b: Select reviewers + standards paths | 5,414 | review-only | None | Conditional selection logic, diff-proportional cap |
| Stage 4: Spawn sub-agents | 4,348 | review-only | None | Model tiering, run ID, subagent prompt assembly |
| Stage 5: Merge findings | 3,142 | review-only | None | Validation, confidence gating, dedup, cross-reviewer agreement |
| Stage 6: Synthesize and present | 3,148 | review-only | None | Report assembly with 12 output sections |
| Headless output format | 3,490 | review-only | None | Structured text envelope for programmatic callers |
| Quality Gates | 1,174 | review-only | None | Pre-delivery verification checklist |
| Language-Aware Conditionals | 226 | review-only | None | Brief stack-specific note |
| After Review (post-review flow) | 6,362 | review-only | None | Action sets, fix application, artifact emission, next steps |

**Phase-only total: ~52,098 bytes (99% of file)**

## ce:compound (24,508 bytes)

| Section | Bytes | Relevance Window | Downstream Relevance | Notes |
|---------|-------|-----------------|---------------------|-------|
| YAML frontmatter | 109 | pipeline-wide | Routing and identity | Tiny |
| Purpose + Usage | 196 | compound-only | None | Brief; negligible |
| Support Files | 474 | compound-only | None | Reference file listing |
| Execution Strategy (mode selection prompt) | 893 | compound-only | None | Full vs lightweight mode choice |
| Full Mode critical requirement | 417 | compound-only | None | Single-file output constraint |
| Phase 0.5: Auto Memory Scan | 902 | compound-only | None | Memory directory check and excerpt prep |
| Phase 1: Research (parallel subagents) | 6,697 | compound-only | None | Context Analyzer, Solution Extractor, Related Docs Finder, Session Historian |
| Phase 2: Assembly and Write | 2,273 | compound-only | None | Overlap check, session history integration, file write |
| Phase 2.5: Selective Refresh Check | 2,531 | compound-only | None | Stale doc detection and ce:compound-refresh gating |
| Discoverability Check | 2,307 | compound-only | None | Instruction file assessment for docs/solutions/ visibility |
| Phase 3: Optional Enhancement | 906 | compound-only | None | Specialized agent dispatch by problem type |
| Lightweight Mode | 2,000 | compound-only | None | Single-pass alternative workflow |
| Preconditions | 363 | compound-only | None | Advisory precondition checks |
| What It Creates | 418 | compound-only | None | Category directory listing |
| Success Output | 1,607 | compound-only | None | Output format examples |
| Auto-Invoke | 274 | compound-only | None | Trigger phrase list |
| Output | 80 | compound-only | None | One-line output path |
| Applicable Specialized Agents | 1,011 | compound-only | None | Agent reference tables |
| Related Commands | 150 | pipeline-wide | Cross-skill links | Mentions /research and /ce:plan |

**Phase-only total: ~24,129 bytes (98% of file)**

## Summary

### Total Pipeline Content

| Skill | Total Bytes | Phase-Only Bytes | Pipeline-Wide Bytes | Phase-Only % |
|-------|-------------|-----------------|--------------------:|----------:|
| ce:brainstorm | 11,614 | 10,031 | 1,583 | 86% |
| ce:plan | 44,635 | 43,346 | 1,289 | 97% |
| ce:work | 24,240 | 22,702 | 1,538 | 94% |
| ce:review | 52,640 | 52,098 | 542 | 99% |
| ce:compound | 24,508 | 24,129 | 379 | 98% |
| **Totals** | **157,637** | **152,306** | **5,331** | **97%** |

### Carrying-Waste Potential by Phase Transition

At each pipeline boundary, all content from completed phases becomes carrying waste if it remains loaded:

| Transition | Bytes Evictable | Cumulative Evictable | % of Total Pipeline |
|------------|---------------:|---------------------:|--------------------:|
| brainstorm -> plan | 10,031 | 10,031 | 6% |
| plan -> work | 43,346 | 53,377 | 34% |
| work -> review | 22,702 | 76,079 | 48% |
| review -> compound | 52,098 | 128,177 | 81% |

### Top Carrying-Waste Blocks (Sorted by Size)

These are the largest discrete blocks that become irrelevant after their phase completes:

| Rank | Skill | Section | Bytes | Window |
|------|-------|---------|------:|--------|
| 1 | ce:review | Stage 1: Determine scope | 9,291 | review-only |
| 2 | ce:work | Phase 2: Execute (task loop) | 8,725 | work-only |
| 3 | ce:plan | Phase 1: Gather Context | 7,820 | plan-only |
| 4 | ce:plan | Phase 0: Resume, Source, and Scope | 7,437 | plan-only |
| 5 | ce:plan | Phase 3: Structure the Plan | 7,142 | plan-only |
| 6 | ce:plan | Phase 5: Final Review, Write File, and Handoff | 7,172 | plan-only |
| 7 | ce:compound | Phase 1: Research | 6,697 | compound-only |
| 8 | ce:review | After Review | 6,362 | review-only |
| 9 | ce:plan | Phase 4.2: Core Plan Template | 5,719 | plan-only |
| 10 | ce:review | Stage 3+3b: Select reviewers | 5,414 | review-only |

### Brainstorm Estimate vs Actual Comparison

| Skill | Section | Brainstorm Estimate | Actual | Delta |
|-------|---------|--------------------:|-------:|------:|
| ce:plan | Phase 1 research infrastructure | ~10,000 | 7,820 | -2,180 |
| ce:plan | Core Plan Template (Phase 4.2) | ~4,800 | 5,719 | +919 |
| ce:brainstorm | Phase 1 collaborative dialogue | ~2,000 | 3,825 | +1,825 |
| ce:work | Phase 1 Step 2 branch setup | ~2,200 | 2,213 | +13 |
| ce:review | Mode detection + argument parsing | ~4,200 | 6,607 | +2,407 |

Notes: The brainstorm estimates were directionally correct but underestimated ce:brainstorm Phase 1 (which includes context scan and pressure test, not just dialogue) and ce:review argument parsing (which includes detailed headless mode rules). The ce:plan research infrastructure estimate included more than Phase 1 alone. Actual measurements supersede estimates.
