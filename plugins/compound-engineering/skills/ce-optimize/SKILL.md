---
name: ce-optimize
description: "Run metric-driven iterative optimization loops with parallel experiments, hard gates, and quality scoring. Use when optimizing any measurable outcome through systematic experimentation."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Iterative Optimization Loop

## Interaction Method

Use the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: present numbered options and wait for a reply.

## Input

<optimization_input> #$ARGUMENTS </optimization_input>

If the input above is empty, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file."

## Optimization Spec Schema

Reference the spec schema for validation:

`references/optimize-spec-schema.yaml`

## Experiment Log Schema

Reference the experiment log schema for state management:

`references/experiment-log-schema.yaml`

<!-- why: Kolmogorov compression -- kept safety settings values, compressed prose -->
## Quick Start

First-run safety settings: `execution.mode: serial`, `max_concurrent: 1`, `stopping.max_iterations: 4`, `stopping.max_hours: 1`. Judge mode: `sample_size: 10`, `batch_size: 5`, `max_total_cost_usd: 5`. Start from `references/example-hard-spec.yaml` (objective metrics) or `references/example-judge-spec.yaml` (semantic quality). Avoid new dependencies until baseline and harness are trusted.

`references/usage-guide.md`

---

<!-- why: Kolmogorov compression -- deduplicated "write before showing" (was 3x), kept checkpoint table and file locations table -->
## Persistence Discipline

**CRITICAL: The experiment log on disk is the single source of truth. Results in conversation only WILL be lost. Never present results without writing to disk first.**

Files under `.context/compound-engineering/ce-optimize/<spec-name>/` are local scratch state (gitignored).

### Core Rules

1. **Write IMMEDIATELY after measurement** -- append before evaluating the next experiment
2. **Verify every critical write** -- read back, confirm entry present, do not proceed until verified <!-- why: catches silent write failures -->
3. **Re-read from disk at phase boundaries and before decisions** -- experiment log + strategy digest
4. **Append-only during Phase 3** -- update `best` in place only when new best found <!-- why: prevents data loss if write interrupted -->
5. **Per-experiment `result.yaml` markers** for crash recovery -- scan on resume
6. **Strategy digest written after every batch, before generating new hypotheses** -- agent reads digest, not memory
7. **Measure -> write -> verify -> THEN show user**

### Mandatory Disk Checkpoints

| Checkpoint | File Written | Phase |
|---|---|---|
| CP-0: Spec saved | `spec.yaml` | Phase 0, after user approval |
| CP-1: Baseline recorded | `experiment-log.yaml` (initial with baseline) | Phase 1, after baseline measurement |
| CP-2: Hypothesis backlog saved | `experiment-log.yaml` (hypothesis_backlog section) | Phase 2, after hypothesis generation |
| CP-3: Each experiment result | `experiment-log.yaml` (append experiment entry) | Phase 3.3, immediately after each measurement |
| CP-4: Batch summary | `experiment-log.yaml` (outcomes + best) + `strategy-digest.md` | Phase 3.5, after batch evaluation |
| CP-5: Final summary | `experiment-log.yaml` (final state) | Phase 4, at wrap-up |

Verification: write, read back, confirm. On failure, retry once, then alert user.

### File Locations (all under `.context/compound-engineering/ce-optimize/<spec-name>/`)

| File | Purpose | Written When |
|------|---------|-------------|
| `spec.yaml` | Optimization spec (immutable during run) | Phase 0 (CP-0) |
| `experiment-log.yaml` | Full history of all experiments | Initialized at CP-1, appended at CP-3, updated at CP-4 |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | Written at CP-4 after each batch |
| `<worktree>/result.yaml` | Per-experiment crash-recovery marker | Immediately after measurement, before CP-3 |

### On Resume

When Phase 0.4 detects an existing run: read experiment log, scan worktrees for `result.yaml` markers not yet logged, recover unlogged experiments, continue from where log left off.

---

<!-- why: Kolmogorov compression -- compressed setup steps, kept hard/judge detection, three-tier approach, rubric constraints, sampling strategy, resume detection -->
## Phase 0: Setup

### 0.1 Determine Input Type

Spec file path (`.yaml`/`.yml`) -> read and validate. Description -> create spec interactively.

### 0.2 Load or Create Spec

**If spec file provided:** Parse YAML natively, validate against `references/optimize-spec-schema.yaml` (required fields, kebab-case name, `hard`/`judge` type, judge section when judge, degenerate gates, non-empty measurement command, mutable/immutable scopes, valid operators, max_concurrent >= 1 and <= 6 for worktree backend). On failure, report errors.

**If description provided:**

1. Analyze what can be measured.
2. **Detect hard vs judge:** `type: hard` for scalar, objective, clear-direction metrics. `type: judge` when semantic quality required, proxy metrics mislead, or degenerate solutions look good numerically. For qualitative targets, strongly recommend `type: judge` with the three-tier approach:
   - **Degenerate gates** (hard, cheap, fast) -- skip judge if gates fail
   - **LLM-as-judge** (optimization target) -- sample, score, aggregate
   - **Diagnostics** (logged, not gated)

<!-- why: Kolmogorov compression -- compressed domain-specific examples to pattern description -->
3. **Sampling strategy** (judge): guide stratified sampling -- what one item looks like, natural strata, where failures most likely, total sample size (default 30). Buckets cover size extremes and failure modes. Adapt to domain; sample singletons for coverage goals.

4. **Rubric** (judge): 1-5 scale, concrete descriptions per level, no directional assumptions, supplementary diagnostics. Must support inter-judge agreement.

5. Remaining spec fields: degenerate gates, measurement command, mutable/immutable scope, constraints. First-run: recommend serial/1-concurrent/4-iterations/1-hour. Judge: recommend sample 10, batch 5, max $5 until trusted.

6. Write spec to `.context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`, present for approval.

### 0.3 Search Prior Learnings

Dispatch `compound-engineering:research:learnings-researcher` for prior optimization work.

### 0.4 Run Identity Detection

```bash
git rev-parse --verify "optimize/<spec-name>" 2>/dev/null
```

Branch exists + experiment log found -> offer: **Resume** (read all state from disk, scan `result.yaml` markers for crash recovery, continue from last iteration) or **Fresh start** (archive to `optimize-archive/<spec-name>/archived-<timestamp>`, clear log).

### 0.5 Create Optimization Branch and Scratch Space

```bash
git checkout -b "optimize/<spec-name>"  # or switch to existing if resuming
mkdir -p .context/compound-engineering/ce-optimize/<spec-name>/
```

---

<!-- why: Kolmogorov compression -- compressed standard steps, kept clean-tree gate, stability repeat, parallelism probe, worktree budget, CP-1 structure, uncapped approval -->
## Phase 1: Measurement Scaffolding

**HARD GATE: User must approve baseline and parallel readiness before Phase 2.**

### 1.1 Clean-Tree Gate

```bash
git status --porcelain
```

Filter against scope paths. Dirty in-scope files -> report, ask to commit/stash, do NOT continue.

### 1.2 Build or Validate Measurement Harness

Existing command -> run once via `bash scripts/measure.sh`, validate JSON contains all gate/diagnostic keys. Building -> analyze codebase, create script, add to `scope.immutable`, validate, present for review.

### 1.3 Establish Baseline

Run harness. Stability mode `repeat`: run `repeat_count` times, aggregate per configured method, warn if variance > `noise_threshold`. Record baseline:

```yaml
baseline:
  timestamp: "<ISO 8601>"
  gates: { <gate_name>: <value> }
  diagnostics: { <diagnostic_name>: <value> }
```

Judge type: also run judge evaluation for starting score.

### 1.4 Parallelism Readiness Probe

```bash
bash scripts/parallel-probe.sh "<project_directory>" "<measurement.command>" "<measurement.working_directory>" <shared_files...>
```

Present blockers with mitigations.

### 1.5 Worktree Budget Check

```bash
bash scripts/experiment-worktree.sh count
```

If count + `max_concurrent` > 12: warn, suggest cleanup. Do NOT block.

### 1.6 Write Baseline to Disk (CP-1)

**MANDATORY CHECKPOINT.** Create experiment-log.yaml with required sections (`spec`, `run_id`, `started_at`, `baseline`, `experiments: []`, `best` seeded from baseline). Verify by reading back. Then present results.

### 1.7 User Approval Gate

Present baseline metrics, log location, parallel readiness, clean-tree status, worktree budget, judge budget (flag uncapped if `max_total_cost_usd` null -- require explicit approval). Options: Proceed / Adjust spec / Fix issues. Do NOT proceed without approval. After approval, re-read spec and baseline from disk.

---

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read code within `scope.mutable` to identify:
- Current implementation approach
- Improvement opportunities
- Constraints and inter-component dependencies

Optional: dispatch `compound-engineering:research:repo-research-analyst` for deeper analysis when scope is large or unfamiliar.

<!-- why: Kolmogorov compression -- compressed category list, kept dependency pre-approval rules -->
### 2.2 Generate Hypothesis List

Generate 10-30 hypotheses. Each must have: **Description** (what to try), **Category** (standard: signal-extraction, graph-signals, embedding, algorithm, preprocessing, parameter-tuning, architecture, data-handling -- or domain-specific), **Priority** (high/medium/low), **Required dependencies** (new packages/tools). Include user-provided hypotheses. More can be generated during the loop.

### 2.3 Dependency Pre-Approval

Collect all unique new dependencies across hypotheses. Present the full list via platform question tool and ask for bulk approval. Mark each hypothesis's `dep_status` as `approved` or `needs_approval`. Unapproved-dependency hypotheses remain in backlog but are skipped during batch selection and re-presented at wrap-up.

### 2.4 Record Hypothesis Backlog (CP-2)

**MANDATORY CHECKPOINT.** Write the initial backlog to the experiment log file and verify:
```yaml
hypothesis_backlog:
  - description: "Remove template boilerplate before embedding"
    category: "signal-extraction"
    priority: high
    dep_status: approved
    required_deps: []
  - description: "Try HDBSCAN clustering algorithm"
    category: "algorithm"
    priority: medium
    dep_status: needs_approval
    required_deps: ["scikit-learn"]
```

---

<!-- why: Kolmogorov compression -- compressed standard execution, kept batch selection, both backends, degenerate gates, runner-up check, 7 stopping criteria, Codex cascade -->
## Phase 3: Optimization Loop

### 3.1 Batch Selection

Exclude `dep_status: needs_approval`. Serial mode: `batch_size = 1`. Otherwise: `batch_size = min(runnable_backlog, max_concurrent)`. Prefer diversity across categories; within category, priority (high first). Empty/blocked backlog -> Phase 4.

### 3.2 Dispatch Experiments

Serial: one to completion before next. Parallel: full batch concurrently.

**Worktree backend:**
```bash
WORKTREE_PATH=$(bash scripts/experiment-worktree.sh create "<spec_name>" <exp_index> "optimize/<spec_name>" <shared_files...>)
```
Apply port parameterization if configured. Fill `references/experiment-prompt-template.md` (iteration, hypothesis, current best/baseline, scope, constraints, approved deps, last 10 experiments). Dispatch subagent in worktree.

**Codex backend:**
```bash
# Environment guard -- do NOT delegate if already in Codex
test -n "${CODEX_SANDBOX:-}" || test -n "${CODEX_SESSION_ID:-}" || test ! -w .git
```
Fill prompt template, write to temp file, dispatch:
```bash
cat /tmp/optimize-exp-XXXXX.txt | codex exec --skip-git-repo-check - 2>&1
```
Security posture: ask once per session if not in spec.

### 3.3 Collect and Persist Results

Process as experiments complete -- do NOT wait for full batch. For each:

1. **Measure** via `bash scripts/measure.sh` in experiment worktree. Stability `repeat`: run `repeat_count` times, aggregate; warn if variance > `noise_threshold`.
2. **Write `result.yaml`** crash-recovery marker in worktree <!-- why: recovers if agent crashes before main log update -->
3. **Evaluate degenerate gates** -- any gate fails: `degenerate`, skip judge
4. **Judge** (gates pass + `type: judge`): stratified sampling, batch into `batch_size` groups, parallel judge sub-agents via `references/judge-prompt-template.md`, aggregate scores. Singleton evaluation if configured.
5. **Hard** (gates pass + `type: hard`): use metric directly
6. **Append to experiment log (CP-3)** -- transitional outcome `measured`; finalize during evaluation
7. **Verify CP-3** -- read back, confirm, retry on failure

### 3.4 Evaluate Batch

1. **Rank** by primary metric improvement (must exceed noise_threshold for hard, minimum_improvement for judge)
2. **Best improves -> KEEP**: commit mutable-scope changes (revert if no eligible diff), merge into optimization branch, cleanup worktree. New baseline.
3. **Runner-up check** (up to `max_runner_up_merges_per_batch`): file-level disjointness (same file = overlapping). Disjoint: cherry-pick, re-measure. Strictly better -> `runner_up_kept`. Otherwise -> `runner_up_reverted`. Stop after first failed combination.
4. Deferred deps -> `deferred_needs_approval`
5. Revert all others, cleanup worktrees

### 3.5 Update State (CP-4)

**MANDATORY CHECKPOINT.**

1. Re-read experiment log from disk
2. Finalize outcomes (`kept`/`reverted`/`runner_up_kept`/etc.), write immediately
3. Update `best` section if new best found, write
4. Write strategy digest: categories tried (success/failure counts), key learnings, exploration frontier, current best + improvement
5. Generate new hypotheses: re-read digest + last 10 from log (not full log), add to backlog, write
6. Write updated backlog

**CP-4 Verification:** Read back log (outcomes finalized, best current, backlog updated) + digest. Only then proceed.

### 3.6 Check Stopping Criteria

Stop if ANY: target reached, max iterations, max hours, judge budget exhausted, plateau (no improvement for `plateau_iterations`), manual stop, empty backlog. Otherwise -> 3.1.

### 3.7 Cross-Cutting Concerns

**Codex failure cascade:** 3 consecutive failures -> auto-disable, fall back to subagent. Log the switch.

**Error handling:** Crash/timeout/malformed -> log as `error`/`timeout`, revert, continue with batch.

**Progress reporting:** After each batch: batch N/M, experiments run, current best + improvement, cumulative judge cost.

**Crash recovery:** `result.yaml` markers + immediate CP-3 + batch CP-4. On resume (Phase 0.4): scan for unlogged markers.

---

<!-- why: Kolmogorov compression -- kept deferred->Phase 3 option, 5 post-completion options, cleanup rules -->
## Phase 4: Wrap-Up

### 4.1 Present Deferred Hypotheses

If deferred exist: list with deps, ask approve/skip/save. Approved -> add to backlog, offer one more Phase 3 round.

### 4.2 Summarize Results

Present: spec name, duration, experiment counts (kept/reverted/degenerate/errors/deferred, including runner-up merges), baseline->final metrics (primary, gates, diagnostics), judge cost if applicable, key improvements with deltas.

### 4.3 Preserve and Offer Next Steps

Optimization branch preserves kept commits. Experiment log/digest in `.context/` (gitignored, machine-local).

Options: (1) `/ce-review` with `mode:autofix`, (2) `/ce-compound` to document strategy, (3) Create PR, (4) Continue (re-enter Phase 3, re-read state first), (5) Done.

### 4.4 Cleanup

```bash
rm -f .context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md
```

Keep experiment log (resume/audit). Do NOT delete referenced worktrees.
