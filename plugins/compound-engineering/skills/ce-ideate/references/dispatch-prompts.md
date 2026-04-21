# ce-ideate Dispatch Prompts

Sub-agent prompt specifications for Phase 1 and Phase 2 dispatch.

---

## Phase 1: Quick Context Scan

Dispatch using the platform's cheapest capable model (e.g., `model: "haiku"` in Claude Code).

> Read the project's AGENTS.md (or CLAUDE.md only as compatibility fallback, then README.md if neither exists), then discover the top-level directory layout using native file-search tools. Return a concise summary (under 30 lines) covering:
> - project shape (language, framework, top-level directory layout)
> - notable patterns or conventions
> - obvious pain points or gaps
> - likely leverage points for improvement
>
> Keep the scan shallow -- read only top-level documentation and directory structure. Do not analyze GitHub issues, templates, or contribution guidelines. Do not do deep code search.
>
> Focus hint: {focus_hint}

---

## Phase 2: Ideation Sub-Agent Dispatch

Dispatch 3-4 parallel ideation sub-agents on the inherited model (do not tier down). <!-- why: creative ideation needs the orchestrator's reasoning level --> Omit the `mode` parameter. Each targets ~8-10 ideas (yielding ~30 raw ideas, ~20-25 after dedupe). Adjust per-agent targets when volume overrides apply (e.g., "100 ideas" raises it, "top 3" may lower the survivor count instead).

Give each sub-agent: the grounding summary, the focus hint, the per-agent volume target, and an instruction to generate raw candidates only (not critique). Push past obvious first ideas. Ground every idea in the Phase 1 scan.

Assign each sub-agent a different ideation frame as a **starting bias, not a constraint**. Prompt each to begin from its assigned perspective but follow any promising thread.

**Frame selection:**
- **When issue-tracker intent is active and themes were returned:** Each high/medium-confidence theme becomes a frame. Pad with default frames if fewer than 3 cluster-derived frames. Cap at 4 total.
- **Default frames (no issue-tracker intent):** (1) user/operator pain and friction, (2) inversion, removal, or automation of a painful step, (3) assumption-breaking or reframing, (4) leverage and compounding effects.

Ask each sub-agent to return a compact structure per idea: title, summary, why_it_matters, evidence/grounding hooks, optional boldness or focus_fit signal.
