---
title: "Meta-Plan: Token Efficiency Execution Roadmap"
type: meta-plan
date: 2026-04-13
origin: docs/ideation/2026-04-08-token-efficiency-ideation.md
status: active
---

# Meta-Plan: Token Efficiency Execution Roadmap

## Purpose

Sequence the brainstorm and plan phases for all 30 token efficiency ideas from the ideation file. Each idea gets a full `/ce:brainstorm` then `/ce:plan` cycle. This document tracks which ideas are ready, which are blocked, and the order to process them.

## Status Legend

- `done` -- brainstorm + plan + execution complete
- `planned` -- brainstorm + plan complete, awaiting execution
- `brainstormed` -- brainstorm complete, awaiting plan
- `ready` -- no blockers, can start brainstorm
- `blocked` -- waiting on dependency
- `skipped` -- decided not to pursue

## Completed Work

| Idea | Status | Artifacts |
|------|--------|-----------|
| #26 Register Mismatch Correction | done (methodology + top 7 application) | `docs/brainstorms/2026-04-11-register-mismatch-correction-requirements.md`, `docs/plans/2026-04-11-001-feat-register-mismatch-correction-methodology-plan.md`, `docs/references/register-mismatch-correction-methodology.md` |
| (Prior) Description Trim + disable-model-invocation | done | `docs/plans/2026-02-08-refactor-reduce-plugin-context-token-usage-plan.md` |

## Execution Batches

### Batch 1: Foundation Measurement (Phase 0)

Two foundational ideas that produce data every later decision depends on. Brainstorm in parallel; plan sequentially (carrying cost may reorder Phase 2+ priorities).

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 14 | Empirical Ablation Framework | Medium | ready | none | Unlocks Phase 3 entirely (#19, #18, #27, #23, #25). Build the test harness first; everything else is guesswork without it |
| 20 | Carrying Cost Budgeting | Low | ready | none | Reframes optimization priority from file size to `size x tool_calls`. May reorder which skills get optimized in Phases 2-4 |

**Brainstorm order:** #14 and #20 in parallel (independent).
**Plan order:** #14 first (more ideas depend on it), then #20.

---

### Batch 2: Quick Wins (Phase 1)

All independent, no dependencies on Phase 0 or each other. Brainstorm and plan in any order. Four ideas since #26 is already done.

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 9 | Description Trim | Low | ready | none | Enforce existing 250-char guideline on 10 violating descriptions. ~8-10KB always-loaded savings |
| 6 | Merge ce-work/beta | Low | ready | none | 84 diff lines apart. Merge into single skill with mode flag. ~27KB dedup |
| 5 | Dead Content Audit | Low | ready | none | Manual audit of all 43 skills + 51 agents for deprecated/duplicated/verbose content. 10-20% bloat estimate |
| 10 | Token Guardrails | Low | ready | none | 3 static checks in release:validate. Prevents regression from all later work |

**Brainstorm order:** All 4 in parallel.
**Plan order:** #10 first (regression prevention gate), then #9, #6, #5 in any order.
**Execution note:** Ship #10 early so guardrails catch regressions from all subsequent work.

---

### Batch 3: Structural Dedup (Phase 2)

All independent of each other and Phase 0. Can run in parallel with Batch 1 execution. Five ideas (including #21 which was omitted from the ideation dependency graph).

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 7 | On-Demand Loading (ce-review) | Low | ready | none | Convert 5 @-inlined refs (29KB) to stage-specific reads. Fastest single change |
| 3 | Diff-Proportional Scaling | Low | ready | none | Cap reviewers proportional to diff size. One conditional in dispatch logic |
| 8 | Cross-Skill Instruction Dedup | Low | ready | none | Centralize 36 cross-platform boilerplate occurrences + 32 native tool occurrences in AGENTS.md |
| 2 | Lean Agent Dispatch | Medium-High | ready | none | Archetypes for 17 review agents + shared context dedup via .context/ file. Biggest single-step savings (~144KB/review) |
| 21 | Pipeline Semantic Dedup | Low-Medium | ready | none | Audit co-loaded skill pairs for semantic redundancy and conflicting instructions. Pairs naturally with #8 |

**Brainstorm order:** #7, #3, #8, #21 in parallel (all low complexity). Then #2 separately (medium-high, needs deeper exploration of archetype design).
**Plan order:** #7 first (1-hour implementation), #3 second (2-4 hours), #8 and #21 together (related dedup concerns), #2 last (largest scope).

---

### Batch 4: Ablation-Guided Optimization (Phase 3)

All require Phase 0 (#14) ablation data. Brainstorming can start before #14 execution completes, but plans need the data.

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 19 | L3/Negative-Space Agent Redesign | Medium | blocked (#14) | #14 ablation data | Audit + remove instructions restating model priors. Negative-space for review agents (exclusion boundaries vs inclusion lists) |
| 18 | Kolmogorov Compression | Medium | blocked (#14) | #14 ablation data | Replace exhaustive listings with minimal generative specs. 70-90% on applicable blocks |
| 27 | Schelling Point Architecture | Medium | blocked (#14) | #14 ablation data | Spend tokens only on non-Schelling behaviors. "Rest markers" for natural convergence points |
| 4 | Script-First Extraction | Medium | blocked (#14, #20) | #14 ablation data, #20 carrying cost (for prioritization) | Extract deterministic operations from top 5 procedural skills into co-located scripts |

**Brainstorm order:** #19 and #27 in parallel (complementary -- negative-space defines what to remove, Schelling defines what's already known). Then #18. Then #4.
**Plan order:** #4 first (most concrete, proven pattern). Then #19, #27, #18 (all depend on ablation results for specifics).
**Key constraint:** Brainstorms can define the approach and criteria. Plans must wait for #14 harness to provide empirical data on which instructions are load-bearing.

---

### Batch 5: Architecture (Phase 4)

Builds on Phases 1-3 work. Each idea restructures how content is organized or loaded.

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 1 | Queryable Reference Libraries | Medium | blocked (#20) | #20 carrying cost (for priority), Phase 2 structural work | Convert 3 encyclopedia skills (361KB) to thin routers with on-demand section loading |
| 11 | Compact Returns Generalization | Medium | blocked (Phase 2) | #2 lean dispatch (pattern to generalize) | Extend compact returns from ce-review to all sub-agent-dispatching skills |
| 28 | Cartographic Zoom / Cartouches | Low-Medium | blocked (Phase 2) | #2, #8 (need clean agent/skill boundaries first) | 3-5 line cartouches for orchestrator routing. Orchestrators carry ~300 bytes/downstream skill |
| 15 | Plugin Module Unbundling | High | blocked (Phases 1-3) | #9 description trim, #5 dead content audit, #10 guardrails | Split plugin into core + specialist modules. Depends on knowing final skill inventory |

**Brainstorm order:** #11 and #28 in parallel (both about reducing what orchestrators carry). Then #1 (larger restructuring). Then #15 last (needs stable skill inventory from prior phases).
**Plan order:** #28 first (low-medium complexity, clear deliverable). #11 second (extends proven pattern). #1 third. #15 last (highest complexity, needs most prior work complete).

---

### Batch 6: Session Lifecycle (Phase 5)

Addresses context degradation across long multi-phase sessions. Builds on Phase 4 architecture.

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 16 | Circuit Breaker + Resumption | Medium | blocked (Phase 4) | #11 compact returns, #1 reference libraries | Self-diagnostic at phase boundaries. Continuation prompts to .context/ |
| 17 | JIT Skill Specialization | Medium-High | blocked (Phase 3, Phase 4) | #4 script-first, #2 lean dispatch | Mode-conditional branch resolution at invoke time via PreToolUse hooks |
| 24 | RG Flow (Multi-Scale Hierarchy) | High | blocked (Phase 4) | #15 module unbundling, #1 reference libraries | Three self-consistent instruction tiers: macro (CLAUDE.md), meso (SKILL.md), micro (references/) |
| 29 | OODA Decision Manifests | Medium-High | blocked (Phase 4) | #11 compact returns, #28 cartouches | Pre-compute decision trees to .context/ at session start for multi-step orchestrators |

**Brainstorm order:** #16 first (enables #30 in Phase 6). #17 second (builds on #4 script-first concepts). #29 third (extends #28 cartouche thinking). #24 last (most complex, needs clearest picture of final architecture).
**Plan order:** Same as brainstorm order. These are sequential in nature.

---

### Batch 7: Experimental (Phase 6)

High-risk, high-reward ideas requiring validated foundation. Some may be skipped based on earlier results.

| # | Idea | Complexity | Status | Dependencies | Notes |
|---|------|-----------|--------|-------------|-------|
| 25 | Pidgin Instruction Language | Medium | blocked (#14, #26) | #14 ablation harness, #26 register mismatch (done) | Formalized minimal grammar for agent instructions. 90% reduction on agent content. Needs empirical validation |
| 23 | Model Self-Compression | Medium | blocked (#14, #19) | #14 ablation, #19 L3/negative-space | Model rewrites its own instructions in most efficient form. Highest risk idea |
| 30 | Congestion Pricing | High | blocked (#16) | #16 circuit breaker, context estimation | Pipeline-aware compression proportional to context load. Compressed variants from #17 JIT |
| 12 | PreCompact Hook | Medium | blocked (Phase 5) | #16 circuit breaker | Snapshot critical state before auto-compaction. 60% confidence |
| 13 | Phase Transition Markers | Low | blocked (Phase 5) | #16 circuit breaker | Soft deprecation signals at phase boundaries. 55% confidence |
| 22 | Positional Attention Budgeting | Low | blocked (#14) | #14 ablation data (to validate positioning effects) | Restructure skills for primacy/recency effect. 60% confidence |

**Brainstorm order:** #25 and #22 in parallel (both about instruction optimization, independent). Then #12 and #13 in parallel (both session lifecycle extensions). Then #23 (needs #19 results). Then #30 last (highest complexity, most dependencies).
**Plan order:** #13 first (lowest complexity). #22 second. #12 third. #25 fourth. #23 fifth (needs ablation safety net). #30 last.
**Gate:** After brainstorming each, explicitly decide go/skip based on confidence and prior phase results. Ideas below 60% confidence at brainstorm time are candidates for skipping.

---

## Cross-Batch Constraints

1. **#10 Token Guardrails** should be the first idea *executed* (not just planned) to prevent regression from all subsequent work.
2. **#14 Ablation Framework** blocks all of Phase 3. Start building the harness early even if Phase 1 execution is still in progress.
3. **#20 Carrying Cost** data may reorder priorities within Phases 2-4. Review batch ordering after #20 is complete.
4. **#26 Register Mismatch** is done. Its output (specification-register corpus) is a prerequisite for #25 Pidgin.
5. **Phase 2 can run in parallel with Phase 0.** Neither depends on the other. Brainstorm both batches concurrently.

## Session Strategy

Each brainstorm+plan pair is one session. Recommended session groupings:

| Session | Ideas | Est. Duration | Rationale |
|---------|-------|--------------|-----------|
| S1 | #14, #20 (brainstorm both) | 1 session | Foundation pair, independent, brainstorm in parallel |
| S2 | #14 (plan) | 1 session | Complex: test harness design needs focused planning |
| S3 | #20 (plan) | 1 session | Metric design + integration with skill:stats |
| S4 | #9, #6, #5, #10 (brainstorm all) | 1 session | All low complexity, brainstorm 4 in parallel |
| S5 | #10, #9, #6, #5 (plan all) | 1 session | All low complexity, plan 4 sequentially |
| S6 | #7, #3, #8, #21 (brainstorm all) | 1 session | Low complexity Phase 2, brainstorm in parallel |
| S7 | #2 (brainstorm) | 1 session | Medium-high: archetype design needs dedicated exploration |
| S8 | #7, #3, #8, #21 (plan all) | 1 session | Low complexity, plan sequentially |
| S9 | #2 (plan) | 1 session | Complex: build-time expansion, converter implications |
| S10 | #19, #27 (brainstorm both) | 1 session | Complementary: negative-space + Schelling points |
| S11 | #18, #4 (brainstorm both) | 1 session | Both about extracting/compressing content |
| S12 | #4, #19, #27, #18 (plan all) | 1-2 sessions | Plans need #14 data; may split if complex |
| S13 | #11, #28 (brainstorm both) | 1 session | Both about orchestrator context reduction |
| S14 | #1 (brainstorm) | 1 session | Large restructuring of 3 encyclopedia skills |
| S15 | #15 (brainstorm) | 1 session | High complexity: plugin architecture changes |
| S16 | #28, #11, #1, #15 (plan) | 1-2 sessions | Phase 4 plans, sequentially |
| S17 | #16, #17 (brainstorm both) | 1 session | Session lifecycle pair |
| S18 | #29, #24 (brainstorm both) | 1 session | Decision externalization + multi-scale hierarchy |
| S19 | #16, #17, #29, #24 (plan) | 1-2 sessions | Phase 5 plans |
| S20 | #25, #22, #12, #13 (brainstorm) | 1 session | Low-medium experimental batch |
| S21 | #23, #30 (brainstorm both) | 1 session | High-risk experimental pair |
| S22 | Phase 6 plans | 1-2 sessions | Go/skip gate before each plan |

**Total: ~22 sessions for brainstorm+plan across all 30 ideas.**

## Decision Points

After each batch, evaluate before proceeding:

| After Batch | Decision |
|-------------|----------|
| Batch 1 | Does #20 carrying cost data change the priority order of Batch 3 or Batch 5? |
| Batch 2 | Are any Phase 1 ideas not worth executing? (unlikely given low complexity) |
| Batch 3 | Does #2 archetype design affect #11 compact returns approach? |
| Batch 4 | Does #14 ablation data invalidate any Phase 3 ideas? Go/skip gate per idea |
| Batch 5 | Is #15 module unbundling worth the complexity? Check if Phases 1-3 savings are sufficient |
| Batch 6 | Are session lifecycle ideas needed? Check if compaction is still a problem after Phases 1-4 |
| Batch 7 | Per-idea go/skip gate. Ideas below 60% confidence after brainstorm are skipped |

## Tracking

Update this table as brainstorm/plan work progresses:

| # | Idea | Batch | Brainstorm | Plan | Execution | Notes |
|---|------|-------|-----------|------|-----------|-------|
| 14 | Empirical Ablation Framework | 1 | done | done | | `docs/brainstorms/2026-04-13-empirical-ablation-framework-requirements.md`, `docs/plans/2026-04-13-001-feat-empirical-ablation-framework-plan.md` |
| 20 | Carrying Cost Budgeting | 1 | done | done | | `docs/brainstorms/2026-04-13-carrying-cost-budgeting-requirements.md`, `docs/plans/2026-04-13-002-feat-carrying-cost-budgeting-plan.md` |
| 9 | Description Trim | 2 | | | | |
| 6 | Merge ce-work/beta | 2 | | | | |
| 5 | Dead Content Audit | 2 | | | | |
| 10 | Token Guardrails | 2 | | | | |
| 7 | On-Demand Loading | 3 | | | | |
| 3 | Diff-Proportional Scaling | 3 | | | | |
| 8 | Cross-Skill Dedup | 3 | | | | |
| 21 | Pipeline Semantic Dedup | 3 | | | | |
| 2 | Lean Agent Dispatch | 3 | | | | |
| 19 | L3/Negative-Space | 4 | | | | |
| 18 | Kolmogorov Compression | 4 | | | | |
| 27 | Schelling Points | 4 | | | | |
| 4 | Script-First Extraction | 4 | | | | |
| 1 | Queryable Reference Libraries | 5 | | | | |
| 11 | Compact Returns Generalization | 5 | | | | |
| 28 | Cartographic Zoom | 5 | | | | |
| 15 | Module Unbundling | 5 | | | | |
| 16 | Circuit Breaker + Resumption | 6 | | | | |
| 17 | JIT Specialization | 6 | | | | |
| 24 | RG Flow | 6 | | | | |
| 29 | OODA Decision Manifests | 6 | | | | |
| 25 | Pidgin Language | 7 | | | | |
| 23 | Model Self-Compression | 7 | | | | |
| 30 | Congestion Pricing | 7 | | | | |
| 12 | PreCompact Hook | 7 | | | | |
| 13 | Phase Transition Markers | 7 | | | | |
| 22 | Positional Attention Budgeting | 7 | | | | |
| 26 | Register Mismatch Correction | -- | done | done | done | Methodology + top 7 skills applied |
