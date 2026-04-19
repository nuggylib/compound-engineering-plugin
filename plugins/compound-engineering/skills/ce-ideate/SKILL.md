---
name: ce-ideate
description: "Generate and critically evaluate grounded improvement ideas for the current project. Use when asking what to improve, requesting idea generation, or wanting AI-suggested project directions."
argument-hint: "[feature, focus area, or constraint]"
---

# Generate Improvement Ideas

`ce-ideate` precedes `ce-brainstorm`.

- `ce-ideate` answers: "What are the strongest ideas worth exploring?"
- `ce-brainstorm` answers: "What exactly should one chosen idea mean?"
- `ce-plan` answers: "How should it be built?"

Produce a ranked ideation artifact in `docs/ideation/`. Do **not** produce requirements, plans, or code.

## Interaction Method

Use the platform question tool when available (AskUserQuestion / request_user_input / ask_user). Fallback: present numbered options and wait for a reply.

Ask one question at a time. Prefer concise single-select choices when natural options exist.

## Focus Hint

<focus_hint> #$ARGUMENTS </focus_hint>

Interpret any provided argument as optional context. It may be:

- a concept such as `DX improvements`
- a path such as `plugins/compound-engineering/skills/`
- a constraint such as `low-complexity quick wins`
- a volume hint such as `top 3`, `100 ideas`, or `raise the bar`

If no argument is provided, proceed with open-ended ideation.

## Core Principles

1. **Ground before ideating** - Scan the actual codebase first. Do not generate abstract product advice detached from the repository.
2. **Generate many -> critique all -> explain survivors only** - Use explicit rejection with reasons, not optimistic ranking.
3. **Route action into brainstorming** - Do not skip to planning from ideation output.

## Execution Flow

### Phase 0: Resume and Scope

#### 0.1 Check for Recent Ideation Work

Look in `docs/ideation/` for ideation documents created within the last 30 days.

Treat a prior ideation doc as relevant when:
- the topic matches the requested focus
- the path or subsystem overlaps the requested focus
- the request is open-ended and there is an obvious recent open ideation doc
- the issue-grounded status matches: do not offer to resume a non-issue ideation when the current argument indicates issue-tracker intent, or vice versa — treat these as distinct topics

If a relevant doc exists, ask whether to:
1. continue from it
2. start fresh

If continuing:
- read the document
- summarize what has already been explored
- preserve previous idea statuses
- update the existing file instead of creating a duplicate

#### 0.2 Classify Subject Mode

Classify the **subject of ideation** (what the user wants ideas about), not the environment. A user inside any repo can ideate about something unrelated to that repo; a user in `/tmp` can ideate about code they hold in their head.

Make two sequential binary decisions, enumerating negative signals at each:

**Decision 1 — repo-grounded vs elsewhere.** Weigh prompt content first, topic-repo coherence second, and CWD repo presence as supporting evidence only.

- Positive signals for **repo-grounded**: prompt references repo files, code, architecture, modules, tests, or workflows; topic is clearly bounded by the current codebase.
- Negative signals (push toward **elsewhere**): prompt names things absent from the repo (pricing, naming, narrative, business model, personal decisions, brand, content, market positioning); topic is creative, business, or personal with no code surface.

**Decision 2 (only fires if Decision 1 = elsewhere) — software vs non-software.** Classify by whether the *subject* of ideation is a software artifact or system, not by where the individual ideas will eventually land. If the topic concerns a product, app, SaaS, web/mobile UI, feature, page, or service, it is **elsewhere-software** — even when the ideas themselves are about copy, UX, CRO, pricing, onboarding, visual design, or positioning *for that software product*. **Elsewhere-non-software** is reserved for topics with no software surface at all: company or brand naming (independent of product), narrative and creative writing, personal decisions, non-digital business strategy, physical-product design.

Sample classifications:

- "Improve conversion on our sign-up page" → elsewhere-software (the subject is a page)
- "Redesign the onboarding flow" → elsewhere-software (the subject is a flow)
- "Pricing page A/B test ideas" → elsewhere-software (the subject is a page)
- "Features to add to our note-taking app" → elsewhere-software
- "Name my new coffee shop" → elsewhere-non-software (the subject is a brand)
- "Plot ideas for a short story" → elsewhere-non-software (the subject is a narrative)
- "Options for my next career move" → elsewhere-non-software (the subject is a personal decision)

State the inferred approach in one sentence at the top, using plain language the user will recognize. Never print the internal taxonomy label (`repo-grounded`, `elsewhere-software`, `elsewhere-non-software`) to the user — those names are for routing only. Adapt the template below to the actual topic; pick a domain word from the topic itself (e.g., "landing page", "onboarding flow", "naming", "career decision") instead of a mode label.

- **Repo-grounded:** "Treating this as a topic in this codebase — about X. Say 'actually this is outside the repo' to switch."
- **Elsewhere-software:** "Treating this as a product/software topic outside this repo — about X. Say 'actually this is about this repo' or 'actually this has no software surface' to switch."
- **Elsewhere-non-software:** "Treating this as a [naming | narrative | business | personal] topic — about X. Say 'actually this is about a software product' or 'actually this is about this repo' to switch."

The correction hints must also be plain language ("actually this is outside the repo", "actually this is about this repo"), not internal labels ("actually elsewhere-software").

**Active confirmation on ambiguity (V16).** When classifier confidence is low — single-keyword or short prompts mapping cleanly to either mode (`/ce-ideate ideas`, `/ce-ideate ideas for the docs`), conflicting CWD/prompt signals, or topic mentioning both repo-internal and external surfaces — ask one confirmation question via the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini) **before dispatching Phase 1 grounding**. For clear cases the one-sentence inferred-mode statement is sufficient; do not ask.

Sample wording (refine to fit the prompt at hand; follow the Interactive Question Tool Design rules in the plugin AGENTS.md — self-contained labels, max 4, third person, front-loaded distinguishing word, no leaked internal mode names):

- **Stem:** "What should the agent ideate about?"
- **Options:**
  - "Code in this repository — features, refactors, architecture"
  - "A topic outside this repository — business, design, content, personal decisions"
  - "Cancel — let me rephrase the prompt"

If the user confirms or selects "elsewhere," still run Decision 2 to choose between elsewhere-software and elsewhere-non-software.

**Routing rule.** When Decision 2 = non-software, still run Phase 1 Elsewhere-mode grounding (user-context synthesis + web-research by default; skip phrases honored). Learnings-researcher is skipped by default in this mode — the CWD's `docs/solutions/` rarely transfers to naming, narrative, personal, or non-digital business topics; see Phase 1 for the full rationale. Then load `references/universal-ideation.md` and follow it in place of Phase 2's software frame dispatch and the Phase 6 menu narrative. This load is non-optional — the file contains the domain-agnostic generation frames, critique rubric, and wrap-up menu that replace Phase 2 and the post-ideation menu for this mode, and none of those details live in this main body. Improvising from memory produces the wrong facilitation for non-software topics. Do not run the repo-specific codebase scan at any point. The §6.5 Proof Failure Ladder in `references/post-ideation-workflow.md` still applies — load and follow it whenever a Proof save (the elsewhere-mode default for Save and end) fails, so the local-save fallback path stays reachable in non-software elsewhere runs.

If any prompt-broadening or intake step (0.4 below) materially changes the topic, re-evaluate the mode statement before dispatching Phase 1 — classify on the scope to be acted on, not the scope at first read.

#### 0.3 Interpret Focus and Volume

Infer three things from the argument:

- **Focus context** - concept, path, constraint, or open-ended
- **Volume override** - any hint that changes candidate or survivor counts
- **Issue-tracker intent** - whether the user wants issue/bug data as an input source. **Repo-mode only** — do not trigger in elsewhere mode.

Issue-tracker intent triggers when the argument's primary intent is about analyzing issue patterns: `bugs`, `github issues`, `open issues`, `issue patterns`, `what users are reporting`, `bug reports`, `issue themes`.

Do NOT trigger on arguments that merely mention bugs as a focus: `bug in auth`, `fix the login issue`, `the signup bug` — these are focus hints, not requests to analyze the issue tracker.

When combined (e.g., `top 3 bugs in authentication`): detect issue-tracker intent first, volume override second, remainder is the focus hint.

Default volume:
- each ideation sub-agent generates about 6-8 ideas (yielding ~36-48 raw ideas across 6 frames in the default path, or ~24-32 across 4 frames in issue-tracker mode; roughly 25-30 survivors after dedupe in the 6-frame path and fewer in the 4-frame path)
- keep the top 5-7 survivors

Honor clear overrides such as:
- `top 3`
- `100 ideas`
- `go deep`
- `raise the bar`

Use reasonable interpretation rather than formal parsing.

<!-- why: cartouche routing table + extracted dispatch prompts for token efficiency -->
### Dispatched Agents

| agent-name | trigger | output | focus |
|------------|---------|--------|-------|
| Quick context scan (anonymous) | always | codebase-summary | project shape, patterns, pain points |
| compound-engineering:research:learnings-researcher | always | research-summary | institutional learnings from docs/solutions/ |
| compound-engineering:research:issue-intelligence-analyst | conditional: issue-tracker intent detected | issue-themes | issue patterns, trends, theme clusters |
| compound-engineering:research:slack-researcher | opt-in: Slack available + user requested | research-summary | organizational context from Slack |
| Ideation sub-agents (3-4 anonymous) | always in Phase 2 | raw-candidates | divergent idea generation per frame |

### Phase 1: Codebase Scan

Before generating ideas, gather codebase context. Run agents in parallel in the **foreground** (do not use background dispatch).

Read `references/dispatch-prompts.md` for the Phase 1 quick context scan prompt. Dispatch `Quick context scan` using the platform's cheapest capable model (e.g., `model: "haiku"` in Claude Code) with that prompt, substituting `{focus_hint}`.

Dispatch `learnings-researcher` with a brief summary of the ideation focus.

If issue-tracker intent was detected in Phase 0.2, dispatch `issue-intelligence-analyst` with the focus hint in parallel with the other agents. On error (gh not installed, no remote, auth failure), log a warning ("Issue analysis unavailable: {reason}. Proceeding with standard ideation.") and continue. If fewer than 5 total issues, note "Insufficient issue signal for theme analysis" and proceed with default ideation frames in Phase 2.

Consolidate results into a short grounding summary with distinct sections: codebase context, past learnings, and issue intelligence (when present -- preserve theme titles, descriptions, issue counts, trend directions).

**Slack context** (opt-in) -- never auto-dispatch. Route by condition:

- **Tools available + user asked**: Dispatch `slack-researcher` with the focus hint in parallel. Include findings in the grounding summary.
- **Tools available + user didn't ask**: Note: "Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt."
- **No tools + user asked**: Note: "Slack context was requested but no Slack tools are available. Install and authenticate the Slack plugin to enable organizational context search."

Issue intelligence does not apply in elsewhere mode. Slack research is opt-in for both modes (see "Slack context" below).

#### Web Research (V5, V15)

Always-on for both modes. Skip when the user said "no external research", "skip web research", or equivalent in their prompt or earlier answers; in that case, omit `ce-web-researcher` from dispatch and note the skip in the consolidated grounding summary.

Reuse prior web research within a session via a sidecar cache — see `references/web-research-cache.md` for the cache file shape, reuse check, append behavior, and platform-degradation rules. Read it the first time `ce-web-researcher` would be dispatched in this run (and on every subsequent dispatch where the cache might apply).

When dispatching `ce-web-researcher`, pass: the focus hint, a brief planning context summary (one or two sentences), and the mode. Do not pass codebase content — the agent operates externally.

#### Consolidated Grounding Summary

Consolidate all dispatched results into a short grounding summary using these sections (omit any section that produced nothing):

- **Codebase context** *(repo mode)* OR **Topic context** *(elsewhere mode)* — project/topic shape, notable patterns or stated constraints, pain points, leverage points
- **Past learnings** — relevant institutional knowledge from `docs/solutions/`
- **Issue intelligence** *(when present, repo mode only)* — theme summaries with titles, descriptions, issue counts, and trend directions
- **External context** *(when web research ran)* — prior art, adjacent solutions, market signals, cross-domain analogies. Note "(reused from earlier dispatch)" when V15 reuse fired
- **Slack context** *(when present)* — organizational context

**Failure handling.** Grounding agent failures follow "warn and proceed" — never block on grounding failure. If `ce-web-researcher` fails (network, tool unavailable), log a warning ("External research unavailable: {reason}. Proceeding with internal grounding only.") and continue. If elsewhere-mode intake produced no usable context, note in the grounding summary that context is thin so Phase 2 sub-agents can compensate with broader generation.

**Slack context** (opt-in, both modes) — never auto-dispatch. When the user asks for Slack context and Slack tools are available (look for any `slack-researcher` agent or `slack` MCP tools in the current environment), dispatch `ce-slack-researcher` with the focus hint in parallel with other Phase 1 agents. When tools are present but the user did not ask, mention availability in the grounding summary so they can opt in. When the user asked but no Slack tools are reachable, surface the install hint instead.

### Phase 2: Divergent Ideation

Generate the full candidate list before critiquing any idea.

Read `references/dispatch-prompts.md` for Phase 2 ideation sub-agent dispatch instructions, including frame selection rules, per-agent prompt structure, and volume adjustment. Dispatch `Ideation sub-agents` accordingly.

After all sub-agents return:

1. Merge and dedupe into one master candidate list.
2. Synthesize cross-cutting combinations -- scan for ideas from different frames that combine into something stronger (expect 3-5 additions at most).
3. If a focus was provided, weight the merged list toward it without excluding stronger adjacent ideas.
4. Spread ideas across multiple dimensions when justified: workflow/DX, reliability, extensibility, missing capabilities, docs/knowledge compounding, quality/maintenance, leverage on future work.

**Checkpoint A (V17).** Immediately after the cross-cutting synthesis step completes and the raw candidate list is consolidated, write `<scratch-dir>/raw-candidates.md` (using the absolute path captured in Phase 1) containing the full candidate list with sub-agent attribution. This protects the most expensive output (6 parallel sub-agent dispatches + dedupe) before Phase 3 critique potentially compacts context. Best-effort: if the write fails (disk full, permissions), log a warning and proceed; the checkpoint is not load-bearing. Not cleaned up at the end of the run (the run directory is preserved so the V15 cache remains reusable across run-ids in the same session — see Phase 6).

After merging and synthesis — and before presenting survivors — load `references/post-ideation-workflow.md`. This load is non-optional. The file contains the adversarial filtering rubric, artifact template, quality bar, and the canonical Phase 6 handoff menu (Refine, Open and iterate in Proof, Brainstorm, Save and end) — these options do not appear anywhere in this main body. Skipping the load silently degrades every subsequent step; the agent improvises the menu from memory instead of presenting the documented options. "Quickly" means fewer Phase 2 sub-agents, not skipping references. Do not load this file before Phase 2 agent dispatch completes.
