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

## Quick Start

For a first run, optimize for signal and safety, not maximum throughput:

- Start from `references/example-hard-spec.yaml` when the metric is objective and cheap to measure
- Use `references/example-judge-spec.yaml` only when actual quality requires semantic judgment
- Prefer `execution.mode: serial` and `execution.max_concurrent: 1`
- Cap the first run with `stopping.max_iterations: 4` and `stopping.max_hours: 1`
- Avoid new dependencies until the baseline and measurement harness are trusted
- For judge mode, start with `sample_size: 10`, `batch_size: 5`, and `max_total_cost_usd: 5`

`references/usage-guide.md`

---

## Persistence Discipline

**CRITICAL: The experiment log on disk is the single source of truth. Results that exist only in the conversation WILL be lost.**

Files under `.context/compound-engineering/ce-optimize/<spec-name>/` are local scratch state, gitignored. They survive local resumes but are not preserved by commits, branches, or pushes unless exported separately.

**Never present results to the user without writing them to disk first.**

### Core Rules

1. **Write each experiment result to disk IMMEDIATELY after measurement** — append the experiment entry to the log the moment metrics are known, before evaluating the next experiment.

2. **VERIFY every critical write** — after writing the experiment log, read the file back and confirm the entry is present. Do not proceed until verification passes. <!-- why: catches silent write failures that lose data -->

3. **Re-read from disk at every phase boundary and before every decision** — re-read the experiment log and strategy digest at phase transitions, batch boundaries, and after any long operation.

4. **The experiment log is append-only during Phase 3** — append new experiment entries. Update the `best` section in place only when a new best is found. <!-- why: prevents data loss if a write is interrupted -->

5. **Per-experiment result markers for crash recovery** — each experiment writes a `result.yaml` marker in its worktree immediately after measurement. On resume, scan for these markers to recover experiments that were measured but not yet logged.

6. **Strategy digest is written after every batch, before generating new hypotheses** — the agent reads the digest (not its memory) when deciding what to try next.

7. **Never present results to the user without writing them to disk first** — measure -> write to disk -> verify -> THEN show the user.

### Mandatory Disk Checkpoints

At each checkpoint, write the specified file and read it back to confirm success.

| Checkpoint | File Written | Phase |
|---|---|---|
| CP-0: Spec saved | `spec.yaml` | Phase 0, after user approval |
| CP-1: Baseline recorded | `experiment-log.yaml` (initial with baseline) | Phase 1, after baseline measurement |
| CP-2: Hypothesis backlog saved | `experiment-log.yaml` (hypothesis_backlog section) | Phase 2, after hypothesis generation |
| CP-3: Each experiment result | `experiment-log.yaml` (append experiment entry) | Phase 3.3, immediately after each measurement |
| CP-4: Batch summary | `experiment-log.yaml` (outcomes + best) + `strategy-digest.md` | Phase 3.5, after batch evaluation |
| CP-5: Final summary | `experiment-log.yaml` (final state) | Phase 4, at wrap-up |

**Verification step:** Write the file, read it back, confirm expected content is present. On failure, retry once, then alert the user.

### File Locations (all under `.context/compound-engineering/ce-optimize/<spec-name>/`)

| File | Purpose | Written When |
|------|---------|-------------|
| `spec.yaml` | Optimization spec (immutable during run) | Phase 0 (CP-0) |
| `experiment-log.yaml` | Full history of all experiments | Initialized at CP-1, appended at CP-3, updated at CP-4 |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | Written at CP-4 after each batch |
| `<worktree>/result.yaml` | Per-experiment crash-recovery marker | Immediately after measurement, before CP-3 |

### On Resume

When Phase 0.4 detects an existing run:
1. Read the experiment log from disk
2. Scan worktree directories for `result.yaml` markers not yet in the log
3. Recover any measured-but-unlogged experiments
4. Continue from where the log left off

---

## Phase 0: Setup

### 0.1 Determine Input Type

- **Spec file path** (ends in `.yaml` or `.yml`): read and validate it
- **Description of the optimization goal**: create a spec interactively with the user

### 0.2 Load or Create Spec

**If spec file provided:**
1. Read and parse the YAML spec file natively (no shell script parsing).
2. Validate against `references/optimize-spec-schema.yaml`:
   - All required fields present
   - `name` is lowercase kebab-case and safe to use in git refs / worktree paths
   - `metric.primary.type` is `hard` or `judge`
   - If type is `judge`, `metric.judge` section exists with `rubric` and `scoring`
   - At least one degenerate gate defined
   - `measurement.command` is non-empty
   - `scope.mutable` and `scope.immutable` each have at least one entry
   - Gate check operators are valid (`>=`, `<=`, `>`, `<`, `==`, `!=`)
   - `execution.max_concurrent` is at least 1
   - `execution.max_concurrent` does not exceed 6 when backend is `worktree`
3. If validation fails, report errors and ask the user to fix them

**If description provided:**
1. Analyze the project to understand what can be measured
2. **Detect whether the optimization target is qualitative or quantitative:**

   **Use `type: hard`** when the metric is a scalar number, objectively measurable, with a clear "better" direction (build time, test pass rate, latency, memory usage, bundle size).

   **Use `type: judge`** when output quality requires semantic understanding, proxy metrics can mislead, or optimization could produce degenerate solutions that look good numerically (clustering quality, search relevance, summarization quality, code readability).

   For qualitative targets, **strongly recommend `type: judge`** and present the three-tier approach:
   - **Degenerate gates** (hard, cheap, fast): catch obviously broken solutions. If gates fail, skip the expensive judge step.
   - **LLM-as-judge** (optimization target): sample outputs, score against rubric, aggregate.
   - **Diagnostics** (logged, not gated): distribution stats, counts, timing.

   If the user insists on `type: hard` for a qualitative target, proceed but warn about misleading proxy optimization.

3. **Design the sampling strategy** (for `type: judge`):

   Guide the user through stratified sampling with these questions:
   - **What does one "item" look like?** (a cluster, a search result page, a summary, etc.)
   - **What are the natural size/quality strata?** (e.g., large vs small vs singletons)
   - **Where are quality failures most likely?** (e.g., degenerate merges, missed groupings)
   - **What total sample size balances cost vs signal?** (default: 30 items)

   Example stratified sampling for clustering:
   ```yaml
   stratification:
     - bucket: "top_by_size"     # largest clusters — check for degenerate mega-clusters
       count: 10
     - bucket: "mid_range"       # middle of non-solo cluster size range — representative quality
       count: 10
     - bucket: "small_clusters"  # clusters with 2-3 items — check if connections are real
       count: 10
   singleton_sample: 15          # singletons — check for false negatives (items that should cluster)
   ```

   Adapt strata to the domain (e.g., search relevance: "top-3", "results 4-10", "tail"; summarization: "short", "long", "multi-topic").

   When the goal involves coverage, sample singletons with the singleton rubric to detect missed groupings.

4. **Design the rubric** (for `type: judge`):

   Define the scoring rubric:
   - 1-5 scale with concrete descriptions for each level
   - Supplementary diagnostic fields (e.g., `distinct_topics`, `outlier_count`)
   - Specific enough for inter-judge agreement
   - No directional assumptions ("3 items per cluster average" is not inherently good or bad)

   Example for clustering:
   ```yaml
   rubric: |
     Rate this cluster 1-5:
     - 5: All items clearly about the same issue/feature
     - 4: Strong theme, minor outliers
     - 3: Related but covers 2-3 sub-topics that could reasonably be split
     - 2: Weak connection — items share superficial similarity only
     - 1: Unrelated items grouped together
     Also report: distinct_topics (integer), outlier_count (integer)
   ```

5. Guide the user through the remaining spec fields:
   - What degenerate cases should be rejected? (gates — e.g., "solo_pct <= 0.95" catches all-singletons, "max_cluster_size <= 500" catches mega-clusters)
   - What command runs the measurement?
   - What files can be modified? What is immutable?
   - Any constraints or dependencies?
   - If this is the first run: recommend `execution.mode: serial`, `execution.max_concurrent: 1`, `stopping.max_iterations: 4`, and `stopping.max_hours: 1`
   - If `type: judge`: recommend `sample_size: 10`, `batch_size: 5`, and `max_total_cost_usd: 5` until the rubric and harness are trusted
6. Write the spec to `.context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`
7. Present the spec to the user for approval before proceeding

### 0.3 Search Prior Learnings

Dispatch `compound-engineering:research:learnings-researcher` to search for prior optimization work on similar topics. Incorporate any relevant learnings.

### 0.4 Run Identity Detection

Check if the `optimize/<spec-name>` branch exists:

```bash
git rev-parse --verify "optimize/<spec-name>" 2>/dev/null
```

**If branch exists**, check for an existing experiment log at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`. Present the user with a choice:
- **Resume**: read ALL state from the experiment log on disk. Recover measured-but-unlogged experiments by scanning worktree directories for `result.yaml` markers. Continue from the last iteration in the log.
- **Fresh start**: archive the old branch to `optimize-archive/<spec-name>/archived-<timestamp>`, clear the experiment log, start from scratch

### 0.5 Create Optimization Branch and Scratch Space

```bash
git checkout -b "optimize/<spec-name>"  # or switch to existing if resuming
```

Create scratch directory:
```bash
mkdir -p .context/compound-engineering/ce-optimize/<spec-name>/
```

---

## Phase 1: Measurement Scaffolding

**HARD GATE: User must approve baseline and parallel readiness before Phase 2.**

### 1.1 Clean-Tree Gate

Verify no uncommitted changes to `scope.mutable` or `scope.immutable` files:

```bash
git status --porcelain
```

Filter output against scope paths. If any in-scope files are dirty:
- Report the dirty files
- Ask the user to commit or stash
- Do NOT continue until in-scope files are clean

### 1.2 Build or Validate Measurement Harness

**If `measurement.command` exists:**
1. Run it once:
   ```bash
   bash scripts/measure.sh "<measurement.command>" <timeout_seconds> "<measurement.working_directory or .>"
   ```
2. Validate JSON output contains keys for all gate and diagnostic metric names with numeric or boolean values
3. On validation failure, report missing keys and ask the user to fix the harness

**If building the harness:**
1. Analyze the codebase to determine what to measure
2. Build an evaluation script (e.g., `evaluate.py`, `evaluate.sh`)
3. Add the script path to `scope.immutable`
4. Run once and validate output
5. Present the harness and output to the user for review

### 1.3 Establish Baseline

Run the measurement harness on current code.

**If stability mode is `repeat`:**
1. Run the harness `repeat_count` times
2. Aggregate results using the configured aggregation method (median, mean, min, max)
3. Calculate variance across runs
4. If variance exceeds `noise_threshold`, warn the user and suggest increasing `repeat_count`

Record the baseline in the experiment log:
```yaml
baseline:
  timestamp: "<current ISO 8601 timestamp>"
  gates:
    <gate_name>: <value>
    ...
  diagnostics:
    <diagnostic_name>: <value>
    ...
```

If primary type is `judge`, also run the judge evaluation on baseline output to establish the starting judge score.

### 1.4 Parallelism Readiness Probe

Run the parallelism probe script:
```bash
bash scripts/parallel-probe.sh "<project_directory>" "<measurement.command>" "<measurement.working_directory>" <shared_files...>
```

Read the JSON output. Present blockers with suggested mitigations. The probe inspects the measurement command, working directory, and declared shared files only.

### 1.5 Worktree Budget Check

Count existing worktrees:
```bash
bash scripts/experiment-worktree.sh count
```

If count + `execution.max_concurrent` exceeds 12:
- Warn the user and suggest cleanup or reducing `max_concurrent`
- Do NOT block

### 1.6 Write Baseline to Disk (CP-1)

**MANDATORY CHECKPOINT.** Write the initial experiment log before presenting results:

1. Create `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`
2. Include all required sections from `references/experiment-log-schema.yaml`: `spec`, `run_id`, `started_at`, `baseline`, `experiments`, and `best`
3. Seed `experiments: []` and seed `best` from the baseline snapshot (`iteration: 0`, baseline metrics, baseline judge scores if present)
4. Optional: seed `hypothesis_backlog: []`
5. **Verify**: read back and confirm required sections and baseline values
6. Then present results to the user

### 1.7 User Approval Gate

Present via platform question tool:

- **Baseline metrics**: gate values, diagnostic values, judge scores (if applicable)
- **Experiment log location**: file path
- **Parallel readiness**: probe results, blockers, mitigations
- **Clean-tree status**: confirmed clean
- **Worktree budget**: current count and projected usage
- **Judge budget**: estimated per-experiment cost and `max_total_cost_usd` cap (flag uncapped if null)

**Options:**
1. **Proceed** -- move to Phase 2
2. **Adjust spec** -- modify settings
3. **Fix issues** -- resolve blockers

Do NOT proceed until the user explicitly approves. If `max_total_cost_usd` is null, require explicit approval for uncapped spend.

After approval, re-read spec and baseline from disk.

---

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read code within `scope.mutable` to identify:
- Current implementation approach
- Improvement opportunities
- Constraints and inter-component dependencies

Optional: dispatch `compound-engineering:research:repo-research-analyst` for deeper analysis when scope is large or unfamiliar.

### 2.2 Generate Hypothesis List

Generate 10-30 hypotheses. Each must have:
- **Description**: what to try
- **Category**: standard (signal-extraction, graph-signals, embedding, algorithm, preprocessing, parameter-tuning, architecture, data-handling) or domain-specific
- **Priority**: high / medium / low
- **Required dependencies**: new packages or tools needed

Include user-provided hypotheses. More hypotheses can be generated during the loop.

### 2.3 Dependency Pre-Approval

Collect all unique new dependencies across hypotheses:
1. Present the full dependency list via platform question tool
2. Ask for bulk approval
3. Mark each hypothesis's `dep_status` as `approved` or `needs_approval`

Unapproved-dependency hypotheses remain in backlog but are skipped during batch selection and re-presented at wrap-up.

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

## Phase 3: Optimization Loop

### 3.1 Batch Selection

Select hypotheses for the batch:
- Build runnable backlog by excluding hypotheses with `dep_status: needs_approval`
- If `execution.mode` is `serial`, force `batch_size = 1`
- Otherwise, `batch_size = min(runnable_backlog_size, execution.max_concurrent)`
- Prefer diversity: select from different categories when possible
- Within a category, select by priority (high first)

If backlog is empty and no new hypotheses can be generated, proceed to Phase 4.
If no runnable hypotheses remain (all need approval or are blocked), proceed to Phase 4.

### 3.2 Dispatch Experiments

Dispatch according to `execution.mode`: serial runs one experiment to completion before selecting the next; parallel dispatches the full batch concurrently.

**Worktree backend:**
1. Create experiment worktree:
   ```bash
   WORKTREE_PATH=$(bash scripts/experiment-worktree.sh create "<spec_name>" <exp_index> "optimize/<spec_name>" <shared_files...>)  # creates optimize-exp/<spec_name>/exp-<NNN>
   ```
2. Apply port parameterization if configured
3. Fill `references/experiment-prompt-template.md` with:
   - Iteration number, spec name
   - Hypothesis description and category
   - Current best and baseline metrics
   - Mutable and immutable scope
   - Constraints and approved dependencies
   - Rolling window of last 10 experiments (concise summaries)
4. Dispatch a subagent with the filled prompt, working in the experiment worktree

**Codex backend:**
1. Check environment guard -- do NOT delegate if already inside a Codex sandbox:
   ```bash
   # If these exist, we're already in Codex -- fall back to subagent
   test -n "${CODEX_SANDBOX:-}" || test -n "${CODEX_SESSION_ID:-}" || test ! -w .git
   ```
2. Fill the experiment prompt template
3. Write the filled prompt to a temp file
4. Dispatch via Codex:
   ```bash
   cat /tmp/optimize-exp-XXXXX.txt | codex exec --skip-git-repo-check - 2>&1
   ```
5. Security posture: use the user's selection (ask once per session if not set in spec)

### 3.3 Collect and Persist Results

Process experiments as they complete — do NOT wait for the entire batch. For each completed experiment, **immediately**:

1. **Run measurement** in the experiment's worktree:
   ```bash
   bash scripts/measure.sh "<measurement.command>" <timeout_seconds> "<worktree_path>/<measurement.working_directory or .>" <env_vars...>
   ```
   - If stability mode is `repeat`, run `repeat_count` times, aggregate as in Phase 1 before evaluating gates.
   - Use aggregated metrics as the experiment's score; if variance exceeds `noise_threshold`, record in learnings.

2. **Write crash-recovery marker** — write `result.yaml` in the experiment worktree containing raw metrics. <!-- why: recovers measurement if agent crashes before updating main log -->

3. **Read raw JSON output** from the measurement script

4. **Evaluate degenerate gates**:
   - For each gate in `metric.degenerate_gates`, compare metric value against operator and threshold
   - If ANY gate fails: mark outcome as `degenerate`, skip judge evaluation

5. **If gates pass AND primary type is `judge`**:
   - Read the experiment's output
   - Apply stratified sampling per `metric.judge.stratification` (using `sample_seed`)
   - Group into batches of `metric.judge.batch_size`
   - Fill `references/judge-prompt-template.md` for each batch
   - Dispatch `ceil(sample_size / batch_size)` parallel judge sub-agents
   - Aggregate structured JSON scores: `metric.judge.scoring.primary` plus any `scoring.secondary` values
   - If `singleton_sample > 0`: dispatch singleton evaluation sub-agents

6. **If gates pass AND primary type is `hard`**: use the metric value directly from measurement output.

7. **IMMEDIATELY append to experiment log (CP-3)** — write the experiment entry (iteration, hypothesis, outcome, metrics, learnings) to `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`. Use transitional outcome `measured`; update to `kept`, `reverted`, or terminal state during evaluation.

8. **VERIFY the write (CP-3)** — read the log back and confirm the entry is present. Retry on failure. Do NOT proceed until confirmed on disk.

### 3.4 Evaluate Batch

After all experiments in the batch are measured:

1. **Rank** by primary metric improvement:
   - Hard metrics: compare to current best using `metric.primary.direction`; improvement must exceed `measurement.stability.noise_threshold`
   - Judge metrics: compare primary judge score to current best; must exceed `minimum_improvement`

2. **Identify the best experiment** that passes all gates and improves the primary metric

3. **If best improves on current best: KEEP**
   - Commit the experiment branch (mutable-scope changes only); if no eligible diff remains, revert
   - Merge into the optimization branch with message `optimize(<spec-name>): <hypothesis description>`
   - Clean up the winner's experiment worktree and branch
   - New baseline for subsequent batches

4. **Check file-disjoint runners-up** (up to `max_runner_up_merges_per_batch`):
   - For each improving runner-up, check file-level disjointness with the kept experiment (same file = overlapping, even if different lines)
   - If disjoint: cherry-pick onto new baseline, re-run full measurement
   - If combined measurement is strictly better: keep (`runner_up_kept`), clean up worktree/branch
   - Otherwise: revert (`runner_up_reverted`), clean up worktree/branch
   - Stop after first failed combination

5. **Handle deferred deps**: experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Revert all others**: cleanup worktrees, log as `reverted`

### 3.5 Update State (CP-4)

**MANDATORY CHECKPOINT.** Update aggregate state and verify.

1. **Re-read the experiment log from disk.**

2. **Finalize outcomes** — mark `kept`, `reverted`, `runner_up_kept`, etc. Write to disk immediately.

3. **Update the `best` section** in the experiment log if a new best was found. Write to disk.

4. **Write strategy digest** to `.context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md`:
   - Categories tried so far (with success/failure counts)
   - Key learnings from this batch and overall
   - Exploration frontier: what categories and approaches remain untried
   - Current best metrics and improvement from baseline

5. **Generate new hypotheses**:
   - Re-read strategy digest from disk
   - Read rolling window (last 10 experiments from log on disk)
   - Do NOT read full log -- use digest for broad context
   - Add new hypotheses to backlog, write to disk

6. **Write updated hypothesis backlog to disk** (newly added and removed hypotheses).

**CP-4 Verification:** Read experiment log back. Confirm: (a) all batch outcomes finalized, (b) `best` section current, (c) backlog updated. Read `strategy-digest.md` back. Only then proceed.

### 3.6 Check Stopping Criteria

Stop if ANY:
- **Target reached**: `stopping.target_reached` is true, `metric.primary.target` is set, and primary metric reaches target per `metric.primary.direction`
- **Max iterations**: experiments >= `stopping.max_iterations`
- **Max hours**: wall-clock time >= `stopping.max_hours`
- **Judge budget exhausted**: cumulative spend >= `metric.judge.max_total_cost_usd`
- **Plateau**: no improvement for `stopping.plateau_iterations` consecutive experiments
- **Manual stop**: user interrupts (save state, proceed to Phase 4)
- **Empty backlog**: no hypotheses remain

If none met, proceed to next batch (step 3.1).

### 3.7 Cross-Cutting Concerns

**Codex failure cascade**: After 3 consecutive Codex delegation failures, auto-disable Codex and fall back to subagent dispatch. Log the switch.

**Error handling**: If measurement crashes, times out, or produces malformed output: log as `error` or `timeout`, revert (cleanup worktree), continue with remaining batch experiments.

**Progress reporting**: After each batch report batch N/M, experiments run (batch + total), current best metric + improvement from baseline, cumulative judge cost.

**Crash recovery**: Per-experiment `result.yaml` markers (step 3.3), individual results appended immediately (step 3.3), batch state finalized (step 3.5). On resume (Phase 0.4), scan for `result.yaml` markers not yet in the log.

---

## Phase 4: Wrap-Up

### 4.1 Present Deferred Hypotheses

If deferred hypotheses exist:
1. List with dependency requirements
2. Ask: approve, skip, or save for future run
3. If approved: add to backlog and offer one more Phase 3 round

### 4.2 Summarize Results

Present summary:

```
Optimization: <spec-name>
Duration: <wall-clock time>
Total experiments: <count>
  Kept: <count> (including <runner_up_kept_count> runner-up merges)
  Reverted: <count>
  Degenerate: <count>
  Errors: <count>
  Deferred: <count>

Baseline -> Final:
  <primary_metric>: <baseline_value> -> <final_value> (<delta>)
  <gate_metrics>: ...
  <diagnostics>: ...

Judge cost: $<total_judge_cost_usd> (if applicable)

Key improvements:
  1. <kept experiment 1 hypothesis> (+<delta>)
  2. <kept experiment 2 hypothesis> (+<delta>)
  ...
```

### 4.3 Preserve and Offer Next Steps

The optimization branch (`optimize/<spec-name>`) preserves all kept-experiment commits. The experiment log and strategy digest remain in local `.context/` scratch space (gitignored, machine-local only).

Present post-completion options:

1. **Run `/ce-review`** on cumulative diff with `mode:autofix`
2. **Run `/ce-compound`** to document the winning strategy
3. **Create PR** from optimization branch to default branch
4. **Continue** -- re-enter Phase 3 (re-read state first)
5. **Done** -- leave branch for manual review

### 4.4 Cleanup

```bash
# Remove temporary batch artifacts; keep experiment log for local resume/audit
rm -f .context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md
```

Do NOT delete the experiment log if the user may resume or wants a local audit trail. Do NOT delete worktrees still being referenced.
