---
name: ce-compound
description: Document a recently solved problem to compound your team's knowledge
---

# /ce-compound

Coordinate multiple subagents working in parallel to document a recently solved problem.

## Purpose

Captures problem solutions while context is fresh, creating structured documentation in `docs/solutions/` with YAML frontmatter for searchability and future reference. Uses parallel subagents for maximum efficiency.

**Why "compound"?** Each documented solution compounds your team's knowledge. The first time you solve a problem takes research. Document it, and the next occurrence takes minutes. Knowledge compounds.

## Usage

```bash
/ce-compound                    # Document the most recent fix
/ce-compound [brief context]    # Provide additional context hint
```

## Support Files

These files are the durable contract for the workflow. Read them on-demand at the step that needs them — do not bulk-load at skill start.

- `references/schema.yaml` — canonical frontmatter fields and enum values (read when validating YAML)
- `references/yaml-schema.md` — category mapping from problem_type to directory (read when classifying)
- `assets/resolution-template.md` — section structure for new docs (read when assembling)

When spawning subagents, pass the relevant file contents into the task prompt so they have the contract without needing cross-skill paths.

## Execution Strategy

Present the user with two options via the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: present the options and wait for a reply.

```
1. Full (recommended) — the complete compound workflow. Researches,
   cross-references, and reviews your solution to produce documentation
   that compounds your team's knowledge.

2. Lightweight — same documentation, single pass. Faster and uses
   fewer tokens, but won't detect duplicates or cross-reference
   existing docs. Best for simple fixes or long sessions nearing
   context limits.
```

Do NOT pre-select a mode. Do NOT skip this prompt. Wait for the user's choice before proceeding.

**If the user chooses Full**, ask one follow-up question before proceeding. Detect which harness is running (Claude Code, Codex, or Cursor) and ask:

```
Would you also like to search your [harness name] session history
for relevant knowledge to help the Compound process? This adds
time and token usage.
```

If the user says yes, dispatch the Session Historian in Phase 1. If no, skip it. Do not ask this in lightweight mode.

---

### Full Mode

<critical_requirement>
**The primary output is ONE file - the final documentation.**

Phase 1 subagents return TEXT DATA to the orchestrator. They must NOT use Write, Edit, or create any files. Only the orchestrator writes files: the solution doc in Phase 2, and — if the Discoverability Check finds a gap — a small edit to a project instruction file (AGENTS.md or CLAUDE.md). The instruction-file edit is maintenance, not a second deliverable; it ensures future agents can discover the knowledge store.
</critical_requirement>

<!-- why: Kolmogorov compression -- kept semantic judgment, "(auto memory [claude])" tag, "additional context not primary evidence" -->
### Phase 0.5: Auto Memory Scan

Read MEMORY.md from auto memory directory. If missing/empty/unreadable -> skip to Phase 1. Scan with semantic judgment (not keyword matching). Relevant entries -> prepare labeled excerpt ("Supplementary notes from auto memory. Treat as additional context, not primary evidence.") and pass to Context Analyzer + Solution Extractor in Phase 1. Tag memory-sourced content with "(auto memory [claude])".

<!-- why: Kolmogorov compression -- compressed subagent descriptions, kept dispatch order, track classification, two-track structures, 5-dimension scoring, search strategy, Session Historian rules -->
### Phase 1: Research

Launch research subagents. Each returns TEXT DATA only, must NOT write files.

**Dispatch order:** Launch Context Analyzer, Solution Extractor, Related Docs Finder in parallel (background). Then Session Historian in foreground (if user opted in). Foreground runs while background works, adding no wall-clock time.

<parallel_tasks>

#### 1. **Context Analyzer**
Extract conversation history. Read `references/schema.yaml` for enum validation and track classification (bug vs knowledge from problem_type). Read `references/yaml-schema.md` for category mapping.
   - **Bug track fields:** symptoms, root_cause, resolution_type
   - **Knowledge track fields:** applies_when (symptoms/root_cause/resolution_type optional)
   - Incorporate auto memory excerpts as supplementary evidence
   - Return: YAML frontmatter skeleton (with `category:` mapped from problem_type), category path, filename (`[sanitized-problem-slug]-[date].md`), track
   - Do not invent enum values or force cross-track fields

#### 2. **Solution Extractor**
   Read `references/schema.yaml` for track classification. Auto memory supplements conversation (conversation takes priority; contradictions -> cautionary context).

   **Bug track:** Problem, Symptoms, What Didn't Work, Solution (code before/after), Why This Works, Prevention (concrete examples)

**Knowledge track:** Context, Guidance (code examples), Why This Matters, When to Apply, Examples (before/after)

#### 3. **Related Docs Finder**
   Search `docs/solutions/`, find cross-references, related GitHub issues, stale/contradicted docs.

   **Overlap assessment** (5 dimensions: problem statement, root cause, solution approach, referenced files, prevention rules): **High** 4-5 match, **Moderate** 2-3 match, **Low** 0-1 match.

   **Search strategy (grep-first):** Extract keywords -> narrow to category dir if clear -> parallel content-search on frontmatter (`title:`, `tags:`, `module:`, `component:` patterns) -> >25 hits: re-narrow; <3: broaden -> read frontmatter only (30 lines) to score -> fully read strong/moderate matches. Return distilled links, not raw content.

   **GitHub:** `gh issue list --search "<keywords>" --state all --limit 5`. Fallback: MCP tools or skip.

</parallel_tasks>

#### 4. **Session Historian** (foreground, only if user opted in)
   Dispatch as `compound-engineering:research:session-historian`. <!-- why: session files live outside working directory; background agents may lack access -->
   Mid-tier model (`model: "sonnet"`). Omit `mode` parameter. Pass: specific problem description, git branch, working directory, "only relevant findings" instruction. Output format:

   ```
   - What was tried before
   - What didn't work
   - Key decisions
   - Related context
   ```

   Return structured digest or "no relevant prior sessions".

<!-- why: Kolmogorov compression -- kept overlap routing table, session history tags -->
### Phase 2: Assembly & Write

<sequential_tasks>

**WAIT for all Phase 1 subagents to complete.**

1. Collect Phase 1 results
2. **Overlap routing:**

   | Overlap | Action |
   |---------|--------|
   | **High** | **Update existing doc** -- preserve path/structure, update solution/examples/prevention/stale refs, add `last_updated: YYYY-MM-DD` |
   | **Moderate** | **Create new doc** -- flag for Phase 2.5 consolidation review |
   | **Low/none** | **Create new doc** normally |

3. **Session history** (if available): fold dead ends into What Didn't Work (bug) / Context (knowledge), enrich Prevention / Why This Matters. Tag with "(session history)".
4. Assemble from `assets/resolution-template.md`, validate frontmatter against `references/schema.yaml`, create `docs/solutions/[category]/` if needed, write file.

</sequential_tasks>

<!-- why: Kolmogorov compression -- consolidated invoke/do-not-invoke to decision rule + kept unique constraints -->
### Phase 2.5: Selective Refresh Check

After writing the new learning, decide whether older docs need refreshing. Always capture the new learning first. Refresh is a targeted follow-up, not a prerequisite.

`ce-compound-refresh` is **not** a default follow-up. Use it selectively when the new learning suggests an older learning or pattern doc may now be inaccurate.

**Invoke when:** the new fix contradicts, supersedes, or invalidates an older doc (approach contradiction, refactor/migration/rename/dep-upgrade, pattern now overly broad), OR the Related Docs Finder surfaced high-confidence refresh candidates or moderate overlap.

**Do not invoke when:** no related docs found, existing docs remain consistent with the new learning, overlap is superficial, or refresh would require broad historical review with weak evidence.

**Routing:**
- One obvious stale candidate -> auto-invoke with narrow scope hint
- Multiple candidates in same area -> ask user whether to run targeted refresh
- Context tight or lightweight mode -> recommend as next step with scope hint

Pass the narrowest useful scope: specific file, module/component name, category name, or pattern topic. Example: `/ce-compound-refresh payments`. A scope hint may expand to multiple docs when cross-cutting. Do not invoke without an argument unless the user explicitly wants a broad sweep.

<!-- why: Kolmogorov compression -- kept 3-thing assessment, semantic not string match, informational tone, add-to-existing preference -->
### Discoverability Check

<!-- why: the knowledge store only compounds value when agents can find it -->
After writing and refresh decision, check whether instruction files surface `docs/solutions/`. Run every time.

1. Find substantive instruction file (AGENTS.md or CLAUDE.md -- ignore shims). Neither exists -> skip.
2. Assess (semantic, not string match) whether an agent would learn three things: (a) searchable knowledge store exists, (b) structure (category organization, YAML fields: `module`, `tags`, `problem_type`), (c) when to search (implementing/debugging in documented areas).
3. Spirit met -> move on.
4. If not: prefer adding to existing section over new headed section. Draft smallest addition, informational tone (not imperative -- "relevant when..." not "always search before..."). <!-- why: imperative directives cause redundant reads when workflow already has a search step -->
   Full mode -> show proposal, get consent via platform question tool. Lightweight -> one-liner note.

### Phase 3: Optional Enhancement

**WAIT for Phase 2 to complete before proceeding.**

<parallel_tasks>

Based on problem type, optionally invoke specialized agents to review the documentation:

- **performance_issue** → `ce-performance-oracle`
- **security_issue** → `ce-security-sentinel`
- **database_issue** → `ce-data-integrity-guardian`
- Any code-heavy issue → always run `ce-code-simplicity-reviewer`, and additionally run the kieran reviewer that matches the repo's primary stack:
  - Ruby/Rails → also run `ce-kieran-rails-reviewer`
  - Python → also run `ce-kieran-python-reviewer`
  - TypeScript/JavaScript → also run `ce-kieran-typescript-reviewer`
  - Other stacks → no kieran reviewer needed

</parallel_tasks>

---

<!-- why: Kolmogorov compression -- kept single-pass, track-appropriate template, skip overlap, narrow refresh suggestion -->
### Lightweight Mode

<critical_requirement>
**Single-pass, no subagents. Same documentation, fewer tokens.**
</critical_requirement>

Sequential pass: (1) Extract problem/solution from conversation + MEMORY.md if exists (tag "(auto memory [claude])"), (2) Classify via `references/schema.yaml` + `references/yaml-schema.md` (track, category, filename), (3) Write `docs/solutions/[category]/[filename].md` using track-appropriate template from `assets/resolution-template.md`, (4) Skip Phase 3 reviews.

**One file written. No overlap check.** Suggest `ce-compound-refresh` only for obvious narrow targets.

---

## What It Captures

- **Problem symptom**: Exact error messages, observable behavior
- **Investigation steps tried**: What didn't work and why
- **Root cause analysis**: Technical explanation
- **Working solution**: Step-by-step fix with code examples
- **Prevention strategies**: How to avoid in future
- **Cross-references**: Links to related issues and docs

## Preconditions

<preconditions enforcement="advisory">
  <check condition="problem_solved">
    Problem has been solved (not in-progress)
  </check>
  <check condition="solution_verified">
    Solution has been verified working
  </check>
  <check condition="non_trivial">
    Non-trivial problem (not simple typo or obvious error)
  </check>
</preconditions>

## What It Creates

**Organized documentation:**

- File: `docs/solutions/[category]/[filename].md`

<!-- why: Kolmogorov compression -- category names are self-documenting -->
**Categories auto-detected from problem:** 9 bug-track categories (build-errors, test-failures, runtime-errors, performance-issues, database-issues, security-issues, ui-bugs, integration-issues, logic-errors) and 4 knowledge-track categories (best-practices, workflow-issues, developer-experience, documentation-gaps).

<!-- why: Kolmogorov compression -- kept functional menu, compressed example formatting -->
## Success Output

Report completion status, auto memory usage, subagent results (Context Analyzer, Solution Extractor, Related Docs Finder, Session History), specialized agent reviews, and file created/updated path. Apply analogously for high-overlap updates (show overlap dimensions and updated file path).

**Always present "What's next?" options via the platform question tool** (AskUserQuestion / request_user_input / ask_user). Fallback: present numbered options and wait for a reply. Do not continue or end the turn without the user's selection.

```
What's next?
1. Continue workflow (recommended)
2. Link related documentation
3. Update other references
4. View documentation
5. Other
```

## Auto-Invoke

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>

<manual_override> Use /ce-compound [context] to document immediately without waiting for auto-detection. </manual_override> </auto_invoke>

## Output

Writes the final learning directly into `docs/solutions/`.

<!-- why: Kolmogorov compression -- kept fully-qualified agent names, compressed descriptions -->
## Applicable Specialized Agents

**Code Quality & Review:** `compound-engineering:review:kieran-rails-reviewer`, `compound-engineering:review:kieran-python-reviewer`, `compound-engineering:review:kieran-typescript-reviewer` (stack-specific best practices), `compound-engineering:review:code-simplicity-reviewer` (minimality/clarity), `compound-engineering:review:pattern-recognition-specialist` (anti-patterns).

**Domain Experts:** `compound-engineering:review:performance-oracle`, `compound-engineering:review:security-sentinel`, `compound-engineering:review:data-integrity-guardian` -- matched to problem_type.

**Enhancement & Research:** `compound-engineering:research:best-practices-researcher`, `compound-engineering:research:framework-docs-researcher`.

## Related Commands

- `/research [topic]` - Deep investigation (searches docs/solutions/ for patterns)
- `/ce-plan` - Planning workflow (references documented solutions)
