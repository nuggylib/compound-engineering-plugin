---
date: 2026-04-16
topic: empirical-ablation-framework
idea: 14
phase: 0
status: brainstormed
---

# Empirical Instruction Ablation Framework

## Problem Frame

608KB of instructions across 42 skills and 51 agents, and no measurement of which instructions change model behavior. Every optimization so far assumes all content is load-bearing. Script-first extraction proved 60-75% of processing instructions are waste; the same ratio likely holds for behavioral instructions. Without empirical measurement, all Phase 3 ideas (#19 L3/Negative-Space, #18 Kolmogorov Compression, #27 Schelling Points, #4 Script-First Extraction) are guesswork.

The review pipeline provides a natural evaluation harness: run ce-review with/without specific instruction sections against the same diff, compare whether findings change. The output is structured (JSON findings with confidence scores), making automated comparison feasible.

## Requirements

### R1. Section-level ablation

The framework operates at the granularity of markdown sections (H2/H3 headers). Given a skill or agent file, it identifies discrete sections, creates variants with each section removed, and measures the output quality delta. Each section gets a "value per token" score.

### R2. Evaluation harness using ce-review

The primary evaluation target is the ce-review pipeline. For each ablation variant:
1. Create a modified SKILL.md (or agent file) with the target section removed
2. Run the modified review against a fixed diff
3. Compare findings against the baseline (full-content) review
4. Score the quality delta

### R3. Fixed task suite

A curated set of 3-5 representative diffs that exercise different reviewer categories:
- Small diff (<50 lines) touching a single file type
- Medium diff (100-300 lines) touching multiple file types
- Large diff (500+ lines) with cross-cutting concerns
- Security-relevant diff (auth/input handling)
- Performance-relevant diff (queries/loops)

The task suite provides consistent inputs across ablation runs. Diffs stored as fixtures.

### R4. Structured quality scoring

Quality delta measured on four axes:
1. **Finding coverage**: Did the ablated variant miss findings the baseline caught? (recall)
2. **Finding precision**: Did the ablated variant produce false findings the baseline didn't? (precision)
3. **Confidence calibration**: Are confidence scores stable between baseline and ablated runs?
4. **Behavioral compliance**: Did the ablated variant follow structural rules (output format, severity scale, routing)?

Score = weighted combination. A section with zero quality delta across all task suite items is a cut candidate.

### R5. Script-driven, not model-driven

The harness is a Bun/TypeScript script that:
- Parses skill/agent files into sections
- Creates ablation variants programmatically
- Invokes `claude` CLI to run reviews (or simulates by comparing structured outputs)
- Computes quality delta scores
- Outputs a ranked report: section name, byte size, quality delta, value-per-token

The harness itself must be deterministic. Only the model invocation is non-deterministic.

### R6. Output format

Two outputs:
- **Ablation report** (markdown): Ranked table of sections by value-per-token. Sections with zero delta highlighted as cut candidates. Per-task-suite-item breakdown available.
- **Machine-readable** (JSON): Full ablation results for downstream consumption by Phase 3 plans.

### R7. Incremental operation

The harness supports running ablation on a single section, a single file, or the entire plugin. Results accumulate in a results directory. Re-running a section reuses cached baseline results (baseline = full content, stable across section ablations for the same file).

## Constraints

### Model invocation cost

Each ablation variant requires at least one model invocation. For ce-review with 20 sections and 5 task suite items, that is 100+ invocations for full ablation. At ~100K tokens per invocation, the full ablation costs ~10M+ tokens.

Mitigation: The framework supports targeted ablation (single section or file) for iterative exploration. Full ablation is a deliberate investment, not a casual operation.

### Non-deterministic outputs

The same prompt can produce different findings across runs. The harness must account for variance.

Mitigation: Run each ablation variant 2-3 times and use majority-vote findings as the canonical output. Report variance alongside delta scores. Alternatively, use structured output comparison (finding title + file + severity) rather than exact string matching.

### Baseline instability

If the baseline review produces different findings across runs, ablation deltas become noisy.

Mitigation: Run baseline 3 times, establish canonical baseline findings via intersection (findings present in all 3 runs). Only measure ablation delta against canonical findings.

### @-directive resolution

Some sections reference external files via `@` directives or backtick paths. Removing a section that contains a reference instruction may change behavior by eliminating the model's awareness of that file, not by removing the section's behavioral content.

Mitigation: The ablation report flags sections containing file references. Interpret their delta scores with this caveat.

### Agent vs skill ablation

Skills are loaded once and persist. Agents are dispatched per sub-agent invocation. Ablating a section from an agent file tests whether that section affects a single sub-agent's behavior. Ablating from a skill tests whether it affects the full workflow.

The framework handles both but reports them separately.

## Feasibility Assessment

### What exists

- `parseFrontmatter()` in `src/utils/frontmatter.ts` strips YAML frontmatter
- `walkFiles()` and `readText()` in `src/utils/files.ts` for file enumeration
- ce-review produces structured findings JSON (via findings-schema.json)
- `claude` CLI can be invoked programmatically with `--print` for single-turn evaluation

### What needs building

- Section parser: split markdown by H2/H3 headers into named sections with byte sizes
- Variant generator: create modified files with sections removed
- CLI invocation wrapper: run `claude` with a modified skill directory
- Output comparator: structured diff of findings arrays
- Quality scorer: four-axis scoring from comparison results
- Report generator: markdown + JSON output

### Alternative: offline comparison without model invocation

Instead of running full ce-review pipelines, compare instruction sections against model priors using a simpler prompt: "Given this role description and diff, what would you review?" Then compare the model's natural review focus with and without each section. This trades evaluation fidelity for cost efficiency.

The framework should support both modes: full pipeline evaluation (high fidelity, high cost) and single-prompt comparison (low fidelity, low cost).

## Approach Options

### Option A: Full pipeline ablation

Run complete ce-review for each variant. Highest fidelity. ~100+ model invocations for full ablation of one skill.

Pros: Tests actual behavior in context. Catches interaction effects between sections.
Cons: Expensive. Slow. Non-deterministic outputs require multiple runs.

### Option B: Single-prompt ablation

For each section, ask the model: "Here are your instructions [with/without section X]. Review this diff." Compare outputs.

Pros: 10x cheaper per variant. Faster iteration.
Cons: Doesn't test section interaction effects. Single-prompt behavior may differ from multi-turn pipeline behavior.

### Option C: Hybrid (recommended)

Use Option B for initial screening (identify sections with zero impact in single-prompt mode). Then run Option A only on ambiguous cases (sections that show small but non-zero delta in screening). This reduces full pipeline runs from ~100 to ~20-30.

## Downstream Dependencies

| Idea | What it needs from #14 |
|------|----------------------|
| #19 L3/Negative-Space | Which instruction sections restate model priors (zero delta when removed) |
| #18 Kolmogorov Compression | Which sections can be compressed without quality loss (low delta tolerance) |
| #27 Schelling Points | Which behaviors the model naturally produces without instruction (zero delta = Schelling) |
| #4 Script-First Extraction | Which procedural sections can be replaced by scripts (zero behavioral delta when removed + replaced with script call) |
| #23 Model Self-Compression | Safety net: validate compressed versions against originals |
| #25 Pidgin Language | Validate pidgin instructions produce equivalent behavior |

## Success Criteria

1. The framework produces a ranked value-per-token report for ce-review sections
2. At least 3 sections are identified as zero-delta cut candidates across all task suite items
3. Results are reproducible: running the same ablation twice produces consistent rankings (top-5 and bottom-5 agree)
4. The report format is directly consumable by Phase 3 plans

## Open Questions

- **Exact claude CLI invocation for controlled evaluation**: Does `claude --print` support passing a modified skill directory? Alternative: use a temp plugin directory with the modified file.
- **Cost budget for initial ablation run**: How many model invocations can we afford for the first pass? This determines whether to use Option A, B, or C.
- **Interaction effects**: If removing section A has zero delta and removing section B has zero delta, does removing both still have zero delta? Combinatorial ablation is exponentially expensive. The framework should at least flag this as a known limitation.
