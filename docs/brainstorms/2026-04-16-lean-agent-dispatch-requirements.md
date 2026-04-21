---
date: 2026-04-16
topic: lean-agent-dispatch
idea: 2
phase: 2
status: brainstormed
---

# Lean Agent Dispatch Pipeline (Archetypes + Shared Context Dedup)

## Problem Frame

The ce-review skill dispatches 6-21 reviewer sub-agents per review session. Each sub-agent prompt is assembled by the orchestrator from:

| Component | Size | Shared? | Per-reviewer cost |
|-----------|------|---------|-------------------|
| Subagent template scaffold | 7,325 B | Identical | Duplicated per agent |
| Findings schema (embedded in template) | 6,615 B | Identical | Duplicated per agent |
| Diff-scope rules (embedded in template) | 1,818 B | Identical | Duplicated per agent |
| Persona file content | 2,706-8,016 B (median 3,541 B) | Unique | 1x per agent |
| Diff content | Variable | Identical | Duplicated per agent |
| Intent + file list + PR metadata | ~500-2,000 B | Identical | Duplicated per agent |

The shared overhead per reviewer (template + schema + scope) is **15,758 bytes**. For a typical review dispatching 10 reviewers, this shared content is duplicated 10 times in the orchestrator's context via Agent tool calls -- **157,580 bytes of identical content** occupying the orchestrator's context window during dispatch.

This is the single largest token inefficiency in the plugin. The orchestrator needs this content only to assemble prompts, but the content persists in the orchestrator's message history through all subsequent stages (merge, synthesis, output). After dispatch, it is dead weight.

### Token economics by dispatch count

| Reviewers | Shared overhead | Persona overhead | Diff overhead | Total dispatch prompt cost |
|-----------|----------------|-----------------|---------------|---------------------------|
| 6 (minimum) | 94,548 B | ~22,000 B | 6 x diff | ~116 KB + 6 x diff |
| 10 (typical) | 157,580 B | ~41,000 B | 10 x diff | ~199 KB + 10 x diff |
| 14 (high) | 220,612 B | ~57,000 B | 14 x diff | ~278 KB + 14 x diff |
| 17 (maximum) | 267,886 B | ~70,000 B | 17 x diff | ~338 KB + 17 x diff |

For a 5 KB diff (common for focused PRs), the typical-dispatch total is ~249 KB, of which ~158 KB is duplicated shared context.

### Two independent optimization axes

The ideation identified two complementary changes:

**(a) Archetypes** -- Extract shared structure from the 17 persona agent files into a base pattern, reducing each to its unique delta.

**(b) Shared context dedup** -- Write the dispatch-shared content (template + schema + scope rules) to disk once, pass a path to each sub-agent instead of inlining ~16 KB per reviewer.

These axes are independent. Axis B delivers ~90% of the total savings with minimal complexity. Axis A delivers modest savings (~5-10 KB) but requires build-time infrastructure. This brainstorm evaluates both and recommends a sequencing.

## Current State Analysis

### The 17 persona agents

All 17 review persona agents dispatched by ce-review live in `plugins/compound-engineering/agents/review/`. They share an identical structure:

```
---
name: <reviewer-name>
description: "<description>"
model: inherit
tools: Read, Grep, Glob, Bash
color: blue (or red for adversarial)
---

# <Title>

<Identity paragraph: 2-3 sentences defining the persona's perspective>

## What you're hunting for
<5 domain-specific bullet points, ~800-2,000 bytes>

## Confidence calibration
<3 paragraphs: high (0.80+), moderate (0.60-0.79), low (below 0.60)>
<Thresholds are identical; examples are unique per persona>
<Security has a special lower-threshold note>

## What you don't flag
<3-5 suppress conditions, ~300-600 bytes>

## Output format
<Identical JSON template across all 17, differing only in the "reviewer" string value>
```

**Content analysis per agent:**

| Component | Bytes (range) | Shared vs Unique |
|-----------|---------------|------------------|
| Frontmatter | 100-160 | Structure shared, values unique |
| Identity paragraph | 150-350 | Fully unique |
| Hunting targets | 800-2,000 | Fully unique |
| Confidence calibration | 400-700 | Structure shared (threshold values), examples unique |
| Suppress conditions | 300-600 | Fully unique |
| Output format | ~150 | Identical (except reviewer name string) |
| Adversarial extras | 0 or ~3,200 | Unique (depth calibration, cascade construction) |

**Truly identical content per agent:** The "Output format" section (~150 bytes) is word-for-word identical across all 17 agents except the reviewer name. Additionally, the confidence threshold values (0.80+, 0.60-0.79, below 0.60) are shared but the explanatory text is unique.

**Overlap with subagent template:** The per-agent output format block is redundant with the subagent template's `<output-contract>` section, which already contains the full schema, confidence rubric, suppress categories, and rules. The per-agent block reinforces the format but adds no information.

### The subagent template dispatch mechanism

Stage 4 of ce-review assembles each sub-agent's prompt using `references/subagent-template.md`. The template defines variable slots:

| Slot | Source | Size |
|------|--------|------|
| `{persona_file}` | Agent .md file content | 2.7-8 KB |
| `{diff_scope_rules}` | `references/diff-scope.md` | 1,818 B |
| `{schema}` | `references/findings-schema.json` | 6,615 B |
| `{intent_summary}` | Stage 2 output | ~100-300 B |
| `{pr_metadata}` | Stage 1 output | 0-2,000 B |
| `{file_list}` | Stage 1 output | ~200-1,000 B |
| `{diff}` | Stage 1 output | Variable |
| `{run_id}` | Stage 4 generated | ~30 B |
| `{reviewer_name}` | Stage 3 output | ~20 B |

The assembled prompt is passed as the `prompt` parameter to the Agent tool. Claude Code's Agent tool creates a fresh sub-agent context per call. The assembled prompt, including all substituted content, lives in the orchestrator's message history as the tool call argument.

### What sub-agents see

Sub-agents do NOT inherit parent context. Each receives:
1. System prompt + CLAUDE.md chain (~3-4K tokens baseline)
2. The assembled prompt from the Agent tool call (~16 KB shared + persona + diff)

This means the shared content (schema, scope rules, confidence rubric) must be in each sub-agent's prompt somehow -- either inlined (current) or via a Read instruction pointing to a file.

### Current dispatch flow

```
Orchestrator
  |
  |-- Read subagent-template.md (7.3 KB into orchestrator context)
  |-- Read diff-scope.md (1.8 KB into orchestrator context)
  |-- Read findings-schema.json (6.6 KB into orchestrator context)
  |   (These 3 reads happen once; content is ~15.7 KB in orchestrator)
  |
  |-- For each of 10 reviewers:
  |     |-- Read persona file (~3.5 KB into orchestrator context)
  |     |-- Assemble prompt: template + scope + schema + persona + diff
  |     |-- Agent tool call with ~20+ KB prompt argument
  |     |   (prompt argument persists in orchestrator message history)
  |     |
  |     Total new orchestrator context per reviewer: ~3.5 KB (persona) + ~20 KB (tool call)
  |
  Total orchestrator context from dispatch: ~15.7 + 10 * (3.5 + 20) = ~251 KB
```

The 15.7 KB of shared content is read once but then duplicated into each Agent tool call argument. The orchestrator carries ~251 KB of dispatch context through Stages 5-6 (merge, synthesis).

## Design Approaches

### Approach 1: .context/ Write-Once, Path-Pass (Axis B)

Write the shared dispatch context to a file before spawning agents. Each sub-agent prompt includes a Read instruction instead of the inlined content.

**Mechanism:**

```
Orchestrator
  |
  |-- Read subagent-template.md, diff-scope.md, findings-schema.json
  |-- Assemble shared dispatch context (template with schema + scope embedded)
  |-- Write to .context/compound-engineering/ce-review/{run_id}/dispatch-context.md
  |-- Write diff to .context/compound-engineering/ce-review/{run_id}/diff.txt
  |
  |-- For each of 10 reviewers:
  |     |-- Agent tool call with LEAN prompt:
  |     |   "Read .context/.../dispatch-context.md for your review contract.
  |     |    <persona>{persona_file}</persona>
  |     |    <review-context>Run ID: ... Reviewer: ...
  |     |    Intent: ... Files: ...
  |     |    Read .context/.../diff.txt for the full diff.</review-context>"
  |     |
  |     Prompt size: ~4 KB (persona + paths + metadata) instead of ~20 KB
  |
  Total orchestrator context: ~16 KB (write) + 10 * ~4 KB (calls) = ~56 KB
```

**Savings:** ~195 KB for a 10-reviewer dispatch (from ~251 KB to ~56 KB).

**Pros:**
- No build infrastructure needed. Pure SKILL.md prose change.
- Sub-agents independently Read the shared file -- one additional tool call per agent.
- Orchestrator context is dramatically leaner during Stages 5-6.
- Diff dedup: currently the diff is passed to every reviewer; writing it to disk means each agent Reads it independently. The orchestrator's context drops the N copies of the diff.
- Already consistent with the plugin's pass-paths-not-content pattern (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`).

**Cons:**
- Each sub-agent makes 1-2 additional Read tool calls at startup (dispatch-context + diff file).
- Adds ~1-2 seconds of latency per sub-agent for file reads (negligible since agents run in parallel).
- The sub-agent's own context still loads the full shared content -- no savings in sub-agent token usage. The savings are entirely in the orchestrator.
- Platform portability: `.context/` file paths may not work identically on all converted platforms. However, `.context/` is already used by ce-review for run artifacts, so the mechanism is proven.

**Estimated savings (orchestrator context only):**

| Reviewers | Before | After | Savings |
|-----------|--------|-------|---------|
| 6 (minimum) | ~151 KB | ~40 KB | ~111 KB |
| 10 (typical) | ~251 KB | ~56 KB | ~195 KB |
| 14 (high) | ~351 KB | ~72 KB | ~279 KB |
| 17 (maximum) | ~427 KB | ~84 KB | ~343 KB |

These estimates assume a 5 KB diff. For larger diffs, the savings from diff dedup are even greater.

### Approach 2: Agent Archetype Files (Axis A)

Extract shared per-agent content into a base archetype file. Each persona agent becomes a delta that references the archetype.

**Mechanism:**

Create `agents/review/_base-review-persona.md` containing:
- Standard confidence threshold values and instructions
- Output format JSON template
- Cross-persona rules (e.g., "Do not flag style preferences that a linter would catch")

Each persona agent removes the shared sections and adds a frontmatter reference:
```yaml
archetype: _base-review-persona
```

**Challenge: No runtime composition mechanism.** Claude Code agent files are standalone markdown documents. There is no `@` file inclusion in agent frontmatter, no inheritance mechanism, and no build-time composition in the plugin spec. The archetype approach requires one of:

1. **Build-time expansion**: The CLI converter reads the archetype reference, loads the base file, and composes the full agent at conversion time. The installed agent file contains the full content.
2. **Subagent template integration**: Instead of a separate archetype file, embed the shared persona structure into the subagent template. The template already defines the output contract; extend it to include the standard confidence rubric and suppress categories. Each agent file then truly contains only the unique delta.
3. **Convention only**: Document the archetype pattern but don't enforce it mechanically. Each agent file continues to contain its own content, but authors are guided to keep the structure consistent.

**Savings per agent (if output format section removed):**

| Content removed | Size per agent | Across 17 agents |
|-----------------|---------------|-------------------|
| Output format block | ~150 B | ~2,550 B |
| Shared confidence structure | ~100-200 B | ~1,700-3,400 B |
| **Total** | **~250-350 B** | **~4,250-5,950 B** |

**Savings if subagent template absorbs shared structure:**

Move the confidence threshold definitions and output format from each agent into the subagent template's `<output-contract>` section (which already contains the confidence rubric). This means:
- Remove the `## Confidence calibration` *structure* from each agent -- each agent retains only unique calibration notes (e.g., security's "lower confidence threshold" note, adversarial's depth calibration)
- Remove the `## Output format` section entirely (redundant with template)
- Net savings per agent: ~400-700 bytes
- Across 17 agents: ~6,800-11,900 bytes

**Pros:**
- Reduces maintenance burden -- shared structure changes apply once.
- Agent files become more focused on the unique persona identity and hunting instructions.
- No build infrastructure needed if using the subagent-template integration path.

**Cons:**
- Savings are modest (~5-12 KB total) compared to Axis B (~195 KB per review session).
- Risk of degraded persona behavior if agents rely on the template for calibration rather than carrying it themselves.
- Agents dispatched outside ce-review (standalone invocation) would not receive the template's calibration guidance. They'd need a fallback.
- Archetype base files require converter pipeline changes (build-time expansion).

### Approach 3: Combined (Axis B first, Axis A optional)

Implement Axis B (shared context dedup) as the primary change. Optionally implement Axis A (archetype cleanup) as a low-priority follow-up.

**Rationale:** Axis B delivers ~195 KB savings per review session with a single SKILL.md change. Axis A delivers ~5-12 KB of static savings across agent files, requiring either build infrastructure or careful template restructuring. The ROI difference is ~20-40x.

## Requirements

**R1. Write-once shared dispatch context.** The orchestrator must write the shared dispatch content (assembled subagent template with embedded schema and diff-scope rules) to a per-run file before spawning any sub-agents. The file must contain everything a sub-agent needs to understand the output contract, confidence rubric, suppress categories, and scope rules.

**R2. Per-run diff file.** The orchestrator must write the diff content to a separate per-run file. Sub-agents Read this file instead of receiving the diff inline. This deduplicates the diff across N sub-agents in the orchestrator's context.

**R3. Lean sub-agent prompts.** Each sub-agent's Agent tool call prompt must contain only:
- A Read instruction pointing to the shared dispatch context file
- A Read instruction pointing to the diff file (or inline the diff if it's small enough that dedup savings are negligible, e.g., < 1 KB)
- The persona file content (identity, hunting targets, calibration, suppress conditions) -- inlined because it's unique per agent
- Review context metadata: run ID, reviewer name, intent summary, file list, PR metadata
- Standards paths (for project-standards only)

**R4. Sub-agent Read-first behavior.** The sub-agent prompt must instruct the agent to Read the shared dispatch context file as its first action before analyzing the diff. The prompt must be structured so the agent knows the file contains the output contract and schema.

**R5. Backward compatibility.** The review output format, findings schema, merge/dedup pipeline (Stage 5), and synthesis (Stage 6) must remain unchanged. The only change is how sub-agent prompts are assembled, not what sub-agents produce.

**R6. Mode compatibility.** Write-once dispatch must work in all four review modes (interactive, autofix, report-only, headless). In report-only mode, run-id generation and artifact writes are already skipped -- the shared dispatch context write must follow the same pattern:
- Interactive, autofix, headless: write dispatch context to `.context/compound-engineering/ce-review/{run_id}/`
- Report-only: the mechanism needs a decision -- either write to a temp location (since report-only skips .context/) or inline the content (falling back to current behavior). See Q1 in Open Questions.

**R7. Persona inlining preserved.** Persona file content must remain inlined in each sub-agent prompt, not path-referenced. Rationale: persona files are unique per agent and define the agent's identity. A Read instruction would add latency and a potential failure point for the agent's core instructions. The persona is the only part of the prompt that should remain inline.

**R8. Run artifact directory reuse.** The shared dispatch context and diff files should be written to the same `.context/compound-engineering/ce-review/{run_id}/` directory that already holds per-reviewer artifact JSON files. No new directory structure.

**R9. Orchestrator context budget.** After implementation, the orchestrator's context cost for dispatching N reviewers must be: O(1) for shared content (one write) + O(N) for persona-sized prompts, instead of the current O(N) for (shared + persona)-sized prompts. The constant factor on the shared write is ~16 KB; the per-reviewer factor drops from ~20 KB to ~4 KB.

**R10. Agent archetype (deferred).** Removing the per-agent `## Output format` section and standardizing the confidence calibration structure is a separate unit that can be implemented after Axis B. It is not required for the primary savings but should be captured as follow-up work. The follow-up must verify that agents dispatched outside ce-review (standalone invocation) are not degraded by the removal of inline output format instructions.

**R11. Subagent template update.** The subagent template (`references/subagent-template.md`) must be updated to reflect the new dispatch mechanism. The template should document:
- How shared context is written to disk
- The file structure of the dispatch context file
- How the lean prompt references the shared files
- Variable slots that change (removing `{schema}` and `{diff_scope_rules}` inline slots, adding `{shared_context_path}` and `{diff_path}`)

## Constraints

### Platform behavior

**C1.** Sub-agents do not inherit parent context. Each sub-agent starts with system prompt + CLAUDE.md chain + the Agent tool call prompt. The shared dispatch content must be accessible to the sub-agent via file read.

**C2.** The `.context/` directory is already used by ce-review for run artifacts. Per-reviewer JSON files are written there by sub-agents. The shared dispatch context file is a new addition to the same directory.

**C3.** On converted platforms, file write/read behavior varies. The `.context/` path may resolve differently. However, ce-review already uses `.context/` for artifacts, so this mechanism is tested on the platforms where ce-review runs.

### Orchestrator context

**C4.** The orchestrator's context window is the bottleneck. After dispatching 10+ agents, the orchestrator is carrying ~250+ KB of dispatch prompts plus the Stage 1-3 context. Stages 5-6 (merge, synthesis) require the orchestrator to process all returned findings -- a complex reasoning task that benefits from more available context. Reducing dispatch overhead directly improves merge/synthesis quality by giving the orchestrator more headroom.

**C5.** Agent tool call arguments are part of the orchestrator's message history. They are not garbage-collected after the agent returns. The full assembled prompt persists until compaction.

### Per-agent file structure

**C6.** Agent files in `plugins/compound-engineering/agents/review/*.md` are Claude Code agent definitions. They have no `@` inclusion mechanism, no inheritance, and no build-time composition in the current plugin spec.

**C7.** Some review agents are dispatched outside ce-review (standalone invocation by users). The standalone invocation path does not use the subagent template. Any archetype changes that remove content from agent files must not degrade standalone usage.

### Converter pipeline

**C8.** The CLI converter reads agent files from `agents/review/` and converts them for target platforms. Changes to agent file structure may affect conversion. The converter does not currently handle archetype composition.

## Implementation Scope

### In scope

- SKILL.md changes: Stage 4 dispatch mechanism (write-once, lean prompts)
- SKILL.md changes: Subagent template variable reference update
- `references/subagent-template.md` update (document new dispatch mechanism)
- Verification that review output is unchanged

### Out of scope (deferred to follow-up)

- Per-agent file archetype refactoring (R10)
- Build-time archetype expansion in the converter
- New reference files or scripts
- Changes to the findings schema, diff-scope rules, or review output template

## Edge Cases

**E1. Report-only mode dispatch.** Report-only mode skips run-id generation and `.context/` writes. Options: (a) fall back to inline dispatch for report-only (no savings, no change from current), (b) write to OS temp instead of `.context/`, (c) generate a run-id for dispatch context only (not for per-reviewer artifacts). See Q1.

**E2. Single reviewer dispatch.** If only 6 always-on agents are dispatched (e.g., trivial diff under idea #3's cap), the savings ratio is lower (~78 KB vs ~111 KB) but still significant. The write-once overhead (one file write) is constant and negligible.

**E3. Very large diffs.** A 100 KB diff duplicated across 10 reviewers is 1 MB of diff content in the orchestrator's context. Writing the diff to a file and path-passing saves ~900 KB. The savings from diff dedup exceed the shared overhead savings for large diffs.

**E4. Sub-agent Read failure.** If a sub-agent fails to Read the shared dispatch context file (file not found, permission error), it has no output contract and cannot produce valid findings. Mitigation: the lean prompt should include a minimal fallback instruction ("If the file read fails, return an empty findings array and report the error in residual_risks").

**E5. Concurrent reviews.** Two ce-review invocations running simultaneously on the same checkout. Each has its own run-id and therefore its own dispatch context directory. No conflict.

## Open Questions

### Q1: Report-only mode dispatch mechanism

Report-only mode currently skips `.context/` writes. Should the shared dispatch context:
- (a) Fall back to inline dispatch (current behavior, no savings for report-only)?
- (b) Write to OS temp (`mktemp`) per AGENTS.md scratch space conventions?
- (c) Generate a lightweight run-id for dispatch context only?

**Recommendation:** Option (b). AGENTS.md already specifies OS temp for throwaway artifacts. The dispatch context is consumed once during the review and discarded. Report-only mode's constraint is "never write `.context/`", not "never write files." The temp directory is outside the repo tree and auto-cleaned by the OS.

### Q2: Should the diff be inlined or path-passed?

For small diffs (< 1 KB), path-passing adds a Read call per sub-agent with negligible savings. For large diffs (> 5 KB), the savings from dedup are substantial.

**Recommendation:** Always path-pass the diff. The mechanism is consistent regardless of size, the threshold logic would add complexity, and even small diffs benefit from keeping the orchestrator's Agent tool call arguments lean. The additional Read call per sub-agent is negligible since they run in parallel.

### Q3: Should persona content be path-passed too?

Following the same logic, persona files could be path-passed instead of inlined. Each agent file is 2.7-8 KB.

**Recommendation:** No. Persona content is the agent's identity -- it defines what the agent is and what it hunts for. Inlining it in the prompt ensures the agent receives its identity immediately without a Read dependency. The savings (~3.5 KB median per agent, ~35 KB for 10 reviewers) are modest compared to the shared context savings (~158 KB), and the risk of a Read failure losing the agent's identity is higher stakes than losing the output contract (which has a fallback).

### Q4: Interaction with idea #7 (on-demand loading)

Idea #7 (just executed) converted the 5 reference file `@` inclusions to stage-specific backtick-path reads. This means the orchestrator already reads subagent-template.md, diff-scope.md, and findings-schema.json on demand at Stage 4 instead of carrying them from trigger time.

The write-once mechanism in this idea goes further: after reading these files at Stage 4, the orchestrator writes the assembled content to disk and passes a path to each sub-agent. This is complementary -- #7 deferred the read, #2 deduplicates the distribution.

### Q5: Interaction with idea #3 (diff-proportional scaling)

Idea #3 caps the number of conditional reviewers based on diff size. Fewer reviewers means fewer Agent tool calls, which reduces the duplicated shared content. The two ideas are additive: #3 reduces the number of agents, #2 reduces the per-agent overhead. Combined, a trivial diff dispatching 8 agents (6 always-on + 2 conditional) with lean prompts uses ~48 KB instead of ~184 KB.

## Risk Assessment

### R-1: Sub-agent first-action reliability

**Risk:** Sub-agents may not reliably execute the Read instruction as their first action. If the agent starts analyzing before reading the dispatch context, it has no output contract and produces malformed findings.

**Severity:** Medium. The sub-agent prompt structure (Read instruction at the top, persona below, review context below that) strongly biases the agent to read first. Claude Code agents reliably follow prompt ordering.

**Mitigation:** Structure the lean prompt so the Read instruction is the first line, before persona content. Include "Read this file BEFORE analyzing the diff" phrasing. The fallback for Read failure (empty findings + error in residual_risks) prevents silent data loss.

### R-2: File write adds failure mode to dispatch

**Risk:** The orchestrator's file write could fail (permissions, disk space, path issues), preventing dispatch entirely.

**Severity:** Low. The `.context/` directory is already created by run-id generation in Stage 4. The write is to an existing directory. Permission and disk-space failures would also affect the per-reviewer artifact writes that already exist.

**Mitigation:** If the file write fails, fall back to inline dispatch (current behavior). Log a warning but do not block the review.

### R-3: Converter pipeline impact

**Risk:** The subagent template update changes variable slots. Converted versions of ce-review for other platforms might break if they expect the old variable structure.

**Severity:** Low. The subagent template is a reference file within ce-review's skill directory. It is not directly consumed by the converter -- it is read at runtime by the orchestrating agent. The converter copies skill directories as-is.

**Mitigation:** Verify that the converted ce-review skill on Codex and Kiro produces the same behavior. The variable slots are consumed by the orchestrating model, not by the converter.

### R-4: Context savings may be less than modeled

**Risk:** The orchestrator's context may not carry the full Agent tool call arguments in all cases. If the platform compresses or truncates tool call arguments in message history, the actual savings may be lower.

**Severity:** Low. Current Claude Code behavior preserves full tool call arguments in message history until compaction. The savings model is based on observed behavior.

## Success Criteria

**S1.** Orchestrator context cost for dispatching N reviewers drops from O(N x 20 KB) to O(16 KB + N x 4 KB). For 10 reviewers: from ~251 KB to ~56 KB.

**S2.** Sub-agents produce the same findings as before the change. Validate by running a review on a known diff before and after, comparing findings count, severity distribution, and reviewer coverage.

**S3.** All four review modes (interactive, autofix, report-only, headless) dispatch correctly. Report-only uses OS temp for the dispatch context file.

**S4.** `bun test` passes. `bun run release:validate` passes.

**S5.** No regression in review completion time. Parallel sub-agent startup adds ~1-2 Read calls per agent but runs concurrently, so wall-clock time should be negligibly different.

## Estimated Savings

| Component | Before | After | Savings | Confidence |
|-----------|--------|-------|---------|------------|
| Shared context dedup (Axis B, 10 reviewers) | 157,580 B in orchestrator | 15,758 B write + 2,000 B refs | ~140 KB | High |
| Diff dedup (5 KB diff, 10 reviewers) | 50,000 B in orchestrator | 5,000 B write + 1,000 B refs | ~44 KB | High |
| Agent archetype cleanup (Axis A, deferred) | 69,662 B total agent content | ~58,000-64,000 B | ~6-12 KB | Medium |
| **Total (Axis B only, typical review)** | | | **~184 KB** | |
| **Total (Axis B + diff dedup, typical)** | | | **~184 KB** | |
| **Total (all axes)** | | | **~190-196 KB** | |

**Per-year impact estimate:** A developer running ~10 reviews/week with an average 10 reviewers dispatches ~100 sub-agents/week. At ~18 KB savings per sub-agent in orchestrator context, that is ~1.8 MB/week or ~94 MB/year of reduced orchestrator context load. More importantly: the orchestrator has ~195 KB more headroom during the merge/synthesis stages, improving reasoning quality on complex reviews.

## Recommendation

**Implement Axis B (shared context dedup) as the primary deliverable.** This is a single-unit change to ce-review's SKILL.md (Stage 4 dispatch section + subagent template update) delivering ~140-195 KB savings per review session. No build infrastructure, no agent file changes, no converter impact.

**Defer Axis A (agent archetype cleanup) to a follow-up after idea #19 (L3/Negative-Space Agent Redesign).** Idea #19 will audit and restructure agent content based on ablation data. Removing shared structure from agents now would be reworked by #19. Sequence: #2 (dispatch dedup) -> #19 (agent content audit) -> Axis A (archetype cleanup on the post-#19 agent content).
