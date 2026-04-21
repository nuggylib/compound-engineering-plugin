---
title: "refactor: Kolmogorov Compression of Instruction Corpus"
type: refactor
status: done
date: 2026-04-18
origin: docs/brainstorms/2026-04-16-kolmogorov-compression-requirements.md
ideas: [18]
---

# refactor: Kolmogorov Compression of Instruction Corpus (#18)

## Overview

Compress non-Schelling instruction content across review agents and top-5 skills using four reusable patterns (category-name, enumeration, process, example). This is the "shorten what remains" pass that follows #19+#27's "remove what's redundant" pass. The model genuinely needs these instructions as behavioral seeds, but the seeds are over-expanded relative to what the model needs to decompress the intended behavior.

Graduated approach: apply the safest pattern first (category-name), validate with ablation, then progressively apply riskier patterns where ablation confirms safety.

## Problem Frame

After #19+#27 removes Schelling (model-prior) content, an estimated ~38,000 bytes of non-Schelling specification content remains that is over-expanded. This content falls between two categories:

- Content the model needs NO seed for (removed by #19+#27)
- Content that is irreducible specification (retained as-is)

The gap is content where the model needs a direction but not a tutorial, a category name but not an enumeration of every member, one example but not three. The requirements doc identifies ~57 compressible blocks across agents and skills with an estimated ~25,000 bytes of conservative savings (see origin: `docs/brainstorms/2026-04-16-kolmogorov-compression-requirements.md`).

## Requirements Trace

- R1. Apply four compression patterns (category-name, enumeration, process, example) to non-Schelling content
- R2. Preserve behavioral fidelity -- compressed specifications must produce equivalent model output
- R3. Validate every compression empirically via ablation (composite score > 0.95 against original baseline)
- R4. Graduate compression across phases, expanding only where ablation confirms safety
- R5. Operate on post-#19+#27 corpus to maximize ROI
- R6. Maintain human readability with explicit compression annotations
- R7. Inventory all 28 review agents and top 5 skills; compress all agents with compressible content (T1 agents excluded -- already minimal after #19+#27)

## Scope Boundaries

**In scope:**
- All 28 review agents in `plugins/compound-engineering/agents/review/`
- Top 5 skills: ce-review (53.8KB), ce-plan (44.1KB), ce-optimize (26.9KB), ce-compound (24.5KB), ce-work (23.2KB)
- Four compression patterns from the requirements taxonomy
- Ablation validation of each phase

**Out of scope:**
- Non-review agents (document-review, research, design, docs, workflow categories)
- Reference files (loaded on demand, low carrying cost)
- Automated compression tooling (manual application guided by patterns)
- Pidgin instruction language (#25, which changes the authoring register entirely)
- Content already handled by #19+#27 (Schelling removal/compression)
- Combinatorial compression (compressing multiple blocks simultaneously)

## Context & Research

### Relevant Code and Patterns

- **Ablation framework**: `scripts/ablation/run.ts` -- evaluates skill/agent variants against a fixture suite. Currently supports section removal; #18 validation uses whole-file comparison against cached baselines
- **Section parser**: `src/analysis/sections.ts` -- `parseSections()` at H2/H3 granularity, `removeSection()` for ablation
- **Evaluator**: `src/analysis/evaluator.ts` -- `evaluate()` takes content + diff, returns findings; `scoreQualityDelta()` computes composite score across 4 axes (coverage, precision, calibration, compliance)
- **Existing ablation data**: `.context/ablation/` contains baselines and section-removal runs for 5 agents on disk (cli-readiness, project-standards, adversarial, agent-native, cli-agent-readiness). Correctness-reviewer data is referenced in the #19+#27 plan but not persisted; re-run ablation if needed
- **#19+#27 plan**: `docs/plans/2026-04-18-006-refactor-schelling-negative-space-agent-optimization-plan.md` -- defines what content is removed/compressed before #18 runs

### Key Compression Pattern Examples (from origin)

These examples reference pre-#19+#27 content and are illustrative of the compression patterns. Actual blocks will be identified at Unit 1 time against the post-#19+#27 corpus; some of these blocks may have been removed or modified by #19+#27.

| Pattern | Example | Before | After | Savings |
|---------|---------|-------:|------:|--------:|
| Category-name | adversarial "Assumption violation" sub-bullets | 789B | 113B | 86% |
| Category-name | security-sentinel scanning protocol | 1,813B | 178B | 90% |
| Category-name | performance-oracle analysis framework | 1,942B | 210B | 89% |
| Category-name | correctness-reviewer hunting bullets | 1,147B | 189B | 84% |
| Enumeration | adversarial "Abuse cases" sub-bullets | 596B | 103B | 83% |
| Process | cli-agent-readiness framework idioms | 6,500B | 198B | 97% |
| Process | ce-plan external research decision logic | 1,400B | 275B | 80% |

### Interaction with #19+#27 Tier Classification

| #19+#27 tier | What #19+#27 does | What #18 targets |
|--------------|-------------------|------------------|
| T1 (Full Schelling, ~3-5 agents) | Rewrites to ~500B minimal format | Little -- already minimal |
| T2 (Partial Schelling, ~8-12 agents) | Compresses Schelling sections (composite > 0.80), retains load-bearing | Load-bearing sections (composite < 0.80) that are over-expanded |
| T3 (Load-bearing, ~8-12 agents) | Identity compression only (~200B) | All remaining content -- primary #18 targets |
| T4 (Distributed value, ~2-3 agents) | Identity compression only | All remaining content |

### Decompression Reliability Factors

Five factors affect whether compressed specifications decompress reliably (from origin analysis):

1. **Domain familiarity** -- security, performance, correctness domains decompress well; niche domains poorly
2. **Context pressure** -- compressed specs are more sensitive to late-session context loads
3. **Prompt position** -- mid-document positions decompress less reliably (lost-in-the-middle)
4. **Specificity gradient** -- comma-separated category labels decompress better than abstract descriptions
5. **Model generation drift** -- different model versions may decompress differently

Mitigation: position compressed specs early, use explicit category labels (not abstractions), validate on each major model release.

## Key Technical Decisions

### Graduated compression (Approach C) over single-pass

The requirements doc evaluated three approaches. Approach C (graduated with ablation feedback) is chosen because:
1. Each phase's ablation data informs the next phase's aggressiveness
2. Lower risk than applying all four patterns simultaneously
3. Produces empirical compression thresholds for future authoring
4. Leverages the ablation framework (#14) already live

### Whole-file ablation comparison for validation

The ablation framework's section-removal mode tests Schelling-ness (is this section needed at all?). Kolmogorov validation needs a different comparison: does the compressed version produce equivalent quality to the original?

**Score semantics:** `scoreQualityDelta()` returns similarity scores where 1.0 = identical to baseline and lower values indicate degradation. The pass criterion is `composite > 0.95` (equivalent to "less than 0.05 degradation from the original"). The #19+#27 plan uses these scores the same way (e.g., "composite > 0.85" = safe to remove).

**Validation mechanism:** The `run.ts` CLI caches baselines by content hash, so running it on a modified file creates a new baseline rather than comparing against the original. For Kolmogorov validation, the implementer must:
1. Ensure the original (pre-compression) baseline JSON exists in `.context/ablation/<agent>/baseline-<hash>.json` (run `--file` on the original file first if needed)
2. Run `evaluate()` directly on the compressed file content against each fixture
3. Load the original baseline JSON and call `scoreQualityDelta(originalBaseline, compressedResult)` to get the comparison

This requires a small validation script (or inline calls to `evaluate()` and `scoreQualityDelta()` from `src/analysis/evaluator.ts`). The framework API supports this; only the CLI lacks a `--compare-baseline` flag. Writing this script is part of Unit 2's first validation run.

Per-block isolation can be done by compressing one block at a time and measuring the delta, which helps identify which specific compression caused a regression.

### Keep surprising items explicit in compressed specifications

When compressing a partially compressible list, always retain items the model might not reconstruct. The detection heuristic: if an item is low-salience, domain-specific, or encodes a plugin-specific emphasis, keep it explicitly. Examples:
- TOCTOU within race conditions (low-salience term)
- "Swapped or inverted ID/enum mappings" in data-migrations (plugin-specific emphasis)
- Insecure deserialization with language-specific sinks (surprising detail)

### Compression annotations for maintainability

Add `<!-- why: Kolmogorov compression -- model reconstructs [what] from [seed] -->` comments on compressed blocks. This mirrors the annotation pattern from #26 (register mismatch correction) and enables future auditing.

## Open Questions

### Resolved During Planning

- **How to validate without framework extension?** A small validation script calling `evaluate()` and `scoreQualityDelta()` directly, comparing compressed content against the original's cached baseline JSON. The `run.ts` CLI's content-hash caching makes direct CLI use impractical for before/after comparison.
- **What about T1 agents after #19+#27?** Minimal format (~500B), little compression opportunity. Inventory all 28 for completeness but skip T1 agents for compression.
- **Should skills be compressed before or after agents?** After. Agents have higher pattern density (more compressible blocks per file) and more ablation data. Skills have lower Schelling ratio (9-17%) so most content is non-Schelling -- but process blocks in skills are the primary Pattern 3 target, which is the riskiest pattern. Agents first establishes confidence.

### Deferred to Implementation

- **Exact compressed wording per block**: The requirements doc provides 7 examples; remaining blocks require per-block judgment at compression time
- **Which specific blocks achieve composite > 0.95 after compression**: Only ablation testing reveals this
- **Interaction effects between multiple compressed blocks in the same file**: May emerge during validation

## Implementation Units

- [x] **Unit 1: Compression block inventory**

**Goal:** Scan all 28 review agents and top 5 skills (post-#19+#27 corpus) to identify and classify every compressible block.

**Requirements:** R1, R5, R7

**Dependencies:** #19+#27 execution complete

**Files:**
- Create: `.context/compression/kolmogorov-inventory.md`
- Read: all 28 files in `plugins/compound-engineering/agents/review/`
- Read: `plugins/compound-engineering/skills/ce-review/SKILL.md`
- Read: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Read: `plugins/compound-engineering/skills/ce-compound/SKILL.md`
- Read: `plugins/compound-engineering/skills/ce-work/SKILL.md`
- Read: `plugins/compound-engineering/skills/ce-optimize/SKILL.md`
- Read: `.context/ablation/schelling-classification.md` (from #19+#27 Unit 1)

**Approach:**

For each file, identify blocks matching the four compression patterns:
- **Pattern 1 (category-name)**: Headings followed by 3+ members of a named category with explanatory expansions
- **Pattern 2 (enumeration)**: 3+ examples following the same structural template
- **Pattern 3 (process)**: Numbered/bulleted lists of 3+ standard engineering process steps with detailed explanations
- **Pattern 4 (example)**: Multiple before/after or worked examples demonstrating the same concept

For each identified block, record:
- File path and section name
- Pattern type (1-4)
- Compressibility tier (fully, partially, incompressible)
- Current bytes
- Estimated compressed bytes
- Non-obvious items to retain explicitly (for partially compressible blocks)
- #19+#27 tier (T1-T4) from the Schelling classification manifest

Skip T1 agents (already minimal after #19+#27 rewrite).

**Execution note:** This is a pure classification task. Use parallel sub-agents: one for agents (28 files, ~112KB post-#19+#27), one for skills (5 files, ~172KB). Each agent reads and classifies, producing a structured inventory.

**Patterns to follow:**
- `.context/ablation/schelling-classification.md` (classification manifest format from #19+#27)

**Test expectation:** none -- pure classification, no code changes

**Verification:**
- Inventory covers all 28 agents and 5 skills
- Each block cites pattern type and compressibility tier
- Total estimated savings calculated per phase
- T1 agents explicitly excluded with rationale

---

- [x] **Unit 2: Phase 1 -- Category-name compression + validation**

**Goal:** Apply Pattern 1 (category-name compression) across agents and skills. Validate with ablation.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** Unit 1 (inventory identifies Pattern 1 blocks)

**Files:**
- Modify: T2, T3, T4 agent files identified in Unit 1 as having Pattern 1 blocks (estimated 15-20 agents)
- Modify: Top 5 skill files where Pattern 1 blocks were identified
- Create: `.context/compression/phase-1-validation.md`

**Approach:**

For each Pattern 1 block:
1. Replace exhaustive category member lists with comma-separated category labels
2. Retain any non-obvious or surprising items explicitly (from Unit 1 inventory)
3. Add `<!-- why: Kolmogorov compression -- model reconstructs expansion from category labels -->` annotation
4. Keep structural markers (numbered headings, bold labels) as attention anchors

Compression template:

```
BEFORE:
### 1. Assumption violation
Identify assumptions the code makes...
- **Data shape assumptions** -- code assumes an API always returns JSON... [full paragraph]
- **Timing assumptions** -- code assumes operations complete before... [full paragraph]
- **Ordering assumptions** -- code assumes events arrive in... [full paragraph]
- **Value range assumptions** -- code assumes IDs are positive... [full paragraph]
For each assumption, construct the specific input...

AFTER:
### 1. Assumption violation
Identify assumptions (data shape, timing, ordering, value range). Construct the violating condition and trace the consequence.
```

**Ablation validation:** After compressing all Pattern 1 blocks, run whole-file evaluation on 4 representative files:
- 1 T2 agent (has both compressed Schelling sections from #19+#27 and newly compressed non-Schelling Pattern 1 blocks)
- 1 T3 agent with dense Pattern 1 content (e.g., adversarial-reviewer)
- 1 legacy agent with Pattern 1 content (e.g., performance-oracle or security-sentinel)
- 1 skill (e.g., ce-review)

Pass criteria: composite score > 0.95 against original (pre-compression) baseline for each validated file.

When compressing, also consider prompt position: place compressed specifications in the first 20% of the agent body when possible (within the existing section order) to reduce lost-in-the-middle decompression risk.

**Patterns to follow:**
- Concrete examples from origin doc (Examples 1-5)
- #19+#27 T2 graduated compression approach (but applied to different content)

**Test scenarios:**
- Happy path: Category-name compressed agent produces equivalent findings to original on all 4 fixtures (composite > 0.95)
- Happy path: Compressed skill produces equivalent evaluation quality
- Edge case: Partially compressible list retains surprising items after compression
- Error path: Composite < 0.95 on any file triggers per-block isolation to identify the over-compressed block

**Verification:**
- All Pattern 1 blocks compressed with annotations
- 4 ablation validations pass (composite > 0.95 against original baseline)
- Phase 1 savings measured and recorded
- Any regressions identified and specific blocks restored
- Validation script written and reusable for Phases 2 and 3

---

- [x] **Unit 3: Phase 2 -- Enumeration + example compression + validation**

**Goal:** Apply Pattern 2 (enumeration) and Pattern 4 (example) compression where Phase 1 showed no quality regression.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 2 (Phase 1 ablation results confirm which files tolerate compression)

**Files:**
- Modify: Agent and skill files with Pattern 2/4 blocks (estimated 10-15 files)
- Create: `.context/compression/phase-2-validation.md`

**Approach:**

Compress Pattern 2/4 blocks in all files that have them, regardless of Phase 1 results (some files may have Pattern 2/4 blocks but no Pattern 1 blocks). Validation always compares against the original (pre-any-compression) baseline, so stacking effects are caught by the same composite > 0.95 threshold.

**Pattern 2 (enumeration):** Replace N examples of a structural template with 1 example + pattern description.

```
BEFORE:
- Example A: [specific instance]
- Example B: [specific instance]
- Example C: [specific instance]

AFTER:
- [Pattern description]. E.g.: [best/most boundary-case example].
```

**Pattern 4 (example):** Replace N worked examples with 1 illustrative example + "apply analogously."

```
BEFORE:
Example 1: [full worked example]
Example 2: [full worked example]
Example 3: [full worked example]

AFTER:
Example: [most illustrative example]. Apply analogously.
```

**Ablation validation:** Run on 3 representative files:
- 1 agent with both Pattern 1 (from Phase 1) and Pattern 2/4 compressions stacked
- 1 agent with Pattern 2/4 only (no prior Pattern 1 blocks)
- 1 skill with Pattern 4 content

Pass criteria: composite > 0.95 against original (pre-compression) baseline. Always compare against the uncompressed original, not the Phase 1 intermediate.

**Patterns to follow:**
- Origin doc Examples 2 (adversarial abuse cases) and 6 (cli-agent-readiness framework idioms)

**Test scenarios:**
- Happy path: Stacked compressions (Pattern 1 + Pattern 2) produce composite > 0.95 against original
- Happy path: Example compression retains the most illustrative/boundary case
- Edge case: File with stacked compressions that was borderline in Phase 1 -- test specifically to catch interaction effects
- Error path: Composite < 0.95 on stacked file triggers per-block rollback of Pattern 2/4 changes while keeping Pattern 1

**Verification:**
- All Pattern 2/4 blocks compressed
- 3 ablation validations pass (composite > 0.95 against original)
- Cumulative savings (Phase 1 + Phase 2) measured
- Any regressions documented with which block was restored

---

- [x] **Unit 4: Phase 3 -- Process compression + validation**

**Goal:** Apply Pattern 3 (process compression) to legacy agents and skill methodology blocks. This is the riskiest pattern.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 3 (Phase 2 results)

**Files:**
- Modify: Legacy agent files with process/recipe sections (estimated 5-8 agents)
- Modify: Skill files with methodology blocks (estimated 3-5 files)
- Create: `.context/compression/phase-3-validation.md`

**Approach:**

Only apply to files that tolerated Phase 1/2 compression or have not been compressed yet.

**Pattern 3 (process):** Replace multi-step recipes with named procedure + one sentence capturing the non-obvious constraint.

```
BEFORE:
1. Step 1: [standard step with detailed explanation]
2. Step 2: [standard step with detailed explanation]
3. Step 3: [standard step with detailed explanation]
4. Step 4: [standard step with detailed explanation]

AFTER:
[Process name]. [Non-obvious constraint or ordering requirement.]
```

When step ordering is non-obvious, keep step names in sequence without explanations:

```
AFTER:
[Process name]: detect framework -> credit defaults -> flag gaps -> write recommendations.
```

**Phrasing preservation:** Process compression must preserve efficient execution phrasing. Institutional learnings show that "bulk find then filter" vs "per-item walk" instructions produce 7x differences in tool call count (see `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`). When compressing process steps, retain the execution pattern even when removing the step explanations.

**Primary targets:**
- Legacy agents: security-sentinel scanning protocol, performance-oracle analysis sections, deployment-verification-agent checklists
- Skills: ce-plan research decision logic, ce-review pipeline methodology, ce-optimize optimization workflow steps

**Ablation validation:** Run on 3 representative files:
- 1 legacy agent with process-heavy content
- 1 skill with compressed methodology blocks
- 1 file with all three phases of compression stacked

Pass criteria: composite > 0.95 against original (pre-compression) baseline.

**Regression protocol:** Process compression has the highest decompression variance. If a file fails validation:
1. Identify which process block caused the regression
2. Expand it back to step names (without full explanations) -- intermediate compression level
3. Re-validate
4. If still failing, restore the full process description

**Patterns to follow:**
- Origin doc Example 7 (ce-plan external research decision logic)

**Test scenarios:**
- Happy path: Process-compressed legacy agent produces equivalent findings
- Happy path: Skill with compressed methodology produces equivalent evaluations
- Edge case: Process with non-obvious ordering -- keep step names, test that the model follows correct sequence
- Error path: Process compression causes ordering confusion -- fall back to step-name-only compression (intermediate level)

**Verification:**
- All qualifying process blocks compressed
- 3 ablation validations pass
- Total savings across all three phases measured
- Any fallback compressions documented

---

- [x] **Unit 5: Documentation, tracking, and savings report**

**Goal:** Record results, update meta-plan tracking, and document compression thresholds for future authoring.

**Requirements:** R6

**Dependencies:** Units 2, 3, 4

**Files:**
- Modify: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md` (tracking table)
- Create: `.context/compression/final-report.md`

**Approach:**

1. Update meta-plan tracking: mark #18 as "done" with execution artifacts and measured savings
2. Compile final savings report:
   - Per-phase savings (Phase 1, 2, 3)
   - Per-pattern savings (category-name, enumeration, process, example)
   - Per-file-type savings (agents vs skills)
   - Actual vs predicted (from requirements doc estimates)
3. Document empirical compression thresholds discovered during validation:
   - Which patterns are reliably safe (composite > 0.98)
   - Which patterns are marginal (composite 0.95-0.98)
   - Which blocks resisted compression (blocks restored after regression)
4. Record lessons for future authoring:
   - When to use each compression pattern in new content
   - The specificity gradient: explicit category labels > abstract descriptions
   - Which domains decompress reliably vs which need expanded specifications

**Test expectation:** none -- documentation only

**Verification:**
- Meta-plan tracking table updated
- Final report includes per-phase, per-pattern, and per-file-type breakdowns
- Empirical thresholds documented

## System-Wide Impact

- **Interaction graph:** Compressed agents are dispatched by ce-review's pipeline (loaded via `@` inline in the dispatch prompt). Compression reduces per-dispatch token cost. No callback or middleware changes.
- **Error propagation:** If a compressed agent misses a finding that the original would have caught, the error is silent (false negative). Ablation validation is the primary defense.
- **State lifecycle risks:** None. Agent content is stateless -- loaded fresh each dispatch.
- **API surface parity:** All compressed agents must still produce findings matching the findings schema in `plugins/compound-engineering/skills/ce-review/references/findings-schema.json`. Output format sections are incompressible and retained.
- **Integration coverage:** Ablation validates the full evaluate-score-compare pipeline for each compressed file. Per-block isolation available for regression diagnosis.
- **Unchanged invariants:** Agent frontmatter (name, description, model, tools, color), output format sections, and the ce-review dispatch pipeline are not modified. Only instruction body content changes.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Decompression fragility under context pressure | Position compressed specs early in agents, use explicit category labels, validate under realistic context loads |
| Stacked compressions (Phase 1+2+3) interact negatively | Always validate against original (pre-compression) baseline, not intermediate; composite > 0.95 threshold catches stacking effects |
| Model generation drift degrades compressed specs | Re-run ablation on major model releases; compressed specs use explicit labels for anchoring |
| Over-compression of partially compressible content | Inventory explicitly marks surprising items to retain; ablation catches false negatives |
| #19+#27 not yet executed | Plan explicitly gates on #19+#27 completion; Unit 1 scans the post-#19+#27 corpus |

## Dependencies

| Idea | Status | How this plan uses it |
|------|--------|----------------------|
| #14 Ablation Framework | done | Provides evaluation and quality delta scoring for validation |
| #19+#27 Schelling/Negative-Space | planned (not executed) | Must execute first; defines the corpus #18 operates on |
| #26 Register Mismatch | done | Content is in specification register, making compression patterns cleaner |
| #20 Carrying Cost | done | Top 5 skills identified by carrying cost metric |

## Savings Projection

These estimates are based on pre-#19+#27 content analysis and will be refined at Unit 1 inventory time against the actual post-#19+#27 corpus. Some Pattern 1 targets in agents may overlap with content #19+#27 already removed.

| Phase | Patterns | Pre-#19+#27 estimate | Post-#19+#27 estimate |
|-------|----------|---------------------:|----------------------:|
| Phase 1: Category-name | Pattern 1 | 18,000-22,000B | 10,000-16,000B |
| Phase 2: Enumeration + example | Patterns 2, 4 | 4,000-8,000B | 3,000-7,000B |
| Phase 3: Process | Pattern 3 | 3,000-6,000B | 2,000-5,000B |
| **Total** | **All four** | **25,000-36,000B** | **15,000-28,000B** |

Conservative post-#19+#27 estimate: **~15,000-20,000 bytes** of additional savings. Combined with #19+#27's ~15-25KB, total agent+skill instruction reduction: **~30-45KB**.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-kolmogorov-compression-requirements.md](docs/brainstorms/2026-04-16-kolmogorov-compression-requirements.md)
- **#19+#27 plan:** [docs/plans/2026-04-18-006-refactor-schelling-negative-space-agent-optimization-plan.md](docs/plans/2026-04-18-006-refactor-schelling-negative-space-agent-optimization-plan.md)
- **Ablation framework:** `scripts/ablation/run.ts`, `src/analysis/evaluator.ts`, `src/analysis/sections.ts`
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
