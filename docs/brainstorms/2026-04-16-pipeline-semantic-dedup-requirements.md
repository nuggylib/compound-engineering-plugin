---
date: 2026-04-16
topic: pipeline-semantic-dedup
idea: 21
phase: 1
status: brainstormed
---

# Pipeline Semantic Dedup + Anti-Interference Audit

## Problem Frame

The compound-engineering plugin's primary workflow is a pipeline: `ce:brainstorm` -> `ce:plan` -> `ce:work` -> `ce:review` -> `ce:compound`. These five skills were authored independently and have never been audited for interaction effects. When loaded in sequence during a single session (or across a pipeline orchestrated by `lfg`/`slfg`), they accumulate ~153 KB of skill content with no cross-skill coordination.

Two categories of waste result:

1. **Semantic redundancy** -- different text conveying the same constraint across skills. This goes beyond idea #8's verbatim boilerplate dedup (which targets identical strings like the cross-platform question-tool sentence). Semantic redundancy occurs when two skills teach the same behavioral constraint using different words, different levels of detail, or different framing. The constraint enters the context window twice, consuming tokens without adding behavioral value.

2. **Instruction interference** -- instructions that are correct in their home phase but become conflicting when multiple skills coexist in the same context window, especially after compaction. Conflicting context causes 39% performance drop (the most damaging category in the context hygiene taxonomy, per the ideation research). Under compaction, phase boundaries blur and the model receives "Do X" and "Don't do X" without the qualifying phase context that made both instructions correct.

The pipeline's cumulative sizes:

| Skill | Bytes | Tokens (~4 chars/token) |
|-------|-------|------------------------|
| ce:brainstorm | 11,614 | ~2,900 |
| ce:plan | 44,560 | ~11,140 |
| ce:work | 24,169 | ~6,042 |
| ce:review | 48,405 | ~12,101 |
| ce:compound | 24,508 | ~6,127 |
| **Total** | **153,256** | **~38,314** |

In a full brainstorm-plan-work-review-compound session, all five skills persist in context. Even in the most common partial pipeline (plan-work-review), three skills totaling ~117 KB coexist.

## Current State Analysis

### Category 1: Semantic Redundancy

These are instructions that convey the same constraint using different words across pipeline skills.

#### 1A: Test Discipline (ce:plan + ce:work)

ce:plan defines test expectations at the planning level:

- "Enumerated test scenarios for each feature-bearing unit, specific enough that an implementer knows exactly what to test without inventing coverage themselves" (Plan Quality Bar)
- A full `Test scenarios` template with four categories: happy path, edge cases, error/failure paths, integration scenarios (Section 3.5)
- "Feature-bearing units with blank or missing test scenarios are flagged as incomplete" (Section 5.1)

ce:work re-teaches the same four-category test framework:

- "Test Scenario Completeness" section with the identical four-category table (happy path, edge cases, error/failure paths, integration)
- "Test Discovery" section teaching the agent to find existing tests
- "System-Wide Test Check" with a five-question checklist
- "Test As You Go" key principle and "Test Continuously" section

**Overlap estimate**: The test discipline content in ce:work (Test Discovery + Test Scenario Completeness + System-Wide Test Check) spans ~100 lines / ~4,800 bytes. Approximately 60% of this semantic content was already established by ce:plan's test scenario framework. The remaining 40% is legitimately execution-specific (e.g., "Run tests after changes", "Fix failures immediately", the System-Wide Test Check's runtime questions about callbacks and middleware).

**Estimated redundancy**: ~2,400-3,200 bytes (~600-800 tokens) of semantic overlap in test discipline between ce:plan and ce:work.

#### 1B: Execution Posture Signaling (ce:plan + ce:work)

ce:plan defines the concept of "Execution notes" and how to carry execution posture:

- Core Principle 7: "Carry execution posture lightly when it matters"
- Section 1.1b: "Detect Execution Posture Signals" with criteria for TDD/test-first/characterization-first
- Section 3.5: Execution note field definition with three examples
- Section 5.1: "If test-first or characterization-first posture was explicit or strongly implied..."

ce:work re-explains the same concept from the consumer side:

- Phase 1 step 1: "Check for `Execution note` on each implementation unit"
- Phase 1 step 3: "Carry each unit's `Execution note` into the task when present"
- Phase 2 step 1: "When a unit carries an `Execution note`, honor it. For test-first units, write the failing test before implementation..."
- Guardrails for execution posture (4 bullet points)

**Overlap estimate**: ce:plan spends ~1,600 bytes defining execution posture and ce:work spends ~1,200 bytes re-explaining how to interpret and honor it. In a plan-work session, the definition and the interpretation coexist -- the model already has the plan that contains the execution notes, making re-explanation of the concept partially redundant.

**Estimated redundancy**: ~800-1,200 bytes (~200-300 tokens). Some re-statement is justified (ce:work must know what to do with execution notes even without ce:plan in context), but the full re-explanation of TDD/characterization-first concepts is duplicated.

#### 1C: Slack Context Routing (ce:brainstorm + ce:plan)

Both skills carry near-identical Slack context routing blocks:

ce:brainstorm (5 lines):

```text
**Slack context** (opt-in, Standard and Deep only) -- never auto-dispatch. Route by condition:
- Tools available + user asked: Dispatch slack-researcher...
- Tools available + user didn't ask: Note in output: "Slack tools detected..."
- No tools + user asked: Note in output: "Slack context was requested..."
```

ce:plan (6 lines):

```text
**Slack context** (opt-in) -- never auto-dispatch. Route by condition:
- Tools available + user asked: Dispatch slack-researcher...
- Tools available + user didn't ask: Note in output: "Slack tools detected..."
- No tools + user asked: Note in output: "Slack context was requested..."
```

**Estimated redundancy**: ~700-900 bytes (~175-225 tokens). The two blocks are near-verbatim (idea #8 territory) but included here because they also represent semantic redundancy -- the same routing logic taught twice in a pipeline where brainstorm flows directly into plan.

#### 1D: Scope Assessment Classification (ce:brainstorm + ce:plan)

Both skills classify work scope using the same three-tier system:

ce:brainstorm (Phase 0.3):

- Lightweight -- "small, well-bounded, low ambiguity"
- Standard -- "normal feature or bounded refactor with some decisions to make"
- Deep -- "cross-cutting, strategic, or highly ambiguous"

ce:plan (Phase 0.6):

- Lightweight -- "small, well-bounded, low ambiguity"
- Standard -- "normal feature or bounded refactor with some technical decisions to document"
- Deep -- "cross-cutting, strategic, high-risk, or highly ambiguous implementation work"

The wording is nearly identical. In a brainstorm-plan pipeline, scope has already been assessed and should flow through the requirements document, not be re-derived from scratch.

**Estimated redundancy**: ~400-600 bytes (~100-150 tokens).

#### 1E: "Follow Existing Patterns" Instruction (ce:plan + ce:work)

ce:plan instructs research agents to gather "Architectural patterns and conventions to follow" and templates each unit with a "Patterns to follow" field.

ce:work re-instructs the same behavior:

- Phase 2 step 3: "Follow Existing Patterns" -- "The plan should reference similar code - read those files first / Match naming conventions exactly / Reuse existing components where possible"
- Key Principle: "Don't reinvent - match what exists"

When the plan already specifies patterns per unit, re-teaching the general principle of following patterns is semantically redundant.

**Estimated redundancy**: ~600-800 bytes (~150-200 tokens).

#### 1F: Domain Classification Routing (ce:brainstorm + ce:plan)

Both skills include nearly identical task domain classification logic:

ce:brainstorm (Phase 0.1b): Classify whether the task involves "building, modifying, or architecting software" -- references code, repositories, APIs, databases. Routes non-software to `references/universal-brainstorming.md`.

ce:plan (Phase 0.1b): Identical classification criteria -- "building, modifying, or architecting software (references code, repos, APIs, databases, or asks to build/modify/deploy)". Routes non-software to `references/universal-planning.md`.

**Estimated redundancy**: ~500-700 bytes (~125-175 tokens).

### Category 2: Instruction Interference

These are instructions that are correct within their phase but create conflicting signals when multiple skills coexist, especially under compaction.

#### 2A: "Do Not Code" vs "Proceed to Implementation" (ce:plan + ce:work) -- CRITICAL

ce:plan contains strong anti-implementation directives:

- "This workflow produces a durable implementation plan. It does **not** implement code, run tests, or learn from execution-time results."
- "**Decisions, not code** -- Capture approach, boundaries, files, dependencies, risks, and test scenarios. Do not pre-write implementation code or shell command choreography."
- "**Do not** run tests, build the app, or probe runtime behavior in this phase."
- "NEVER CODE! Research, decide, and write the plan."

ce:work contains pro-implementation directives:

- "Execute work efficiently while maintaining quality and finishing features."
- "implement following existing conventions"
- "Add, update, or remove tests to match implementation changes"

**Interference severity**: HIGH. Under compaction, when phase boundaries disappear, these become genuinely conflicting instructions. "NEVER CODE!" from ce:plan and "implement following existing conventions" from ce:work are direct contradictions when the model loses the phase context that scoped each instruction. This is the most dangerous interference pattern because it maps directly to the "conflicting context" category (39% performance drop) in the context hygiene taxonomy.

#### 2B: "Ask Questions First" vs "Execute Quickly" (ce:plan + ce:work)

ce:plan emphasizes deliberation:

- "If the input is unclear, ask clarifying questions"
- "Resolve planning-time questions here."
- "Do not continue planning while true blockers remain unresolved"

ce:work emphasizes speed:

- "Start Fast, Execute Faster"
- "Get clarification once at the start, then execute"
- "Don't wait for perfect understanding - ask questions and move"
- "Don't overthink, read the plan and execute"

Both instructions are correct in their phase -- planning should be thorough, execution should be fast. But under compaction, "Don't wait for perfect understanding" and "Do not continue while blockers remain unresolved" become directly conflicting.

**Interference severity**: MEDIUM. The model can usually infer which phase it is in from recent messages, but compaction degrades this inference. The tension between thoroughness and speed is a common source of confused agent behavior in long sessions.

#### 2C: "Ask Before Proceeding" vs "Skip All User Questions" (ce:plan + ce:review)

ce:plan and ce:brainstorm emphasize interactive dialogue:

- ce:brainstorm: "Ask one question at a time"
- ce:plan: "Ask the user only when the answer materially affects architecture"
- ce:plan: "Get user approval to proceed"

ce:review in autofix/headless modes:

- "Skip all user questions. Never pause for approval or clarification."
- "Never use the platform question tool (AskUserQuestion / request_user_input / ask_user)"

These are mode-scoped and not true conflicts when the mode context is intact. However, under compaction, "Never use the platform question tool" from headless mode instructions may suppress the model's willingness to ask questions in other skills. The word "Never" is a strong positional attention signal.

**Interference severity**: LOW-MEDIUM. Mode context usually survives because it is close to the current action, but the absolute "Never" phrasing creates risk.

#### 2D: Plan as Source of Truth vs Plan as Guide (ce:plan + ce:work)

ce:plan positions the plan as authoritative:

- "Use requirements as the source of truth"
- Plans are designed to be "implementation-ready" with concrete files, dependencies, and test scenarios

ce:work softens this:

- "The Plan is Your Guide" (not "source of truth")
- "Treat the plan as a decision artifact, not an execution script"
- "adapt based on what you find during implementation"

This is a deliberate and healthy tension -- plans should guide but not constrain execution. However, the framing shift from "source of truth" to "guide" could confuse the model about how strictly to follow plan decisions, especially when compaction merges these into a single compressed context. The model may either over-adhere (refusing to deviate when the code demands it) or under-adhere (ignoring plan decisions in favor of its own judgment).

**Interference severity**: LOW. This is more of a consistency concern than a true conflict. Both framings are defensible, but the inconsistency adds ambiguity tokens.

### Category 3: Phase-Specific Instructions That Persist Beyond Their Phase

These instructions make sense only during one phase but remain in context during later phases.

#### 3A: ce:plan's Research Infrastructure (persists into ce:work, ce:review)

ce:plan's Phase 1 contains ~10,000 bytes of research infrastructure:

- Detailed instructions for dispatching repo-research-analyst, learnings-researcher, best-practices-researcher, framework-docs-researcher
- Decision framework for when to do external research (8 conditions for "always lean toward" and 4 for "skip")
- Technology context leverage instructions
- Monorepo scoping instructions
- Adjacent-domain pattern detection

None of this is relevant during ce:work execution or ce:review, but it persists in context. Under compaction, the model may summarize these as "research before implementing", which could cause ce:work to launch unnecessary research agents instead of executing the plan.

**Estimated carrying waste**: ~10,000 bytes (~2,500 tokens) of irrelevant content carried through work and review phases.

#### 3B: ce:plan's Plan Template (persists into ce:work)

The Core Plan Template (Phase 4.2) is ~4,800 bytes of markdown structure guidance that ce:work never needs. The plan has already been written. The template's presence in context during execution wastes tokens and, under compaction, may cause ce:work to produce plan-formatted output instead of code.

**Estimated carrying waste**: ~4,800 bytes (~1,200 tokens).

#### 3C: ce:brainstorm's Collaborative Dialogue Instructions (persist into ce:plan)

ce:brainstorm's Phase 1 includes interaction coaching:

- "Start broad then narrow"
- "Bring ideas, alternatives, and challenges instead of only interviewing"
- "Ask what the user is already thinking before offering your own ideas"
- Product pressure test questions

These facilitation instructions are irrelevant during planning. Under compaction, they may cause ce:plan to re-engage in brainstorming-style dialogue instead of proceeding with structured planning.

**Estimated carrying waste**: ~2,000 bytes (~500 tokens).

#### 3D: ce:work's Branch Setup Instructions (persist into ce:review)

ce:work's Phase 1 step 2 contains ~2,200 bytes of git branch setup instructions (checking current branch, worktree options, branch naming). By the time ce:review runs, the branch is already set up. These instructions persist in context without value.

**Estimated carrying waste**: ~2,200 bytes (~550 tokens).

#### 3E: ce:review's Mode Detection and Argument Parsing (persists into ce:compound)

ce:review's mode detection (interactive, autofix, report-only, headless) and detailed mode rules span ~4,200 bytes. When the review is complete and ce:compound runs, these mode-specific instructions have no relevance but persist in context.

**Estimated carrying waste**: ~4,200 bytes (~1,050 tokens).

### Summary of Findings

| Category | Item | Bytes | Tokens | Severity |
|----------|------|-------|--------|----------|
| Semantic redundancy | 1A: Test discipline (plan + work) | ~2,800 | ~700 | Medium |
| Semantic redundancy | 1B: Execution posture (plan + work) | ~1,000 | ~250 | Low |
| Semantic redundancy | 1C: Slack routing (brainstorm + plan) | ~800 | ~200 | Low |
| Semantic redundancy | 1D: Scope classification (brainstorm + plan) | ~500 | ~125 | Low |
| Semantic redundancy | 1E: Follow patterns (plan + work) | ~700 | ~175 | Low |
| Semantic redundancy | 1F: Domain classification (brainstorm + plan) | ~600 | ~150 | Low |
| **Semantic redundancy subtotal** | | **~6,400** | **~1,600** | |
| Interference | 2A: Don't code vs implement | -- | -- | **Critical** |
| Interference | 2B: Ask questions vs execute fast | -- | -- | Medium |
| Interference | 2C: Ask user vs skip questions | -- | -- | Low-Medium |
| Interference | 2D: Source of truth vs guide | -- | -- | Low |
| Carrying waste | 3A: Plan research infrastructure | ~10,000 | ~2,500 | Medium |
| Carrying waste | 3B: Plan template | ~4,800 | ~1,200 | Medium |
| Carrying waste | 3C: Brainstorm dialogue coaching | ~2,000 | ~500 | Low |
| Carrying waste | 3D: Work branch setup | ~2,200 | ~550 | Low |
| Carrying waste | 3E: Review mode detection | ~4,200 | ~1,050 | Low |
| **Carrying waste subtotal** | | **~23,200** | **~5,800** | |
| **Total addressable** | | **~29,600** | **~7,400** | |

**Key insight**: The token waste from semantic redundancy (~6,400 bytes) is modest. The larger concern is carrying waste (~23,200 bytes) and, most critically, the interference patterns that have no byte cost but cause behavioral degradation. The "NEVER CODE" vs "implement" interference (2A) is potentially the single most damaging cross-skill interaction in the plugin.

## Relationship to Other Ideas

### Idea #8: Cross-Skill Dedup (Centralize in AGENTS.md)

Idea #8 targets **verbatim** boilerplate -- identical strings repeated across files. This audit targets **semantic** overlap -- different words conveying the same constraint. The Slack context routing blocks (1C) sit at the boundary: they are near-verbatim and could be addressed by either idea. All other findings here are semantic, not verbatim, and require judgment rather than mechanical dedup.

**Coordination**: The two ideas should share a dedup strategy. If idea #8 centralizes cross-platform boilerplate in AGENTS.md, this audit's semantic dedup should follow the same pattern where applicable (e.g., centralizing the scope classification taxonomy once, with each skill referencing it).

### Idea #13: Phase Transition Markers

Idea #13 proposes explicit signals at phase boundaries ("brainstorm instructions are no longer relevant"). This directly addresses Category 3 (carrying waste) -- if the model receives a clear signal that ce:plan's research infrastructure is no longer relevant, compaction can prioritize current-phase content. Phase transition markers are complementary to this audit: this audit identifies what content becomes irrelevant at each transition; idea #13 provides the mechanism to signal that irrelevance.

### Idea #17: JIT Skill Specialization

JIT specialization could resolve the interference patterns by loading phase-appropriate skill variants. A "post-plan" variant of ce:plan could strip the research infrastructure and template, retaining only the cross-references that ce:work needs. This is a heavier mechanism than this audit's proposed solutions but would eliminate carrying waste structurally.

### Idea #26: Register Mismatch Correction

The register-mismatch work already applied to the top 7 skills (including ce:plan, ce:work, ce:brainstorm) reduced hedging and tutorial-register content. This audit operates on a different axis: not how instructions are phrased (register) but whether they belong in the skill at all (semantic dedup) or create conflicts when co-loaded (interference).

## Requirements

**R1** -- Audit all pipeline skill pairs for semantic redundancy using this methodology: for each constraint expressed in skill A, search skill B for semantically equivalent constraints. Classify each match as: (a) true redundancy (same constraint, different words -- one copy can be removed), (b) intentional reinforcement (repetition is deliberate because the skill must work standalone), or (c) phase-appropriate specialization (same concept, different phase-specific guidance).

**R2** -- For each true redundancy (R1a), determine which skill is the canonical owner and which should reference rather than re-teach. The canonical owner is the skill where the constraint first applies in the pipeline sequence. For constraints that originate in the plan and flow to execution (test discipline, execution posture, pattern following), the plan is canonical and ce:work should reference ("honor the plan's test scenarios") rather than re-teach the four-category framework.

**R3** -- For intentional reinforcement (R1b), evaluate whether the reinforcement can be made more token-efficient. Instead of re-teaching a concept, the downstream skill should use a compact reference phrase that activates the model's memory of the upstream instruction. Example: replace ce:work's full "Test Scenario Completeness" four-category table with "Verify the plan's test scenarios cover all applicable categories (happy path, edge cases, error paths, integration) and supplement gaps."

**R4** -- Audit all pipeline skill pairs for instruction interference. For each potential conflict, classify as: (a) phase-scoped (correct in both phases, safe if phase context is maintained), (b) compaction-vulnerable (correct in both phases but becomes genuinely conflicting when phase context is compacted away), or (c) unconditionally conflicting (the instructions contradict regardless of phase context).

**R5** -- For compaction-vulnerable conflicts (R4b), add explicit phase-scoping language to the instruction that reduces ambiguity under compression. The instruction should carry its phase context internally rather than relying on the surrounding document structure to disambiguate it. Example: change "NEVER CODE!" to "During planning: do not write implementation code." The phase qualifier survives compaction because it is part of the instruction itself.

**R6** -- For the critical "NEVER CODE vs implement" interference (finding 2A), redesign the phase boundary language so that both instructions are unambiguously phase-scoped even when the model's understanding of which phase is active has degraded. Specific requirements:

- ce:plan's anti-implementation directives must include their phase scope in every occurrence
- ce:work's pro-implementation directives must include activation conditions
- The resulting language must not increase total token count (phase-scoping should replace, not supplement, the existing phrasing)

**R7** -- Identify carrying-waste content (Category 3) in each skill that becomes irrelevant after that skill's phase completes. Produce a per-skill manifest of phase-specific content sections with their byte sizes and downstream relevance. This manifest is a prerequisite for idea #13 (Phase Transition Markers) and idea #17 (JIT Specialization).

**R8** -- For semantic redundancies that cannot be removed because the skill must work standalone (when invoked without the upstream skill), use a compact "with/without pipeline" pattern: a brief reference phrase when the upstream skill is in context, with the full instruction retained only in a conditional block or reference file for standalone invocation. Evaluate whether the SKILL.md format supports this pattern or whether it requires structural changes.

**R9** -- Validate that all interference mitigations preserve behavioral equivalence. For each rewritten instruction, verify that the model produces the same behavior when the skill is invoked standalone (without the pipeline partner) and when it is invoked as part of the pipeline. The interference mitigation must not degrade standalone behavior to improve pipeline behavior or vice versa.

**R10** -- Produce a cross-reference matrix showing which skills share which constraints, the redundancy classification (true/reinforcement/specialization), and the recommended action. This matrix serves as the ongoing maintenance artifact to prevent future independent authoring from reintroducing semantic redundancy.

## Constraints

### Must Preserve

1. **Standalone skill function** -- Each skill must remain fully functional when invoked independently, without any other pipeline skill in context. The brainstorm-plan-work pipeline is the common case but not the only case. Users invoke ce:work with a bare prompt (no plan), ce:plan without a brainstorm, and ce:review standalone.
2. **Phase boundary clarity** -- The distinction between what happens in planning vs execution vs review is a core architectural principle. Dedup must not blur phase responsibilities. The plan decides what to build; execution builds it; review validates it.
3. **Behavioral instructions** -- Every instruction that changes model behavior in a measurable way must be retained. Semantic dedup removes the second copy of a constraint, not the first.
4. **Cross-platform portability** -- Skills are converted to other platforms. Any dedup strategy that relies on AGENTS.md inheritance or shared context may not survive conversion. Validate through the converter pipeline.

### Must Not Change

1. **Skill frontmatter** -- `name`, `description`, and other YAML fields.
2. **Pipeline sequencing** -- The brainstorm -> plan -> work -> review -> compound flow.
3. **Agent dispatch contracts** -- Which research/review agents are dispatched and when.
4. **Output formats** -- Plan document structure, review findings format, compound documentation structure.

### Must Not Introduce

1. **Cross-skill file dependencies** -- Per AGENTS.md: "A SKILL.md file must only reference files within its own directory tree." Dedup cannot create shared reference files across skills.
2. **Implicit pipeline assumptions** -- A skill must not assume the previous pipeline skill ran successfully. Each skill handles the case where it is the first skill invoked.

## Audit Methodology

### Phase 1: Pairwise Semantic Comparison

For each adjacent pair in the pipeline (brainstorm+plan, plan+work, work+review, review+compound):

1. Extract all behavioral constraints from both skills (imperative sentences, prohibitions, routing rules, process definitions)
2. Match constraints across skills using semantic similarity (same intent, regardless of wording)
3. Classify each match per R1's taxonomy
4. Record: constraint text in both skills, classification, byte cost, recommended action

### Phase 2: Interference Detection

For each pair, identify instructions that would be contradictory if phase context were removed:

1. Extract all prohibitions ("do not X", "never X") and mandates ("always X", "must X") from both skills
2. Cross-reference for logical contradictions (skill A says "do X", skill B says "don't do X")
3. Classify per R4's taxonomy: phase-scoped, compaction-vulnerable, unconditionally conflicting
4. For compaction-vulnerable conflicts, propose phase-scoping rewrites

### Phase 3: Carrying-Waste Inventory

For each skill, identify content blocks that are relevant only during that skill's active phase:

1. Mark each major section with its relevance window (brainstorm-only, plan-only, work-only, etc.)
2. Calculate the byte cost carried beyond the relevance window
3. Map to potential mechanisms: phase transition markers (#13), JIT specialization (#17), or structural extraction

### Phase 4: Cross-Reference Matrix Assembly

Compile all findings into the matrix specified in R10. Include:

- Constraint identifier
- Skills involved
- Redundancy classification
- Interference classification (if applicable)
- Byte cost
- Recommended action
- Priority (P1 for interference, P2 for redundancy, P3 for carrying waste)

## Risks

### R-1: Over-Dedup Degrades Standalone Behavior

**Risk**: Removing "redundant" test discipline from ce:work because ce:plan already teaches it would leave ce:work incomplete when invoked without a plan (bare-prompt mode). ce:work's bare-prompt flow skips plan reading and goes straight to implementation -- the agent needs test guidance even without a plan in context.

**Mitigation**: R8's "with/without pipeline" pattern. For each dedup candidate, verify standalone behavior is preserved. The default should be to keep the instruction and compress it, not remove it entirely.

### R-2: Phase-Scoping Language Adds Tokens

**Risk**: Adding "During planning:" or "In the execution phase:" to every instruction could increase total token count rather than decrease it.

**Mitigation**: R6 requires that phase-scoping replaces existing language rather than supplementing it. "NEVER CODE! Research, decide, and write the plan." (11 words) becomes "During planning: do not write implementation code." (7 words). The phase qualifier replaces the emphatic phrasing, reducing net tokens.

### R-3: Interference Patterns Are Not Actually Harmful

**Risk**: The identified conflicts may not actually degrade model behavior in practice. The model may successfully infer phase context from recent messages even after compaction, making the interference theoretical rather than practical.

**Mitigation**: This is acknowledged as a genuine risk. The 39% performance drop from conflicting context is a research finding, not a measurement of this specific plugin. Empirical validation (idea #14, Ablation Framework) would be needed to confirm the practical impact. However, the cost of phase-scoping language is near-zero, so even theoretical risk reduction is worth the minimal effort.

### R-4: Carrying-Waste Inventory Has No Immediate Mechanism

**Risk**: R7 produces a manifest of phase-specific content, but there is no current mechanism to evict or deprioritize this content. The inventory is useful only as input to future ideas (#13, #17) that may or may not be implemented.

**Mitigation**: The inventory has standalone value as documentation of the pipeline's context economics. Even without a deprioritization mechanism, it informs skill authoring decisions (e.g., "this section adds 10 KB of carrying waste -- is it worth it?") and helps prioritize future work.

## Open Questions

### Blocking

**Q1**: Should the "with/without pipeline" pattern (R8) use a runtime detection mechanism (check whether ce:plan is in context) or a static authoring pattern (always include a compact version with a reference-file fallback for standalone)? Runtime detection is fragile (no reliable way to detect co-loaded skills); static authoring is more tokens but more robust.

**Recommendation**: Static authoring. Use a compact inline version for pipeline use and retain the full version behind a backtick reference path for standalone invocation. This avoids fragile runtime detection and works across all platforms.

### Non-Blocking

**Q2**: Should the cross-reference matrix (R10) be a living document in `docs/` or a one-time audit artifact? A living document adds maintenance burden but prevents regression; a one-time artifact captures current state but may become stale.

**Q3**: The carrying-waste inventory (R7) quantifies content that persists beyond its useful phase. Should this inform the Phase Transition Markers work (#13) directly, or should the two ideas be sequenced independently?

**Q4**: Some "redundancy" may actually be intentional reinforcement that improves reliability -- the model follows the instruction more reliably when it appears twice. The ablation framework (#14) could test this hypothesis. Should any dedup work wait for ablation data, or proceed on the assumption that redundancy is waste?

## Success Criteria

1. **Cross-reference matrix produced**: A complete pairwise matrix covering all 5 pipeline skills with redundancy and interference classifications for every shared constraint.
2. **Critical interference mitigated**: Finding 2A (NEVER CODE vs implement) is rewritten with phase-scoping language that eliminates ambiguity under compaction, without increasing total token count.
3. **Semantic redundancy reduced by 40%+**: At least 2,500 bytes of the 6,400-byte semantic redundancy total are eliminated through compact references, with standalone behavior preserved.
4. **Carrying-waste manifest complete**: Every skill section is annotated with its relevance window, producing the input artifact needed for ideas #13 and #17.
5. **Behavioral equivalence validated**: For each modified skill, a representative invocation in standalone mode and pipeline mode produces equivalent behavior to the pre-modification version.
6. **No cross-skill file dependencies introduced**: All changes respect the self-contained skill directory constraint.

## Estimated Savings

| Category | Bytes | Tokens | Confidence |
|----------|-------|--------|------------|
| Semantic redundancy removal | ~2,500-3,800 | ~625-950 | Medium -- requires judgment per finding |
| Interference mitigation (net neutral to negative) | ~0 (rewrites, not removals) | ~0 | High -- phase-scoping replaces emphatic phrasing |
| Carrying-waste reduction (requires #13/#17) | ~15,000-20,000 | ~3,750-5,000 | Low -- depends on future mechanism implementation |
| **Immediate savings (this idea alone)** | **~2,500-3,800** | **~625-950** | |
| **Future savings (with #13/#17)** | **~17,500-23,800** | **~4,375-5,950** | |

**Note**: The primary value of this audit is not token savings but behavioral improvement. The interference mitigations (especially 2A) address the 39% performance drop category -- the most damaging form of context pollution. Fixing "NEVER CODE vs implement" may have more impact on output quality than removing 10 KB of dead content.
