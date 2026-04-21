---
name: ce-work
description: Execute work efficiently while maintaining quality and finishing features
argument-hint: "[Plan doc path or description of work. Blank to auto use latest plan doc] [delegate:codex]"
---

# Work Execution Command

During execution: work efficiently while maintaining quality and finishing features.

<!-- why: Kolmogorov compression -- restated frontmatter description -->

## Input Document

<input_document> #$ARGUMENTS </input_document>

<!-- why: Kolmogorov compression -- kept argument tokens, fuzzy rules, 3-level precedence, config command, 6 keys with defaults, 6 resolved variables -->
## Argument Parsing

Parse `$ARGUMENTS` for optional tokens. Strip recognized tokens; remainder is plan file path or bare prompt.

| Token | Effect |
|-------|--------|
| `delegate:codex` | Activate Codex delegation |
| `delegate:local` | Deactivate delegation |

**Fuzzy activation:** "use codex", "delegate to codex", "codex mode", "delegate mode" -> `delegate:codex`. Bare "codex" mention (e.g., "fix codex bugs") must NOT activate.
**Fuzzy deactivation:** "no codex", "local mode", "standard mode" -> `delegate:local`.

### Settings Resolution Chain

Precedence: (1) argument flag, (2) config file, (3) hard default `false`.

**Config (pre-resolved):**
!`cat "$(git rev-parse --show-toplevel 2>/dev/null)/.compound-engineering/config.local.yaml" 2>/dev/null || cat "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)")/.compound-engineering/config.local.yaml" 2>/dev/null || echo '__NO_CONFIG__'`

`__NO_CONFIG__` or missing -> all defaults. Unresolved command string -> read via native file-read tool. Unrecognized values -> defaults.

| Config key | Values (default bold) |
|---|---|
| `work_delegate` | `codex` / **`false`** |
| `work_delegate_consent` | `true` / **`false`** |
| `work_delegate_sandbox` | **`yolo`** / `full-auto` |
| `work_delegate_decision` | **`auto`** / `ask` |
| `work_delegate_model` | passthrough, default **`gpt-5.4`** |
| `work_delegate_effort` | `minimal`/`low`/`medium`/**`high`**/`xhigh` |

Resolved state: `delegation_active` (bool), `delegation_source` (argument/config/default), `sandbox_mode`, `consent_granted` (bool), `delegate_model`, `delegate_effort`.

---

## Execution Workflow

<!-- why: Kolmogorov compression -- kept 3-tier routing, trivial Test Discovery, scan-first -->
### Phase 0: Input Triage

**Plan document** (file path) -> Phase 1. **Bare prompt:**

1. **Scan work area** -- identify likely changed files, find existing test files, note local patterns.

2. **Route by complexity:**

   | Complexity | Signals | Action |
   |-----------|---------|--------|
| **Trivial** | 1-2 files, no behavioral change | Phase 1.2, implement directly (no task list). Apply Test Discovery if behavior-bearing |
   | **Small/Medium** | Clear scope, <10 files | Build task list, Phase 1.2 |
   | **Large** | Cross-cutting, 10+ files, auth/payments/migrations | Recommend `/ce-brainstorm` or `/ce-plan`. Honor user choice |

---

<!-- why: Kolmogorov compression -- kept Execution note/Deferred/Scope checks, explicit TDD honor, 3 environment options, meaningless branch detection, default branch confirmation, task derivation, 3 execution strategies, bare prompt default -->
### Phase 1: Quick Start

1. **Read Plan and Clarify** _(skip if arriving from Phase 0 with a bare prompt)_

Read completely. Treat as decision artifact, not execution script. Check for:
   - **Execution note** per unit (posture: test-first, characterization-first) -> carry into tasks
   - **Deferred to Implementation** / **Implementation-Time Unknowns** -> note before starting
   - **Scope Boundaries** -> explicit non-goals, refer back during implementation
   - Honor explicit user TDD/test-first request even without Execution note
   - Ask clarifying questions now. Get approval. Do not skip.

2. **Setup Environment**

   ```bash
   current_branch=$(git branch --show-current)
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   if [ -z "$default_branch" ]; then
     default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")
   fi
   ```

   **Feature branch:** Check for meaningless/auto-generated names (e.g., `worktree-jolly-beaming-raven`). If meaningless, suggest `git branch -m <meaningful-name>` derived from plan title. Ask: continue or create new branch.

   **Default branch** -- 3 options:
   - **A: New branch** (`git pull origin [default_branch] && git checkout -b <name>`)
   - **B: Worktree** (recommended for parallel dev -- use `git-worktree` skill)
   - **C: Continue on default** -- requires explicit user confirmation ("yes, commit to [default_branch]")

3. **Create Todo List** _(skip if Phase 0 already built one or routed as Trivial)_

Derive tasks from implementation units (Goal, Dependencies, Files, Test targets, Verification). Carry Execution note. Read `Patterns to follow` before implementing. Use Verification as done signal. Do not expect implementation code or micro-step TDD.

4. **Choose Execution Strategy**

   **Delegation routing gate:** `delegation_active` + plan file -> read `references/codex-delegation-workflow.md`, force serial. Bare prompt -> disable delegation ("Codex delegation requires a plan file -- using standard mode.").

   | Strategy | When to use |
   |----------|-------------|
| **Inline** | 1-2 tasks or user interaction needed. **Default for bare prompts** |
   | **Serial subagents** | 3+ tasks with dependencies. Fresh context per unit prevents degradation |
   | **Parallel subagents** | 3+ independent units (no shared deps, non-overlapping files) |

   Subagent dispatch: pass plan file path, unit metadata (Goal, Files, Approach, Execution note, Patterns, Test scenarios, Verification), resolved deferred questions, instruction to check test scenario completeness. Omit `mode` parameter. Update plan checkboxes after each subagent.

<!-- why: Kolmogorov compression -- kept task loop, 4 guardrails, test discovery, System-Wide Test Check (INCOMPRESSIBLE), commit table, frontend detection criteria -->
### Phase 2: Execute

1. **Task Execution Loop**

   ```
   while (tasks remain):
     - Mark in-progress
     - Read referenced files, find similar patterns
     - Test Discovery (see below)
     - If delegation_active: branch to the Codex Delegation Execution Loop (references/codex-delegation-workflow.md)
     - Otherwise: implement following existing conventions
     - Add/update/remove tests to match changes
     - System-Wide Test Check (see below)
     - Run tests after changes
     - Assess testing coverage (behavior changed -> tests written?)
     - Mark task as completed
     - Evaluate incremental commit
   ```

   Honor `Execution note`: test-first -> failing test before implementation; characterization-first -> capture behavior before changing. No note -> proceed pragmatically.

   **Guardrails:** (1) Test-first: do not write test and implementation in same step, (2) verify new test fails before implementing, (3) do not over-implement beyond current slice, (4) skip test-first for trivial renames/config/styling.

   **Test Discovery** -- Find existing test/spec files for implementation files being changed. Plan test scenarios first, then check for additional coverage. New behavior -> new tests; changed -> modified tests; deleted -> removed tests.

   **Test Scenario Completeness** -- Verify plan scenarios cover happy path, edge cases, error/failure paths, integration. Supplement gaps before writing tests.

   **System-Wide Test Check** — Before marking a task done, pause and ask:

   | Question | What to do |
   |----------|------------|
   | **What fires when this runs?** Callbacks, middleware, observers, event handlers — trace two levels out from your change. | Read the actual code (not docs) for callbacks on models you touch, middleware in the request chain, `after_*` hooks. |
   | **Do my tests exercise the real chain?** If every dependency is mocked, the test proves your logic works *in isolation* — it says nothing about the interaction. | Write at least one integration test that uses real objects through the full callback/middleware chain. No mocks for the layers that interact. |
   | **Can failure leave orphaned state?** If your code persists state (DB row, cache, file) before calling an external service, what happens when the service fails? Does retry create duplicates? | Trace the failure path with real objects. If state is created before the risky call, test that failure cleans up or that retry is idempotent. |
   | **What other interfaces expose this?** Mixins, DSLs, alternative entry points (Agent vs Chat vs ChatMethods). | Grep for the method/behavior in related classes. If parity is needed, add it now — not as a follow-up. |
   | **Do error strategies align across layers?** Retry middleware + application fallback + framework error handling — do they conflict or create double execution? | List the specific error classes at each layer. Verify your rescue list matches what the lower layer actually raises. |

   **When to skip:** Leaf-node changes with no callbacks, no state persistence, no parallel interfaces.
   **When this matters most:** Models with callbacks, error handling with fallback/retry, multiple interfaces.

<!-- why: Kolmogorov compression -- kept table and heuristic, compressed examples -->
2. **Incremental Commits**

   | Commit when... | Don't commit when... |
   |----------------|---------------------|
   | Logical unit complete (model, service, component) | Small part of a larger unit |
   | Tests pass + meaningful progress | Tests failing |
   | About to switch contexts (backend -> frontend) | Purely scaffolding with no behavior |
   | About to attempt risky/uncertain changes | Would need a "WIP" commit message |

   **Heuristic:** "Can I write a commit message that describes a complete, valuable change?" Use plan units as starting commit boundaries. Stage only related files, conventional messages, resolve conflicts immediately.

3. **Follow Existing Patterns** -- Read `Patterns to follow` first. Match conventions, reuse components. Bare prompt -> grep for similar implementations.

4. **Test Continuously** -- Run tests after each significant change, fix immediately. Unit tests (mocked isolation) + integration tests (real objects) when touching callbacks/middleware/error handling.

5. **Simplify as You Go** -- After 2-3 related units, review for consolidation/shared helpers. Don't simplify after every unit -- early patterns may diverge. Use `/simplify` skill if available.

6. **Figma Design Sync** (if applicable) -- Implement, compare iteratively with figma-design-sync, fix differences, repeat until match.

7. **Frontend Design Guidance** (if applicable) -- Detection: touches view/template/component/layout/page files, creates user-visible routes, or plan contains UI/frontend/design language. Load `frontend-design` skill. Verification screenshot satisfies Phase 4 screenshot requirement; mental-review fallback does not.

8. **Track Progress** -- Update task list, note blockers, create tasks if scope expands.

### Phase 3-4: Quality Check and Ship It

When all Phase 2 tasks are complete and execution transitions to quality check, read `references/shipping-workflow.md` for the full shipping workflow: quality checks, code review, final validation, PR creation, and notification.

---

## Codex Delegation Mode

When `delegation_active` is true after argument parsing, read `references/codex-delegation-workflow.md` for the complete delegation workflow: pre-checks, batching, prompt template, execution loop, and result classification.

---

<!-- why: Kolmogorov compression -- principle names are self-documenting -->
## Key Principles

1. **Start Fast, Execute Faster** -- clarify once upfront, then execute; finish features, not process.
2. **The Plan is Your Guide** -- load referenced patterns and match what exists.
3. **Test As You Go** -- run tests after each change, fix failures immediately.
4. **Quality is Built In** -- follow patterns, write tests, lint before pushing, review every change.
5. **Ship Complete Features** -- mark all tasks done; a shipped feature beats a perfect unfinished one.

<!-- why: Kolmogorov compression -- names carry the message -->
## Common Pitfalls to Avoid

Analysis paralysis, skipping clarifying questions, ignoring plan references, testing at the end, forgetting to track progress, 80% done syndrome, skipping review.
