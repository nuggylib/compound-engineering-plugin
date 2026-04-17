---
title: "feat: Empirical Ablation Framework"
type: feat
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-empirical-ablation-framework-requirements.md
---

# feat: Empirical Ablation Framework

## Overview

Build a script-driven test harness that measures the quality impact of removing individual instruction sections from skills and agents. The harness parses markdown files into sections, creates ablation variants, runs them against a task suite, computes quality delta scores, and produces a ranked "value per token" report. This unlocks all Phase 3 work (#19, #18, #27, #4) with empirical data instead of guesswork.

## Problem Frame

608KB of instructions with no measurement of which ones change model behavior. Every prior optimization assumed all content is load-bearing. The ablation framework creates the feedback loop that makes Phase 3 decisions evidence-based.

(see origin: `docs/brainstorms/2026-04-16-empirical-ablation-framework-requirements.md`)

## Requirements Trace

| Req | Summary | Addressed by |
|-----|---------|-------------|
| R1 | Section-level ablation | Unit 1 (section parser), Unit 2 (variant generator) |
| R2 | Evaluation harness using ce-review | Unit 3 (evaluator) |
| R3 | Fixed task suite | Unit 2 (fixtures) |
| R4 | Structured quality scoring | Unit 3 (scorer) |
| R5 | Script-driven, not model-driven | All units (Bun/TypeScript) |
| R6 | Output format (markdown + JSON) | Unit 4 (reporter) |
| R7 | Incremental operation | Unit 4 (results cache) |

## Scope Boundaries

### In Scope

- Section parser for markdown files (H2/H3 granularity)
- Ablation variant generator (remove one section at a time)
- Single-prompt evaluation mode (Option B from brainstorm: cost-efficient screening)
- Quality delta scoring on four axes (coverage, precision, calibration, compliance)
- Ranked report output (markdown + JSON)
- CLI command: `bun run ablation` and `bun run ablation:report`
- Tests for section parser and quality scorer

### Out of Scope

- Full pipeline ablation (Option A: too expensive for initial framework; add later as enhancement)
- Combinatorial ablation (removing multiple sections simultaneously)
- Agent-specific ablation (agents are simpler; apply framework to agents after validating on skills)
- Automatic section removal based on scores (human decision gate)
- Integration with release:validate (no automated gates on ablation scores)

## Context & Research

### Relevant Code and Patterns

- **Frontmatter parser**: `src/utils/frontmatter.ts` -- `parseFrontmatter()` strips YAML, returns body
- **File utilities**: `src/utils/files.ts` -- `walkFiles()`, `readText()`, `writeText()`, `ensureDir()`
- **Script pattern**: `scripts/release/validate.ts` -- existing `bun run` script importing from `src/`
- **Test pattern**: `tests/token-guardrails.test.ts` -- temp directory setup, component testing
- **Findings schema**: `plugins/compound-engineering/skills/ce-review/references/findings-schema.json`
- **Plugin structure**: Skills at `plugins/compound-engineering/skills/<name>/SKILL.md`, agents at `plugins/compound-engineering/agents/<category>/<name>.md`

### Institutional Learnings

- **Script-first architecture**: The ablation harness is deterministic except for model invocation; all parsing, scoring, and reporting belong in scripts
- **Pass-paths not content**: The variant generator writes modified files to temp directories and passes paths, not content

## Key Technical Decisions

### Single-prompt evaluation (Option B) for initial framework

Full pipeline ablation (Option A) requires 100+ model invocations and costs ~10M+ tokens. Single-prompt evaluation provides 80% of the signal at 10% of the cost. The framework is structured to accept a pluggable evaluator, so full pipeline mode can be added later.

Single-prompt approach: For each section ablation variant, send a prompt to `claude --print`:
```
You are a code reviewer. Here are your instructions:
[skill content with section removed]

Review this diff:
[diff content]

Respond with a JSON array of findings, each with: title, severity, file, line, confidence, category.
```

Compare the findings array against the baseline (full content) response.

### Section parser as reusable module

The section parser (`src/analysis/sections.ts`) splits markdown by H2/H3 headers into named sections with byte counts. This is reusable by:
- The ablation framework (this plan)
- Future carrying-cost enhancements (section-level cost breakdown)
- Kolmogorov compression (#18: identify compressible sections)

### Results stored as JSON in `.context/ablation/`

Each ablation run writes results to `.context/ablation/<skill-name>/<run-id>.json`. The reporter reads all result files to produce the ranked report. This supports incremental operation: ablate one section at a time, accumulate results, generate report when ready.

### Baseline caching

The baseline (full-content) evaluation result is cached per skill per task-suite item. Re-running ablation on different sections reuses the cached baseline. Cache invalidation: baseline re-runs when the skill file's content hash changes.

### Four-axis quality scoring

```typescript
type QualityDelta = {
  coverage: number;    // 0-1: fraction of baseline findings still present
  precision: number;   // 0-1: fraction of variant findings that match baseline
  calibration: number; // 0-1: mean confidence delta (lower is better)
  compliance: number;  // 0-1: structural compliance (output format, required fields)
};
```

Composite score: `0.4 * coverage + 0.3 * precision + 0.2 * compliance + 0.1 * calibration`

A section with composite delta < 0.05 across all task suite items is a "zero delta" cut candidate.

## Implementation Units

- [ ] **Unit 1: Section parser module**

**Goal:** Parse markdown files into named sections with byte sizes and line ranges.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- Create: `src/analysis/sections.ts`
- Create: `tests/sections.test.ts`

**Approach:**

```typescript
type Section = {
  name: string;        // Header text (e.g., "Stage 1: Determine scope")
  level: number;       // 2 or 3 (H2 or H3)
  startLine: number;
  endLine: number;
  bytes: number;
  content: string;
  containsFileRefs: boolean; // flags @-directives or backtick paths
};

function parseSections(content: string): Section[];
function removeSection(content: string, sectionName: string): string;
```

- Split on `^#{2,3}\s+` pattern
- Track line numbers for each section boundary
- Calculate byte size per section
- Flag sections containing `@./` or backtick path references
- `removeSection` returns content with the named section (and its sub-sections) stripped

**Test scenarios:**
- File with 3 H2 sections: returns 3 sections with correct byte sizes
- Nested H3 under H2: H3 is a child, removing H2 removes its H3 children
- Section with `@./references/foo.md`: `containsFileRefs = true`
- File with only frontmatter: returns empty array
- Empty section (header with no content before next header): returns section with 0 bytes content
- `removeSection` on non-existent name: returns original content unchanged

**Verification:**
- `bun test tests/sections.test.ts` passes

---

- [ ] **Unit 2: Task suite fixtures and variant generator**

**Goal:** Create diff fixtures and a variant generator that produces ablation variants.

**Requirements:** R3, R1

**Dependencies:** Unit 1 (section parser)

**Files:**
- Create: `scripts/ablation/fixtures/` directory with 3 representative diffs
- Create: `src/analysis/variants.ts`
- Create: `tests/variants.test.ts`

**Approach:**

*Fixtures:*
Extract 3 real diffs from this repo's git history:
- Small: a single-file skill description trim (~20 lines)
- Medium: a multi-file refactor (~150 lines)
- Security-adjacent: a file touching auth/permission patterns (~80 lines)

Store as `.diff` files in `scripts/ablation/fixtures/`.

*Variant generator:*
```typescript
type AblationVariant = {
  skillName: string;
  removedSection: string;
  removedBytes: number;
  modifiedContent: string;
  tempDir: string;  // temp directory with the modified skill
};

async function generateVariants(
  skillPath: string,
  sections: Section[],
  options?: { only?: string[] }
): Promise<AblationVariant[]>;
```

- For each section, call `removeSection` to create modified content
- Write modified SKILL.md to a temp directory (preserving other skill files like references/)
- `options.only` allows targeting specific sections for incremental ablation

**Test scenarios:**
- Skill with 5 sections generates 5 variants
- Each variant is missing exactly one section
- `only` filter limits variants to specified sections
- Temp directories contain the modified SKILL.md plus original reference files
- Variant for section "Stage 1" has correct `removedBytes`

**Verification:**
- `bun test tests/variants.test.ts` passes

---

- [ ] **Unit 3: Single-prompt evaluator and quality scorer**

**Goal:** Run evaluation prompts and score quality deltas between baseline and ablated variants.

**Requirements:** R2, R4, R5

**Dependencies:** Unit 2 (variant generator)

**Files:**
- Create: `src/analysis/evaluator.ts`
- Create: `tests/evaluator.test.ts`

**Approach:**

*Evaluator:*
```typescript
type Finding = {
  title: string;
  severity: string;
  file: string;
  line?: number;
  confidence: number;
  category: string;
};

type EvaluationResult = {
  skillName: string;
  section: string | "baseline";
  taskItem: string;
  findings: Finding[];
  rawOutput: string;
  timestamp: string;
};

async function evaluate(
  skillContent: string,
  diffContent: string,
  options?: { runs?: number }
): Promise<EvaluationResult>;
```

- Constructs a single-prompt review request with the skill content as instructions
- Invokes `claude --print -p "<prompt>"` via `Bun.spawn`
- Parses JSON findings from the response
- `runs` option (default 1, max 3) for variance reduction via majority vote

*Quality scorer:*
```typescript
function scoreQualityDelta(
  baseline: EvaluationResult,
  variant: EvaluationResult
): QualityDelta;
```

- **Coverage**: Count baseline findings matched in variant (by title + file + severity). `coverage = matched / baseline.findings.length`
- **Precision**: Count variant findings matched in baseline. `precision = matched / variant.findings.length` (1.0 if variant has no findings)
- **Calibration**: Mean absolute confidence difference for matched findings. `calibration = 1 - meanAbsDelta`
- **Compliance**: Check structural requirements (valid JSON, required fields present, severity in valid set). `compliance = validFields / totalRequiredFields`
- **Composite**: `0.4 * coverage + 0.3 * precision + 0.2 * compliance + 0.1 * calibration`

Finding matching: two findings match if they share the same `title` (fuzzy: Levenshtein distance < 3 or substring containment) AND the same `file`.

**Test scenarios:**
- Identical findings: all scores = 1.0, composite = 1.0
- Variant missing 2 of 5 findings: coverage = 0.6, precision = 1.0
- Variant with 2 extra findings: coverage = 1.0, precision ~= 0.71
- Empty variant findings: coverage = 0, precision = 1.0 (vacuously)
- Confidence shift: baseline finding at 0.80, variant at 0.65 -> calibration accounts for delta
- Invalid JSON response: compliance = 0

**Verification:**
- `bun test tests/evaluator.test.ts` passes (scorer tests use mock data, not model invocations)

---

- [ ] **Unit 4: CLI runner and report generator**

**Goal:** CLI scripts that orchestrate ablation runs and produce ranked reports.

**Requirements:** R6, R7

**Dependencies:** Units 1-3

**Files:**
- Create: `scripts/ablation/run.ts`
- Create: `scripts/ablation/report.ts`
- Modify: `package.json` (add `ablation` and `ablation:report` scripts)

**Approach:**

*Runner (`scripts/ablation/run.ts`):*
```
Usage: bun run ablation [options]
  --skill <name>     Target skill (default: ce-review)
  --section <name>   Ablate only this section (incremental mode)
  --fixture <name>   Use only this fixture diff
  --runs <n>         Evaluation runs per variant (default: 1)
  --dry-run          Parse sections and show what would be ablated, no model calls
```

Workflow:
1. Parse target skill into sections
2. Run baseline evaluation against each fixture (or load from cache)
3. Generate variants (all sections or `--section` target)
4. Evaluate each variant against each fixture
5. Score quality deltas
6. Write results to `.context/ablation/<skill>/<run-id>.json`

Cache: baseline results cached at `.context/ablation/<skill>/baseline-<content-hash>.json`. Invalidated when skill content hash changes.

*Reporter (`scripts/ablation/report.ts`):*
```
Usage: bun run ablation:report [options]
  --skill <name>     Report for this skill (default: all with results)
  --json             Output JSON instead of markdown
  --threshold <n>    Highlight sections below this composite score (default: 0.05)
```

Report format:
```markdown
# Ablation Report: ce-review

## Summary
- Sections analyzed: 20
- Zero-delta cut candidates: 4
- Total bytes in cut candidates: 8,234
- Potential savings: 15.6% of skill content

## Section Rankings (by value per token)

| Rank | Section | Bytes | Composite Delta | Coverage | Precision | Cut? |
|------|---------|------:|:---------------:|:--------:|:---------:|:----:|
| 1 | Mode Detection | 4,917 | 0.92 | 0.95 | 0.90 | |
| ... | | | | | | |
| 18 | Language-Aware Conditionals | 226 | 0.01 | 1.00 | 1.00 | yes |

## Cut Candidates (composite < 0.05)
...

## Caveats
- Sections flagged with file references: [list]
- Interaction effects not tested (removing A+B may differ from removing A then B)
```

**Test scenarios:**
- `--dry-run` lists sections without model calls
- Results directory created on first run
- Cached baseline reused on second run for same skill
- Report aggregates across multiple fixture results
- `--json` outputs valid JSON

**Verification:**
- `bun test` passes (no new test file needed; Unit 3 tests cover scorer logic)
- `bun run ablation --skill ce-review --dry-run` lists sections with byte sizes
- `bun run ablation:report --skill ce-review` generates report (after at least one ablation run)

## System-Wide Impact

- **New files**: 4 source files in `src/analysis/`, 2 scripts in `scripts/ablation/`, 3 fixture files, 2 test files
- **Modified files**: `package.json` (2 script entries)
- **No existing code modified**: All new code. Imports only from `src/utils/`
- **Runtime results**: Written to `.context/ablation/` (gitignored scratch space)
- **Error propagation**: If `claude` CLI invocation fails, the evaluator returns an error result with empty findings. The scorer treats this as compliance = 0, not a crash

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `claude --print` doesn't support single-prompt review well | The prompt is self-contained (instructions + diff + output format). Fallback: write prompt to a temp file and use `claude --print < file` |
| Quality delta too noisy (high variance across runs) | Start with `--runs 1` for screening. Increase to 3 for ambiguous cases. Report variance |
| Section parser misidentifies boundaries | Test against actual ce-review SKILL.md structure. H2/H3 parsing is simple and robust |
| Ablation cost exceeds budget | `--dry-run` previews cost. `--section` enables incremental operation. Start with ce-review only (highest value target) |
| Interaction effects between sections not captured | Documented limitation. Phase 3 plans should validate combined removals after identifying individual cut candidates |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-empirical-ablation-framework-requirements.md](docs/brainstorms/2026-04-16-empirical-ablation-framework-requirements.md)
- **Ideation source:** [docs/ideation/2026-04-08-token-efficiency-ideation.md](docs/ideation/2026-04-08-token-efficiency-ideation.md) (idea #14, line 252)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- Frontmatter parser: `src/utils/frontmatter.ts`
- File utilities: `src/utils/files.ts`
- Script pattern: `scripts/release/validate.ts`
- Test pattern: `tests/token-guardrails.test.ts`
