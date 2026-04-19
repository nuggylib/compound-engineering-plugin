---
name: ce-code-review
description: "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR."
argument-hint: "[blank to review current branch, or provide PR link]"
---

# Code Review

Reviews code changes using dynamically selected reviewer personas. Spawns parallel sub-agents that return structured JSON, then merges and deduplicates findings into a single report.

## When to Use

- Before creating a PR
- After completing a task during iterative implementation
- When feedback is needed on any code changes
- Can be invoked standalone
- Can run as a read-only or autofix review step inside larger workflows

## Argument Parsing

Parse `$ARGUMENTS` for the following optional tokens. Strip each recognized token before interpreting the remainder as the PR number, GitHub URL, or branch name.

| Token | Example | Effect |
|-------|---------|--------|
| `mode:autofix` | `mode:autofix` | Select autofix mode (see Mode Detection below) |
| `mode:report-only` | `mode:report-only` | Select report-only mode |
| `mode:headless` | `mode:headless` | Select headless mode for programmatic callers (see Mode Detection below) |
| `base:<sha-or-ref>` | `base:abc1234` or `base:origin/main` | Skip scope detection — use this as the diff base directly |
| `plan:<path>` | `plan:docs/plans/2026-03-25-001-feat-foo-plan.md` | Load this plan for requirements verification |
| `cap:none` or `cap:N` | `cap:none` or `cap:4` | Override the diff-proportional conditional reviewer cap. `cap:none` disables capping; `cap:N` sets the max conditional reviewers to N |

All tokens are optional. Each one present means one less thing to infer. When absent, fall back to existing behavior for that stage.

**Conflicting mode flags:** If multiple mode tokens appear in arguments, stop and do not dispatch agents. If `mode:headless` is one of the conflicting tokens, emit the headless error envelope: `Review failed (headless mode). Reason: conflicting mode flags — <mode_a> and <mode_b> cannot be combined.` Otherwise emit the generic form: `Review failed. Reason: conflicting mode flags — <mode_a> and <mode_b> cannot be combined.`

**`cap:` validation:** `cap:N` requires N to be a positive integer. `cap:0` is invalid (it would eliminate all conditional reviewers). If `cap:` has an invalid value, stop and report the error. `cap:` does not conflict with any mode flag.

## Mode Detection

| Mode | When | Behavior |
|------|------|----------|
| **Interactive** (default) | No mode token present | Review, apply safe_auto fixes automatically, present findings, ask for policy decisions on gated/manual findings, and optionally continue into fix/push/PR next steps |
| **Autofix** | `mode:autofix` in arguments | No user interaction. Review, apply only policy-allowed `safe_auto` fixes, re-review in bounded rounds, write a run artifact, and emit residual downstream work when needed |
| **Report-only** | `mode:report-only` in arguments | Strictly read-only. Review and report only, then stop with no edits, artifacts, todos, commits, pushes, or PR actions |
| **Headless** | `mode:headless` in arguments | Programmatic mode for skill-to-skill invocation. Apply `safe_auto` fixes silently (single pass), return all other findings as structured text output, write run artifacts, skip todos, and return "Review complete" signal. No interactive prompts. |

<!-- why: Kolmogorov compression -- deduplicated cross-mode shared constraints -->
### Shared non-interactive mode constraints (autofix, report-only, headless)

- **Skip all user questions.** Never pause for approval or clarification. Infer intent conservatively if diff metadata is thin.
- **Never commit, push, or create a PR.** Parent workflows or callers own those decisions.
- **Do not switch the shared checkout.** If the caller passes an explicit PR or branch target, run in an isolated checkout/worktree or stop.

### Autofix mode rules

In addition to shared constraints above:

- **Apply only `safe_auto -> review-fixer` findings.** Leave `gated_auto`, `manual`, `human`, and `release` work unresolved.
- **Write a run artifact** under `.context/compound-engineering/ce-review/<run-id>/` summarizing findings, applied fixes, residual actionable work, and advisory outputs.
- **Create durable todo files only for unresolved actionable findings** whose final owner is `downstream-resolver`. Load the `todo-create` skill for the canonical directory path and naming convention.

### Report-only mode rules

In addition to shared constraints above:

- **Never edit files or externalize work.** Do not write `.context/compound-engineering/ce-review/<run-id>/`, do not create todo files. Do not create residual todos or `.context` artifacts.
- **Only mode safe for parallel read-only use.** Safe to run concurrently with browser testing on the same checkout. Do not start a mutating review round concurrently with browser testing on the same checkout.
- **Checkout restrictions:** mode:report-only cannot switch the shared checkout to review a PR target — use an isolated worktree. mode:report-only cannot switch the shared checkout to review another branch — use an isolated worktree or no target argument.

### Headless mode rules

In addition to shared constraints above:

- **Never use the platform question tool.** All decisions must be made deterministically without user interaction.
- **Require a determinable diff scope.** If no branch, PR, or `base:` ref is determinable without user interaction, emit `Review failed (headless mode). Reason: no diff scope detected. Re-invoke with a branch name, PR number, or base:<ref>.` and stop.
- **Single-pass fixes only.** Apply `safe_auto -> review-fixer` findings in one pass. No bounded re-review rounds. Return all other findings in the structured text output (headless envelope, see Stage 6) preserving severity, autofix_class, owner, requires_verification, confidence, pre_existing, and suggested_fix. Enrich with detail-tier fields from per-agent artifacts.
- **Write a run artifact** under `.context/compound-engineering/ce-review/<run-id>/`. Include the artifact path in the structured output.
- **Do not create todo files.** The caller receives structured findings and routes downstream work itself.
- **Not concurrent-safe.** Not safe for concurrent use on a shared checkout. Unlike report-only, headless mutates files. Do not run concurrently with other mutating operations on the same checkout. mode:headless must run in an isolated checkout/worktree or stop. When stopping due to checkout switch, emit `Review failed (headless mode). Reason: cannot switch shared checkout. Re-invoke with base:<ref> to review the current checkout, or run from an isolated worktree.`
- **End with "Review complete" as the terminal signal.** If all reviewers fail or time out, emit `Code review degraded (headless mode). Reason: 0 of N reviewers returned results.` followed by "Review complete".

### Interactive mode rules

- **Pre-load the platform question tool before any question fires.** In Claude Code, `AskUserQuestion` is a deferred tool — its schema is not available at session start. At the start of Interactive-mode work (before Stage 2 intent-ambiguity questions, the After-Review routing question, walk-through per-finding questions, bulk-preview Proceed/Cancel, and tracker-defer failure sub-questions), call `ToolSearch` with query `select:AskUserQuestion` to load the schema. Load it **once, eagerly, at the top of the Interactive flow** — do not wait for the first question site and do not decide it on a per-site basis. On Codex and Gemini this preload step does not apply.
- **The numbered-list fallback only applies when the harness genuinely lacks a blocking question tool** — `ToolSearch` returns no match, the tool call explicitly fails, or the runtime mode does not expose it (e.g., Codex edit modes where `request_user_input` is unavailable). A pending schema load is not a fallback trigger; call `ToolSearch` first per the pre-load rule. Rendering a question as narrative text because the tool feels inconvenient, because the model is in report-formatting mode, or because the instruction was buried in a long skill is a bug. A question that calls for a user decision must either fire the tool or fall back loudly.

## Severity Scale

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. Routing answers **who acts next** and **whether this skill may mutate the checkout**.

| `autofix_class` | Default owner | Meaning |
|-----------------|---------------|---------|
| `safe_auto` | `review-fixer` | Local, deterministic fix suitable for the in-skill fixer when the current mode allows mutation |
| `gated_auto` | `downstream-resolver` or `human` | Concrete fix exists, but it changes behavior, contracts, permissions, or another sensitive boundary that should not be auto-applied by default |
| `manual` | `downstream-resolver` or `human` | Actionable work that should be handed off rather than fixed in-skill |
| `advisory` | `human` or `release` | Report-only output such as learnings, rollout notes, or residual risk |

Routing rules:

- **Synthesis owns the final route.** Persona-provided routing metadata is input, not the last word.
- **Choose the more conservative route on disagreement.** A merged finding may move from `safe_auto` to `gated_auto` or `manual`, but never the other way without stronger evidence.
- **Only `safe_auto -> review-fixer` enters the in-skill fixer queue automatically.**
- **`requires_verification: true` means a fix is not complete without targeted tests, a focused re-review, or operational validation.**

## Reviewers

17 reviewer personas in layered conditionals, plus CE-specific agents. See `references/persona-catalog.md` for the full catalog.

**Always-on (every review):**

| Agent | Focus |
|-------|-------|
| `ce-correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation |
| `ce-testing-reviewer` | Coverage gaps, weak assertions, brittle tests |
| `ce-maintainability-reviewer` | Coupling, complexity, naming, dead code, abstraction debt |
| `ce-project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, portability |
| `ce-agent-native-reviewer` | Verify new features are agent-accessible |
| `ce-learnings-researcher` | Search docs/solutions/ for past issues related to this PR |

**Cross-cutting conditional (selected per diff):**

| Agent | Select when diff touches... |
|-------|---------------------------|
| `ce-security-reviewer` | Auth, public endpoints, user input, permissions |
| `ce-performance-reviewer` | DB queries, data transforms, caching, async |
| `ce-api-contract-reviewer` | Routes, serializers, type signatures, versioning |
| `ce-data-migrations-reviewer` | Migrations, schema changes, backfills |
| `ce-reliability-reviewer` | Error handling, retries, timeouts, background jobs |
| `ce-adversarial-reviewer` | Diff >=50 changed non-test/non-generated/non-lockfile lines, or auth, payments, data mutations, external APIs |
| `ce-cli-readiness-reviewer` | CLI command definitions, argument parsing, CLI framework usage, command handler implementations |
| `ce-previous-comments-reviewer` | Reviewing a PR that has existing review comments or threads |

**Stack-specific conditional (selected per diff):**

| Agent | Select when diff touches... |
|-------|---------------------------|
| `ce-dhh-rails-reviewer` | Rails architecture, service objects, session/auth choices, or Hotwire-vs-SPA boundaries |
| `ce-kieran-rails-reviewer` | Rails application code where conventions, naming, and maintainability are in play |
| `ce-kieran-python-reviewer` | Python modules, endpoints, scripts, or services |
| `ce-kieran-typescript-reviewer` | TypeScript components, services, hooks, utilities, or shared types |
| `ce-julik-frontend-races-reviewer` | Stimulus/Turbo controllers, DOM events, timers, animations, or async UI flows |

**CE conditional (migration-specific):**

| Agent | Select when diff includes migration files |
|-------|------------------------------------------|
| `ce-schema-drift-detector` | Cross-references schema.rb against included migrations |
| `ce-deployment-verification-agent` | Produces deployment checklist with SQL verification queries |

## Review Scope

Every review spawns all 4 always-on personas plus the 2 CE always-on agents, then adds whichever cross-cutting and stack-specific conditionals fit the diff. The model naturally right-sizes: a small config change triggers 0 conditionals = 6 reviewers. A Rails auth feature might trigger security + reliability + kieran-rails + dhh-rails = 10 reviewers.

## Protected Artifacts

The following paths are compound-engineering pipeline artifacts and must never be flagged for deletion, removal, or gitignore by any reviewer:

- `docs/brainstorms/*` -- requirements documents created by ce-brainstorm
- `docs/plans/*.md` -- plan files created by ce-plan (living documents with progress checkboxes)
- `docs/solutions/*.md` -- solution documents created during the pipeline

If a reviewer flags any file in these directories for cleanup or removal, discard that finding during synthesis.

## How to Run

<!-- why: Kolmogorov compression -- factored shared output format and checkout guards -->
### Stage 1: Determine scope

Compute the diff range, file list, and diff. Minimize permission prompts by combining into as few commands as possible.

**Shared output command** (all paths produce this once BASE is resolved):

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

**Checkout guard** (PR and branch paths only): If `mode:report-only` or `mode:headless` is active, do **not** switch the shared checkout. Report-only: tell caller it cannot switch the checkout -- use an isolated worktree or no target argument. Headless: emit `Review failed (headless mode). Reason: cannot switch shared checkout. Re-invoke with base:<ref> to review the current checkout, or run from an isolated worktree.` Stop unless already in an isolated checkout.

**Clean-tree gate** (PR and branch paths only): Run `git status --porcelain` before switching. If non-empty, inform the user of uncommitted changes and do not proceed.

**If `base:` argument is provided (fast path):**

Skip all detection. Use the provided value directly:

```
BASE_ARG="{base_arg}"
BASE=$(git merge-base HEAD "$BASE_ARG" 2>/dev/null) || BASE="$BASE_ARG"
```

Then run the shared output command. Automated callers should prefer `base:`. **Do not combine `base:` with a PR number or branch target.** If both are present, stop with an error: "Cannot use `base:` with a PR number or branch target — `base:` implies the current checkout is already the correct branch."

**If a PR number or GitHub URL is provided as an argument:**

Apply checkout guard and clean-tree gate, then:

```
gh pr checkout <number-or-url>
```

```
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,url
```

Extract `baseRefName` as the base branch and the repository portion of the PR URL as `<base-repo>` from `gh pr view` output. Resolve the base ref from the PR's actual base repository using `scripts/resolve-pr-base.sh`:

```
RESOLVE_OUT=$(bash scripts/resolve-pr-base.sh --base <baseRefName> --base-repo <base-repo>)
if echo "$RESOLVE_OUT" | grep -q '^ERROR:'; then echo "$RESOLVE_OUT"; exit 1; fi
BASE=$(echo "$RESOLVE_OUT" | sed 's/^BASE://')
```

Run the shared output command with the resolved BASE. If the script outputs an error, stop.

<!-- why: gh pr diff reflects remote PR state only, missing local fix commits until pushed -->
Do not use `gh pr diff` as the review scope after checkout.
<!-- why: a PR review without the PR base branch only shows uncommitted changes, missing all committed branch work -->
Do not fall back to `git diff HEAD` if the base ref cannot be resolved.

**If a branch name is provided as an argument:**

Apply checkout guard and clean-tree gate, then:

```
git checkout <branch>
```

Resolve base via `references/resolve-base.sh`:

```
RESOLVE_OUT=$(bash references/resolve-base.sh) || { echo "ERROR: resolve-base.sh failed"; exit 1; }
if [ -z "$RESOLVE_OUT" ] || echo "$RESOLVE_OUT" | grep -q '^ERROR:'; then echo "${RESOLVE_OUT:-ERROR: resolve-base.sh produced no output}"; exit 1; fi
BASE=$(echo "$RESOLVE_OUT" | sed 's/^BASE://')
```

<!-- why: without the base branch, git diff HEAD only shows uncommitted changes, silently missing all committed branch work -->
If the script outputs an error, stop. Do not fall back to `git diff HEAD`. On success, run the shared output command. Optional: fetch PR metadata with `gh pr view`; do not fail if no PR exists.

**If no argument (standalone on current branch):**

Resolve base via `references/resolve-base.sh` (same script as branch mode):

```
RESOLVE_OUT=$(bash references/resolve-base.sh) || { echo "ERROR: resolve-base.sh failed"; exit 1; }
if [ -z "$RESOLVE_OUT" ] || echo "$RESOLVE_OUT" | grep -q '^ERROR:'; then echo "${RESOLVE_OUT:-ERROR: resolve-base.sh produced no output}"; exit 1; fi
BASE=$(echo "$RESOLVE_OUT" | sed 's/^BASE://')
```

If the script outputs an error, stop. Do not fall back to `git diff HEAD`. On success, run the shared output command.
<!-- why: git diff $BASE (without ..HEAD) diffs merge-base against working tree, capturing committed + staged + unstaged changes -->

**Untracked file handling:** Untracked files are outside review scope until staged. If the `UNTRACKED:` list is non-empty, tell the user which files are excluded and stop if any should be reviewed (`git add` first). In headless/autofix, proceed with tracked changes only and note exclusions in Coverage.

**Executable line counting:** Count changed lines (additions + deletions) from executable code files only. Exclude: test files (`test/`, `tests/`, `spec/`, `__tests__/`, `*_test.*`, `*.test.*`, `*.spec.*`), generated files, lockfiles (`package-lock.json`, `yarn.lock`, `Gemfile.lock`, `bun.lockb`, `Cargo.lock`, `poetry.lock`, `go.sum`), instruction-prose Markdown. Same exclusion rules as adversarial depth calibration. Record as `EXECUTABLE_LINES: N` in Stage 1 metadata.

<!-- why: Kolmogorov compression -- 3 modes share output format, compressed prose -->
### Stage 2: Intent discovery

Determine what the change is trying to accomplish. Source per scope path: PR/URL -> PR title/body/linked issues (supplement with commits if body sparse); branch -> `git log --oneline ${BASE}..<branch>`; standalone -> `git rev-parse --abbrev-ref HEAD` + `git log --oneline ${BASE}..HEAD`.

Write a 2-3 line intent summary combining the above with conversation context (plan, PR description). Pass this to every reviewer.

**When intent is ambiguous:** Interactive: ask one question via the platform question tool ("What is the primary goal of these changes?") -- do not spawn reviewers until established. Non-interactive modes: infer conservatively from branch name, diff, PR metadata, and caller context; note uncertainty in Coverage/Verdict instead of blocking.

<!-- why: Kolmogorov compression -- compressed prose, kept priority order and decision rules -->
### Stage 2b: Plan discovery (requirements verification)

Locate the plan document for Stage 6 requirements verification. Priority order (stop at first hit):

1. **`plan:` argument** -> use directly, verify file exists -> `plan_source: explicit`
2. **PR body** -> scan for `docs/plans/*.md` paths. Single unambiguous match that exists on disk -> `plan_source: explicit`. Multiple/ambiguous -> `plan_source: inferred` for most recent existing match. Verify existence -- stale links are common.
3. **Auto-discover** -> extract 2-3 keywords from branch name, glob `docs/plans/*`. Single unambiguous match -> `plan_source: inferred`. Generic keywords (`review`, `fix`, `update`) that hit many plans -> **skip** -- a wrong plan is worse than no plan.

If found, read its Requirements Trace and Implementation Units; store for Stage 6. Do not block if no plan found.

### Stage 3: Select reviewers

Read `references/persona-catalog.md` for the full reviewer persona catalog with selection criteria.

Read the diff and file list from Stage 1. The 4 always-on personas and 2 CE always-on agents are automatic. For each cross-cutting and stack-specific conditional persona in the persona catalog, decide whether the diff warrants it.

**File-type awareness for conditional selection:** Instruction-prose files (Markdown skill definitions, JSON schemas, config files) are product code but do not benefit from runtime-focused reviewers. The adversarial reviewer's techniques (race conditions, cascade failures, abuse cases) target executable code behavior. For diffs that only change instruction-prose files, skip adversarial unless the prose describes auth, payment, or data-mutation behavior. Count only executable code lines toward line-count thresholds.

**`previous-comments` is PR-only.** Only select this persona when Stage 1 gathered PR metadata (PR number or URL was provided as an argument, or `gh pr view` returned metadata for the current branch). Skip it entirely for standalone branch reviews with no associated PR -- there are no prior comments to check.

Stack-specific personas are additive. A Rails UI change may warrant `kieran-rails` plus `julik-frontend-races`; a TypeScript API diff may warrant `kieran-typescript` plus `api-contract` and `reliability`.

For CE conditional agents, check if the diff includes files matching `db/migrate/*.rb`, `db/schema.rb`, or data backfill scripts.

<!-- why: Kolmogorov compression -- kept both lookup tables and category preservation, compressed algorithm prose -->
#### Diff-proportional cap

Cap applies only to conditional reviewers. Always-on agents (4 persona + 2 CE) are exempt.

| Tier | Changed executable lines | Max conditional reviewers |
|------|--------------------------|---------------------------|
| Trivial | < 50 | 2 |
| Small | 50-199 | 4 |
| Medium | 200-499 | 6 |
| Large | 500+ | No cap |

`cap:none` -> dispatch all matching. `cap:N` -> use N as max.

**Priority tiers** (fill slots Tier 1 first, then 2, 3, 4; content-relevance tiebreaker within tier):

| Priority | Category | Reviewers |
|----------|----------|-----------|
| Tier 1 -- Content-triggered cross-cutting | security, reliability, data-migrations, adversarial |
| Tier 2 -- Structure-triggered cross-cutting | performance, api-contract, cli-readiness, previous-comments |
| Tier 3 -- Stack-specific | dhh-rails, kieran-rails, kieran-python, kieran-typescript, julik-frontend-races |
| Tier 4 -- CE conditional | schema-drift-detector, deployment-verification-agent |

If within cap, dispatch all. Otherwise fill by priority tier, mark remainder `[capped]`.

**Category preservation:** Cap must not eliminate an entire matched category. Tier 1 matched + slots remain -> include at least one. Multi-stack diff -> include at least one stack-specific (most changed lines). CE conditional fills after Tiers 1-3.

**Adversarial interaction:** Adversarial has its own >=50 line threshold. Under trivial tier (<50 lines), adversarial wouldn't match. At 50+ lines, competes at Tier 1 priority.

**Mode compatibility:** Identical across all modes. No mode bypasses cap unless `cap:none`.

Announce team before spawning with per-conditional justifications and `[capped]` entries. Do not wait for confirmation.

<!-- why: Kolmogorov compression -- standard glob + filter to essential instruction -->
### Stage 3b: Discover project standards paths

Glob `**/CLAUDE.md` and `**/AGENTS.md`; filter to those whose directory is an ancestor of at least one changed file. Pass the path list (not contents) to `project-standards` in a `<standards-paths>` block.
<!-- why: orchestrator does path discovery only; persona reads file content to avoid bloating the subagent prompt -->

<!-- why: Kolmogorov compression -- compressed surrounding prose, kept template/schema/tiering -->
### Stage 4: Spawn sub-agents

#### Model tiering

Mid-tier model for all persona and CE sub-agents (`model: "sonnet"` in Claude Code, equivalent on other platforms). Default model for orchestration.
<!-- why: intent discovery, reviewer selection, merge/dedup, and synthesis benefit from stronger reasoning -->

#### Run ID
```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
mkdir -p ".context/compound-engineering/ce-code-review/$RUN_ID"
```

Pass `{run_id}` to every persona sub-agent for artifact writes to `.context/compound-engineering/ce-review/{run_id}/{reviewer_name}.json`.

**Report-only mode:** Skip run-id/directory creation. Use `DISPATCH_DIR=$(mktemp -d -t ce-review-XXXXXX)` instead.

#### Write shared dispatch context

Read `references/subagent-template.md`, `references/diff-scope.md`, `references/findings-schema.json`. Assemble by substituting `{diff_scope_rules}` and `{schema}` into the template; remove `<persona>`, `<pr-context>`, `<review-context>` (per-agent, go in lean prompt); keep preamble, `<scope-rules>`, `<output-contract>`. Write to `{run_id}/dispatch-context.md`. Write diff to `{run_id}/diff.txt`.

#### Spawning

Omit the `mode` parameter. Spawn each persona reviewer in parallel with this lean prompt:

```
Read `.context/compound-engineering/ce-review/{run_id}/dispatch-context.md` for your review contract, confidence rubric, scope rules, and output schema. Read the file BEFORE analyzing the diff.

<persona>
{persona_file}
</persona>

<pr-context>
{pr_metadata}
</pr-context>

<review-context>
Run ID: {run_id}
Reviewer name: {reviewer_name}

Intent: {intent_summary}

Changed files: {file_list}

Read `.context/compound-engineering/ce-review/{run_id}/diff.txt` for the full diff.
</review-context>

If the dispatch context file read fails, return {"reviewer": "{reviewer_name}", "findings": [], "residual_risks": ["Dispatch context read failed"], "testing_gaps": []}.
```

For `project-standards` only: append Stage 3b `<standards-paths>` block after `<review-context>`.

Persona sub-agents: return structured JSON only, no file edits except the `.context/` artifact. Non-mutating inspection commands allowed. Each writes full JSON to `{run_id}/{reviewer_name}.json` and returns compact JSON:

```json
{
  "reviewer": "security",
  "findings": [
    {
      "title": "User-supplied ID in account lookup without ownership check",
      "severity": "P0",
      "file": "orders_controller.rb",
      "line": 42,
      "confidence": 0.92,
      "autofix_class": "gated_auto",
      "owner": "downstream-resolver",
      "requires_verification": true,
      "pre_existing": false,
      "suggested_fix": "Add current_user.owns?(account) guard before lookup"
    }
  ],
  "residual_risks": [...],
  "testing_gaps": [...]
}
```

Detail-tier fields (`why_it_matters`, `evidence`) in artifact only. `suggested_fix` optional in both tiers.

**CE always-on agents** (agent-native-reviewer, learnings-researcher): dispatch in parallel with personas. Pass full review context bundle (entry mode, PR metadata, intent, base branch, `BASE:` marker, file list, diff, `UNTRACKED:` notes). Unstructured output, synthesized in Stage 6.

**CE conditional agents** (schema-drift-detector, deployment-verification-agent): dispatch when applicable with review context plus applicability reason. Schema-drift-detector: pass resolved review base branch explicitly.

<!-- why: Kolmogorov compression -- compressed standard merge steps, kept fingerprint/gates/partitions -->
### Stage 5: Merge findings

Convert multiple reviewer compact JSON returns into one deduplicated, confidence-gated finding set. The compact returns contain merge-tier fields (title, severity, file, line, confidence, autofix_class, owner, requires_verification, pre_existing) plus the optional suggested_fix. Detail-tier fields (why_it_matters, evidence) are on disk in the per-agent artifact files and are not loaded at this stage.

1. **Validate.** Drop malformed returns/findings; record drop count.
   - **Top-level required:** reviewer (string), findings (array), residual_risks (array), testing_gaps (array)
   - **Per-finding required:** title, severity, file, line, confidence, autofix_class, owner, requires_verification, pre_existing
- **Value constraints:** severity: P0-P3; autofix_class: safe_auto|gated_auto|manual|advisory; owner: review-fixer|downstream-resolver|human|release; confidence- 0.0-1.0; line: positive int; pre_existing/requires_verification: boolean
   - Validate compact returns only -- full schema applies to artifact files on disk.
<!-- why: critical-but-uncertain issues must not be silently dropped -->
2. **Confidence gate.** Suppress below 0.60. **Exception:** P0 at 0.50+ survives. Record suppressed count.
3. **Deduplicate.** Fingerprint: `normalize(file) + line_bucket(line, +/-3) + normalize(title)`. On match: keep highest severity and confidence, note contributing reviewers.
4. **Cross-reviewer boost.** 2+ reviewers on same fingerprint -> +0.10 confidence (cap 1.0). Note in Reviewer column.
5. **Separate pre-existing** (`pre_existing: true`) into a separate list.
6. **Resolve disagreements.** Annotate Reviewer column with disagreement (e.g., "security (P0), correctness (P1) -- kept P0").
7. **Normalize routing.** Final autofix_class/owner/requires_verification per merged finding. On disagreement, keep most conservative route. May narrow `safe_auto` -> `gated_auto`/`manual`; never widen without new evidence.
8. **Partition into three sets:**
   - **Fixer queue:** `safe_auto -> review-fixer`
   - **Residual actionable:** `gated_auto`/`manual` with owner `downstream-resolver`
   - **Report-only:** `advisory` + owner `human`/`release`
9. **Sort:** severity (P0 first) -> confidence desc -> file -> line.
10. **Collect coverage.** Union residual_risks and testing_gaps across reviewers.
11. **Preserve CE agent artifacts** (learnings, agent-native, schema-drift, deployment-verification) alongside merged findings.

<!-- why: Kolmogorov compression -- kept report section list, plan_source routing, pipe-delimited constraint -->
### Stage 6: Synthesize and present

Read `references/review-output-template.md` for the report format template. Render findings as **pipe-delimited markdown tables** grouped by severity. Never use freeform text blocks or bullet lists for findings.

**Report sections** (omit empty/inapplicable ones):

1. **Header** -- scope, intent, mode, reviewer team with conditional justifications
2. **Findings** -- pipe-delimited tables: `### P0 -- Critical` through `### P3 -- Low`, rows: #, file, issue, reviewer(s), confidence, route
3. **Requirements Completeness** -- only when plan found (Stage 2b). Checklist: met / not addressed / partially addressed. `plan_source- explicit` -> unaddressed = P1 `manual`/`downstream-resolver` (enter residual queue). `plan_source- inferred` -> unaddressed = P3 `advisory`/`human` (report only). Omit entirely when no plan found.
4. **Applied Fixes** -- only if fix phase ran
5. **Residual Actionable Work** -- unresolved actionable findings
6. **Pre-existing** -- separate, does not count toward verdict
7. **Learnings & Past Solutions** -- flag relevant past solutions as "Known Pattern" with links
8. **Agent-Native Gaps** -- omit if none
9. **Schema Drift Check** -- drift found: list objects + cleanup command; clean: state briefly
10. **Deployment Notes** -- Go/No-Go items, verification queries, rollback, monitoring
11. **Coverage** -- suppressed count, residual risks, testing gaps, failed reviewers, intent uncertainty
12. **Verdict** -- Ready to merge / Ready with fixes / Not ready. `explicit` unaddressed -> "Not ready" unless intentional. `inferred` unaddressed -> note but do not block alone.

No time estimates. Verify pipe-delimited format before delivering.

### Headless output format

In `mode:headless`, replace the interactive pipe-delimited table report with a structured text envelope. The envelope follows the same structural pattern as document-review's headless output (completion header, metadata block, findings grouped by autofix_class, trailing sections) while using ce-code-review's own section headings and per-finding fields.

```
Code review complete (headless mode).

Scope: <scope-line>
Intent: <intent-summary>
Reviewers: <reviewer-list with conditional justifications>
Verdict: <Ready to merge | Ready with fixes | Not ready>
Artifact: .context/compound-engineering/ce-code-review/<run-id>/

Applied N safe_auto fixes.

Gated-auto findings (concrete fix, changes behavior/contracts):

[P1][gated_auto -> downstream-resolver][needs-verification] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">
  Evidence: <evidence[0]>
  Evidence: <evidence[1]>

Manual findings (actionable, needs handoff):

[P1][manual -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Evidence: <evidence[0]>

Advisory findings (report-only):

[P2][advisory -> human] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Pre-existing issues:
[P2][gated_auto -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Residual risks:
- <risk>

Learnings & Past Solutions:
- <learning>

Agent-Native Gaps:
- <gap description>

Schema Drift Check:
- <drift status>

Deployment Notes:
- <deployment note>

Testing gaps:
- <gap>

Coverage:
- Suppressed: <N> findings below 0.60 confidence (P0 at 0.50+ retained)
- Untracked files excluded: <file1>, <file2>
- Failed reviewers: <reviewer>

Review complete
```

**Detail enrichment (headless only):** The headless envelope includes `Why:`, `Evidence:`, and `Suggested fix:` lines. After merge (Stage 5), read the per-agent artifact files from `.context/compound-engineering/ce-code-review/{run_id}/` for only the findings that survived dedup and confidence gating.
   - **Field tiers:** `Why:` and `Evidence:` are detail-tier -- load from per-agent artifact files. `Suggested fix:` is merge-tier -- use it directly from the compact return without artifact lookup.
   - **Artifact matching:** For each surviving finding, look up its detail-tier fields in the artifact files of the contributing reviewers. Match on `file + line_bucket(line, +/-3)` (the same tolerance used in Stage 5 dedup) within each contributing reviewer's artifact. When multiple artifact entries fall within the line bucket, apply `normalize(title)` to both the merged finding's title and each candidate entry's title as a tie-breaker.
   - **Reviewer order:** Try contributing reviewers in the order they appear in the merged finding's reviewer list; use the first match.
   - **No-match fallback:** If no artifact file contains a match (all writes failed, or the finding was synthesized during merge), omit the `Why:` and `Evidence:` lines for that finding and note the gap in Coverage. The `Suggested fix:` line can still be populated from the compact return since it is merge-tier.

<!-- why: Kolmogorov compression -- compressed formatting rules to essential routing -->
**Formatting rules:** `[needs-verification]` only when `requires_verification: true`. `owner: release` -> Advisory section. `pre_existing: true` -> Pre-existing section regardless of autofix_class. Verdict in metadata header. Omit sections with zero items. Degraded output: `Code review degraded (headless mode). Reason: 0 of N reviewers returned results.` followed by "Review complete". Always end with "Review complete" as terminal signal.

<!-- why: Kolmogorov compression -- kept non-obvious gates, compressed standard ones -->
## Quality Gates

Before delivering, verify: every finding is actionable (rewrite vague "consider" language with specific actions), severity is calibrated (style nits are never P0, SQL injection never P3), and protected artifacts are respected.

Non-obvious gates:
<!-- why: wrong line numbers are worse than no finding -- they misdirect the developer -->
1. **Line numbers verified against file content** for each cited finding.
2. **Bug isn't handled elsewhere in same function** -- check surrounding code for existing guards, type annotations using "unused" imports, caller-level null checks.
3. **Findings don't duplicate linter output.** Focus on semantic issues, not formatting the project's linter would catch.

## Language-Aware Conditionals

This skill uses stack-specific reviewer agents when the diff clearly warrants them. Keep those agents opinionated. They are not generic language checkers; they add a distinct review lens on top of the always-on and cross-cutting personas.

Do not spawn them mechanically from file extensions alone. The trigger is meaningful changed behavior, architecture, or UI state in that stack.

<!-- why: Kolmogorov compression -- kept advisory guard, question variants, fixer constraints, severity mapping, per-mode menus -->
## After Review

### Mode-Driven Post-Review Flow

After Stage 6, route next steps by mode.

#### Step 1: Build the action sets

Clean review (zero findings after suppression/pre-existing separation) -> skip fix/handoff. Three queues: fixer (`safe_auto -> review-fixer`), residual actionable (`gated_auto`/`manual` with `downstream-resolver`), report-only (`advisory` + `human`/`release`). **Never convert advisory-only outputs into fix work or todos.**

#### Step 2: Choose policy by mode

**Interactive:** Apply safe_auto automatically. Ask via platform question tool only when `gated_auto`/`manual` remain:

**`gated_auto` present** (with or without `manual`):
  ```
  (A) Review each finding one by one — accept the recommendation or choose another action
  (B) LFG. Apply the agent's best-judgment action per finding
  (C) File a [TRACKER] ticket per finding without applying fixes
  (D) Report only — take no further action
  ```

**Only `manual` remaining:**
  ```
  Safe fixes have been applied. The remaining findings need manual resolution. What should I do?
  1. Leave as residual work (Recommended)
  2. Report only -- no further action
  ```

  If no `gated_auto` or `manual` findings remain after safe fixes, skip the policy question entirely. Only include `gated_auto` findings in the fixer queue after the user explicitly approves the specific items.

**Autofix:** No questions. Apply safe_auto only. Prepare residual work for `downstream-resolver` findings.

**Report-only:** No questions, no fixer, no todos/artifacts. Stop after Stage 6.

**Headless:** No questions. Single-pass safe_auto fix (no re-review loop). Headless envelope output. Write run artifact, no todos. Stop after "Review complete".

#### Step 3: Apply fixes with one fixer and bounded rounds

Single fixer subagent, all approved changes + targeted tests in one pass. No parallel fixers on same checkout. Re-review changed scope only. `max_rounds: 2` -- unresolved after round 2 becomes residual. `requires_verification: true` -> round incomplete until verification runs. No concurrent browser testing.

#### Step 4: Emit artifacts and downstream handoff

In interactive/autofix/headless: write per-run artifact to `.context/compound-engineering/ce-review/<run-id>/` (findings, fixes, residual, advisory). In autofix mode, create durable todo files only for unresolved actionable findings whose final owner is `downstream-resolver`. Severity mapping: `P0`/`P1` -> `p1`, `P2` -> `p2`, `P3` -> `p3`, `status: ready`. No todos for advisory/human/release/protected-artifact findings. If only advisory outputs remain, create no todos.

#### Step 5: Final next steps

**Interactive only** -- offer per entry mode (use resolved base/default branch, not hard-coded):

**On the resolved review base/default branch:**

- **PR mode:** Push fixes | Exit
- **Branch mode (feature branch):** Create a PR (Recommended) | Continue without PR | Exit
- **Default branch:** Continue | Exit

Create PR: `git push --set-upstream origin HEAD` then `gh pr create`. Push fixes: `git push`.

**Non-interactive modes:** stop after report + artifacts + handoff. No commit/push/PR.

## Fallback

If the platform doesn't support parallel sub-agents, run reviewers sequentially. Everything else (stages, output format, merge pipeline) stays the same.

