---
title: Register Mismatch Correction Methodology
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-register-mismatch-correction-requirements.md
related: docs/references/register-mismatch-correction-explainer.md
baseline-commit: a5ce094
---

# Register Mismatch Correction Methodology

## Purpose and Scope

This document catalogs tutorial-register patterns in skill files and provides transformation rules for converting them to specification register. It is consumed by contributors (human or agent) during per-skill rewrite execution.

**In scope:** SKILL.md files in `plugins/compound-engineering/skills/`. Instructions within skills that invoke or configure agents are in scope; the agent files themselves are not.

**Out of scope:** Agent files, reference files, CLAUDE.md content, automated linter rules, and the rewrites themselves.

**Related documents:**
- Origin: [requirements](../brainstorms/2026-04-11-register-mismatch-correction-requirements.md)
- Explainer: [register-mismatch-correction-explainer.md](register-mismatch-correction-explainer.md) (conceptual framing for stakeholders; note: line 46 incorrectly states HTML comments are "invisible to the model" -- they are tokenized as plaintext)

## Pattern Classification

Six pattern classes. Each entry: definition, structural detection heuristic, severity (token cost per instance + compliance impact), and transformation rule.

Transformation rules produce output that satisfies the skill compliance checklist: imperative/infinitive form, no second person.

### 1. Progressive Explanation

**Definition:** Step-by-step conceptual scaffolding that builds understanding before stating the rule, or restates existing tables/templates as prose narrative with illustrative examples.

**Detection heuristic:** Look for sentences that precede an imperative instruction and explain what it means, why it exists, or how it fits into a larger picture. Common markers: "This means...", "In other words...", illustrative examples after a rule is already stated, conceptual orienting sentences before a workflow step. Distinguish from legitimate preamble that establishes context needed for the instruction (e.g., "If the base ref cannot be resolved..." is context, not scaffolding).

**Severity:**
- Token cost: medium (100-500 bytes per instance; avg ~118 bytes in ce-review)
- Compliance impact: low (instructions remain unambiguous without the scaffolding)

**Transformation rule:** Delete the scaffolding. If the operative instruction follows, keep only that instruction. If the scaffolding contains information not present elsewhere (rare), extract the operative fact into the instruction itself. Do not preserve as HTML comment unless the scaffolding encodes a non-obvious design decision.

### 2. Redundant Clarification

**Definition:** Restating the same instruction in different words, adding explanatory follow-up sentences that re-describe what the instruction already says, or providing navigation pointers to content already inlined.

**Detection heuristic:** Look for sentences immediately following an imperative that begin with "This keeps...", "This ensures...", "This avoids...", or "In other words...". Also: "included below" pointers to content already present via `@` includes; section-end summaries that restate section content; negative definitions ("X is not Y") where the positive definition is unambiguous. Distinguish from disambiguation that resolves genuine ambiguity (e.g., "read-only means non-mutating, not no shell access" resolves ambiguity in "read-only").

**Severity:**
- Token cost: medium (100-500 bytes per instance; avg ~192 bytes in ce-review)
- Compliance impact: medium (some clarifications disambiguate terms; evaluate each instance)

**Transformation rule:** Delete the restated/clarifying sentences. If the clarification disambiguates a genuinely ambiguous term, fold the disambiguation into the instruction itself (e.g., "Reviewer sub-agents are non-mutating" instead of a paragraph explaining what "read-only" means). Delete all "included below" navigation pointers -- the content is already inline.

**Subcategory -- Defensive Repetition:** The same constraint stated in multiple mode-specific sections rather than once with a scope marker. Rewrite: state the constraint once at the top of the relevant scope with a clear applicability marker (e.g., "Non-interactive modes: never commit, push, or create a PR"). For high-criticality constraints, one repetition at the section level is acceptable for compaction resilience. Do not repeat more than twice.

### 3. Motivational Framing

**Definition:** Language that explains why an instruction matters, why the approach works, or what value it provides. Justifies the rule for a human reader rather than directing model behavior.

**Detection heuristic:** Look for sentences containing "this helps...", "this is important because...", "the benefit is...", value propositions ("saves time", "reduces risk", "improves reliability"), and consequence statements ("vague findings waste engineering time"). Distinguish from severity/priority signals that calibrate model behavior at decision points (e.g., "worse than no finding" might calibrate verification thoroughness -- evaluate case by case).

**Severity:**
- Token cost: medium (100-500 bytes per instance; avg ~158 bytes in ce-review)
- Compliance impact: low (model follows instructions regardless of motivation)

**Transformation rule:** Delete the motivational sentence. The preceding or following imperative stands alone. If the motivational content functions as a severity signal (borderline), preserve as HTML comment.

### 4. Inline Rationale (Understanding-Only)

**Definition:** "because X", "this ensures Y", or semiclause explanations appended to instructions that aid understanding but are not necessary for compliance. The instruction is complete without the rationale.

**Detection heuristic:** Look for semicolons, em dashes, or "because" clauses following complete instructions. Also: sentences beginning with "The reason..." or "This is because...". Distinguish from rationale that encodes non-obvious technical knowledge the model needs for correct edge-case behavior (e.g., explaining why a git fallback is dangerous helps the model avoid the trap in novel situations).

**Severity:**
- Token cost: low (<100 bytes per instance; avg ~53 bytes in ce-review)
- Compliance impact: medium (some rationale encodes non-obvious technical constraints; evaluate each instance)

**Transformation rule:** Delete the rationale clause. If the rationale encodes a non-obvious technical fact or danger that a future contributor could not reconstruct from the constraint alone, preserve as HTML comment. Apply the default-keep tie-breaker for ambiguous cases (see Rationale Classification Framework below).

### 5. Hedging Markers

**Definition:** Language that signals optionality instead of obligation. Softens imperatives into suggestions, making instructions sound optional when they are not (or obscuring genuine optionality behind vague phrasing).

**Detection heuristic:** Look for "You may", "You might want to", "Consider", "It's recommended", "should" (where "must" is intended), "could", "feel free to". Also: double-hedges ("may... but not required"). Distinguish from genuine optionality markers where the behavior is truly optional -- in those cases, replace the hedge with an explicit "Optional:" prefix or "(if applicable)" qualifier.

**Severity:**
- Token cost: medium (100-500 bytes per instance; avg ~127 bytes in ce-review)
- Compliance impact: medium (hedging signals reduce instruction-following reliability; removing them strengthens compliance)

**Transformation rule:** For non-optional instructions: replace with direct imperative. For genuinely optional behaviors: replace hedge with explicit "Optional:" prefix or "When [condition]:" qualifier. Split compound sentences that mix obligations and options into separate sentences. Always eliminate second-person address ("You may" becomes either the imperative or "Optional: [action]").

### 6. Indirect Speech Acts

**Definition:** Passive constructions, third-person descriptions, or meta-commentary about the skill itself where direct imperatives would serve. The model is told *about* behavior rather than *instructed* to perform it.

**Detection heuristic:** Look for "This skill uses...", "The orchestrator stays on...", "They do not...", "Everything else stays the same", self-referential meta-commentary ("This section covers..."). Also: third-person descriptions of sub-agent behavior where imperatives are needed for instruction encoding. Distinguish from legitimate contextual statements that set up following instructions (e.g., "The platform may lack parallel sub-agent support" is context for a conditional).

**Severity:**
- Token cost: low (<100 bytes per instance; avg ~49 bytes in ce-review)
- Compliance impact: low (most cases; medium when describing sub-agent constraints that should be prescriptive)

**Transformation rule:** Convert to imperative. "The orchestrator stays on the default model" becomes "Use the default model for orchestration." "They do not edit project files" becomes "Do not edit project files." Delete self-referential meta-commentary entirely. For "everything else stays the same" constructions: delete (in specification register, unchanged items are not mentioned).

## Rationale Classification Framework

Every rationale passage falls into one of two categories:

| Category | Definition | Action |
|----------|-----------|--------|
| **Compliance-critical** | Rationale that encodes non-obvious technical knowledge, disambiguates a term, or shapes model behavior at decision points | Keep inline or preserve as HTML comment |
| **Understanding-only** | Rationale that aids human comprehension but does not influence model compliance | Delete |

**Default-keep tie-breaker:** When classification is ambiguous, keep the rationale. False negatives (keeping unnecessary content) cost tokens. False positives (stripping compliance-aiding content) risk behavioral regression. The asymmetry favors keeping.

**Decision procedure for each rationale passage:**

1. Remove the rationale mentally. Read the remaining instruction.
2. Is the instruction unambiguous and complete without it? If yes: understanding-only. Delete.
3. Could the model encounter an edge case where this rationale would change its behavior? If yes: compliance-critical. Keep.
4. If uncertain after steps 2 and 3: apply default-keep. Preserve as HTML comment.

### Worked Borderline Examples

**Example A -- Keep (compliance-critical):**

Original: "Do not use `gh pr diff` as the review scope after checkout -- it only reflects the remote PR state and will miss local fix commits until pushed."

Analysis: The semiclause explains non-obvious git behavior. Without it, the model might use `gh pr diff` in a context where it seems correct (after checkout, local commits present). The rationale encodes a technical trap.

Decision: Keep as HTML comment. The constraint alone ("Do not use `gh pr diff`") is followable, but the rationale prevents the model from circumventing the constraint in novel situations.

Rewritten:
```
<!-- why: gh pr diff reflects remote PR state only, missing local fix commits until pushed -->
Do not use `gh pr diff` as the review scope after checkout.
```

**Example B -- Keep (compliance-critical):**

Original: "Persona sub-agents are read-only with respect to the project: they review and return structured JSON. They do not edit project files or propose refactors."

Analysis: The descriptive "they do not edit" could be interpreted as observation rather than prescription. Sub-agent constraints must be imperative to ensure the model encodes them as instructions when dispatching sub-agents.

Decision: Rewrite to imperative. No HTML comment needed -- the constraint is self-evident once stated imperatively.

Rewritten:
```
Persona sub-agents: return structured JSON only. Do not edit project files or propose refactors.
```

**Example C -- Delete (understanding-only):**

Original: "Cross-reviewer agreement is strong signal -- independent reviewers converging on the same issue is more reliable than any single reviewer's confidence."

Analysis: The sentence explains epistemological reliability theory. The model applies the "+0.10 boost when 2+ reviewers match" rule regardless of understanding why agreement is reliable.

Decision: Delete. No HTML comment needed -- the justification is reconstructible from the rule itself (agreement = higher confidence is self-evident).

**Example D -- Delete (understanding-only):**

Original: "Do not start a mutating review round concurrently with browser testing on the same checkout. Future orchestrators that want both must either run `mode:report-only` during the parallel phase or isolate the mutating review in its own checkout/worktree."

Analysis: The first sentence is the constraint. The second sentence describes how future orchestrators could work around the constraint -- design guidance for implementers who do not exist yet.

Decision: Keep the first sentence. Delete the second sentence. No HTML comment needed -- the future-oriented guidance has no current execution value.

Rewritten:
```
Do not start a mutating review round concurrently with browser testing on the same checkout.
```

**Example E -- Borderline, keep (severity signal):**

Original: "A finding pointing to the wrong line is worse than no finding."

Analysis: The sentence is motivational framing. However, "worse than no finding" functions as a severity signal that might calibrate verification thoroughness. The model either verifies line numbers or does not, but the intensity could affect how carefully it verifies.

Decision: Borderline. Apply default-keep as HTML comment.

Rewritten:
```
<!-- why: wrong line numbers are worse than no finding -- they misdirect the developer -->
Verify each cited line number against the file content.
```

**Example F -- Borderline, keep (optionality encoding):**

Original: "You may still fetch additional PR metadata with `gh pr view` for title, body, and linked issues, but do not fail if no PR exists."

Analysis: "You may still" is a hedge, but it encodes genuine optionality -- the fetch is actually optional. The issue is the second-person hedging register, not the semantic content.

Decision: Rewrite to specification register preserving the optionality semantic.

Rewritten:
```
Optional: fetch PR metadata with `gh pr view` for title, body, and linked issues. Do not fail if no PR exists.
```

## HTML Comment Preservation Rules

**Format:** `<!-- why: [rationale text] -->` placed on the line immediately before the constraint it explains.

**When to use:**
- The stripped rationale encodes a non-obvious design decision
- A future contributor could not reconstruct the reasoning from the constraint alone
- The rationale explains a non-obvious technical danger or trap

**When NOT to use:**
- Motivational framing (value propositions, consequence statements)
- Progressive explanation (conceptual scaffolding)
- Navigation pointers ("included below")
- Self-evident rationale (agreement = higher confidence)
- Future-oriented design guidance

**Token cost awareness:** HTML comments are tokenized as plaintext. They occupy context window space. Expect ~5-10 comments per skill (~200-400 bytes total overhead). The selective application criteria above limit proliferation.

**Example:**
```markdown
<!-- why: gh pr diff reflects remote PR state only, missing local fix commits until pushed -->
Do not use `gh pr diff` as the review scope after checkout.
```

## Before/After Examples

Each example: original text, pattern class, rewritten text, rationale preservation (if applicable), byte reduction.

### Progressive Explanation

**Example 1 -- Safely removable (full section removal)**

*Original (361 bytes):*
> Every review spawns all 4 always-on personas plus the 2 CE always-on agents, then adds whichever cross-cutting and stack-specific conditionals fit the diff. The model naturally right-sizes: a small config change triggers 0 conditionals = 6 reviewers. A Rails auth feature might trigger security + reliability + kieran-rails + dhh-rails = 10 reviewers.

*Pattern class:* Progressive explanation
*Rewritten:* (Delete entirely. The reviewer table and Stage 3 selection rules specify this behavior.)
*Rationale preservation:* None needed.
*Byte reduction:* 361 bytes (361 -> 0)

**Example 2 -- Borderline (conceptual framing preserved as comment)**

*Original (97 bytes):*
> Severity answers **urgency**. Routing answers **who acts next** and **whether this skill may mutate the checkout**.

*Pattern class:* Progressive explanation
*Classification:* Borderline compliance-aiding. Establishes a conceptual distinction (severity vs routing) that could help correct application of routing rules. The routing rules table is explicit and self-contained.
*Rewritten (161 bytes):*
```
Apply severity and routing axes independently: severity encodes urgency; routing encodes actor and mutation permission.
<!-- why: severity and routing are orthogonal axes -- severity = urgency, routing = actor + mutation permission -->
```
*Byte reduction:* -64 bytes (net increase from preserving distinction; retains correct application of routing rules)

### Redundant Clarification

**Example 1 -- Safely removable (design rationale to comment)**

*Original (372 bytes):*
> Pass the resulting path list to the `project-standards` persona inside a `<standards-paths>` block in its review context (see Stage 4). The persona reads the files itself, targeting only the sections relevant to the changed file types. This keeps the orchestrator's work cheap (path discovery only) and avoids bloating the subagent prompt with content the reviewer may not fully need.

*Pattern class:* Redundant clarification
*Rewritten (186 bytes):*
```
Pass the path list to `project-standards` in a `<standards-paths>` block in its review context. The persona reads files itself, targeting sections relevant to changed file types.
<!-- why: orchestrator does path discovery only; persona reads file content to avoid bloating the subagent prompt -->
```
*Byte reduction:* 186 bytes (372 -> 186 instruction + comment overhead)

**Example 2 -- Borderline (technical disambiguation)**

*Original (173 bytes):*
> Do not use `gh pr diff` as the review scope after checkout -- it only reflects the remote PR state and will miss local fix commits until they are pushed.

*Pattern class:* Redundant clarification
*Classification:* Borderline compliance-aiding. The clarification encodes non-obvious git behavior that could prevent errors in edge cases.
*Rewritten (79 bytes + comment):*
```
<!-- why: gh pr diff reflects remote PR state only, missing local fix commits until pushed -->
Do not use `gh pr diff` as the review scope after checkout.
```
*Byte reduction:* 94 bytes (173 -> 79 instruction)

### Motivational Framing

**Example 1 -- Safely removable**

*Original (148 bytes):*
> Cross-reviewer agreement is strong signal -- independent reviewers converging on the same issue is more reliable than any single reviewer's confidence.

*Pattern class:* Motivational framing
*Rewritten:* (Delete. The "+0.10 boost when 2+ reviewers match" rule is self-sufficient.)
*Rationale preservation:* None needed.
*Byte reduction:* 148 bytes (148 -> 0)

**Example 2 -- Borderline (severity signal)**

*Original (63 bytes):*
> A finding pointing to the wrong line is worse than no finding.

*Pattern class:* Motivational framing
*Classification:* Borderline. Functions as a severity signal that might calibrate verification thoroughness.
*Rewritten (143 bytes):*
```
<!-- why: wrong line numbers are worse than no finding -- they misdirect the developer -->
Verify each cited line number against the file content.
```
*Byte reduction:* -80 bytes (net increase; preserves severity signal as compliance directive)

### Inline Rationale (Understanding-Only)

**Example 1 -- Borderline (non-obvious technical danger)**

*Original (206 bytes):*
> If the base ref still cannot be resolved from the PR's actual base repository after the fetch attempt, stop instead of falling back to `git diff HEAD`; a PR review without the PR base branch is incomplete.

*Pattern class:* Inline rationale
*Classification:* Borderline compliance-aiding. The semiclause encodes why the fallback is dangerous -- the model might circumvent the constraint in novel situations without this knowledge.
*Rewritten (153 bytes + comment):*
```
<!-- why: a PR review without the PR base branch only shows uncommitted changes, missing all committed branch work -->
If the base ref cannot be resolved after the fetch attempt, stop. Do not fall back to `git diff HEAD`.
```
*Byte reduction:* 53 bytes (206 -> 153 instruction)

**Example 2 -- Safely removable (future-oriented guidance)**

*Original (259 bytes):*
> Do not start a mutating review round concurrently with browser testing on the same checkout. Future orchestrators that want both must either run `mode:report-only` during the parallel phase or isolate the mutating review in its own checkout/worktree.

*Pattern class:* Inline rationale
*Rewritten (94 bytes):*
```
Do not start a mutating review round concurrently with browser testing on the same checkout.
```
*Rationale preservation:* None needed. Future-oriented design guidance has no current execution value.
*Byte reduction:* 165 bytes (259 -> 94)

### Hedging Markers

**Example 1 -- Borderline (genuine optionality in hedge form)**

*Original (133 bytes):*
> You may still fetch additional PR metadata with `gh pr view` for title, body, and linked issues, but do not fail if no PR exists.

*Pattern class:* Hedging markers
*Classification:* Borderline. "You may still" encodes genuine optionality -- the fetch is actually optional. The issue is the second-person hedging register, not the content.
*Rewritten (127 bytes):*
```
Optional: fetch PR metadata with `gh pr view` for title, body, and linked issues. Do not fail if no PR exists.
```
*Byte reduction:* 6 bytes (133 -> 127). Primary value: register correction, not size reduction.

**Example 2 -- Safely removable (double-hedge)**

*Original (120 bytes):*
> Interactive mode may offer to externalize residual actionable work after fixes, but it is not required to finish the review.

*Pattern class:* Hedging markers
*Rewritten (68 bytes):*
```
Interactive mode: externalizing residual actionable work after fixes is optional.
```
*Rationale preservation:* None needed.
*Byte reduction:* 52 bytes (120 -> 68)

### Indirect Speech Acts

**Example 1 -- Safely removable (passive rationale to imperative)**

*Original (202 bytes):*
> The orchestrator (this skill) stays on the default model because it handles intent discovery, reviewer selection, finding merge/dedup, and synthesis -- tasks that benefit from stronger reasoning.

*Pattern class:* Indirect speech acts
*Rewritten (63 bytes + comment):*
```
<!-- why: intent discovery, reviewer selection, merge/dedup, and synthesis benefit from stronger reasoning -->
Use the default model for orchestration.
```
*Rationale preservation:* HTML comment preserves architectural justification.
*Byte reduction:* 139 bytes (202 -> 63 instruction)

**Example 2 -- Borderline (descriptive constraints on sub-agents)**

*Original (299 bytes):*
> Persona sub-agents are **read-only** with respect to the project: they review and return structured JSON. They do not edit project files or propose refactors. The one permitted write is saving their full analysis to the `.context/` artifact path specified in the output contract.

*Pattern class:* Indirect speech acts
*Classification:* Borderline compliance-aiding. Third-person descriptive constraints on sub-agents may be interpreted as observation rather than prescription. The register shift from description to prescription matters for sub-agent instruction encoding.
*Rewritten (235 bytes):*
```
Persona sub-agents: return structured JSON only. Do not edit project files or propose refactors. One permitted write: save full analysis to the `.context/` artifact path from the output contract.
```
*Byte reduction:* 64 bytes (299 -> 235)

## Savings Estimates

### ce-review (Validated Baseline)

**File:** `plugins/compound-engineering/skills/ce-review/SKILL.md`
**Size:** 54,669 bytes at commit `a5ce094`

| Pattern Class | Instances | Bytes | % of file |
|---------------|-----------|-------|-----------|
| Progressive explanation | 24 | 2,837 | 5.2% |
| Redundant clarification | 8 | 1,539 | 2.8% |
| Motivational framing | 6 | 945 | 1.7% |
| Inline rationale (understanding-only) | 9 | 477 | 0.9% |
| Hedging markers | 2 | 253 | 0.5% |
| Indirect speech acts | 2 | 97 | 0.2% |
| **Total** | **51** | **6,148** | **11.2%** |

Safely removable: 4,386 bytes (8.0%). Borderline compliance-aiding: 1,762 bytes (3.2%).

Estimated HTML comment preservation overhead: ~500-800 bytes (~5-8 comments for borderline items preserved as comments). **Net savings: ~3,600-3,900 bytes (6.6-7.1%).**

### Remaining 6 Skills (Sampling Estimates)

Estimates derived from 3-4 sampled sections per skill. Reported as ranges. Bias direction noted per skill.

| Skill | Size (bytes) | Code ratio | Tutorial % (prose) | Tutorial % (total) | Est. removable bytes | Preservation overhead | Est. net savings | Notes |
|-------|-------------|------------|-------------------|-------------------|---------------------|----------------------|-----------------|-------|
| ce-compound-refresh | 48,110 | 2.7% | 7-10% | 7-10% | 3,400-4,800 | ~300-500 | 2,900-4,300 | Most optimized of the group |
| orchestrating-swarms | 48,055 | 65.1% | 6-9% | 2-3% | 1,000-1,500 | ~100-200 | 800-1,300 | Code-heavy; prose savings low |
| ce-plan | 41,968 | 11.7% | 11-15% | 10-13% | 4,200-5,500 | ~400-600 | 3,600-4,900 | Highest density; judgment-heavy |
| ce-work-beta | 32,224 | 7.4% | 9-12% | 8-11% | 2,600-3,500 | ~200-400 | 2,200-3,100 | Structural duplication with ce-work |
| ce-compound | 31,139 | 12.7% | 9-13% | 8-11% | 2,500-3,400 | ~200-400 | 2,100-3,000 | Concentrated motivational sections |
| ce-work | 27,159 | 8.8% | 9-12% | 8-11% | 2,200-3,000 | ~200-400 | 1,800-2,600 | Near-identical to ce-work-beta |

### Aggregate

| Metric | Value |
|--------|-------|
| Top 7 skills total size | 283,324 bytes |
| Total estimated tutorial-register | 22,100-27,900 bytes |
| Total preservation overhead | ~1,400-2,500 bytes |
| **Estimated net savings** | **19,600-25,400 bytes (6.9-9.0%)** |
| Plugin-wide tutorial-register range | 8-13% of prose content |

**Correction to prior projections:** The explainer document estimated 20-30% tutorial-register. Empirical sampling shows 8-13% is accurate. The discrepancy: the explainer projected from ce-review's raw numbers without accounting for code-block ratios and already-optimized skills.

## Application Guide

### Recommended Sequencing

1. **ce-work** (27,159 bytes) -- Smallest of the top 7. Use as methodology validation target. Apply the methodology, compare before/after behavior manually, confirm no regression before proceeding.
2. **ce-compound** (31,139 bytes) -- Concentrated motivational sections make removal straightforward and low-risk.
3. **ce-plan** (41,968 bytes) -- Highest density but requires careful borderline classification due to judgment-heavy content.
4. **ce-compound-refresh** (48,110 bytes) -- Already well-optimized; lower effort.
5. **ce-review** (54,669 bytes) -- Largest file, validated baseline. Apply after methodology is proven on smaller skills.
6. **ce-work-beta** (32,224 bytes) -- Shares >90% content with ce-work. Apply after ce-work is validated; reuse classifications.
7. **orchestrating-swarms** (48,055 bytes) -- Lowest prose savings. Apply last or defer.

### Validation Approach

For each rewritten skill:

1. Compare the rewritten skill against the original, instruction by instruction
2. Verify every imperative from the original is preserved in the rewrite
3. Verify no new instructions were introduced
4. Confirm HTML comments are selective (only non-obvious design decisions)
5. Run the skill in a test session and compare output quality against the original

### Cross-Skill Observations

These patterns are not register-mismatch corrections but are noted for future optimization:

- **Structural duplication:** Quality Checklist and Code Review Tiers sections appear identically in ce-work and ce-work-beta (~2,400 bytes duplicated). Candidate for extraction to a shared reference file.
- **Cross-skill duplication:** The Discoverability Check section appears near-identically in ce-compound and ce-compound-refresh (~2,000 bytes duplicated).
- **Code example deduplication:** orchestrating-swarms has repeated boilerplate in code examples. Register correction yields minimal savings; code deduplication is the high-value optimization for this skill.

## Requirements Coverage

| Requirement | Satisfied by |
|-------------|-------------|
| R1. Pattern classification (6 classes) | Pattern Classification section (6 classes with definition, heuristic, severity, transformation rule) |
| R2. Detection heuristics | Structural descriptions in each pattern class entry |
| R3. Rationale classification | Rationale Classification Framework section (compliance-critical vs understanding-only, default-keep, 6 worked borderline examples) |
| R4. Selective HTML comment preservation | HTML Comment Preservation Rules section |
| R5. Consistent comment format | HTML Comment Preservation Rules section (`<!-- why: [text] -->` on line before constraint) |
| R6. 2+ before/after examples per class | Before/After Examples section (2 per class, 12 total) |
| R7. Each example: original, class, rewrite, rationale, byte reduction | All 12 examples include all R7 fields |
| R8. ce-review baseline with file size and commit SHA | Savings Estimates section (54,669 bytes at `a5ce094`) |
| R9. Rough estimates for remaining 6 skills | Savings Estimates section (sampling-based ranges per skill) |
