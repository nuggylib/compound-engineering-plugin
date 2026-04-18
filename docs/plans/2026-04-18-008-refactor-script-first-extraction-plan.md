---
title: "refactor: Extract deterministic shell recipes into co-located scripts"
type: refactor
status: active
date: 2026-04-18
origin: docs/brainstorms/2026-04-16-script-first-extraction-requirements.md
---

# refactor: Extract deterministic shell recipes into co-located scripts

## Overview

Move deterministic procedural content (git command cascades, branch detection, diff computation) from SKILL.md inline shell into co-located Bash scripts. Three target skills: git-clean-gone-branches, git-commit-push-pr, and ce-review Stage 1. This reduces carrying cost by replacing multi-line shell recipes with single-line script invocations while improving reliability through deterministic execution.

## Problem Frame

Skill SKILL.md files carry procedural shell recipes in context across every tool call in a session. A 50-line recipe costs ~50 tokens per message x N tool calls. The same logic in a co-located script costs ~1 line of invocation instruction. Nine of 42 skills already use scripts; the remaining 33 embed all procedural logic inline. The claude-permissions-optimizer precedent demonstrated 60-75% token reduction when procedural logic moves to scripts (see origin: `docs/brainstorms/2026-04-16-script-first-extraction-requirements.md`).

## Requirements Trace

- R1. Extract deterministic shell sequences from target skills into co-located Bash scripts
- R2. Maintain behavioral equivalence between inline shell and extracted scripts
- R3. Follow established script patterns (set -euo pipefail, structured text output, exit 0 with error messages)
- R4. Comply with AGENTS.md: scripts are per-skill (no cross-skill sharing), relative path references, no platform-specific variables
- R5. Reduce carrying cost by net ~8,050 bytes across three skills (~502K byte-calls per session)
- R6. Establish golden-output test pattern for co-located scripts

## Scope Boundaries

- Only deterministic, judgment-free shell sequences are extracted. Model reasoning sections stay in SKILL.md
- git-worktree is excluded (already fully scripted)
- Executable line counting in ce-review is deferred (marginal 600B savings)
- ce-review Stage 1's `base:` fast path is excluded (already minimal, 2-line inline)
- No changes to the standalone/branch paths in ce-review (they already use resolve-base.sh)

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-review/references/resolve-base.sh` -- 98-line Bash script, structured output (BASE:<sha> / ERROR:<msg>), 4-fallback cascade with fork-safe remote resolution
- `plugins/compound-engineering/skills/git-clean-gone-branches/scripts/clean-gone` -- 49-line Bash script, one-per-line output with __NONE__ sentinel
- `plugins/compound-engineering/skills/ce-review/SKILL.md:211-231` -- PR-path inline shell (two code blocks, ~21 lines of shell within a broader ~52-line section) duplicating resolve-base.sh logic for fork-safe remote resolution with template variables
- `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md:105-184` -- default branch resolution cascade + base branch detection (48 lines) overlapping with resolve-base.sh
- `plugins/compound-engineering/skills/git-clean-gone-branches/SKILL.md:49-66` -- deletion loop (12 lines) with worktree check

### Institutional Learnings

- Anti-pattern: "instruction-only optimization" -- adding "don't do X" without providing a script alternative yields only 16% savings vs 65% with full extraction (from claude-permissions-optimizer history)
- Anti-pattern: "dual rule definitions" -- rules defined in both script and SKILL.md drift apart. One source of truth per classification
- Anti-pattern: "script-as-documentation bloat" -- after extraction, SKILL.md describes the script's interface, not its implementation

## Key Technical Decisions

- **Bash for all extractions:** All three targets are git/gh command sequences. Bash is the natural fit and matches 5 of 9 existing scripts. JavaScript would add boilerplate for spawning git subprocesses.
- **Duplicate base resolution logic:** AGENTS.md requires per-skill file isolation. git-commit-push-pr gets its own `scripts/resolve-context.sh` adapted from resolve-base.sh, rather than sharing. The logic is similar but not identical -- git-commit-push-pr also needs default branch resolution and existing PR detection, which resolve-base.sh doesn't cover.
- **Structured text output (KEY:value):** Matches resolve-base.sh's `BASE:<sha>` pattern. Parseable with simple sed/awk in SKILL.md code blocks. No JSON dependency for simple git operations.
- **Exit 0 with error messages in output:** Matches existing convention (resolve-base.sh, clean-gone). Prevents model confusion from bash error output. Errors appear as `ERROR:<message>` in stdout.
- **PR-path template variables become script arguments:** ce-review's PR-path uses `<base>` and `<base-repo>` as template variables the model substitutes at runtime. The extracted script accepts these as CLI arguments instead. SKILL.md retains the minimal logic to extract values from PR metadata and pass them as arguments.

## Open Questions

### Resolved During Planning

- **Shared vs duplicated scripts:** Duplicated, per AGENTS.md "If two skills need the same supporting file, duplicate it into each skill's directory." Drift risk is accepted as the cost of converter portability.
- **Executable line counting extraction:** Deferred. Only ~600B savings, and the counting logic is described in prose, not inline shell. Extraction would require inventing a script for something currently expressed as instructions.
- **ce-review diff output command deduplication:** The 4-occurrence diff command (`echo "BASE:$BASE" && echo "FILES:" && ...`) stays inline. It is a single line repeated for clarity across code paths, and extracting it would require passing the BASE variable through a second script call for negligible savings (~200B per occurrence, ~800B total, but the invocation overhead partially offsets).

### Deferred to Implementation

- **Exact argument parsing style for resolve-context.sh:** Positional args vs flags. Depends on how many values need passing. Resolve during implementation.
- **Whether resolve-pr-base.sh should also emit the diff output (Unit 3):** The requirements doc proposed two scripts (extend resolve-base.sh + new scope-diff.sh). Implementation may find a single script cleaner for the PR path since it already needs both the base and the diff. Currently scoped as base-resolution only.

## Implementation Units

- [ ] **Unit 1: git-clean-gone-branches -- Add delete subcommand to clean-gone script**

  **Goal:** Extract the Step 3 deletion loop from SKILL.md into the existing clean-gone script as a `delete` subcommand.

  **Requirements:** R1, R2, R3, R4

  **Dependencies:** None

  **Files:**
  - Modify: `plugins/compound-engineering/skills/git-clean-gone-branches/scripts/clean-gone`
  - Modify: `plugins/compound-engineering/skills/git-clean-gone-branches/SKILL.md`
  - Test: `tests/clean-gone-script.test.ts`

  **Approach:**
  - Add a `delete` subcommand to the existing script. When called with `bash scripts/clean-gone delete branch1 branch2 ...`, the script checks for associated worktrees, removes them, and deletes each branch.
  - Use `git worktree list --porcelain` for reliable worktree path parsing (handles paths with spaces). Parse `worktree <path>` and `branch refs/heads/<name>` lines to match branches.
  - Output: one result line per branch (`DELETED:<branch>`, `WORKTREE_REMOVED:<path>`, or `ERROR:<branch>:<message>`).
  - SKILL.md Step 3 becomes: "Run `bash scripts/clean-gone delete <branch1> <branch2> ...` with the confirmed branch list. Parse the output to report results."
  - Preserve the existing `clean-gone` (no args) behavior for discovery.

  **Patterns to follow:**
  - Existing `clean-gone` script structure (set -euo pipefail, sentinel values)
  - resolve-base.sh error handling (structured error output, exit 0)

  **Test scenarios:**
  - Happy path: delete subcommand with 2 branches, both deleted successfully -> output shows DELETED for each
  - Happy path: branch with associated worktree -> output shows WORKTREE_REMOVED then DELETED
  - Edge case: no arguments to delete subcommand -> output shows ERROR or usage message
  - Edge case: branch that doesn't exist -> output shows ERROR:<branch>:<message>
  - Happy path: no-args invocation still returns branch list (backward compatibility)

  **Verification:**
  - SKILL.md Step 3 is 2-3 lines referencing the script instead of 12 lines of inline shell
  - Net reduction: ~450 bytes from SKILL.md

- [ ] **Unit 2: git-commit-push-pr -- Create resolve-context.sh**

  **Goal:** Extract default branch resolution, existing PR detection, and base branch detection from SKILL.md into a new `scripts/resolve-context.sh`.

  **Requirements:** R1, R2, R3, R4, R5

  **Dependencies:** None (independent skill)

  **Files:**
  - Create: `plugins/compound-engineering/skills/git-commit-push-pr/scripts/resolve-context.sh`
  - Modify: `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md`
  - Test: `tests/resolve-context-script.test.ts`

  **Approach:**
  - The script resolves three things in one invocation:
    1. Default branch (4-fallback cascade from Step 1: origin/HEAD -> gh repo view -> common names)
    2. Base branch and remote for PR diff (4-fallback cascade from Step 6: PR metadata -> remote default -> gh repo view -> common names). This duplicates resolve-base.sh logic, adapted for git-commit-push-pr's context.
    3. Whether the local base ref is already available (to avoid unnecessary fetches)
  - Output format: KEY:value structured text
    ```
    DEFAULT_BRANCH:<name>
    BASE_BRANCH:<name>
    BASE_REMOTE:<remote>
    BASE_REF_LOCAL:<yes|no>
    PR_EXISTS:<yes|no>
    PR_URL:<url|none>
    PR_BASE:<branch|none>
    ```
  - Accept optional flags to short-circuit detection when Claude Code pre-resolution already gathered values:
    - `--default-branch <name>`: skip the default branch fallback cascade
    - `--pr-base <branch>` + `--pr-url <url>`: skip `gh pr view` call inside the script
    When pre-resolution returned sentinel values (e.g., `DEFAULT_BRANCH_UNRESOLVED`, `NO_OPEN_PR`), SKILL.md omits the corresponding flag and the script runs its own detection.
  - When gh is unavailable, PR-related fields default to `PR_EXISTS:no`, `PR_URL:none`, `PR_BASE:none`. The DEFAULT_BRANCH and BASE_BRANCH cascades fall back to common branch names.
  - SKILL.md Steps 1 and 6 each shrink to: run the script (passing any pre-resolved values as flags), parse the output, proceed with decision logic.
  - The decision tree in Step 1 (detached HEAD, clean working tree, on default branch) stays in SKILL.md -- that is model judgment, not deterministic shell.
  - Creates a new `scripts/` directory for this skill.

  **Patterns to follow:**
  - resolve-base.sh 4-fallback cascade pattern
  - clean-gone structured output pattern

  **Test scenarios:**
  - Happy path: on a feature branch with upstream and open PR -> output shows all fields populated
  - Happy path: on a feature branch with no PR -> PR_EXISTS:no, PR_URL:none
  - Edge case: origin/HEAD unresolved, gh unavailable -> falls back to common branch names
  - Edge case: detached HEAD -> DEFAULT_BRANCH still resolves, but current branch info reflects detached state
  - Error path: no remotes configured -> ERROR:<message>
  - Integration: PR metadata from `--pr-base` flag matches output BASE_BRANCH

  **Verification:**
  - SKILL.md Steps 1 and 6 replaced with script invocation + decision logic
  - Net reduction: ~3,000 bytes from SKILL.md (24%)

- [ ] **Unit 3: ce-review -- Extract PR-path scope detection into script**

  **Goal:** Extract the PR-path fork-safe remote resolution code blocks (SKILL.md lines 211-231, ~21 lines of shell within the broader PR-path section) into a script, unifying it with the existing resolve-base.sh approach.

  **Requirements:** R1, R2, R3, R4, R5

  **Dependencies:** None (independent skill)

  **Files:**
  - Create: `plugins/compound-engineering/skills/ce-review/scripts/resolve-pr-base.sh`
  - Modify: `plugins/compound-engineering/skills/ce-review/SKILL.md`
  - Test: `tests/resolve-pr-base-script.test.ts`

  **Approach:**
  - Create `scripts/resolve-pr-base.sh` in a new `scripts/` directory. Note: the existing `resolve-base.sh` lives in `references/`, but AGENTS.md convention places executables in `scripts/`. The new script follows the correct convention; moving `resolve-base.sh` is a separate cleanup task outside this plan's scope.
  - The script accepts `--base <branch>` and `--base-repo <owner/repo>` arguments. If `--base-repo` is empty or omitted, skip remote matching and fall back to `origin/<base>` resolution. This handles the PR-path fork-safe resolution that is currently inline in SKILL.md.
  - The script resolves the correct remote for the base repo, fetches if needed, and computes the merge-base commit. Output: `BASE:<merge-base-sha>` or `ERROR:<message>`.
  - SKILL.md PR-path block (lines 211-231) shrinks from two code blocks + surrounding prose to: run resolve-pr-base.sh with args from PR metadata, check output, produce diff.
  - The diff output command (`echo "BASE:$BASE" && echo "FILES:" && ...`) stays inline in the PR path -- it is a single line and the invocation overhead would offset savings.
  - Standalone and branch paths are unchanged (already use resolve-base.sh).

  **Execution note:** Read the PR-path inline shell carefully before implementing. The template variables `<base>` and `<base-repo>` are model-substituted placeholders, not literal values. For example, inline shell `PR_BASE_REMOTE_REF="$PR_BASE_REMOTE/<base>"` becomes a script invocation: `bash scripts/resolve-pr-base.sh --base main --base-repo owner/repo` where the model extracts concrete values from `gh pr view` metadata and passes them as arguments.

  **Patterns to follow:**
  - `references/resolve-base.sh` -- same output contract (`BASE:<sha>` / `ERROR:<message>`), same error handling pattern
  - Fork-safe remote resolution pattern from the existing inline shell

  **Test scenarios:**
  - Happy path: base repo matches origin remote -> resolves via origin, outputs BASE:<sha>
  - Happy path: base repo matches a non-origin remote (fork) -> resolves via correct remote
  - Edge case: no remote matches base-repo -> falls back to direct fetch from GitHub URL
  - Edge case: base branch not available locally, fetch succeeds -> outputs BASE:<sha>
  - Error path: base branch fetch fails, no local ref available -> outputs ERROR:<message>
  - Edge case: shallow clone -> attempts unshallow fetch before failing

  **Verification:**
  - SKILL.md PR-path code blocks (~21 lines of shell) plus surrounding instructional prose replaced by ~5 lines (script call + error check + diff command)
  - Net reduction: ~2,500-3,800 bytes from SKILL.md PR-path section (range depends on how much surrounding prose can be trimmed)
  - Standalone/branch paths unchanged, still using resolve-base.sh

- [ ] **Unit 4: Golden-output script tests**

  **Goal:** Establish a test pattern for co-located Bash scripts using the existing bun test infrastructure.

  **Requirements:** R6

  **Dependencies:** Units 1-3

  **Files:**
  - Create: `tests/clean-gone-script.test.ts`
  - Create: `tests/resolve-context-script.test.ts`
  - Create: `tests/resolve-pr-base-script.test.ts`
  - Modify: `tests/resolve-base-script.test.ts` (extract shared helpers)
  - Create: `tests/helpers/setup-test-repo.ts`

  **Approach:**
  - Extract the existing test helpers from `tests/resolve-base-script.test.ts` (initRepo, commitFile, runCommand, runGit, createStubBin) into a shared `tests/helpers/setup-test-repo.ts` module. Update resolve-base-script.test.ts to import from the shared helper.
  - Each new test file follows the flat `tests/` convention (matching `resolve-base-script.test.ts`, `session-history-scripts.test.ts`) rather than introducing a `tests/scripts/` subdirectory.
  - Tests focus on output contract (KEY:value format, sentinel values, error messages) rather than internal implementation.
  - Use `bun:test` with `beforeAll`/`afterAll` for repo setup/teardown.
  - Golden outputs stored as inline expectations in test files (not separate fixture files) since the output format is simple structured text.

  **Patterns to follow:**
  - Existing `tests/resolve-base-script.test.ts` structure and helper patterns
  - bun:test conventions used elsewhere in the repo

  **Test scenarios:**
  - clean-gone:
    - Happy path: discovery returns branch list, delete subcommand returns DELETED lines
    - Edge case: no gone branches returns __NONE__
    - Edge case: delete with nonexistent branch returns ERROR
  - resolve-context:
    - Happy path: feature branch with open PR returns all KEY:value fields
    - Edge case: gh unavailable returns PR_EXISTS:no, PR_URL:none, PR_BASE:none with DEFAULT_BRANCH still resolved
    - Error path: no remotes configured returns ERROR
  - resolve-pr-base:
    - Happy path: base repo matches origin remote, outputs BASE:<sha>
    - Edge case: empty --base-repo falls back to origin/<base>
    - Error path: unreachable base-repo returns ERROR

  **Verification:**
  - `bun test tests/*-script.test.ts` passes
  - Tests validate output contract, not internal implementation
  - Shared test helper is reusable for future script test additions

## System-Wide Impact

- **Interaction graph:** Scripts are invoked by SKILL.md via `bash scripts/<name>` or `bash references/<name>`. No callbacks, middleware, or observers affected. The model reads script output and continues its own decision logic.
- **Error propagation:** Scripts exit 0 with ERROR: prefix in stdout. SKILL.md code blocks check for ERROR: and stop or report accordingly. This matches the existing resolve-base.sh contract.
- **Converter portability:** Scripts in `scripts/` and `references/` directories are copied alongside SKILL.md during target conversion. No converter changes needed -- this is already proven by 9 existing scripted skills.
- **API surface parity:** No API changes. The three skills' user-facing behavior is unchanged.
- **Unchanged invariants:** resolve-base.sh remains unchanged. Standalone and branch paths in ce-review remain unchanged. git-commit-push-pr's decision tree logic (Step 1 conditionals, Step 6 evidence decision) stays in SKILL.md. git-clean-gone-branches Steps 1-2 are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Script behaves differently from inline shell it replaces | Document exact inline behavior before extraction. Run both paths on 3-5 test repos and compare output. Unit 4 golden-output tests catch regressions. |
| macOS bash 3.2 vs Linux bash 5.x incompatibility | Use only bash 3.2+ compatible constructs. Existing scripts already use bash features (arrays, `[[ ]]`, `=~`) but avoid bash 4+ features: associative arrays, `${var,,}` case conversion, `readarray`/`mapfile`, nameref variables. |
| Template variable substitution changes for ce-review PR-path | Script accepts concrete values as arguments. SKILL.md retains the logic to extract values from PR metadata and pass them. Document the mapping explicitly in SKILL.md. |
| Maintenance burden of duplicated base resolution logic | Accepted per AGENTS.md conventions. Both resolve-context.sh and resolve-pr-base.sh are small (<100 lines) and independently testable. |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-script-first-extraction-requirements.md](docs/brainstorms/2026-04-16-script-first-extraction-requirements.md)
- Related code: `plugins/compound-engineering/skills/ce-review/references/resolve-base.sh`
- Related code: `plugins/compound-engineering/skills/git-clean-gone-branches/scripts/clean-gone`
- Related solution: claude-permissions-optimizer 60-75% token reduction precedent
- AGENTS.md: per-skill file isolation, relative path references, script path conventions
