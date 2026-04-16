---
date: 2026-04-16
topic: on-demand-loading
idea: 7
phase: 2
status: brainstormed
---

# Eager @-Inline to On-Demand Loading (ce-review)

## Problem Frame

ce-review's SKILL.md (48,405 bytes, 731 lines) `@`-inlines 5 reference files totaling 28,991 bytes at trigger time. All 5 files resolve into the orchestrator's context at the moment the skill loads and persist in every subsequent message for the entire session. ce-review is the plugin's most tool-call-intensive skill, typically making 30-50+ tool calls across 6 stages (scope detection, intent discovery, plan discovery, reviewer selection/dispatch, merge, synthesis/presentation). Each reference file's carrying cost is its size multiplied by every API call that follows its introduction.

The 5 inlined references are consumed at different stages:

| File | Bytes | Lines | Consumed at | Carried from |
|------|------:|------:|-------------|-------------|
| `persona-catalog.md` | 5,908 | 67 | Stage 3 (reviewer selection) | Stage 1 (trigger) |
| `subagent-template.md` | 7,325 | 106 | Stage 4 (sub-agent dispatch) | Stage 1 (trigger) |
| `diff-scope.md` | 1,818 | 31 | Stage 4 (injected into sub-agent prompts) | Stage 1 (trigger) |
| `findings-schema.json` | 6,615 | 134 | Stage 4 (injected into sub-agent prompts) | Stage 1 (trigger) |
| `review-output-template.md` | 7,325 | 148 | Stage 6 (report formatting) | Stage 1 (trigger) |
| **Total** | **28,991** | **486** | | |

The carrying cost problem:
- All 28,991 bytes enter the orchestrator's context at Stage 1 and ride through every subsequent tool call.
- The persona catalog is first consumed at Stage 3 (after scope detection and intent discovery) -- it carries unused through Stages 1-2.
- The subagent template, diff-scope rules, and findings schema are consumed at Stage 4 -- they carry unused through Stages 1-3. After dispatch, these three are only needed by sub-agents (who receive them in their prompts), not the orchestrator. The orchestrator never references them again after Stage 4.
- The review output template is consumed at Stage 6 (the final stage) -- it carries unused through Stages 1-5, the entirety of the sub-agent dispatch and merge phases.
- After Stage 4 dispatch, the orchestrator's only use of reference content is the output template (Stage 6). The other 4 files (21,666 bytes) serve zero purpose in the orchestrator's context for the remainder of the session.

### Compact returns reduce orchestrator dependency on schema

The compact returns implementation (commit a5ce094) split findings into two tiers: merge-tier fields returned to the orchestrator, and detail-tier fields written to disk artifacts. The orchestrator no longer needs the full findings schema to validate or process sub-agent returns -- it works with a well-defined subset (title, severity, file, line, confidence, autofix_class, owner, requires_verification, pre_existing, suggested_fix). The schema's primary consumer is now the sub-agents themselves, who receive it in their prompts via the subagent template.

This means the findings schema (6,615 bytes) has no functional role in the orchestrator's context after Stage 4 dispatch. It is purely sub-agent-facing content.

## Current State

### How @-inlining works

The `@` file inclusion syntax resolves relative to the SKILL.md at load time, substituting the file's full content inline before the model sees it. The SKILL.md contains these 5 `@` references in a trailing "Included References" section (lines 711-731):

```markdown
## Included References

### Persona Catalog
@./references/persona-catalog.md

### Subagent Template
@./references/subagent-template.md

### Diff Scope Rules
@./references/diff-scope.md

### Findings Schema
@./references/findings-schema.json

### Review Output Template
@./references/review-output-template.md
```

### AGENTS.md compliance checklist guidance

The Skill Compliance Checklist in `plugins/compound-engineering/AGENTS.md` specifies:

- **Default: use backtick paths.** Most reference files should be referenced with backtick paths so the agent can load them on demand.
- **Exception: `@` inline for small structural files** that the skill cannot function without and that are under ~150 lines (schemas, output contracts, subagent dispatch templates).

The checklist also specifies the **Conditional and Late-Sequence Extraction** pattern: extract blocks to `references/` when they are conditional or late-sequence and represent a meaningful share of the skill (~20%+). "The more tool/agent calls a skill makes, the more aggressively to extract."

### Current file sizes vs threshold

| File | Lines | Under ~150? | Always needed by orchestrator? |
|------|------:|:-----------:|:------------------------------:|
| `persona-catalog.md` | 67 | yes | Only at Stage 3 |
| `subagent-template.md` | 106 | yes | Only at Stage 4, then sub-agent-facing |
| `diff-scope.md` | 31 | yes | Only at Stage 4, then sub-agent-facing |
| `findings-schema.json` | 134 | yes | Only at Stage 4, then sub-agent-facing |
| `review-output-template.md` | 148 | borderline | Only at Stage 6 |

All 5 files are under or near the ~150-line threshold. However, the checklist's exception is for files "that the skill cannot function without" -- a criterion about essentiality, not just size. Three of these files (subagent-template, diff-scope, findings-schema) are sub-agent-facing content that the orchestrator injects into dispatch prompts and never references again. The orchestrator can function without them in its own context; it only needs to read them at the moment of dispatch.

### Dead content audit interaction

The dead content audit (idea #5, commit ddb079f) condensed cross-platform boilerplate across skills and agents but did not change the `@`-inlining strategy for ce-review's reference files. The register-mismatch correction (commit f14419b) tightened prose in the SKILL.md body but likewise left the reference inclusion mechanism unchanged. Current file sizes reflect post-audit content.

## Requirements

### R1: Convert all 5 `@`-inlined references to backtick-path on-demand reads

Replace the `## Included References` section's `@` file inclusions with backtick-path references. Each reference should be loaded at the stage where it is first consumed, not at skill trigger time.

### R2: Add stage-specific read instructions at each consumption point

Insert a read instruction at the point in each stage where the reference is needed:

| Stage | File to read | Instruction placement |
|-------|-------------|----------------------|
| Stage 3 (Select reviewers) | `references/persona-catalog.md` | Before reviewer selection logic |
| Stage 4 (Spawn sub-agents) | `references/subagent-template.md` | Before the spawning instructions |
| Stage 4 (Spawn sub-agents) | `references/diff-scope.md` | Alongside subagent template (injected into sub-agent prompts) |
| Stage 4 (Spawn sub-agents) | `references/findings-schema.json` | Alongside subagent template (injected into sub-agent prompts) |
| Stage 6 (Synthesize and present) | `references/review-output-template.md` | Before report assembly instructions |

Each read instruction should be a 1-2 line stub stating what to read and why, following the established extraction pattern: "Read `references/persona-catalog.md` for the full reviewer persona catalog with selection rules."

### R3: Remove the trailing "Included References" section

The `## Included References` section (lines 711-731) exists solely to house the 5 `@` inclusions. After converting to stage-specific reads, this section has no content and should be removed. The section headers ("### Persona Catalog", "### Subagent Template", etc.) are not referenced from anywhere else in the SKILL.md.

### R4: Keep existing body references intact

The SKILL.md body already references these files by name in context (e.g., "the persona catalog included below", "the subagent template included below", "the findings schema included below"). Update these references to match the new loading pattern -- change "included below" to the backtick-path form (e.g., "the persona catalog in `references/persona-catalog.md`").

### R5: Preserve sub-agent prompt assembly semantics

Stage 4 assembles sub-agent prompts by injecting diff-scope rules, findings schema, and the subagent template into each reviewer's dispatch context. The conversion must not change what sub-agents receive -- only when and how the orchestrator loads the source content for assembly. The orchestrator reads the 3 files once at Stage 4 start and uses them for all dispatches.

### R6: Validate that existing SKILL.md cross-references resolve correctly

The SKILL.md references "the diff-scope reference included below" (line 409), "the findings schema included below" (line 410), "the review output template included below" (line 482), and "the persona catalog included below" (line 104). After conversion, each cross-reference must point to the correct backtick path and appear at or before the stage where it is consumed.

## Constraints

### C1: No change to sub-agent behavior

Sub-agents must receive identical prompt content (persona file, diff-scope rules, schema, template variables) regardless of whether the orchestrator loaded the content eagerly or on demand. This is a refactor of the orchestrator's loading strategy, not a change to the sub-agent contract.

### C2: No change to skill frontmatter

The SKILL.md frontmatter (`name`, `description`, `argument-hint`) must not change.

### C3: Reference file content unchanged

The 5 reference files themselves are not modified by this change. Only the inclusion mechanism in SKILL.md changes.

### C4: Tool call increase is acceptable

Converting from `@`-inline (0 tool calls) to on-demand reads adds up to 5 Read tool calls per review session. This is a favorable trade: ~29KB of carried context savings across 30-50+ tool calls vs. 5 additional Read calls concentrated at Stages 3, 4, and 6.

### C5: Compliance checklist re-evaluation

The current checklist says `@` inline is appropriate for files under ~150 lines that the skill "cannot function without." This change interprets that criterion narrowly: the orchestrator can function without sub-agent-facing content in its own context. The checklist guidance does not need to change -- the existing "Conditional and Late-Sequence Extraction" section already supports this conversion for skills with many tool/agent calls.

## Open Questions

### OQ1: Should diff-scope.md remain inlined given its small size?

At 31 lines (1,818 bytes), diff-scope.md is the smallest of the 5 files. Its carrying cost is low in absolute terms. However, it is consumed only at Stage 4 (where it is injected into sub-agent prompts) and has no purpose in the orchestrator's context afterward. The carrying cost argument still applies even at this size given ce-review's high tool-call volume. **Recommendation: convert it for consistency. The overhead of one additional Read call is negligible.**

### OQ2: Should Stage 4 files be read individually or as a batch?

The subagent template, diff-scope rules, and findings schema are all consumed at Stage 4 for the same purpose (sub-agent prompt assembly). They could be read as 3 separate Read calls, or the Stage 4 instruction could list all 3 paths in a single "read these files" directive. **Recommendation: list all 3 in a single instruction block to signal they are consumed together, while keeping them as separate files for maintainability.**

### OQ3: Does the persona catalog need to be loaded before Stage 3?

The SKILL.md body mentions the persona catalog at line 104 in Stage 3's reviewer table ("See the persona catalog included below for the full catalog"). Stage 3's instructions already enumerate the always-on and conditional reviewers inline. The catalog provides the full details (agent names, selection rules) needed for the selection decision. Loading at Stage 3 start is correct -- no earlier consumption exists.

## Risks

### Risk 1: Orchestrator fails to read a reference at the correct stage (Low)

If the stage-specific read instruction is skipped or misread, the orchestrator would proceed without the reference content. Mitigation: each read instruction is placed immediately before the logic that consumes the content, making it a natural prerequisite. The existing conditional/late-sequence extraction pattern is proven across ce-plan, ce-brainstorm, ce-ideate, and document-review.

### Risk 2: Multiple Read calls slow down the review (Low)

Five additional Read calls add latency. However, each Read is a local file read (sub-millisecond), not a network call. The latency is negligible compared to the sub-agent dispatch and merge stages that dominate ce-review's runtime.

### Risk 3: Post-compaction, stage-specific read instructions may be lost (Medium)

If compaction summarizes or drops the read instruction for a late-stage file (e.g., the Stage 6 output template instruction), the orchestrator might not load the template for report formatting. Mitigation: read instructions placed as the first line of their respective stage section have strong positional anchoring (stage headers survive compaction as recovery anchors). Additionally, the output template's formatting rules are partially restated in the SKILL.md body (Stage 6 instructions reference pipe-delimited tables, severity grouping, and the headless format), providing a degraded fallback even without the template.

## Success Criteria

### SC1: Zero `@` file inclusions in ce-review SKILL.md

`grep -c '^@\./references/' plugins/compound-engineering/skills/ce-review/SKILL.md` returns 0.

### SC2: All 5 references loaded via backtick-path reads at correct stages

Each reference file is loaded at its consumption stage (3, 4, or 6), not earlier.

### SC3: Sub-agent output unchanged

Running ce-review on a test branch produces identical sub-agent prompt structure (same persona content, same diff-scope rules, same schema, same template) before and after the change.

### SC4: SKILL.md body size decreases by ~29KB

The SKILL.md's loaded-at-trigger-time footprint drops from ~48KB (body + inlined references) to ~19KB (body only with backtick-path stubs). The 5 reference files still total ~29KB but are loaded on demand at their respective stages.

### SC5: Tests pass

`bun test` passes. No converter, frontmatter, or writer tests broken by the change.

## Estimated Savings

### Per-review carrying cost reduction

| Metric | Value |
|--------|------:|
| Content removed from trigger-time load | 28,991 bytes |
| Estimated token equivalent (~4 chars/token) | ~7,248 tokens |
| Typical ce-review tool calls per session | 30-50 |
| Carrying cost eliminated (bytes x calls) | ~870K-1.45M byte-calls |
| Additional Read tool calls introduced | 5 |
| Net overhead of added Reads (~500 bytes each in context) | ~2,500 bytes |

### Stage-by-stage load profile (after conversion)

| Stage | Files loaded at this stage | Cumulative bytes loaded | Previous cumulative |
|-------|--------------------------|------------------------:|--------------------:|
| 1-2 | none | 0 | 28,991 |
| 3 | persona-catalog.md | 5,908 | 28,991 |
| 4 | subagent-template.md, diff-scope.md, findings-schema.json | 21,666 | 28,991 |
| 5 | none (merge uses compact returns) | 21,666 | 28,991 |
| 6 | review-output-template.md | 28,991 | 28,991 |

At Stage 1-2 (scope detection and intent discovery, typically 5-10 tool calls), 0 bytes of reference content are carried instead of 28,991 bytes. At Stage 3 (reviewer selection, typically 2-3 tool calls), only the persona catalog is present. The full reference load only matches the current state at Stage 6, the final stage.

### Comparison to ideation estimate

The ideation estimated 22-25KB savings. Actual measurement shows 28,991 bytes of inlined content, but the effective savings depends on the session profile. In practice, the orchestrator carries the full 29KB for 0% of its pre-Stage-3 work, ~20% (persona catalog only) through Stage 3, ~75% (all but output template) through Stages 4-5, and 100% only at Stage 6. The weighted carrying cost reduction across a typical session is approximately 22-25KB as estimated, validating the original figure.
