---
name: ce:compound
description: Document a recently solved problem to compound your team's knowledge
---

# /compound

Coordinate parallel subagents to document a recently solved problem.

## Purpose

Capture problem solutions while context is fresh. Create structured documentation in `docs/solutions/` with YAML frontmatter for searchability. Use parallel subagents for efficiency.

## Usage

```bash
/ce:compound                    # Document the most recent fix
/ce:compound [brief context]    # Provide additional context hint
```

## Support Files

Read on-demand at the step that needs them — do not bulk-load at skill start.

- `references/schema.yaml` — canonical frontmatter fields and enum values (read when validating YAML)
- `references/yaml-schema.md` — category mapping from problem_type to directory (read when classifying)
- `assets/resolution-template.md` — section structure for new docs (read when assembling)

When spawning subagents, pass the relevant file contents into the task prompt.

## Execution Strategy

Present the user with two options before proceeding via the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the options and wait for the user's reply.

```
1. Full (recommended) — researches, cross-references, and reviews
   the solution before producing documentation.

2. Lightweight — same documentation, single pass. Faster, fewer
   tokens. No duplicate detection or cross-referencing.
```

Do NOT pre-select a mode. Do NOT skip this prompt. Wait for the user's choice before proceeding.

**If the user chooses Full**, detect which harness is running (Claude Code, Codex, or Cursor) and ask:

```
Would you also like to search your [harness name] session history
for relevant knowledge? This adds time and token usage.
```

If the user says yes, dispatch the Session Historian in Phase 1. If no, skip it. Do not ask this in lightweight mode.

---

### Full Mode

<critical_requirement>
**The primary output is ONE file - the final documentation.**

Phase 1 subagents return TEXT DATA to the orchestrator. They must NOT use Write, Edit, or create any files. Only the orchestrator writes files: the solution doc in Phase 2, and — if the Discoverability Check finds a gap — a small edit to a project instruction file (AGENTS.md or CLAUDE.md).
</critical_requirement>

### Phase 0.5: Auto Memory Scan

Check the auto memory directory for notes relevant to the problem being documented.

1. Read MEMORY.md from the auto memory directory (path from system prompt context)
2. If the directory or MEMORY.md does not exist, is empty, or is unreadable, skip to Phase 1
3. Scan entries for relevance -- use semantic judgment, not keyword matching
4. If relevant entries found, prepare a labeled excerpt block:

```
## Supplementary notes from auto memory
Treat as additional context, not primary evidence. Conversation history
and codebase findings take priority over these notes.

[relevant entries here]
```

5. Pass this block as additional context to the Context Analyzer and Solution Extractor task prompts in Phase 1. Tag any memory-sourced content in the final doc with "(auto memory [claude])".

If no relevant entries found, proceed to Phase 1 without memory context.

### Phase 1: Research

Launch research subagents. Each returns text data to the orchestrator.

**Dispatch order:**
- Launch `Context Analyzer`, `Solution Extractor`, and `Related Docs Finder` in parallel (background)
- Then dispatch `session-historian` in foreground
- The foreground dispatch runs while the background agents work, adding no wall-clock time

<parallel_tasks>

#### 1. **Context Analyzer**
   - Extract conversation history
   - Read `references/schema.yaml` for enum validation and **track classification**
   - Determine the track (bug or knowledge) from the problem_type
   - Identify problem type, component, and track-appropriate fields:
     - **Bug track**: symptoms, root_cause, resolution_type
     - **Knowledge track**: applies_when (symptoms/root_cause/resolution_type optional)
   - Incorporate auto memory excerpts (if provided) as supplementary evidence
   - Read `references/yaml-schema.md` for category mapping into `docs/solutions/`
   - Suggest a filename using the pattern `[sanitized-problem-slug]-[date].md`
   - Return: YAML frontmatter skeleton (must include `category:` field mapped from problem_type), category directory path, suggested filename, and which track applies
   - Do not invent enum values, categories, or frontmatter fields from memory; read the schema and mapping files
   - Do not force bug-track fields onto knowledge-track learnings or vice versa

#### 2. **Solution Extractor**
   - Read `references/schema.yaml` for track classification (bug vs knowledge)
   - Adapt output structure based on the problem_type track
   - Incorporate auto memory excerpts (if provided) as supplementary evidence -- conversation history and the verified fix take priority; if memory notes contradict the conversation, note the contradiction as cautionary context

   **Bug track output sections:**

   - **Problem**: 1-2 sentence description of the issue
   - **Symptoms**: Observable symptoms (error messages, behavior)
   - **What Didn't Work**: Failed investigation attempts and why they failed
   - **Solution**: The actual fix with code examples (before/after when applicable)
   - **Why This Works**: Root cause explanation and why the solution addresses it
   - **Prevention**: Strategies to avoid recurrence, best practices, and test cases with concrete code examples (e.g., gem configurations, test assertions, linting rules)

   **Knowledge track output sections:**

   - **Context**: What situation, gap, or friction prompted this guidance
   - **Guidance**: The practice, pattern, or recommendation with code examples when useful
   - **Why This Matters**: Rationale and impact of following or not following this guidance
   - **When to Apply**: Conditions or situations where this applies
   - **Examples**: Concrete before/after or usage examples showing the practice in action

#### 3. **Related Docs Finder**
   - Search `docs/solutions/` for related documentation
   - Identify cross-references and links
   - Find related GitHub issues
   - Flag any related learning or pattern docs that may now be stale, contradicted, or overly broad
   - **Assess overlap** with the new doc across five dimensions: problem statement, root cause, solution approach, referenced files, and prevention rules. Score as:
     - **High**: 4-5 dimensions match — essentially the same problem solved again
     - **Moderate**: 2-3 dimensions match — same area but different angle or solution
     - **Low**: 0-1 dimensions match — related but distinct
   - Return: links, relationships, refresh candidates, and overlap assessment (score + which dimensions matched)

   **Search strategy (grep-first filtering):**

   1. Extract keywords from the problem context: module names, technical terms, error messages, component types
   2. If the problem category is clear, narrow search to the matching `docs/solutions/<category>/` directory
   3. Use the native content-search tool (e.g., Grep in Claude Code) to pre-filter candidate files BEFORE reading content. Run multiple searches in parallel, case-insensitive, targeting frontmatter fields. Template patterns -- substitute actual keywords:
      - `title:.*<keyword>`
      - `tags:.*(<keyword1>|<keyword2>)`
      - `module:.*<module name>`
      - `component:.*<component>`
   4. If >25 candidates, re-run with more specific patterns. If <3, broaden to full content search
   5. Read only frontmatter (first 30 lines) of candidate files to score relevance
   6. Fully read only strong/moderate matches
   7. Return distilled links and relationships, not raw file contents

   **GitHub issue search:**

   Use `gh issue list --search "<keywords>" --state all --limit 5`. If `gh` is unavailable, fall back to GitHub MCP tools if available. If neither is available, skip and note it was skipped.

</parallel_tasks>

#### 4. **Session Historian** (foreground, after launching the above — only if the user opted in)
   - **Skip entirely** if the user declined session history
   - Dispatch as `compound-engineering:research:session-historian`
   <!-- why: session files live outside the working directory (~/.claude/projects/, ~/.codex/sessions/, ~/.cursor/projects/); background agents may lack access -->
   - Dispatch in **foreground**
   - Search prior Claude Code, Codex, and Cursor sessions for the same project to find related investigation context
   - Correlate sessions by repo name across all platforms (main checkouts, worktrees, and Conductor workspaces)
   - In the dispatch prompt, pass:
     - A specific description of the problem being documented — the concrete issue (error messages, module names, what broke and how it was fixed)
     - The current git branch and working directory
     - The instruction: "Only surface findings from prior sessions that are directly relevant to this specific problem. Ignore unrelated work from the same sessions or branches."
     - The output format:

       ```
       Structure your response with these sections (omit any with no findings):
       - What was tried before: prior approaches to this specific problem
       - What didn't work: failed attempts at this problem from prior sessions
       - Key decisions: choices made about this problem and their rationale
       - Related context: anything else from prior sessions that directly informs this problem's documentation
       ```
   - Omit the `mode` parameter so the user's configured permission settings apply
   <!-- why: synthesis feeds into compound assembly and does not need frontier reasoning -->
   - Dispatch on the mid-tier model (e.g., `model: "sonnet"` in Claude Code)
   - Return: structured digest of findings from prior sessions, or "no relevant prior sessions" if none found

### Phase 2: Assembly & Write

<sequential_tasks>

**WAIT for all Phase 1 subagents to complete before proceeding.**

The orchestrator (main conversation) performs these steps:

1. Collect all text results from Phase 1 subagents
2. **Check the overlap assessment** from the Related Docs Finder before deciding what to write:

   | Overlap | Action |
   |---------|--------|
   | **High** — existing doc covers the same problem, root cause, and solution | **Update the existing doc** with fresher context (new code examples, updated references, additional prevention tips) rather than creating a duplicate. The existing doc's path and structure stay the same. |
   | **Moderate** — same problem area but different angle, root cause, or solution | **Create the new doc** normally. Flag the overlap for Phase 2.5 to recommend consolidation review. |
   | **Low or none** | **Create the new doc** normally. |

   <!-- why: two docs describing the same problem and solution will inevitably drift apart; folding into the existing doc prevents immediate consolidation debt -->
   When updating an existing doc, preserve its file path and frontmatter structure. Update the solution, code examples, prevention tips, and any stale references. Add a `last_updated: YYYY-MM-DD` field to the frontmatter. Do not change the title unless the problem framing has materially shifted.

3. **Incorporate session history findings** (if available):
   - Fold investigation dead ends and failed approaches into **What Didn't Work** (bug track) or **Context** (knowledge track)
   - Use cross-session patterns to enrich **Prevention** or **Why This Matters** sections
   - Tag session-sourced content with "(session history)"
   - If findings are thin or "no relevant prior sessions," proceed without session context
4. Assemble complete markdown file from collected pieces, reading `assets/resolution-template.md` for section structure
5. Validate YAML frontmatter against `references/schema.yaml`
6. Create directory if needed: `mkdir -p docs/solutions/[category]/`
7. Write the file: the updated existing doc or the new `docs/solutions/[category]/[filename].md`

Preserve section order from `assets/resolution-template.md` unless the user requests a different structure.

</sequential_tasks>

### Phase 2.5: Selective Refresh Check

After writing the new learning, decide whether older docs need refreshing.

`ce:compound-refresh` is **not** a default follow-up. Invoke only when the new learning suggests an older doc may now be inaccurate.

Invoke `ce:compound-refresh` when one or more of these are true:

1. A related learning or pattern doc recommends an approach that the new fix now contradicts
2. The new fix clearly supersedes an older documented solution
3. The current work involved a refactor, migration, rename, or dependency upgrade that likely invalidated references in older docs
4. A pattern doc now looks overly broad, outdated, or no longer supported by the refreshed reality
5. The Related Docs Finder surfaced high-confidence refresh candidates in the same problem space
6. The Related Docs Finder reported **moderate overlap** with an existing doc

Do **not** invoke `ce:compound-refresh` when:

1. No related docs were found
2. Related docs still appear consistent with the new learning
3. The overlap is superficial and does not change prior guidance
4. Refresh would require a broad historical review with weak evidence

Rules:

- If there is **one obvious stale candidate**, invoke `ce:compound-refresh` with a narrow scope hint after the new learning is written
- If there are **multiple candidates in the same area**, ask the user whether to run a targeted refresh for that module, category, or pattern set
- If context is tight or in lightweight mode, do not expand into a broad refresh; recommend `ce:compound-refresh` as the next step with a scope hint

When invoking or recommending `ce:compound-refresh`, pass the narrowest useful scope:

- **Specific file** when one learning or pattern doc is the likely stale artifact
- **Module or component name** when several related docs may need review
- **Category name** when the drift is concentrated in one solutions area
- **Pattern filename or pattern topic** when the stale guidance lives in `docs/solutions/patterns/`

Examples:

- `/ce:compound-refresh plugin-versioning-requirements`
- `/ce:compound-refresh payments`
- `/ce:compound-refresh performance-issues`
- `/ce:compound-refresh critical-patterns`

A single scope hint may expand to multiple related docs when the change is cross-cutting within one domain, category, or pattern area.

Do not invoke `ce:compound-refresh` without an argument unless the user explicitly wants a broad sweep.

Always capture the new learning first. Refresh is a targeted follow-up, not a prerequisite.

### Discoverability Check

<!-- why: the knowledge store only compounds value when agents can find it -->
After the learning is written and the refresh decision is made, check whether the project's instruction files would lead an agent to discover and search `docs/solutions/`. Run every time.

1. Identify which root-level instruction files exist (AGENTS.md, CLAUDE.md, or both). Determine which holds substantive content — one may be a shim that `@`-includes the other. The substantive file is the assessment and edit target; ignore shims. If neither file exists, skip this check.
2. Assess whether an agent reading the instruction files would learn three things:
   - That a searchable knowledge store of documented solutions exists
   - Enough about its structure to search effectively (category organization, YAML frontmatter fields like `module`, `tags`, `problem_type`)
   - When to search it (before implementing, debugging, or deciding in documented areas)

   This is a semantic assessment, not a string match. If an agent would reasonably discover and use the knowledge store after reading the file, the check passes.

3. If the spirit is already met, no action needed — move on.
4. If not:
   a. Identify where a mention fits naturally. Prefer adding a line to an existing section (architecture tree, directory listing, documentation section, conventions block) over a new headed section. Add a new section only as a last resort.
   b. Draft the smallest addition that communicates the three things. Match the file's existing style and density.

      <!-- why: imperative directives like "always search before implementing" cause redundant reads when a workflow already includes a dedicated search step -->
      Keep the tone informational, not imperative. Express timing as description ("relevant when implementing or debugging in documented areas"), not instruction.

      Examples (adapt to the file):

      When there's an existing directory listing or architecture section — add a line:
      ```
      docs/solutions/  # documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (module, tags, problem_type)
      ```

      When nothing in the file is a natural fit — a small headed section is appropriate:
      ```
      ## Documented Solutions

      `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
      ```
   c. In full mode, show the proposed change and where it would go, then use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini) to get consent before editing. If no question tool is available, present the proposal and wait for the user's reply. In lightweight mode, output a one-liner note and move on

### Phase 3: Optional Enhancement

**WAIT for Phase 2 to complete before proceeding.**

<parallel_tasks>

Optional: invoke specialized agents to review the documentation based on problem type:

- **performance_issue** → `compound-engineering:review:performance-oracle`
- **security_issue** → `compound-engineering:review:security-sentinel`
- **database_issue** → `compound-engineering:review:data-integrity-guardian`
- Any code-heavy issue → always run `compound-engineering:review:code-simplicity-reviewer`, and additionally run the kieran reviewer that matches the repo's primary stack:
  - Ruby/Rails → also run `compound-engineering:review:kieran-rails-reviewer`
  - Python → also run `compound-engineering:review:kieran-python-reviewer`
  - TypeScript/JavaScript → also run `compound-engineering:review:kieran-typescript-reviewer`
  - Other stacks → no kieran reviewer needed

</parallel_tasks>

---

### Lightweight Mode

<critical_requirement>
**Single-pass alternative — same documentation, fewer tokens.**

Skip parallel subagents. The orchestrator performs all work in a single pass without cross-referencing or duplicate detection.
</critical_requirement>

The orchestrator performs ALL of the following in one sequential pass:

1. **Extract from conversation**: Identify the problem and solution from conversation history. Read MEMORY.md from the auto memory directory if it exists -- use relevant notes as supplementary context. Tag any memory-sourced content with "(auto memory [claude])"
2. **Classify**: Read `references/schema.yaml` and `references/yaml-schema.md`, then determine track (bug vs knowledge), category, and filename
3. **Write minimal doc**: Create `docs/solutions/[category]/[filename].md` using the appropriate track template from `assets/resolution-template.md`, with:
   - YAML frontmatter with track-appropriate fields
   - Bug track: Problem, root cause, solution with key code snippets, one prevention tip
   - Knowledge track: Context, guidance with key examples, one applicability note
4. **Skip specialized agent reviews** (Phase 3) to conserve context

**Lightweight output:**
```
✓ Documentation complete (lightweight mode)

File created:
- docs/solutions/[category]/[filename].md

[If discoverability check found instruction files don't surface the knowledge store:]
Tip: Your AGENTS.md/CLAUDE.md doesn't surface docs/solutions/ to agents —
a brief mention helps all agents discover these learnings.

Note: This was created in lightweight mode. For richer documentation
(cross-references, detailed prevention strategies, specialized reviews),
re-run /compound in a fresh session.
```

**No subagents are launched. No parallel tasks. One file written.**

In lightweight mode, the overlap check is skipped. Only suggest `ce:compound-refresh` if there is an obvious narrow refresh target. Do not broaden into a large refresh sweep from a lightweight session.

---

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

**Categories auto-detected from problem:**

Bug track:
- build-errors/
- test-failures/
- runtime-errors/
- performance-issues/
- database-issues/
- security-issues/
- ui-bugs/
- integration-issues/
- logic-errors/

Knowledge track:
- best-practices/
- workflow-issues/
- developer-experience/
- documentation-gaps/

## Success Output

```
✓ Documentation complete

Auto memory: 2 relevant entries used as supplementary evidence

Subagent Results:
  ✓ Context Analyzer: Identified performance_issue in brief_system, category: performance-issues/
  ✓ Solution Extractor: 3 code fixes, prevention strategies
  ✓ Related Docs Finder: 2 related issues
  ✓ Session History: 3 prior sessions on same branch, 2 failed approaches surfaced

Specialized Agent Reviews (Auto-Triggered):
  ✓ performance-oracle: Validated query optimization approach
  ✓ kieran-rails-reviewer: Code examples meet Rails conventions
  ✓ code-simplicity-reviewer: Solution is appropriately minimal

File created:
- docs/solutions/performance-issues/n-plus-one-brief-generation.md

What's next?
1. Continue workflow (recommended)
2. Link related documentation
3. Update other references
4. View documentation
5. Other
```

**Present the "What's next?" options via the platform's blocking question tool** (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the numbered options and wait for the user's reply. Do not continue or end the turn without the user's selection.

**Alternate output (when updating an existing doc due to high overlap):**

```
✓ Documentation updated (existing doc refreshed with current context)

Overlap detected: docs/solutions/performance-issues/n-plus-one-queries.md
  Matched dimensions: problem statement, root cause, solution, referenced files
  Action: Updated existing doc with fresher code examples and prevention tips

File updated:
- docs/solutions/performance-issues/n-plus-one-queries.md (added last_updated: 2026-03-24)
```

## Auto-Invoke

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>

<manual_override> Use /ce:compound [context] to document immediately without waiting for auto-detection. </manual_override> </auto_invoke>

## Output

Write the final learning to `docs/solutions/`.

## Applicable Specialized Agents

### Code Quality & Review
- **compound-engineering:review:kieran-rails-reviewer**: Rails best practices
- **compound-engineering:review:kieran-python-reviewer**: Python best practices
- **compound-engineering:review:kieran-typescript-reviewer**: TypeScript best practices
- **compound-engineering:review:code-simplicity-reviewer**: Solution code minimality and clarity
- **compound-engineering:review:pattern-recognition-specialist**: Anti-patterns or repeating issues

### Specific Domain Experts
- **compound-engineering:review:performance-oracle**: performance_issue solutions
- **compound-engineering:review:security-sentinel**: security_issue solutions
- **compound-engineering:review:data-integrity-guardian**: database_issue migrations and queries

### Enhancement & Research
- **compound-engineering:research:best-practices-researcher**: Industry best practices
- **compound-engineering:research:framework-docs-researcher**: Framework/library documentation references

## Related Commands

- `/research [topic]` - Deep investigation (searches docs/solutions/ for patterns)
- `/ce:plan` - Planning workflow (references documented solutions)
