---
title: "Pipeline Cross-Reference Matrix"
type: reference
date: 2026-04-16
purpose: Tracks shared constraints across pipeline skills to prevent reintroduction of semantic redundancy
---

# Pipeline Cross-Reference Matrix

Update this matrix when adding or modifying pipeline skill constraints to prevent reintroduction of semantic redundancy.

## Constraint Inventory

Redundancy classes: `true-redundancy` (verbatim repeat), `intentional-reinforcement` (same concept, different words), `phase-specialization` (same concept adapted per phase)

Interference classes: `phase-scoped` (safe after mitigation), `none` (no conflict)

| ID | Constraint | Skills | Redundancy Class | Interference Class | Bytes Before | Action Taken | Notes |
|----|-----------|--------|-----------------|-------------------|-------------|-------------|-------|
| 1A | Test discipline (4-category framework) | ce:plan, ce:work | intentional-reinforcement | none | ~480 B in ce:work | Compressed ce:work table to compact reference | ce:plan defines categories; ce:work references them |
| 1B | Execution posture signals | ce:plan, ce:work | phase-specialization | none | 0 (already compact) | No change | ce:work's references are execution-specific, not re-teaching |
| 1C | Slack context routing | ce:brainstorm, ce:plan | true-redundancy | none | ~500 B in ce:plan | Compressed ce:plan block to compact reference | ce:brainstorm is canonical owner |
| 1D | Scope assessment classification | ce:brainstorm, ce:plan | intentional-reinforcement | none | ~180 B | No change (standalone function) | Retained for ce:plan standalone invocation |
| 1E | Follow existing patterns | ce:plan, ce:work | intentional-reinforcement | none | ~350 B in ce:work | Compressed ce:work section to compact reference | ce:plan carries per-unit "Patterns to follow" |
| 1F | Domain classification routing | ce:brainstorm, ce:plan | intentional-reinforcement | none | ~350 B | No change (standalone function) | Retained for ce:plan standalone invocation |
| 2A | "NEVER CODE" vs "implement" | ce:plan, ce:work | N/A | phase-scoped | ~800 B across both | Phase-scoped all 6 directives with "During planning:" / "During execution:" | CRITICAL: 39% performance drop risk eliminated |
| 2B | "Ask questions" vs "Execute quickly" | ce:plan, ce:work | N/A | phase-scoped | ~200 B in ce:work | Phase-scoped 2 directives with "During execution:" | Low severity after 2A fix |
| 2C | "Ask user" vs "Skip all questions" | ce:review (modes) | N/A | phase-scoped | ~50 B | Prefixed mode-specific directives with "Report-only:" / "Headless:" | Survives compaction that drops section headers |
| 2D | "Source of truth" vs "Guide" | ce:plan, ce:work | phase-specialization | none | 0 | No change | Intentional framing difference between phases |
