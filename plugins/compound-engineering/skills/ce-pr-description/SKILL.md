---
name: ce-pr-description
description: "Write or regenerate a value-first pull-request description (title + body) for the current branch's commits or for a specified PR. Use when the user says 'write a PR description', 'refresh the PR description', 'regenerate the PR body', 'rewrite this PR', 'freshen the PR', 'update the PR description', 'draft a PR body for this diff', 'describe this PR properly', 'generate the PR title', or pastes a GitHub PR URL / #NN / number. Also used internally by ce-commit-push-pr (single-PR flow) and ce-pr-stack (per-layer stack descriptions) so all callers share one writing voice. Input is a natural-language prompt. A PR reference (a full GitHub PR URL, `pr:561`, `#561`, or a bare number alone) picks a specific PR; anything else is treated as optional steering for the default 'describe my current branch' mode. Returns structured {title, body_file} (body written to an OS temp file) for the caller to apply via gh pr edit or gh pr create — this skill never edits the PR itself and never prompts for confirmation."
argument-hint: "[PR ref e.g. pr:561 | #561 | URL] [free-text steering]"
---

# CE PR Description

Generate a conventional-commit-style title and a value-first body describing a pull request's work. Return structured `{title, body}` for the caller to apply. Never invoke `gh pr edit` or `gh pr create`, and never prompt for interactive confirmation.

## When to Use

Activate when the user:
- Says "write a PR description", "refresh the PR description", "regenerate the PR body", "rewrite this PR", "freshen the PR", "update the PR description", "draft a PR body for this diff", "describe this PR properly", or "generate the PR title"
- Pastes a GitHub PR URL, `#NN`, or PR number and wants a description written or rewritten
- Wants a value-first PR title and body without interactive confirmation or apply steps
- Internal invocation by `git-commit-push-pr` or `ce-pr-stack` for description generation

---

## Inputs

Parse the free-form input into two parts:

- **PR reference (if present).** Any of: a full GitHub PR URL (`https://github.com/owner/repo/pull/NN`), `pr:<number>` or `pr:<URL>`, a bare hashmark form (`#NN`), or a bare number (`561`). Extract the PR reference; treat the remainder as steering text.
- **Steering text** — a focus hint like "emphasize the benchmarks" or "do a good job with the perf story". May combine with a PR reference or stand alone.

Read the argument as natural language. If no PR reference is present, default to describing the current branch.

### Mode selection

| What the caller passes | Mode |
|---|---|
| No PR reference (empty argument or steering text only) | **Current-branch mode** — describe the commits on HEAD vs the repo's default base |
| A PR reference (URL, `pr:`, `#NN`, or bare number) | **PR mode** — describe the specified PR |

Steering text is optional. If present, incorporate alongside the diff-derived narrative; do not override value-first principles or fabricate content unsupported by the diff.

**Optional `base:<ref>` override (current-branch mode only).** Pins the base branch explicitly. The ref must resolve locally. Overrides auto-detection for current-branch mode; PR mode ignores it. <!-- why: PRs already define their own base via baseRefName -->

**Examples**:

- `ce-pr-description` → current-branch, no focus, auto-detect base
- `ce-pr-description emphasize the benchmarks` → current-branch, focus = "emphasize the benchmarks"
- `ce-pr-description base:origin/develop` → current-branch, base pinned to `origin/develop`
- `ce-pr-description base:origin/develop emphasize perf` → same + focus
- `ce-pr-description pr:561` → PR #561, no focus
- `ce-pr-description #561 do a good job with the perf story` → PR #561, focus = "do a good job with the perf story"
- `ce-pr-description https://github.com/foo/bar/pull/561 emphasize safety` → PR #561 in foo/bar, focus = "emphasize safety"

## Output

Return two fields:

- **`title`** -- conventional-commit format: `type: description` or `type(scope): description`. Under 72 characters. Choose `type` based on intent (feat/fix/refactor/docs/chore/perf/test), not file type. Pick the narrowest useful `scope` (skill or agent name, CLI area, or shared label); omit when no single label adds clarity.
- **`body_file`** -- absolute path to an OS temp file (created via `mktemp`) containing the body markdown that follows the writing principles below. Do not emit the body inline in the return.

---

## Constraints

- No interactive confirmation prompts. If the diff is ambiguous, surface the ambiguity in the returned output — do not prompt the user directly.
- No branch checkout. Describe HEAD (current-branch mode) or the specified PR (PR mode). Never check out a different branch.
- No compare-and-confirm narrative. Describe the end state only.
- No auto-apply via `gh pr edit` or `gh pr create`. Return the output and stop.

---

## Step 1: Resolve the diff and commit list

Parse the input and branch on mode.

### Current-branch mode (default when no PR reference was given)

Determine the base in priority order:

1. **Caller-supplied `base:<ref>`** — use verbatim. Must resolve locally.
2. **Existing PR's `baseRefName`** — if the current branch has an open PR, use that PR's base. <!-- why: handles feature branches targeting non-default bases like develop -->
3. **Repo default (`origin/HEAD`)** — fallback for branches with no PR and no caller-supplied base.

```bash
# Detect current branch (fail if detached HEAD)
CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ]; then
  echo "Detached HEAD — current-branch mode requires a branch. Pass a PR reference instead."
  exit 1
fi

# Priority: caller-supplied base: > existing PR's baseRefName > origin/HEAD > origin/main
if [ -n "$CALLER_BASE" ]; then
  BASE_REF="$CALLER_BASE"
elif EXISTING_PR_BASE=$(gh pr view --json baseRefName --jq '.baseRefName'); then
  BASE_REF="origin/$EXISTING_PR_BASE"
elif DEFAULT_HEAD=$(git rev-parse --abbrev-ref origin/HEAD); then
  BASE_REF="$DEFAULT_HEAD"
else
  BASE_REF="origin/main"
fi
```

If `$BASE_REF` does not resolve locally (`git rev-parse --verify "$BASE_REF"` fails), exit with `"Base ref $BASE_REF does not resolve locally. Fetch it before invoking the skill."` — do not attempt recovery.

Gather merge base, commit list, and full diff:

```bash
MERGE_BASE=$(git merge-base "$BASE_REF" HEAD) && echo "MERGE_BASE=$MERGE_BASE" && echo '=== COMMITS ===' && git log --oneline $MERGE_BASE..HEAD && echo '=== DIFF ===' && git diff $MERGE_BASE...HEAD
```

If the commit list is empty, report `"No commits between $BASE_REF and HEAD"` and exit.

If an existing PR was found in step 1, also capture its body for evidence preservation in Step 3.

### PR mode (when the input contained a PR reference)

Normalize the reference into a form `gh pr view` accepts: a bare number (`561`), a full URL (`https://github.com/owner/repo/pull/561`), or the number extracted from `pr:561` or `#561`. <!-- why: gh pr view does not accept owner/repo#NN shorthand; full URLs are the simplest cross-repo path -->

```bash
gh pr view <pr-ref> --json number,state,title,body,baseRefName,baseRefOid,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,commits,url
```

Use `headRefOid` for the PR head SHA (not `commits` array indexing), `baseRefOid` for the base SHA, `headRepository` + `headRepositoryOwner` for the source repo. <!-- why: no baseRepository field exists; the base repo is the one queried by gh pr view itself -->

If `state` is not `OPEN`, report `"PR <number> is <state> (not open); cannot regenerate description"` and exit without output.

**Route by repo match:** Parse the URL's `<owner>/<repo>` and compare against `git remote get-url origin` (strip `.git`; handle both SSH and HTTPS forms). Match → Case A (local git). No match → Case B (API only). Bare numbers and `#NN` → Case A.

**Case A → Case B fallback:** If Case A's fetch or `git merge-base` fails (shallow clone, missing base branch, auth issues), fall back to Case B. Note the fallback in the output.

**Case A — PR is in the current repo:**

Read `headRefOid` from the JSON response. Fetch the base ref and head SHA in one call:

```bash
PR_HEAD_SHA=<headRefOid from JSON>
git fetch --no-tags origin <baseRefName> $PR_HEAD_SHA
```

<!-- why: explicit $PR_HEAD_SHA avoids FETCH_HEAD multi-ref ordering bug (git rev-parse FETCH_HEAD returns only the first fetched ref's SHA) -->

```bash
MERGE_BASE=$(git merge-base origin/<baseRefName> $PR_HEAD_SHA) && echo "MERGE_BASE=$MERGE_BASE" && echo '=== COMMITS ===' && git log --oneline $MERGE_BASE..$PR_HEAD_SHA && echo '=== DIFF ===' && git diff $MERGE_BASE...$PR_HEAD_SHA
```

If the explicit-SHA fetch is rejected (rare on GitHub, possible on some GHES configurations that disallow fetching non-tip SHAs), fall back to fetching `refs/pull/<number>/head` and reading the PR head SHA from `.git/FETCH_HEAD` by pull-ref pattern:

```bash
git fetch --no-tags origin "refs/pull/<number>/head"
PR_HEAD_SHA=$(awk '/refs\/pull\/[0-9]+\/head/ {print $1; exit}' "$(git rev-parse --git-dir)/FETCH_HEAD")
```

**Case B — PR is in a different repo:**

Read the diff and commit list from the API (no local git):

```bash
gh pr diff <pr-ref>
gh pr view <pr-ref> --json commits --jq '.commits[] | [.oid[0:7], .messageHeadline] | @tsv'
```

Note in the output that the API fallback was used.

Capture the existing PR body for evidence preservation in Step 3 (both cases).

---

## Step 2: Classify commits before writing

Classify each commit:

- **Feature commits** -- new functionality, intentional refactors, design changes. Drive the description.
- **Fix-up commits** -- code review fixes, lint fixes, test fixes, rebase resolutions, style cleanups. Invisible to the reader.

Subtract fix-up commits when sizing: a branch with 12 commits but 9 fix-ups is a 3-commit PR.

---

## Step 3: Decide on evidence

Assess whether evidence capture applies, based on the full branch diff.

**Evidence is possible** when the diff changes observable behavior: UI, CLI output, API behavior with runnable code, generated artifacts, or workflow output.

**Evidence is not possible** for:
- Docs-only, markdown-only, changelog-only, release metadata, CI/config-only, test-only, or pure internal refactors
- Behavior requiring unavailable credentials, paid/cloud services, bot tokens, deploy-only infrastructure, or hardware not provided

Never prompt the user to capture evidence. Decision logic:

1. **PR mode with existing `## Demo` or `## Screenshots` section containing image embeds:** preserve verbatim unless steering text asks to refresh or remove it. Include in the returned body.
2. **All other cases:** omit the evidence section. The caller owns evidence capture (`ce-demo-reel` or regeneration with updated steering).

Do not label test output as "Demo" or "Screenshots". Place any preserved evidence block before the Compound Engineering badge.

---

## Step 4: Frame the narrative before sizing

Articulate the narrative frame:

1. **Before**: What was broken, limited, or impossible? (One sentence.)
2. **After**: What's now possible or improved? (One sentence.)
3. **Scope rationale** (only if 2+ separable-looking concerns): Why do these ship together? (One sentence.)

For small+simple PRs, the "after" sentence alone may be the entire description.

---

## Step 5: Size the change

Assess size (files, diff volume) and complexity (design decisions, trade-offs, cross-cutting concerns) to select description depth:

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bugfix, behavioral change) | Short narrative, ~3-5 sentences. No headers unless two distinct concerns. |
| Medium feature or refactor | Narrative frame (before/after/scope), then what changed and why. Call out design decisions. |
| Large or architecturally significant | Narrative frame + up to 3-5 design-decision callouts + 1-2 sentence test summary + key docs links. Target ~100 lines, cap ~150. For PRs with many mechanisms, use a Summary-level table to list them; do NOT create an H3 subsection per mechanism. Reviewers scrutinize decisions, not inventories — the diff and spec files carry the detail. If you find yourself writing 10+ subsections, consolidate to a table. |
| Performance improvement | Include before/after measurements if available. Markdown table works well. |

Default shorter. Match description weight to change weight.

---

## Step 6: Apply writing principles

### Writing voice

Follow repo style preferences if documented. Otherwise:

- Active voice. No em dashes or `--` substitutes; use periods, commas, colons, or parentheses.
- Vary sentence length. Never three similar-length sentences in a row.
- Do not make a claim and immediately explain it. Trust the reader.
- Plain English. Technical jargon fine; business jargon never.
- No filler: "it's worth noting", "importantly", "essentially", "in order to", "leverage", "utilize."
- Digits for numbers ("3 files"), not words ("three files").

### Writing principles

- **Lead with value**: Open with the outcome ("Evidence capture now works for CLI tools and libraries, not just web apps"), not the mechanism ("Replace the hardcoded capture block with a tiered skill").
- **No orphaned opening paragraphs**: If the description uses `##` headings anywhere, the opening must also be under a heading (e.g., `## Summary`). For short descriptions with no sections, a bare paragraph is fine.
- **Describe the net result, not the journey**: No iteration history, debugging steps, intermediate failures, or bugs found and fixed during development. When regenerating for an existing PR, rewrite from the current state. Exception: process details critical to understand a design choice.
- **When commits conflict, trust the final diff**: If commits describe intermediate steps later revised or reverted, describe the end state from the full branch diff.
- **Explain the non-obvious**: Spend space on what the diff doesn't show: why this approach, what was rejected, what the reviewer should watch.
- **Use structure when it earns its keep**: No mandatory template sections.
- **Markdown tables for data**: Before/after comparisons, performance numbers, or option trade-offs communicate well as tables.
- **No empty sections**: Omit inapplicable sections entirely.
- **Test plan — only when non-obvious**: Include when testing requires edge cases the reviewer wouldn't think of, hard-to-verify behavior, or specific setup. Omit when "run the tests" is the only useful guidance. When the branch adds test files, name them with what they cover.
- **No Commits section**: GitHub already shows the commit list in its own tab. A Commits section in the PR body duplicates that without adding context. Omit unless the commits need annotations explaining their ordering or shipping rationale.
- **No Review / process section**: Do not include a section describing how the reviewer should review (checklists of things to look at, process bullets). Process doesn't help the reviewer evaluate code. Call out specific non-obvious things to scrutinize inline with the change that warrants it.

### Visual communication

Include a visual aid only when a reviewer would struggle to reconstruct the mental model from prose alone.

- **Mermaid diagram** for **topology** — directed relationships (calls, flows, dependencies, state transitions, data paths).
- **Markdown table** for **parallel variation** — N things sharing the same attributes with differing values.

Architecture changes are topology — use Mermaid, not tables.

**When to include:**

| PR changes... | Visual aid |
|---|---|
| Architecture touching 3+ interacting components with directed relationships | **Mermaid** component or interaction diagram |
| Multi-step workflow or data flow with non-obvious sequencing | **Mermaid** flow diagram |
| State machine with 3+ states and non-trivial transitions | **Mermaid** state diagram |
| Data model changes with 3+ related entities | **Mermaid** ERD |
| Before/after performance or behavioral measurements | **Markdown table** |
| Option or flag trade-offs | **Markdown table** |
| Feature matrix / compatibility grid | **Markdown table** |

**When to skip any visual:**
- Sizing routes to "1-2 sentences"
- Prose already communicates clearly
- The diagram would just restate the diff visually
- Mechanical changes (renames, dep bumps, config, formatting)

**Format details:**
- **Mermaid** (default for topology). 5-10 nodes typical, up to 15 for complex changes. Use `TB` direction. Keep source readable as fallback.
- **ASCII diagrams** for annotated flows needing rich in-box content. 80-column max.
- **Markdown tables** for parallel-variation data only.
- Place inline at point of relevance, not in a separate section.
- Prose is authoritative when it conflicts with a visual.

Verify generated diagrams against the change before including.

### Numbering and references

Never prefix list items with `#` in PR descriptions — GitHub interprets `#1`, `#2` as issue references and auto-links them.

When referencing actual GitHub issues or PRs, use `org/repo#123` or the full URL. Never use bare `#123` unless verified.

### Applying the focus hint

If a focus hint was provided, incorporate alongside the diff-derived narrative. Do not invent content the diff does not support, and do not suppress diff-demanded content because focus omitted it. When focus and diff materially disagree, note the conflict in the output rather than fabricating content.

---

## Step 7: Compose the title

Title format: `type: description` or `type(scope): description`.

- **Type** by intent, not file extension: `feat`/`fix`/`refactor`/`docs`/`chore`/`perf`/`test`.
- **Scope** (optional): narrowest useful label (skill/agent name, CLI area, shared area). Omit when no single label adds clarity.
- **Description**: imperative, lowercase, under 72 characters total. No trailing period.
- Match repo commit-title conventions visible in recent commits.

Breaking changes use `!` (e.g., `feat!: ...`) or document in the body with a `BREAKING CHANGE:` footer.

---

## Step 8: Compose the body

Assemble the body in this order:

1. **Opening** -- the narrative frame from Step 4, at the depth chosen in Step 5. Under a heading (e.g., `## Summary`) if the description uses any `##` headings elsewhere; a bare paragraph otherwise.
2. **Body sections** -- only the sections that earn their keep for this change: what changed and why, design decisions, tables for data, visual aids when complexity warrants. Skip empty sections entirely.
3. **Test plan** -- only when non-obvious per the writing principles. Omit otherwise.
4. **Evidence block** -- only the preserved block from Step 3, if one exists.
5. **Compound Engineering badge** -- append a badge footer separated by a `---` rule. Skip if the existing body already contains the badge.

**Badge:**

```markdown
---

[![Compound Engineering](https://img.shields.io/badge/Built_with-Compound_Engineering-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
![HARNESS](https://img.shields.io/badge/MODEL_SLUG-COLOR?logo=LOGO&logoColor=white)
```

**Harness lookup:**

| Harness | `LOGO` | `COLOR` |
|---------|--------|---------|
| Claude Code | `claude` | `D97757` |
| Codex | (omit logo param) | `000000` |
| Gemini CLI | `googlegemini` | `4285F4` |

**Model slug:** Replace spaces with underscores. Append context window and thinking level in parentheses if known. Examples: `Opus_4.6_(1M,_Extended_Thinking)`, `Sonnet_4.6_(200K)`, `Gemini_3.1_Pro`.

---

## Step 8b: Compression pass

Return the composed title and body. Do not call `gh pr edit`, `gh pr create`, or any other mutating command. Do not prompt for confirmation.

Format as a labeled block:

```
=== TITLE ===
<title line>

=== BODY_FILE ===
<absolute path to the mktemp body file>
```

If Step 1 exited (closed/merged PR, invalid range, empty commit list), return only the reason string.

---

## Cross-platform notes

Never invoke a platform question tool. Surface any ambiguity (focus/diff conflicts, evidence decisions) in the returned output.
