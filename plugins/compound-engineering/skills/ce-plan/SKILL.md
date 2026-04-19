---
name: ce-plan
description: "Create structured implementation plans from requirements, feature descriptions, or any multi-step task. Use when the user wants to plan work, break down a feature, or deepen an existing plan."
argument-hint: "[optional: feature description, requirements doc path, plan path to deepen, or any task to plan]"
---

# Create Technical Plan

`ce-brainstorm` defines **WHAT** to build. `ce-plan` defines **HOW** to build it. `ce-work` executes the plan. A prior brainstorm is useful context but never required — `ce-plan` works from any input: a requirements doc, a bug report, a feature idea, or a rough description.

**When directly invoked, always plan.** Never classify a direct invocation as "not a planning task" and abandon the workflow. If the input is unclear, ask clarifying questions or use the planning bootstrap (Phase 0.4) to establish enough context — but always stay in the planning workflow.

This workflow produces a durable implementation plan. During planning, do not implement code, run tests, or learn from execution-time results. If the answer depends on changing code and seeing what happens, that belongs in `ce-work`, not here.

<!-- why: Kolmogorov compression -- trigger phrases recoverable from description -->
## When to Use

Trigger on planning intent ("plan this", "create a plan", "how should we build", "break this down"), deepening intent ("deepen the plan", "deepening pass"), non-software planning ("plan a trip"), or when a brainstorm/requirements doc is ready for implementation planning.

## Interaction Method

Use the platform question tool when available (AskUserQuestion / request_user_input / ask_user). Fallback: present numbered options and wait for a reply.

Ask one question at a time. Prefer a concise single-select choice when natural options exist.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to plan? Describe the task, goal, or project you have in mind." Then wait for their response before continuing.

If the input is present but unclear or underspecified, do not abandon — ask one or two clarifying questions, or proceed to Phase 0.4's planning bootstrap to establish enough context. The goal is always to help the user plan, never to exit the workflow.

**IMPORTANT: All file references must use repo-relative paths (e.g., `src/models/user.rb`), never absolute paths. See Planning Rules (§4.3) for details.**

<!-- why: Kolmogorov compression -- kept 3 non-obvious principles with detail, compressed engineering defaults -->
## Core Principles

1. **Use requirements as the source of truth** -- build from origin docs rather than re-inventing behavior.
2. **Decisions, not code** -- capture approach, boundaries, files, dependencies, risks, and test scenarios. Pseudo-code sketches are welcome as directional guidance when they help validate direction, but must not be framed as implementation specification.
3. **Research before structuring** -- explore codebase, learnings, and external guidance before finalizing.
4. **Right-size the artifact** -- small work gets compact plans, large work gets more structure.
5. **Separate planning from execution discovery** -- resolve planning-time questions here; explicitly defer execution-time unknowns to implementation.
6. **Keep the plan portable** -- no tool-specific executor instructions.
7. **Carry execution posture lightly when it matters** -- reflect test-first or characterization-first as lightweight signals when clearly implied, not step-by-step choreography.

## Plan Quality Bar

Every plan should contain:
- A clear problem frame and scope boundary
- Concrete requirements traceability back to the request or origin document
- Repo-relative file paths for the work being proposed (never absolute paths — see Planning Rules)
- Explicit test file paths for feature-bearing implementation units
- Decisions with rationale, not just tasks
- Existing patterns or code references to follow
- Enumerated test scenarios for each feature-bearing unit, specific enough that an implementer knows exactly what to test without inventing coverage themselves
- Clear dependencies and sequencing

A plan is ready when an implementer can start confidently without needing the plan to write the code for them.

## Workflow

<!-- why: Kolmogorov compression -- compressed process prose, kept deepen trigger, non-software routing, relevance criteria, carry-forward list, symptom/debug routing, depth levels -->
### Phase 0: Resume, Source, and Scope

#### 0.1 Resume Existing Plan Work When Appropriate

If the user references an existing plan or a recent match exists in `docs/plans/`: read it, confirm update-in-place vs new plan, preserve completed checkboxes.

**Deepen intent:** "deepen" (or "deepening") in reference to a plan triggers the fast path. Target is a **plan** in `docs/plans/`, not a requirements doc. Words like "strengthen", "confidence", "gaps", "rigor" alone are NOT sufficient -- only trigger when the request clearly targets the plan as a whole without naming a specific section. Prefer to confirm before entering deepening flow.

Once the plan is identified and appears complete (all sections present, units defined, `status: active`):
- No YAML frontmatter (non-software plan) -> route to `references/universal-planning.md`
- Otherwise -> short-circuit to Phase 5.3 in **interactive mode**

Normal editing requests (specific sections) follow standard resume flow. Existing `deepened: YYYY-MM-DD` field does not force re-deepening.

#### 0.1b Classify Task Domain

Software (code, repos, APIs, databases, build/modify/deploy) -> Phase 0.2. Non-software multi-step goal -> `references/universal-planning.md`. Ambiguous -> ask. Non-planning (only when auto-selected) -> respond directly; when directly invoked, always plan.

#### 0.2 Find Upstream Requirements Document

Search `docs/brainstorms/*-requirements.md`. Relevance: semantic topic match + created within 30 days (override with judgment if clearly relevant/stale) + same user problem/scope. Multiple matches -> ask which to use.

#### 0.3 Use the Source Document as Primary Input

If relevant requirements doc exists: read thoroughly, announce as origin document, carry forward:
- Problem frame, requirements/success criteria, scope boundaries, key decisions/rationale, dependencies/assumptions, outstanding questions (blocking vs deferred classification preserved)

Reference carried-forward decisions with `(see origin: <source-path>)`. Scan each origin section before finalizing to verify nothing silently dropped.

No requirements doc -> proceed from user's request directly.

#### 0.4 Planning Bootstrap (No Requirements Doc or Unclear Input)

If clear enough -> Phase 0.5. Product-framing ambiguity -> recommend `ce-brainstorm` (always offer to continue here). Bootstrap establishes: problem frame, intended behavior, scope boundaries, success criteria, blocking questions.

Routing when bootstrap reveals a different workflow fits better:
- **Symptom without root cause** -> announce and load `ce:debug` ("This needs investigation before planning -- switching to ce:debug to find the root cause")
- **Clear task ready to execute** -> suggest `ce:work` as faster alternative; user decides

Major unresolved product questions -> recommend `ce-brainstorm` again; if user continues, require explicit assumptions.

#### 0.5 Classify Outstanding Questions Before Planning

Review origin doc `Resolve Before Planning` questions. Reclassify as planning-owned only if technical/architectural/research. Keep as blocker if it changes product behavior/scope/criteria.

True product blockers remain -> surface, ask: (1) resume `ce-brainstorm` to resolve, or (2) convert to explicit assumptions. Do not continue while blockers remain.

#### 0.6 Assess Plan Depth

- **Lightweight** -- small, well-bounded, low ambiguity
- **Standard** -- normal feature or bounded refactor with technical decisions
- **Deep** -- cross-cutting, strategic, high-risk, or highly ambiguous

Unclear -> ask one targeted question, then continue.

<!-- why: Kolmogorov compression -- compressed research dispatch, kept parallel agents, Slack opt-in, posture detection, reclassify rule, flow analysis conditional -->
### Phase 1: Gather Context

#### 1.1 Local Research (Always Runs)

Prepare a concise planning context summary from origin doc or feature description. Run in parallel:

- Task compound-engineering:research:repo-research-analyst(Scope: technology, architecture, patterns. {planning context summary})
- Task compound-engineering:research:learnings-researcher(planning context summary)

Collect: technology stack/versions, architectural patterns, implementation patterns/files/tests, AGENTS.md guidance, institutional learnings from `docs/solutions/`.

**Slack context** (opt-in) -- never auto-dispatch. Dispatch `compound-engineering:research:slack-researcher` only when tools available and user asked.

#### 1.1b Detect Execution Posture Signals

Look for: explicit TDD/test-first/characterization-first request, origin doc calling for test-first, legacy/weakly-tested target area. When clear, carry forward silently in implementation units. Ask only if posture would materially change sequencing and cannot be inferred.

#### 1.2 Decide on External Research

<!-- why: Kolmogorov compression -- compressed conditional routing to rules + kept exact-identifier and monorepo constraints -->
Use repo-research-analyst's Technology & Infrastructure summary to sharpen external research: pass detected framework+version identifiers to framework-docs-researcher. Well-established layers -> lean skip; absent/thin -> lean research. In monorepos, scope to the relevant service's tech context, not the aggregate.

<!-- why: Kolmogorov compression -- collapsed always/skip to decision rule -->
**Decision rule:** External research when high-risk (security, payments, privacy, external APIs, migrations, compliance), thin local patterns (<3 direct examples), adjacent-domain gap (frame research around the gap, not the general technology), unfamiliar territory, or absent/thin technology layer. Skip when strong local patterns exist, user knows intended shape, or technology well-established.

Announce briefly before continuing.

#### 1.3 External Research (Conditional)

If 1.2 indicates useful, run in parallel:

- Task ce-best-practices-researcher(planning context summary)
- Task ce-framework-docs-researcher(planning context summary)

#### 1.4 Consolidate Research

Summarize: codebase patterns/file paths, institutional learnings, Slack context (if gathered), external references (if gathered), related issues/PRs, material constraints.

#### 1.4b Reclassify Depth When Research Reveals External Contract Surfaces

Reclassify **Lightweight** to **Standard** if work touches: environment variables consumed by external systems/CI, exported public APIs/CLI flags, CI/CD config, shared types imported downstream, or externally-linked documentation. Announce briefly.

#### 1.5 Flow and Edge-Case Analysis (Conditional)

For **Standard** or **Deep** plans, or unclear user flow completeness:

- Task ce-spec-flow-analyzer(planning context summary, research findings)

Use output to identify missing edge cases, state transitions, handoff gaps. Add only flow details that materially improve the plan.

### Phase 2: Resolve Planning Questions

Build a planning question list from:
- Deferred questions in the origin document
- Gaps discovered in repo or external research
- Technical decisions required to produce a useful plan

For each question, decide whether it should be:
- **Resolved during planning** - the answer is knowable from repo context, documentation, or user choice
- **Deferred to implementation** - the answer depends on code changes, runtime behavior, or execution-time discovery

Ask the user only when the answer materially affects architecture, scope, sequencing, or risk and cannot be responsibly inferred (see Interaction Method).

**During planning:** do not run tests, build the app, or probe runtime behavior. The goal is a strong plan, not partial execution.

<!-- why: Kolmogorov compression -- kept filename convention, unit sizing criteria, technical design table, test scenario categories, compressed standard structuring -->
### Phase 3: Structure the Plan

#### 3.1 Title and File Naming

Draft conventional title (`feat: ...`, `fix: ...`). Filename: `docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md` -- zero-padded 3-digit sequence starting at 001, 3-5 word kebab-cased descriptive name. Create `docs/plans/` if needed.

#### 3.2 Stakeholder and Impact Awareness

For **Standard**/**Deep**: consider affected parties (users, devs, ops, teams). Cross-cutting -> note in System-Wide Impact.

#### 3.3 Break Work into Implementation Units

Each unit = one meaningful atomic-commit-sized change. Good: focused on one component/behavior/seam, small file cluster, dependency-ordered, concrete for execution, checkbox syntax. Avoid: 2-5 minute micro-steps, multi-concern spans, vague units.

#### 3.4 High-Level Technical Design (Optional)

Communicates solution *shape* without dictating implementation. "Directional guidance for review, not implementation specification."

| Work involves... | Best overview form |
|---|---|
| DSL or API surface design | Pseudo-code grammar or contract sketch |
| Multi-component integration | Mermaid sequence or component diagram |
| Data pipeline or transformation | Data flow sketch |
| State-heavy lifecycle | State diagram |
| Complex branching logic | Flowchart |
| Mode/flag combinations or multi-input behavior | Decision matrix (inputs -> outcomes) |
| Single-component with non-obvious shape | Pseudo-code sketch |

Skip for well-patterned, CRUD, or lightweight work.

#### 3.4b Output Structure (Optional)

Include when plan creates 3+ new files in a new directory hierarchy and the layout is a meaningful design decision. Skip when modifying existing files or creating 1-2 files in existing directories. Scope declaration, not constraint -- per-unit Files remain authoritative.

#### 3.5 Define Each Implementation Unit

Required fields: **Goal**, **Requirements** (R1, R2...), **Dependencies**, **Files** (repo-relative, never absolute; include test file for feature-bearing units), **Approach**, **Patterns to follow**, **Test scenarios**, **Verification** (outcomes, not shell scripts).

Optional fields: **Execution note** (only for non-default posture: test-first, characterization-first -- do not expand into RED/GREEN/REFACTOR substeps), **Technical design** (directional guidance when prose alone is ambiguous).

**Test scenarios:** Right-size to unit complexity. Each scenario names input, action, expected outcome. Categories (include all that apply):
- **Happy path** -- core inputs/outputs
- **Edge cases** -- boundaries, empty, nil, concurrency
- **Error/failure paths** -- invalid input, service failures, timeouts, permission denials
- **Integration** -- cross-layer behaviors mocks alone won't prove (callbacks, middleware, multi-layer)

For no behavioral change: `Test expectation: none -- [reason]`.

#### 3.6 Keep Planning-Time and Implementation-Time Unknowns Separate

Record explicitly under deferred implementation notes: exact method names, final SQL, runtime behavior depending on test failures, refactors that may become unnecessary.

### Phase 4: Write the Plan

**NEVER CODE during this skill.** Research, decide, and write the plan — do not start implementation.

Use one planning philosophy across all depths. Change the amount of detail, not the boundary between planning and execution.

#### 4.1 Plan Depth Guidance

**Lightweight**
- Keep the plan compact
- Usually 2-4 implementation units
- Omit optional sections that add little value

**Standard**
- Use the full core template, omitting optional sections (including High-Level Technical Design) that add no value for this particular work
- Usually 3-6 implementation units
- Include risks, deferred questions, and system-wide impact when relevant

**Deep**
- Use the full core template plus optional analysis sections where warranted
- Usually 4-8 implementation units
- Group units into phases when that improves clarity
- Include alternatives considered, documentation impacts, and deeper risk treatment when warranted

#### 4.1b Optional Deep Plan Extensions

For sufficiently large, risky, or cross-cutting work, add the sections that genuinely help:
- **Alternative Approaches Considered**
- **Success Metrics**
- **Dependencies / Prerequisites**
- **Risk Analysis & Mitigation**
- **Phased Delivery**
- **Documentation Plan**
- **Operational / Rollout Notes**
- **Future Considerations** only when they materially affect current design

Do not add these as boilerplate. Include them only when they improve execution quality or stakeholder alignment.

<!-- why: Kolmogorov compression -- kept all section headings and field names (load-bearing), compressed inline comments and per-field descriptions that duplicate Phase 3.5 guidance -->
#### 4.2 Core Plan Template

Omit clearly inapplicable optional sections, especially for Lightweight plans. Unit field semantics defined in Phase 3.5. Test scenarios: include only applicable categories; for no behavioral change use `Test expectation: none -- [reason]`.

```markdown
---
title: [Plan Title]
type: [feat|fix|refactor]
status: active
date: YYYY-MM-DD
origin: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md
deepened: YYYY-MM-DD
---

# [Plan Title]

## Overview
## Problem Frame
## Requirements Trace
- R1. [Requirement]

## Scope Boundaries
### Deferred to Separate Tasks

## Context & Research
### Relevant Code and Patterns
### Institutional Learnings
### External References

## Key Technical Decisions
## Open Questions
### Resolved During Planning
### Deferred to Implementation

## Output Structure
## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

## Implementation Units

- [ ] **Unit 1: [Name]**

**Goal:** **Requirements:** **Dependencies:** **Files:** (Create/Modify/Test)
**Approach:** **Execution note:** **Technical design:**
**Patterns to follow:** **Test scenarios:** **Verification:**

## System-Wide Impact
- **Interaction graph:** **Error propagation:** **State lifecycle risks:**
- **API surface parity:** **Integration coverage:** **Unchanged invariants:**

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|

## Documentation / Operational Notes
## Sources & References
```

For `Deep` plans, extend with: Alternative Approaches Considered, Success Metrics, Dependencies / Prerequisites, Risk Analysis & Mitigation (Likelihood/Impact), Phased Delivery, Documentation Plan, Operational / Rollout Notes. Include only when they improve execution quality.

<!-- why: Kolmogorov compression -- kept non-obvious rules, compressed standard items -->
#### 4.3 Planning Rules

- **All file paths must be repo-relative** — never absolute paths. When targeting a different repo, state it once at the top and use repo-relative paths throughout. Cross-repo plans follow the same rule
- Prefer path plus class/component/pattern references over brittle line numbers
- No implementation code (imports, exact signatures, framework syntax). Pseudo-code and DSL grammars allowed in Technical Design sections as directional guidance only
- No git commands, commit messages, exact test recipes, or micro-step RED/GREEN/REFACTOR instructions
- Mermaid diagrams encouraged for relationships/flows that prose alone makes hard to follow
- Keep units checkable with `- [ ]` syntax; do not fake certainty on execution-time unknowns

#### 4.4 Visual Communication in Plan Documents

When the plan contains 4+ implementation units with non-linear dependencies, 3+ interacting surfaces in System-Wide Impact, 3+ behavioral modes/variants in Overview or Problem Frame, or 3+ interacting decisions in Key Technical Decisions or alternatives in Alternative Approaches, read `references/visual-communication.md` for diagram and table guidance. This covers plan-structure visuals (dependency graphs, interaction diagrams, comparison tables) — not solution-design diagrams, which are covered in Section 3.4.

### Phase 5: Final Review, Write File, and Handoff

<!-- why: Kolmogorov compression -- most items restate Phase 3 guidance; kept unique checks -->
#### 5.1 Review Before Writing

Verify all Phase 3 guidance was followed (units concrete and dependency-ordered, test scenarios complete per applicable category, deferred items explicit, technical design directional not prescriptive). Flag blank or missing test scenarios on feature-bearing units — every unit that changes behavior must have test scenarios or an explicit `Test expectation: none -- [reason]` annotation. Then check these unique items:

- The plan does not invent product behavior that should have been defined in `ce-brainstorm`
- If no origin document, the planning bootstrap established enough product clarity
- If the plan creates a new directory structure, consider adding an Output Structure tree
- If Scope Boundaries lists planned-but-separate work, verify it is under `### Deferred to Separate Tasks`
- Would a visual aid (dependency graph, interaction diagram, comparison table) help a reader grasp the plan structure?

If the plan originated from a requirements document, re-read it and verify: approach matches product intent, scope/success criteria preserved, blocking questions resolved or assumed, and every section addressed -- scan to confirm nothing was silently dropped.

#### 5.2 Write Plan File

**REQUIRED: Write the plan file to disk before presenting any options.**

Use the Write tool to save the complete plan to:

```text
docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md
```

Confirm:

```text
Plan written to docs/plans/[filename]
```

**Pipeline mode:** If invoked from an automated workflow such as LFG, SLFG, or any `disable-model-invocation` context, skip interactive questions. Make the needed choices automatically and proceed to writing the plan.

<!-- why: Kolmogorov compression -- kept high-risk signals, thin-grounding override, two deepening modes -->
#### 5.3 Confidence Check and Deepening

After writing the plan, evaluate whether it needs strengthening.

**Two modes:** **Auto** (default during generation) -- synthesize findings directly, no approval needed. **Interactive** (re-deepen fast path from Phase 0.1) -- present findings individually for accept/reject; user is invested and wants surgical control.

`document-review` vs this: document-review handles clarity/completeness/scope; this strengthens rationale/sequencing/risk/system-wide thinking on structurally sound plans.

**Pipeline mode:** Always auto in pipeline/disable-model-invocation contexts.

##### 5.3.1 Classify Plan Depth and Topic Risk

Classify depth: Lightweight (2-4 units), Standard (3-6), Deep (4-8 / phased). High-risk signals: auth/security, payments/billing, data migrations/backfills, external APIs, privacy/compliance, cross-interface parity, significant rollout/ops concerns.

##### 5.3.2 Gate: Decide Whether to Deepen

Lightweight -> usually skip unless high-risk. Standard -> benefit when important sections thin. Deep/high-risk -> targeted second pass.

**Thin local grounding override:** If Phase 1.2 triggered external research due to thin local patterns (<3 direct examples or adjacent-domain), always proceed to scoring regardless of apparent grounding. Claims built on unfamiliar territory are more likely assumptions than verified facts.

Sufficiently grounded + no override -> "Confidence check passed -- no sections need strengthening" -> skip to 5.3.8. Document-review always runs regardless.

##### 5.3.3–5.3.7 Deepening Execution

When deepening is warranted, read `references/deepening-workflow.md` for confidence scoring checklists, section-to-agent dispatch mapping, execution mode selection, research execution, interactive finding review, and plan synthesis instructions. Execute steps 5.3.3 through 5.3.7 from that file, then return here for 5.3.8.

##### 5.3.8–5.4 Document Review, Final Checks, and Post-Generation Options

**Load `references/plan-handoff.md` now.** It contains the full instructions for 5.3.8 (document review), 5.3.9 (final checks and cleanup), and 5.4 (post-generation handoff, including the Proof HITL flow, post-HITL re-review, and Issue Creation branching). Document review is mandatory — do not skip it even if the confidence check already ran.

During planning: research, decide, and write the plan -- do not write implementation code.
