---
name: ce-doc-review
description: Review requirements or plan documents using parallel persona agents that surface role-specific issues. Use when a requirements document or plan document exists and the user wants to improve it.
argument-hint: "[mode:headless] [path/to/document.md]"
---

# Document Review

Review requirements or plan documents through multi-persona analysis. Dispatch specialized reviewer agents in parallel, auto-fix quality issues, and present strategic questions for user decision.

## Phase 0: Detect Mode

Check the skill arguments for `mode:headless`. Arguments may contain a document path, `mode:headless`, or both. Tokens starting with `mode:` are flags, not file paths -- strip them from the arguments and use the remaining token (if any) as the document path for Phase 1.

If `mode:headless` is present, set **headless mode** for the rest of the workflow.

**Headless mode** keeps the same classification boundaries. Non-auto findings change delivery only:
- `auto` fixes are applied silently (same as interactive)
- `present` findings are returned as structured text for the caller to handle -- no AskUserQuestion prompts, no interactive approval
- Phase 5 returns immediately with "Review complete" (no refine/complete question)

Callers invoke headless mode by including `mode:headless` in the skill arguments, e.g.:
```
Skill("compound-engineering:document-review", "mode:headless docs/plans/my-plan.md")
```


If `mode:headless` is not present, run in default interactive mode.

## Phase 1: Get and Analyze Document

**If a document path is provided:** Read it, then proceed.

**If no document is specified (interactive mode):** Ask which document to review, or find the most recent in `docs/brainstorms/` or `docs/plans/` using a file-search/glob tool (e.g., Glob in Claude Code).

**If no document is specified (headless mode):** Output "Review failed: headless mode requires a document path. Re-invoke with: Skill(\"compound-engineering:document-review\", \"mode:headless <path>\")" without dispatching agents.

### Classify Document Type

After reading, classify the document:
- **requirements** -- from `docs/brainstorms/`, focuses on what to build and why
- **plan** -- from `docs/plans/`, focuses on how to build it with implementation details

### Review Personas

| agent-name | trigger | output | focus |
|------------|---------|--------|-------|
| ce-coherence-reviewer | always | structured-json | internal consistency, logic gaps |
| ce-feasibility-reviewer | always | structured-json | technical viability, risks |
| ce-product-lens-reviewer | conditional: challengeable premise claims or strategic weight | structured-json | product direction, opportunity cost |
| ce-design-lens-reviewer | conditional: UI/UX, user flows, or visual design references | structured-json | design quality, interaction patterns |
| ce-security-lens-reviewer | conditional: auth, data handling, or trust boundaries | structured-json | security posture, threat surface |
| ce-scope-guardian-reviewer | conditional: multiple priority tiers, large scope, or misaligned boundaries | structured-json | scope control, priority alignment |
| ce-adversarial-document-reviewer | conditional: 5+ requirements, explicit rationale, high-stakes domains, or new abstractions | structured-json | assumptions, blind spots, weak rationale |

### Select Conditional Personas

Read `references/persona-routing.md` and identify all conditional agents whose criteria match the document under review. Combine the matching conditional agents with the two always-on agents (coherence-reviewer, feasibility-reviewer) to form the review team.

If `references/persona-routing.md` cannot be read, dispatch always-on agents only and note the read failure.

## Phase 2: Announce and Dispatch Personas

### Announce the Review Team

Tell the user which personas will review and why. For conditional personas, include the justification (use the cartouche focus field for always-on agents):

```
Reviewing with:
- coherence-reviewer (always-on)
- feasibility-reviewer (always-on)
- scope-guardian-reviewer -- plan has 12 requirements across 3 priority levels
- security-lens-reviewer -- plan adds API endpoints with auth flow
```

### Generate Run ID and Assemble Dispatch Context

Generate a unique run ID and assemble shared dispatch content before spawning agents:

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
mkdir -p ".context/compound-engineering/document-review/$RUN_ID"
```

Assemble the dispatch context:
1. Read `references/subagent-template.md` (the template body inside the code block)
2. Read `references/findings-schema.json`
3. Resolve `{schema}` in the template with the full schema content
4. Strip `<persona>` and `<review-context>` blocks (these move to the lean prompt)
5. Keep the preamble and `<output-contract>` -- the output contract stays in the dispatch context with `{run_id}` and `{reviewer_name}` as unresolved placeholders that agents resolve from their lean prompt metadata
6. Write the assembled content to `.context/compound-engineering/document-review/{run_id}/dispatch-context.md`

**R8 fallback:** If the dispatch context write fails, fall back to inline dispatch -- fill the full template per agent with all variables resolved (current behavior) and dispatch without disk artifacts. Warn the user that compact returns are disabled for this run.

### Dispatch

Dispatch all agents in **parallel** using the platform's task/agent tool (e.g., Agent tool in Claude Code, spawn in Codex). Omit the `mode` parameter so the user's configured permission settings apply.

Each agent receives a **lean prompt** instead of the full inlined template:

```
Read `.context/compound-engineering/document-review/{run_id}/dispatch-context.md` for your review contract, output schema, and analysis instructions. Read the file BEFORE analyzing the document.

<persona>
{persona_file}
</persona>

<review-context>
Run ID: {run_id}
Reviewer name: {reviewer_name}
Document type: {document_type}
Document path: {document_path}
Read the document at {document_path} for the full content.
</review-context>

If the dispatch context file read fails, return {"reviewer": "{reviewer_name}", "findings": [], "residual_risks": [], "deferred_questions": []}.
```

| Variable | Value |
|----------|-------|
| `{persona_file}` | Full content of the agent's markdown file |
| `{document_type}` | "requirements" or "plan" from Phase 1 classification |
| `{document_path}` | Path to the document |
| `{run_id}` | The generated run ID |
| `{reviewer_name}` | Agent short name (e.g., "coherence", "feasibility") |

**Error handling:** If an agent fails or times out, proceed with findings from agents that completed. Note the failed agent in the Coverage section. Do not block the entire review on a single agent failure.

**Dispatch limit:** Even at maximum (7 agents), use parallel dispatch.

## Phases 3-5: Synthesis, Presentation, and Next Action

After all dispatched agents return, read `references/synthesis-and-presentation.md` for the synthesis pipeline (validate, gate, dedup, promote, resolve contradictions, route by autofix class), auto-fix application, finding presentation, and next-action menu. Pass the run ID to the synthesis pipeline for artifact-based evidence loading. Do not load this file before agent dispatch completes.

After Phase 5 completes successfully, clean up the run directory:
```bash
rm -rf ".context/compound-engineering/document-review/$RUN_ID"
```

---

## Reference Files

- Subagent template: `references/subagent-template.md`
- Findings schema: `references/findings-schema.json`
- Synthesis pipeline: `references/synthesis-and-presentation.md`
- Persona routing: `references/persona-routing.md`
- Review output template: `references/review-output-template.md`
