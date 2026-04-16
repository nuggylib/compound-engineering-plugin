---
title: "refactor: Lean Agent Dispatch -- Shared Context Dedup for ce-review"
type: refactor
status: planned
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-lean-agent-dispatch-requirements.md
---

# refactor: Lean Agent Dispatch -- Shared Context Dedup for ce-review

## Overview

Deduplicate shared dispatch content across sub-agent prompts by writing it to disk once and passing paths. The orchestrator writes the assembled subagent template (with schema and scope rules embedded) and the diff to per-run files. Each sub-agent's Agent tool call contains only a Read instruction, the inlined persona, and lightweight metadata (~4 KB) instead of the full assembled prompt (~20 KB).

This is Axis B from the brainstorm. Axis A (agent archetype cleanup) is deferred to post-#19.

## Problem Frame

Each of the 10-17 sub-agent dispatches carries ~16 KB of shared content (template + schema + scope rules) in the Agent tool call argument. These arguments persist in the orchestrator's message history through Stages 5-6. For a typical 10-reviewer dispatch: ~158 KB of duplicated shared content + ~50 KB of duplicated diff content = ~208 KB of dead weight during merge/synthesis.

(See origin: `docs/brainstorms/2026-04-16-lean-agent-dispatch-requirements.md`)

## Requirements Trace

| Req | Summary | Addressed by |
|-----|---------|-------------|
| R1 | Write-once shared dispatch context | Unit 1 |
| R2 | Per-run diff file | Unit 1 |
| R3 | Lean sub-agent prompts | Unit 2 |
| R4 | Sub-agent Read-first behavior | Unit 2 |
| R5 | Backward compatibility | Unit 2 (verification) |
| R6 | Mode compatibility (report-only via OS temp) | Unit 1 |
| R7 | Persona inlining preserved | Unit 2 |
| R8 | Run artifact directory reuse | Unit 1 |
| R9 | O(1) shared + O(N) persona budget | Units 1+2 (verification) |
| R11 | Subagent template update | Unit 3 |

R10 (agent archetype) is deferred to post-#19.

## Scope Boundaries

### In Scope

- `plugins/compound-engineering/skills/ce-review/SKILL.md` (Stage 4 modifications)
- `plugins/compound-engineering/skills/ce-review/references/subagent-template.md` (variable reference update)

### Out of Scope

- Persona agent files (no changes)
- Stages 1-3, 5-6 (unchanged)
- Other reference files (diff-scope.md, findings-schema.json -- content unchanged, consumed by dispatch context assembly)
- Agent archetype cleanup (deferred to post-#19)
- CE always-on and CE conditional agent dispatch (unchanged -- they don't use the persona subagent template)
- New files or scripts

## Context & Research

### Current Dispatch Flow (Stage 4, lines 404-452)

The orchestrator:

1. Reads subagent-template.md (7,325 B), diff-scope.md (1,818 B), findings-schema.json (6,615 B) -- total 15,758 B
2. For each reviewer: reads persona file (~3.5 KB), assembles template with all variable slots filled, passes ~20 KB prompt to Agent tool
3. Each Agent tool call argument (persona + template + schema + scope + diff + metadata) persists in orchestrator message history

Post-dispatch context cost: 15.7 KB (initial reads) + N * ~20 KB (tool calls).

### Target Dispatch Flow

1. Read the same 3 reference files (15,758 B)
2. Assemble the dispatch context (template + schema + scope rules pre-filled)
3. Write dispatch-context.md and diff.txt to the run directory (~16 KB write, appears once in context)
4. For each reviewer: pass ~4 KB lean prompt (persona inlined + Read instructions + metadata)

Post-dispatch context cost: 15.7 KB (reads) + ~16 KB (write) + N * ~4 KB (lean calls).

### Dispatch Context File Structure

The dispatch context file is the subagent template with `{diff_scope_rules}` and `{schema}` already substituted. It contains:

1. The `You are a specialist code reviewer.` preamble
2. `<scope-rules>` section (diff-scope.md content, pre-resolved)
3. `<output-contract>` section (confidence rubric, suppress rules, schema, autofix guide, rules -- all pre-resolved)

It does NOT contain: `<persona>`, `<pr-context>`, `<review-context>` -- these are per-agent and go in the lean prompt.

### Institutional Learnings

- On-demand loading (#7): Established stage-specific reads. Dispatch context dedup extends this -- sub-agents load content on-demand rather than the orchestrator carrying it.
- Pass-paths-not-content pattern: `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`.

## Key Technical Decisions

### Pre-assembled dispatch context (not raw files)

The orchestrator assembles the template with schema and scope rules already embedded, then writes the result. Sub-agents make ONE Read call for the complete dispatch context instead of THREE separate reads. Simpler, fewer sub-agent startup calls.

### Report-only mode uses OS temp

Report-only mode skips `.context/` writes. Dispatch context and diff files go to OS temp (`mktemp -d -t ce-review-XXXXXX`) per AGENTS.md scratch space conventions. Outside repo tree, auto-cleaned by OS.

### Diff always path-passed

No size threshold. Consistent mechanism, negligible Read call in parallel execution, keeps orchestrator Agent tool call arguments lean regardless of diff size.

### Persona remains inlined

Persona is the agent's identity (2.7-8 KB, unique per agent). Inlining avoids Read dependency for identity content. Path-passing savings (~35 KB for 10 agents) are modest vs shared context savings (~158 KB).

## Implementation Units

### Unit 1: Write-Once Dispatch Context

**Goal:** After Run ID generation, write the shared dispatch context and diff to per-run files.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Stage 4, between "Run ID" (line 402) and "Spawning" (line 404)

**Changes:**

*1a. Add `#### Write shared dispatch context` subsection after Run ID:*

Instruct the orchestrator to:

1. Read `references/subagent-template.md`, `references/diff-scope.md`, and `references/findings-schema.json`. (Move these reads from the current "Spawning" section line 406.)
2. Assemble the dispatch context: substitute `{diff_scope_rules}` and `{schema}` into the template. Remove the `<persona>`, `<pr-context>`, and `<review-context>` sections -- these go in the lean prompt. Keep `<scope-rules>` and `<output-contract>` intact.
3. Write the assembled dispatch context to `.context/compound-engineering/ce-review/{run_id}/dispatch-context.md`.
4. Write the diff content to `.context/compound-engineering/ce-review/{run_id}/diff.txt`.

*1b. Report-only mode handling:*

When in report-only mode (which skips `.context/` writes and Run ID):

1. Generate a temp directory: `DISPATCH_DIR=$(mktemp -d -t ce-review-XXXXXX)`
2. Write dispatch-context.md and diff.txt to the temp directory.
3. Lean prompts use temp directory paths instead of `.context/` paths.

*1c. Document the dispatch context file structure:*

State what the file contains (preamble + scope rules + output contract with schema) and what it omits (persona, diff, review-context). Brief, for maintainer orientation.

**Verification:**

- [ ] "Write shared dispatch context" subsection exists in Stage 4 between Run ID and Spawning
- [ ] Instructs reading the 3 reference files
- [ ] Instructs writing dispatch-context.md and diff.txt
- [ ] Report-only mode uses `mktemp`
- [ ] Reference file reads no longer duplicated in Spawning section

---

### Unit 2: Lean Prompt Dispatch

**Goal:** Rewrite the Spawning section to use lean per-agent prompts.

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`

**Section:** Stage 4, "Spawning" subsection (lines 404-452)

**Changes:**

*2a. Replace the per-agent content list (lines 410-418) with lean prompt structure:*

Each persona sub-agent receives a lean prompt containing:

1. Read instruction for dispatch-context.md: "Read `.context/compound-engineering/ce-review/{run_id}/dispatch-context.md` for the output contract, confidence rubric, scope rules, and schema. Read the file BEFORE analyzing the diff."
2. Persona file content (inlined in `<persona>` tags)
3. PR metadata in `<pr-context>` tags
4. Review context in `<review-context>` tags: run ID, reviewer name, intent summary, file list -- but NOT the diff
5. Read instruction for diff: "Read `.context/compound-engineering/ce-review/{run_id}/diff.txt` for the full diff."
6. For `project-standards` only: standards paths from Stage 3b
7. Fallback: "If the dispatch context file read fails, return `{"reviewer": "{name}", "findings": [], "residual_risks": ["Dispatch context read failed"], "testing_gaps": []}`"

*2b. Show lean prompt example:*

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

If the dispatch context file read fails, return an empty findings array with a residual risk noting the failure.
```

*2c. Remove line 406:*

Delete "Read `references/subagent-template.md`, `references/diff-scope.md`, and `references/findings-schema.json` for sub-agent prompt assembly." -- now in Unit 1.

*2d. Preserve unchanged content:*

Keep intact:
- "Omit the mode parameter" instruction
- Compact return JSON example
- Detail-tier fields note
- CE always-on agents paragraph
- CE conditional agents paragraph
- Non-mutating inspection commands
- "return structured JSON only" instruction

**Verification:**

- [ ] Lean prompt structure appears in Spawning section
- [ ] Read instructions for dispatch-context.md and diff.txt present
- [ ] Persona inlined in lean prompt
- [ ] Read-failure fallback present
- [ ] CE always-on and CE conditional dispatch unchanged
- [ ] Compact return format unchanged
- [ ] `bun test` passes
- [ ] `bun run release:validate` passes

---

### Unit 3: Subagent Template Documentation Update

**Goal:** Update the subagent template's variable reference to document the dispatch mechanism.

**File:** `plugins/compound-engineering/skills/ce-review/references/subagent-template.md`

**Section:** Variable Reference table (lines 94-107)

**Changes:**

*3a. Add dispatch mechanism note at the top of the file:*

After the opening description, add a note explaining: the template body (with `{diff_scope_rules}` and `{schema}` pre-resolved) is written to `dispatch-context.md` before agent spawning. Sub-agents Read this file as their first action. The template body remains the canonical definition of the output contract and scope rules.

*3b. Update variable reference table:*

Add a "Resolution" column distinguishing:

| Variable | Source | Resolution | Description |
|----------|--------|------------|-------------|
| `{diff_scope_rules}` | `references/diff-scope.md` | Pre-resolved into dispatch-context.md | ... |
| `{schema}` | `references/findings-schema.json` | Pre-resolved into dispatch-context.md | ... |
| `{persona_file}` | Agent markdown file | Per-agent (inlined in lean prompt) | ... |
| `{intent_summary}` | Stage 2 output | Per-agent (inlined in lean prompt) | ... |
| `{pr_metadata}` | Stage 1 output | Per-agent (inlined in lean prompt) | ... |
| `{file_list}` | Stage 1 output | Per-agent (inlined in lean prompt) | ... |
| `{diff}` | Stage 1 output | File-referenced (diff.txt) | ... |
| `{run_id}` | Stage 4 output | Per-agent (inlined in lean prompt) | ... |
| `{reviewer_name}` | Stage 3 output | Per-agent (inlined in lean prompt) | ... |

**Verification:**

- [ ] Variable reference table has Resolution column
- [ ] Dispatch mechanism note present
- [ ] Template body unchanged

## Open Questions

### Resolved During Planning

- **Should the dispatch context file include the preamble?** Yes. The file should be self-contained as a review contract.

- **Should the lean prompt duplicate any output contract content?** No. Full deferral to the dispatch context file.

- **Should CE always-on/conditional agents use the dispatch context file?** No. They use unstructured output and don't follow the persona subagent template. Keep their dispatch unchanged.

- **Should the diff file path use `.md` or `.txt`?** `.txt`. The diff is not markdown content. Plain text extension avoids any markdown rendering or processing.

## Verification Plan

### Post-Implementation Checks

1. `grep 'dispatch-context.md' plugins/compound-engineering/skills/ce-review/SKILL.md` returns matches in Stage 4
2. `grep 'diff.txt' plugins/compound-engineering/skills/ce-review/SKILL.md` returns matches in Stage 4
3. Spawning section no longer instructs reading reference files per-agent
4. CE always-on and CE conditional agent dispatch unchanged
5. `bun test` passes
6. `bun run release:validate` passes

### Context Budget Verification

| Component | Before | After |
|-----------|--------|-------|
| Reference file reads (1x) | 15,758 B | 15,758 B |
| Dispatch context write (1x) | 0 | ~16,000 B |
| Per-agent tool calls (10x) | 10 * ~20,000 B = 200,000 B | 10 * ~4,000 B = 40,000 B |
| **Total** | **~216 KB** | **~72 KB** |
| **Savings** | | **~144 KB** |

## Execution Order

Units: 1 -> 2 -> 3. Unit 2 depends on Unit 1 (lean prompt references files from Unit 1). Unit 3 is documentation.

One commit touching 2 files.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-16-lean-agent-dispatch-requirements.md](docs/brainstorms/2026-04-16-lean-agent-dispatch-requirements.md)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- **Pass-paths-not-content pattern:** [docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md](docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md)
