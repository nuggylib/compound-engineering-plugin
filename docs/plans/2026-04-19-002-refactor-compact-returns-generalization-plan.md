---
title: "refactor: Apply write-once dispatch and compact returns to document-review"
type: refactor
status: completed
date: 2026-04-19
origin: docs/brainstorms/2026-04-19-compact-returns-generalization-requirements.md
---

# refactor: Apply write-once dispatch and compact returns to document-review

## Overview

Apply two proven orchestrator patterns from ce-review to document-review: (1) write-once dispatch — shared content (template with embedded schema) is written to disk once, each sub-agent receives a path instead of inlined content; (2) compact returns — sub-agents write full findings to disk artifacts and return only merge-tier fields. Estimated savings: ~63-75KB per 5-agent document review session.

## Problem Frame

Document-review dispatches 2-7 reviewer agents, each receiving the full template (~2.3KB), schema (~3.5KB), and document content (5-20KB) inlined in its prompt. All return fields including evidence arrays are returned inline. For a typical 5-agent review of a 10KB document, this costs ~84-91.5KB of orchestrator context. CE-review already solves this with write-once dispatch + compact returns. Document-review should follow the same patterns. (see origin: `docs/brainstorms/2026-04-19-compact-returns-generalization-requirements.md`)

## Requirements Trace

- R1. Orchestrator writes shared dispatch content to a per-run directory before spawning agents
- R2. Sub-agents Read the document from its original path directly (no per-run copy)
- R3. Lean prompts contain only: Read instruction for shared context, persona content (inlined), document path, document type, run ID, reviewer name
- R4. Sub-agents write full findings to per-run artifact files
- R5. Sub-agents return compact JSON omitting `evidence` only (all other fields including `why_it_matters` stay in merge tier)
- R6. Synthesis Phase 3.3 loads evidence from artifact files using reviewer name + content-based fingerprint matching (`normalize(section) + normalize(title)`)
- ~~R7.~~ (numbering gap inherited from origin document)
- R8. Fallback to inline dispatch if shared context write fails
- R9. Fallback to full inline returns if artifact write fails
- R10. Headless mode generates run-id for dispatch context and artifacts
- R11. All four dispatch scenarios use the same code paths
- R12. Add "Sub-Agent Communication Patterns" section to AGENTS.md

## Scope Boundaries

- Only document-review is in scope (other orchestrator skills already have compact/status returns)
- No changes to persona files (agents under `plugins/compound-engineering/agents/document-review/`)
- No changes to findings-schema.json field definitions (only add `_meta`)
- No changes to ce-review
- Headless mode adds evidence lines to output using batch-loaded artifacts; interactive mode evidence rendering is unchanged (out of scope)

## Context & Research

### Relevant Code and Patterns

- **CE-review write-once dispatch** (`plugins/compound-engineering/skills/ce-review/SKILL.md`, Stage 4): Generates run ID, assembles dispatch context (template + schema + scope rules), writes to `.context/compound-engineering/ce-review/{run_id}/dispatch-context.md`, dispatches lean prompts per agent
- **CE-review compact returns** (`plugins/compound-engineering/skills/ce-review/SKILL.md`, Stage 4 output contract): Agents write full findings to `{run_id}/{reviewer_name}.json`, return only merge-tier fields. Detail enrichment loads artifacts for headless output
- **CE-review schema `_meta.return_tiers`** (`plugins/compound-engineering/skills/ce-review/references/findings-schema.json`): Documents which fields are merge-tier vs detail-tier
- **Document-review dispatch** (`plugins/compound-engineering/skills/document-review/SKILL.md`, Phase 2): Fills 5 template variables per agent, all inlined
- **Document-review template** (`plugins/compound-engineering/skills/document-review/references/subagent-template.md`, 53 lines): Contains `{schema}`, `{document_content}`, `{persona_file}`, `{document_type}`, `{document_path}` slots
- **Document-review schema** (`plugins/compound-engineering/skills/document-review/references/findings-schema.json`, 87 lines)
- **Document-review synthesis** (`plugins/compound-engineering/skills/document-review/references/synthesis-and-presentation.md`): Phases 3-5, loaded after agents return
- **`.context/` conventions** (AGENTS.md): Namespace under `.context/compound-engineering/<skill-name>/`, add per-run subdirectory, clean up after success

### Institutional Learnings

- **Pass paths, not content** (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`): Separate discovery from reading. Include standalone fallback. Content-passing acceptable when small and always consumed
- **Skill body size is multiplicative** (`docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md`): Every line in SKILL.md body is paid on every tool call. Move content consumed only by sub-agents to reference files or `.context/` artifacts. Threshold: move if >50 lines AND minority-use
- **Script-first for deterministic ops** (`docs/solutions/skill-design/script-first-skill-architecture.md`): If merge/dedup logic is deterministic, consider a script. For this refactor, the synthesis pipeline instructions are kept as-is (model-mediated) since the dedup involves semantic judgment
- **Artifact IS the handoff** (`docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md`): Compact return is the index; artifact is the full record

## Key Technical Decisions

- **Only `evidence` moves to detail tier**: `why_it_matters` stays in merge tier because Phase 3.6 checks it for codebase pattern citations. This differs from ce-review where both `why_it_matters` and `evidence` are detail-tier. (see origin)
- **Batch-load evidence before dedup**: All artifact files are read before Phase 3.3 starts. Typical counts (15-25 findings across 5 agents) make batch-load simpler than per-finding on-demand. Loaded evidence serves both Phase 3.3 (evidence union) and Phase 4 (headless presentation)
- **Document not copied to run directory**: The document is already on disk at `{document_path}`. Agents Read it directly. This eliminates a write operation and simplifies the lean prompt. (see origin)
- **`@` inlines change to backtick paths**: Template and schema are currently `@`-inlined in SKILL.md (~7.5KB in every message). After write-once dispatch, they are only consumed during Phase 2 dispatch context assembly. Backtick references let the orchestrator load them on demand
- **Artifact matching by reviewer name + content-based fingerprint**: Reviewer field maps 1:1 to artifact filenames. Within each reviewer's artifact, findings are matched to compact return findings using `normalize(section) + normalize(title)` — the same fingerprint used for Phase 3.3 dedup. This avoids relying on fragile order-preserving assumptions between two separate LLM generation acts, and aligns with ce-review's content-based matching approach

## Open Questions

### Resolved During Planning

- **Lean prompt structure**: Adapted from ce-review's proven pattern. Contains: Read instruction for `dispatch-context.md`, inlined persona content, `<review-context>` block with run ID / reviewer name / document type / document path, fallback instruction
- **Evidence loading strategy**: Batch-load all artifact files before Phase 3.3. Simpler than on-demand, data size is small, loaded evidence serves both dedup and headless presentation

### Deferred to Implementation

- **Exact persona content inlining format**: The lean prompt inlines persona content. Implementation will determine whether the full persona file or a trimmed version is used (ce-review inlines the full persona)
- **Cleanup timing**: AGENTS.md says "clean up after successful completion." The exact cleanup point (end of Phase 5 vs separate cleanup instruction) is an implementation detail

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
BEFORE (current):
  SKILL.md loads → @template (~2.3KB) + @schema (~3.5KB) inlined
  Phase 2:
    for each agent:
      fill template({schema}, {doc_content}, {persona}, {doc_type}, {doc_path})
      Agent(filled_template)  → full findings JSON returned inline

AFTER (target):
  SKILL.md loads → backtick refs to template + schema (not inlined)
  Phase 2:
    run_id = generate()
    Read template, Read schema
    Resolve {schema} into template, strip per-agent slots
    Write → .context/.../document-review/{run_id}/dispatch-context.md
    for each agent:
      Agent(lean_prompt: Read dispatch-context.md, persona, doc_path, metadata)
        → agent Reads dispatch-context.md + document from disk
        → agent writes full findings to {run_id}/{reviewer_name}.json
        → agent returns compact JSON (all fields except evidence)
  Phase 3.3:
    Read all {run_id}/*.json artifact files (batch-load evidence)
    Dedup with evidence union from loaded artifacts
  Phase 4 (headless):
    Include evidence from loaded artifacts in output
```

## Implementation Units

- [x] **Unit 1: Add `_meta.return_tiers` to findings-schema.json**

**Goal:** Document the merge/detail tier split in the schema metadata, following ce-review's schema pattern.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/document-review/references/findings-schema.json`

**Approach:**
- Add a `_meta` section with `return_tiers` documenting which fields are merge-tier (returned inline) and which are detail-tier (artifact-only)
- Follow the structure from ce-review's `references/findings-schema.json` `_meta.return_tiers`

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/references/findings-schema.json` `_meta` section

**Test scenarios:**
- Happy path: `bun run release:validate` passes with the updated schema file
- Happy path: `_meta.return_tiers` lists `evidence` as the only detail-tier field, all other finding fields as merge-tier

**Verification:**
- `bun run release:validate` passes
- Schema file is valid JSON

---

- [x] **Unit 2: Restructure subagent-template.md for write-once dispatch + compact returns**

**Goal:** Transform the subagent template to work with path-based dispatch context delivery and produce dual output (artifact file + compact return).

**Requirements:** R1, R2, R3, R4, R5, R9

**Dependencies:** Unit 1 (tier split documented in schema)

**Files:**
- Modify: `plugins/compound-engineering/skills/document-review/references/subagent-template.md`

**Approach:**
- Remove `{schema}` variable slot — schema is pre-resolved into dispatch-context.md
- Remove `{document_content}` variable slot — agents Read the document from `{document_path}` directly
- The template becomes the dispatch context body: review contract, analysis instructions, and output contract with embedded schema
- Add artifact write instruction in the output contract: write full findings JSON (all fields including evidence) to `.context/compound-engineering/document-review/{run_id}/{reviewer_name}.json`
- Add compact return instruction: return the same JSON but omit `evidence` from each finding object
- Add R9 fallback: "If the artifact file write fails, return the full findings JSON including evidence instead of compact returns"
- Update the read-only constraint in the template to: "You are operationally read-only. The one permitted exception is writing your full analysis to the `.context/` artifact path when a run ID is provided." (mirrors ce-review's formulation)
- The artifact path uses `{run_id}` and `{reviewer_name}` as unresolved variable placeholders in the dispatch context. Agents resolve these from the `<review-context>` block in their lean prompt
- Keep `{persona_file}`, `{document_type}`, `{document_path}` as lean-prompt variables (not dispatch-context variables)
- Structure: the template should cleanly separate "dispatch context" content (shared, written to disk) from "lean prompt" variables (per-agent, filled at dispatch time)

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/references/subagent-template.md` — output contract with `return_tiers`, artifact write instruction, compact return format

**Test scenarios:**
- Happy path: Template contains artifact write instruction with correct path pattern (`.context/compound-engineering/document-review/{run_id}/{reviewer_name}.json`)
- Happy path: Template's compact return instruction lists all merge-tier fields and explicitly omits `evidence`
- Edge case: Template includes R9 fallback instruction for artifact write failure
- Happy path: Template no longer contains `{schema}` or `{document_content}` variable slots
- Happy path: Template contains Read instruction for dispatch-context.md path

**Verification:**
- Template file is well-formed Markdown
- Variable slots match the lean prompt structure defined in Unit 3

---

- [x] **Unit 3: Add dispatch context assembly and lean prompt dispatch to SKILL.md**

**Goal:** Write shared content to disk once before dispatch, then spawn agents with lean prompts instead of inlined content.

**Requirements:** R1, R2, R3, R8, R10, R11

**Dependencies:** Unit 2 (template restructured)

**Files:**
- Modify: `plugins/compound-engineering/skills/document-review/SKILL.md`

**Approach:**

*Run ID and directory setup:*
- Add a step before Phase 2 dispatch to generate a run ID (following ce-review's pattern: `date +%Y%m%d-%H%M%S` with random suffix)
- Create `.context/compound-engineering/document-review/{run_id}/` directory

*Dispatch context assembly:*
- Read `references/subagent-template.md` (the dispatch-context portion)
- Read `references/findings-schema.json`
- Resolve schema into the template's schema slot
- Strip per-agent sections: remove `<persona>` and `<review-context>` blocks (which move to the lean prompt), NOT the output contract. The output contract stays in the dispatch context with `{run_id}` and `{reviewer_name}` as unresolved placeholders that agents resolve from their lean prompt metadata
- Write assembled content to `{run_id}/dispatch-context.md`
- R8 fallback: if the write fails, fall back to inline dispatch (current behavior) with a warning

*Lean prompt structure per agent:*
```
Read `.context/compound-engineering/document-review/{run_id}/dispatch-context.md` for your review contract, output schema, and analysis instructions. Read the file BEFORE analyzing the document.

<persona>
{persona content}
</persona>

<review-context>
Run ID: {run_id}
Reviewer name: {reviewer_name}
Document type: {document_type}
Document path: {document_path}
Read the document at {document_path} for the full content.
</review-context>

If the dispatch context file read fails, return {"reviewer": "{reviewer_name}", "findings": [], ...}.
```

*`@` inline removal:*
- Change `@./references/subagent-template.md` to backtick path reference at the bottom of SKILL.md
- Change `@./references/findings-schema.json` to backtick path reference
- This removes ~7.5KB from every message in the session

*R10 and R11:*
- Both interactive and headless modes use the same run ID generation, dispatch context assembly, lean prompt structure, and dispatch code path
- Headless mode already generates arguments; run ID generation is a new shared step

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/SKILL.md` Stage 4 — run ID generation, dispatch context assembly, lean prompt dispatch

**Test scenarios:**
- Happy path: Phase 2 generates a run ID and creates the run directory before dispatching agents
- Happy path: Dispatch context file is written to `.context/compound-engineering/document-review/{run_id}/dispatch-context.md` containing the resolved template with embedded schema
- Happy path: Each agent receives a lean prompt (~1.5KB) instead of the full inlined prompt (~8-25KB)
- Happy path: Lean prompt contains Read instruction for dispatch-context.md, persona content, document path, document type, run ID, and reviewer name
- Edge case: R8 fallback — if dispatch context write fails, agents receive full inline prompts and review proceeds normally
- Integration: Both interactive and headless modes use the same dispatch path, differing only in output format and agent count
- Happy path: `@` inlines at bottom of SKILL.md are replaced with backtick path references
- Happy path: SKILL.md no longer carries ~7.5KB of inlined template/schema content in every message

**Verification:**
- `bun run release:validate` passes
- SKILL.md does not contain `@./references/subagent-template.md` or `@./references/findings-schema.json`
- Phase 2 instructions include run ID generation, dispatch context write, and lean prompt dispatch
- Fallback path exists for dispatch context write failure

---

- [x] **Unit 4: Update synthesis pipeline for artifact-based evidence loading**

**Goal:** Synthesis loads evidence from per-agent artifact files instead of expecting it inline. Handles fallback for inline evidence.

**Requirements:** R6, R9

**Dependencies:** Unit 2 (compact return format), Unit 3 (run ID and artifact path conventions)

**Files:**
- Modify: `plugins/compound-engineering/skills/document-review/references/synthesis-and-presentation.md`

**Approach:**

*Evidence batch-load (new step before Phase 3.3):*
- Evidence batch-load begins only after all dispatched agents have returned their compact JSON
- Read all artifact files at `.context/compound-engineering/document-review/{run_id}/{reviewer_name}.json` for each reviewer in the findings set
- Build an evidence lookup indexed by reviewer name and finding fingerprint (`normalize(section) + normalize(title)`)
- R9 detection: if an artifact file is missing for a reviewer, check whether that reviewer's compact return contains `evidence` arrays in its findings (per-finding check). If the `evidence` key is present and non-empty in a finding, use it directly. If absent, proceed without evidence for that finding (graceful degradation)

*Phase 3.3 dedup update:*
- When unioning evidence for duplicate findings, look up evidence from the batch-loaded artifacts using reviewer name + fingerprint (`normalize(section) + normalize(title)`)
- If evidence is already inline (R9 fallback), use it directly without artifact lookup

*Phase 4 headless update:*
- Headless output includes evidence per finding. Use evidence from the batch-loaded artifacts
- Interactive mode does not render evidence — no change needed

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/SKILL.md` Stage 5 — detail enrichment from artifact files for headless output

**Test scenarios:**
- Happy path: Phase 3.3 loads evidence from artifact files and correctly unions evidence arrays during dedup
- Happy path: Evidence lookup uses reviewer name to locate artifact file and `normalize(section) + normalize(title)` fingerprint to match findings
- Edge case: R9 fallback — if an artifact file is missing but evidence is present inline in the compact return, synthesis uses inline evidence directly
- Edge case: R9 fallback — if an artifact file is missing and evidence is not inline, dedup proceeds without evidence for that finding (graceful degradation)
- Integration: Phase 4 headless output includes evidence loaded from artifacts
- Happy path: Phase 4 interactive output is unchanged (does not render evidence)

**Verification:**
- Synthesis instructions include evidence batch-load step before Phase 3.3
- Phase 3.3 references loaded artifacts for evidence union
- Phase 4 headless references loaded artifacts for evidence presentation
- Fallback paths exist for missing artifacts and inline evidence

---

- [x] **Unit 5: Add "Sub-Agent Communication Patterns" to AGENTS.md**

**Goal:** Document the write-once dispatch + compact returns pattern as guidance for future skills that dispatch multiple agents.

**Requirements:** R12

**Dependencies:** None

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- Add a new section titled "Sub-Agent Communication Patterns" to AGENTS.md
- Document the pattern with two sub-sections: write-once dispatch (shared content to disk, lean prompts per agent) and compact returns (full artifacts to disk, merge-tier fields returned inline)
- Reference ce-review and document-review as implementations
- Include guidance on when to apply (multi-agent dispatch with shared content), tier split decision-making, fallback expectations, and `.context/` artifact conventions
- Keep it concise — this is pattern guidance, not a tutorial

**Patterns to follow:**
- Existing AGENTS.md style and section depth
- The "pass paths, not content" learning (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`)

**Test scenarios:**
- Happy path: `bun run release:validate` passes with the updated AGENTS.md
- Happy path: Section covers write-once dispatch pattern, compact returns pattern, when to apply, and fallback expectations

**Verification:**
- `bun run release:validate` passes
- Section is present in AGENTS.md under a clear heading
- Content references both ce-review and document-review as implementations

## System-Wide Impact

- **Interaction graph:** The dispatch change affects the orchestrator-to-sub-agent interface (prompt content and return format). The synthesis pipeline (Phase 3) consumes the new compact return format. Phase 4 headless consumes evidence from artifacts. No other skills or agents are affected
- **Error propagation:** Two fallback paths: R8 (dispatch context write failure → inline dispatch) and R9 (artifact write failure → full inline returns). Both degrade gracefully to current behavior. Synthesis detects inline evidence and uses it directly
- **State lifecycle risks:** `.context/` artifact files must persist through the full dispatch-synthesis pipeline. Cleanup happens after successful completion per AGENTS.md conventions. No risk of partial-write since each artifact is written atomically by one agent
- **API surface parity:** Document-review's external interface (user invocation, headless output format, findings schema fields) is unchanged. Internal dispatch protocol changes are transparent to callers
- **Integration coverage:** The dispatch → artifact → synthesis → presentation pipeline should be validated end-to-end for both interactive and headless modes
- **Unchanged invariants:** Findings schema field definitions, persona file content, persona routing logic, and interactive presentation output format are explicitly unchanged. Headless output gains evidence lines per finding

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Template restructuring breaks dispatch context assembly | Follow ce-review's template structure closely; verify variable slots match lean prompt |
| Evidence batch-load adds latency before dedup | Artifact files are small (3-5 findings per agent, ~500-2500 bytes each); batch-load is negligible |
| `@` inline removal breaks SKILL.md load for orchestrator | Backtick references ensure template/schema are still accessible; verify SKILL.md loads correctly |
| Lean prompt too sparse for agents to operate | ce-review's lean prompt is proven with similar-complexity reviewers; document-review agents have the same capabilities |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-19-compact-returns-generalization-requirements.md](docs/brainstorms/2026-04-19-compact-returns-generalization-requirements.md)
- Related pattern: `plugins/compound-engineering/skills/ce-review/SKILL.md` (Stage 4 dispatch + compact returns)
- Related schema: `plugins/compound-engineering/skills/ce-review/references/findings-schema.json` (`_meta.return_tiers`)
- Learning: `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`
- Learning: `docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md`
