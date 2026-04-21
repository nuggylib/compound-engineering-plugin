---
date: 2026-04-16
topic: cross-skill-instruction-dedup
idea: 8
phase: 2
status: brainstormed
---

# Cross-Skill Instruction Dedup (Centralize in AGENTS.md)

## Problem Frame

The compound-engineering plugin repeats two categories of cross-platform instruction boilerplate across dozens of files. The dead content audit (idea #5, executed in commits ddb079f and 4ae26ac) condensed these occurrences from verbose multi-sentence paragraphs to shorter canonical forms, achieving 50-60% per-occurrence savings. But the occurrences themselves remain: each skill still carries its own copy of the condensed boilerplate.

The question is whether to go one step further and centralize these instructions in AGENTS.md so skills carry only a short reference sentence instead of the full boilerplate.

### Category (a): Cross-Platform Question Tool Boilerplate

34 occurrences across 26 files (skills, references, and 1 AGENTS.md occurrence). The condensed canonical form is:

```text
Use the platform question tool when available (AskUserQuestion / request_user_input / ask_user).
Fallback: present numbered options and wait for a reply.
```

This sentence (or a close variant) appears in every skill that asks the user a question. Some skills use it once at the top as an "Interaction Method" section and reference it later. Others repeat the full boilerplate at every decision point (ce-compound: 3 times, ce-compound-refresh: 3 times, git-commit: 2 times, ce-review: 2 times, ce-demo-reel: 2 times).

Many reference files that are loaded on-demand also carry their own copy (universal-planning.md: 2, universal-brainstorming.md: 1, upload-and-approval.md: 1, synthesis-and-presentation.md: 3 lines listing each tool individually, codex-delegation-workflow.md: 1, handoff.md: 1, plan-handoff.md: 2, deepening-workflow.md: 1).

**Byte estimate for category (a):** Each condensed occurrence is ~130-160 bytes including the fallback sentence. With 34 occurrences, the total is ~4,400-5,400 bytes. Centralizing would replace each with a ~40-60 byte reference ("see Interaction Convention in AGENTS.md" or equivalent), saving ~2,800-3,600 bytes.

### Category (b): Native Tool Guidance

30 occurrences across 18 files (10 agent files, 7 skill files, 1 AGENTS.md). Typical condensed forms:

```text
Use native content-search (e.g., Grep) to find candidate files BEFORE reading any content.
Use native file-search (e.g., Glob) to discover files by name or extension.
Use native file-read (e.g., Read) to examine file contents.
**Tool Selection:** Prefer native file-search, content-search, and file-read tools (e.g., Glob, Grep, Read).
```

AGENTS.md already has a full "Tool Selection in Agents and Skills" section (lines 133-142) with a 6-item checklist explaining when and how to use native tools. Despite this, 17 files outside AGENTS.md re-state the guidance, often in shorter form but still carrying tokens that duplicate what AGENTS.md already provides.

**Byte estimate for category (b):** Individual occurrences range from 60-200 bytes. With 30 occurrences totaling ~2,800-4,000 bytes, and AGENTS.md already containing the authoritative version (~1,200 bytes), the per-file copies are pure duplication. Removing them saves ~2,800-4,000 bytes.

### Combined Estimate

Total duplicate bytes: ~7,200-9,400. After centralization: ~800-1,200 bytes of reference sentences. Net savings: ~6,000-8,200 bytes (~1,500-2,050 tokens).

This is a modest savings compared to other token efficiency ideas (register mismatch saved ~30 KB, code example reduction saved ~49 KB). The primary value is not raw byte savings but maintenance hygiene: a single source of truth that prevents per-file drift and makes future platform additions (e.g., adding a new tool name when a new target ships) a one-line change.

## Current State Analysis

### What the dead content audit already did

The dead content plan (2026-04-15-004-refactor-dead-content-audit-plan.md) explicitly evaluated centralization vs. per-file condensing and chose per-file condensing:

> "This plan takes the conservative approach: condense each per-file occurrence to a shorter canonical form rather than removing it entirely."

The rationale was:

1. Cross-platform conversion copies SKILL.md files as-is -- centralized instructions in AGENTS.md would not travel with the skill.
2. Build-time expansion infrastructure does not exist yet.
3. Condensing gets 50-60% savings without new infrastructure.

The plan deferred centralization to this idea: "Idea #8 (Cross-Skill Instruction Dedup) plans a build-time expansion mechanism that would solve this properly."

### How AGENTS.md content flows today

**In Claude Code (native platform):**

- AGENTS.md is loaded as part of the CLAUDE.md chain. The plugin's `CLAUDE.md` contains `@AGENTS.md`, which resolves at load time.
- AGENTS.md content is present in the main conversation context and in every sub-agent's baseline (~3-4K tokens: system prompt + CLAUDE.md chain + tools).
- Skills see AGENTS.md content. A skill can say "see the Tool Selection checklist" and the model will find it in its context.

**In converted formats (Codex, Gemini, Kiro, Pi, etc.):**

- Skills are copied as-is to the target format (pass-through via `copySkillDir`). Only SKILL.md is optionally transformed for slash-command rewrites and agent name rewrites.
- AGENTS.md is NOT copied alongside skills. Each target handles repo-level instruction files differently:
  - **Codex**: `ensureCodexAgentsFile()` writes a separate AGENTS.md with a tool-mapping block -- but this is Codex-specific tool mapping, not the plugin's AGENTS.md content.
  - **Kiro**: `buildSteeringFiles()` converts AGENTS.md into `.kiro/steering/` files, separate from skills.
  - **Pi**: Writes a separate `AGENTS.md` with a Pi-specific block.
  - **OpenCode, Gemini, Windsurf, OpenClaw**: No mechanism to carry AGENTS.md content alongside pass-through skills.

This means: **Skills that rely on "see AGENTS.md" references will silently lose that context when converted to most target platforms.** The model on those platforms will not have the Tool Selection checklist or the Cross-Platform Interaction Convention unless the skill carries its own copy.

### AGENTS.md Skill Compliance Checklist (current)

The checklist currently instructs skills to include the boilerplate per-file:

> "When a skill needs to ask the user a question, instruct use of the platform's blocking question tool and name the known equivalents (AskUserQuestion in Claude Code, request_user_input in Codex, ask_user in Gemini)"
>
> "Include a fallback for environments without a question tool"

Centralizing would require updating these checklist items to say "refer to the Cross-Platform Interaction Convention" instead -- but only if the centralized content survives conversion.

## Design Options

### Option A: Centralize-and-Rely-on-AGENTS.md

Remove per-file boilerplate entirely. Add two named sections to AGENTS.md:

1. **Cross-Platform Interaction Convention**: The question-tool guidance with all three platform names and the fallback instruction.
2. **Tool Selection in Agents and Skills**: Already exists (lines 133-142). No change needed.

Each skill replaces its boilerplate with a short reference:

```text
## Interaction Method

See the Cross-Platform Interaction Convention in the plugin instructions.
```

**Pros:**

- Zero maintenance overhead for per-file copies.
- Single source of truth.
- Any platform addition (e.g., a fourth tool name) is a one-line edit.
- Works correctly on Claude Code, where AGENTS.md is always loaded.

**Cons:**

- **Breaks on all converted platforms.** Skills copied as-is to Codex, Gemini, etc. will reference AGENTS.md content that is not present in their context. The model has no way to resolve "see the Cross-Platform Interaction Convention" when running on Codex because the Codex AGENTS.md contains only a tool-mapping block, not the plugin's conventions.
- Violates the self-contained skill principle in AGENTS.md: "Each skill directory is a self-contained unit."
- The AGENTS.md compliance checklist would need to contradict itself: "include cross-platform references per-file" vs. "reference the centralized convention."
- For native tool guidance (category b), removing per-file hints means the agent in a sub-agent context must rely on the CLAUDE.md chain to know about tool preferences. This works but is indirect.

### Option B: Centralize-with-Build-Time-Injection

Add the same named sections to AGENTS.md. But instead of relying on runtime availability, the CLI converter injects the centralized content into each SKILL.md during the `copySkillDir` transform step.

Skills carry a marker (e.g., a sentinel comment or a frontmatter field) that the converter replaces with the full boilerplate at build time:

```markdown
## Interaction Method

<!-- INJECT:cross-platform-interaction-convention -->
```

The converter reads the marker, looks up the content from AGENTS.md or a shared definitions file, and substitutes it into the SKILL.md before writing to the target.

**Pros:**

- Single source of truth for authoring and maintenance.
- Every target platform gets the full boilerplate in the skill, no runtime dependency.
- Self-contained skill principle is preserved (skills are self-contained after build).
- Works on all current and future target platforms without per-platform adaptation.

**Cons:**

- **Requires new infrastructure.** The CLI's `copySkillDir` currently does simple content transforms (slash-command rewrites, agent name rewrites). Adding a marker-injection system is new build machinery.
- Markers in source files are a maintenance hazard. If someone removes or misspells a marker, the injection silently fails.
- The source SKILL.md in the repo no longer contains the actual content -- contributors reading the source see markers, not instructions. This harms readability.
- Must decide where the canonical definitions live (AGENTS.md sections? A separate `definitions.yaml`? Inline in the converter code?).
- Over-engineering for ~6-8 KB of savings.

### Option C: Centralize for Claude Code Only, Keep Condensed Per-File for Portability

A hybrid approach. Keep the condensed per-file boilerplate in all skills (what the dead content audit already achieved). Add the named sections to AGENTS.md for documentation clarity. Update the compliance checklist to say: "Keep the condensed per-file form. AGENTS.md contains the authoritative version; per-file copies are portable summaries."

This explicitly accepts the duplication as a portability tax and focuses maintenance effort on keeping per-file copies consistent with the AGENTS.md definition.

**Pros:**

- Zero infrastructure change.
- Zero conversion risk.
- Per-file copies are already condensed (dead content audit).
- AGENTS.md becomes the authoritative reference without breaking anything.
- Skill portability is preserved.

**Cons:**

- Does not achieve the centralization goal -- boilerplate remains duplicated.
- Adding a fourth platform name still requires editing 26+ files.
- No enforcement mechanism to keep per-file copies in sync with AGENTS.md.

### Option D: Differentiate by Category

Different strategies for the two categories based on their characteristics:

**Category (a) -- Question tool boilerplate**: Keep condensed per-file. The question-tool reference is load-bearing in every skill that asks users questions. These skills are frequently invoked, and the fallback behavior ("present numbered options and wait") must be present in the skill context even on platforms where AGENTS.md is not loaded. The dead content audit already condensed these to a short canonical form. Further centralization has poor risk/reward.

**Category (b) -- Native tool guidance**: Remove from individual skills and agents. AGENTS.md already has the authoritative "Tool Selection in Agents and Skills" checklist. Sub-agents get AGENTS.md through the CLAUDE.md chain. For converted platforms, native tool hints are less critical because: (1) converted agents already have platform-specific tool mappings injected by the converter (see `codex-agents.ts`), and (2) the guidance is "prefer native tools over shell" -- a general principle the model can follow without per-file reminders, especially when the target platform's AGENTS.md block already provides tool mappings.

**Pros:**

- Pragmatic. Removes duplication where it is safe (native tool hints), keeps it where it is load-bearing (question tool).
- No build infrastructure needed.
- Saves ~2,800-4,000 bytes from category (b) with near-zero risk.
- Category (a) remains stable and portable.

**Cons:**

- Does not fully centralize category (a).
- Category (b) removal from agents might degrade tool selection quality in sub-agent contexts on converted platforms.
- Two different policies for two similar categories adds cognitive overhead.

## Requirements

**R1** -- Determine which design option (A, B, C, or D) to implement. Document the decision with rationale.

**R2** -- If centralization is chosen for either category, add a named section to AGENTS.md containing the canonical instruction text. The section must be clearly labeled and self-contained.

**R3** -- If per-file references are removed (Options A, B, or D for category b), verify that the content is reachable from the model's context on every supported target platform. For Claude Code, verify through the CLAUDE.md chain. For each converted format, verify through the target's instruction file mechanism or document the gap.

**R4** -- If build-time injection is chosen (Option B), define the marker syntax, the source file for definitions, and the injection point in the `copySkillDir` transform pipeline. Add tests for marker resolution, missing markers, and malformed markers.

**R5** -- Update the AGENTS.md Skill Compliance Checklist to reflect the chosen approach. If centralization is chosen, the checklist must no longer instruct authors to include full per-file boilerplate. If per-file copies are retained, the checklist must reference the canonical AGENTS.md section as the source of truth.

**R6** -- If per-file copies are retained (Options C or D-for-category-a), add a staleness check to `release:validate` that compares each per-file occurrence against the canonical AGENTS.md definition. Flag drift (not necessarily block -- drift may be intentional variation for specific skills like ce-review which suppresses questions in pipeline mode).

**R7** -- Measure the byte-level savings of the chosen approach against the current state (post-dead-content-audit). Report separately for category (a) and category (b).

**R8** -- Validate cross-platform conversion for at least Codex and Kiro after implementation. Run `bun run convert --to codex` and `bun run convert --to kiro` and verify that converted skills either contain the boilerplate inline or have access to it through the target's instruction file mechanism.

**R9** -- Do not break any existing skill behavior. Every skill that currently names `AskUserQuestion / request_user_input / ask_user` must continue to produce the correct platform-appropriate behavior after the change.

## Constraints

### Self-Contained Skill Directories

AGENTS.md states: "Each skill directory is a self-contained unit. A SKILL.md file must only reference files within its own directory tree." Centralization creates a dependency on content outside the skill directory. This constraint must be either satisfied (Option B: build-time injection makes skills self-contained after build) or explicitly relaxed for AGENTS.md-inherited content with documented rationale.

### Cross-Platform Conversion Pipeline

The CLI converter copies skills as pass-through content. Any solution must produce correct behavior on all 7+ target platforms, not just Claude Code. The dead content audit chose per-file condensing specifically to avoid this conversion gap.

### AGENTS.md Loading Behavior

In Claude Code, AGENTS.md is part of the CLAUDE.md chain and is loaded into every context (main and sub-agent). In converted formats, AGENTS.md content flows through platform-specific mechanisms (steering files in Kiro, managed blocks in Codex/Pi, not at all in Gemini/Windsurf/OpenClaw). A solution that centralizes in AGENTS.md works on Claude Code but may not work on other platforms.

### Minimal Infrastructure Change

The dead content audit plan explicitly deferred centralization because "build-time expansion infrastructure does not exist yet." If the chosen solution requires new infrastructure, the scope and complexity must be proportional to the savings (~6-8 KB).

### Intentional Per-File Variation

Not all occurrences are identical. Some skills have intentional variation:

- ce-review suppresses questions entirely in pipeline mode: "Never use the platform question tool"
- document-review lists the three tool names on separate lines (for readability in a different context)
- ce-work references "native file-read tool (e.g., Read in Claude Code, read_file in Codex)" -- a more specific hint than the generic form
- codex-delegation-workflow references only "AskUserQuestion in Claude Code" (Codex-specific reference file)

Any centralization must preserve these intentional variations. A solution that replaces all occurrences with a uniform reference loses contextual nuance.

## Open Questions

### Q1: Does AGENTS.md content survive compaction?

AGENTS.md is loaded through the CLAUDE.md chain. CLAUDE.md is re-loaded from disk after compaction (documented behavior). If AGENTS.md content is part of the CLAUDE.md chain and therefore re-loaded, centralized instructions survive compaction. If AGENTS.md content is loaded once and then subject to compaction like any other content, centralized instructions may be lost mid-session. The answer affects whether centralization is reliable for long sessions.

**Current evidence:** The ideation document states "CLAUDE.md after compaction: Re-loaded from disk (guaranteed survivor)." If `@AGENTS.md` in CLAUDE.md causes AGENTS.md to be resolved at load time and both are re-loaded after compaction, then AGENTS.md content survives. This needs empirical verification.

### Q2: Do sub-agents on converted platforms see the instruction file?

On Claude Code, sub-agents get the CLAUDE.md chain in their baseline. On Codex, sub-agents are sequential (no true sub-agents). On Kiro, sub-agents get `file://.kiro/steering/**/*.md` in their resources. The question is whether the centralized content is reachable from sub-agent contexts on each platform.

### Q3: Is build-time injection worth the complexity?

The total savings are ~6-8 KB. The build-time injection system (Option B) requires: marker syntax definition, converter pipeline changes, marker validation tests, contributor documentation, and ongoing marker maintenance. Is this proportional? The dead content audit already captured the majority of savings through condensing. The remaining centralization saves ~3 KB beyond condensing (the difference between condensed per-file copies and short reference sentences).

### Q4: Should the compliance checklist be updated regardless?

Even if per-file copies are retained, the checklist could be updated to reference an AGENTS.md section as the canonical phrasing. This would not change what skills contain but would establish a "copy from here" source for new skills. This is Option C and costs nothing.

### Q5: Is there a simpler alternative to build-time injection?

Instead of a marker system, the converter could use a regex-based replacement: find the condensed canonical form in skill content and replace it with the full boilerplate during conversion. This avoids markers but is fragile (any variation in the canonical form breaks the match). It also only works for expansion, not for the common case where Claude Code skills already have the content.

## Risk Assessment

### R-1: Conversion-silent loss of question-tool instructions

**Risk:** If category (a) is centralized and the converted skill does not carry the boilerplate, the agent on the target platform will not know which tool to use for user questions. On Codex, it might use `ask_user` (wrong). On Gemini, it might not ask at all.

**Severity:** High. Question-tool behavior is user-facing and platform-critical.

**Mitigation:** Do not centralize category (a) unless build-time injection or equivalent is in place. Option D explicitly avoids this risk.

### R-2: Native tool hints removed from sub-agent context

**Risk:** If category (b) is centralized, sub-agents dispatched on converted platforms may not have tool selection guidance. They might default to shell commands, causing permission prompts.

**Severity:** Medium. Sub-agents on converted platforms already have platform-specific tool mappings (Codex: "Read: use shell reads or rg", etc.). The native tool hints are supplementary, not primary.

**Mitigation:** Verify that each target's AGENTS.md or equivalent contains tool selection guidance. For targets without it (Gemini, Windsurf), document the gap.

### R-3: Over-engineering the build-time injection system

**Risk:** Building a marker-injection pipeline for ~3 KB of incremental savings over the dead content audit's condensing work. The infrastructure itself may cost more tokens to maintain (documentation, tests, contributor friction) than it saves.

**Severity:** Medium. The risk is wasted effort, not broken functionality.

**Mitigation:** If Option B is chosen, keep the implementation minimal: one marker type, one source file, one regex substitution in `copySkillDir`. No YAML definition files, no multi-marker systems, no conditional injection.

### R-4: Compliance checklist contradiction

**Risk:** Updating the checklist to say "reference AGENTS.md" while the constraint says "skills must be self-contained" creates a visible contradiction. Contributors may be confused about which rule to follow.

**Severity:** Low. The contradiction can be resolved by distinguishing "self-contained at authoring time" from "self-contained after build."

**Mitigation:** Add a note to the self-contained skill principle clarifying that AGENTS.md-inherited content is an exception to the self-containment rule, as it is guaranteed to be loaded on all platforms (either natively or via build-time injection).

## Success Criteria

1. **Single source of truth:** The canonical question-tool and native-tool-selection instructions are defined in exactly one location (AGENTS.md), regardless of whether per-file copies also exist.
2. **No conversion regression:** `bun run convert --to codex` and `bun run convert --to kiro` produce skills with the same behavioral instructions as before the change.
3. **No behavioral regression:** A representative set of 5 skills (ce-plan, ce-review, ce-brainstorm, ce-compound, git-commit) produces correct question-tool and tool-selection behavior before and after the change.
4. **Measurable savings:** At least 2,500 bytes net savings from the change (beyond the dead content audit's condensing).
5. **Checklist updated:** AGENTS.md Skill Compliance Checklist reflects the chosen approach and references the canonical section.
6. **Drift detection:** If per-file copies are retained, `release:validate` detects drift between per-file copies and the canonical AGENTS.md definition.

## Recommendation

**Option D (Differentiate by Category)** is the recommended approach.

**Category (a) -- question tool boilerplate:** Retain condensed per-file copies. The risk/reward of centralizing load-bearing, user-facing, platform-critical instructions is unfavorable, especially given the conversion gap. The dead content audit already captured the majority of savings. Add the canonical form to AGENTS.md as an explicit "Cross-Platform Interaction Convention" section that serves as the source of truth for new skills and the reference for drift detection.

**Category (b) -- native tool guidance:** Remove from individual skills and agents where the guidance duplicates what AGENTS.md already states. AGENTS.md's "Tool Selection in Agents and Skills" section is comprehensive (6-item checklist, 10 lines). Per-file restating of "use native file-search (e.g., Glob)" in agents and skills is pure duplication of this section. Sub-agents get AGENTS.md through the CLAUDE.md chain on Claude Code, and converted platforms have their own tool-mapping blocks. The few cases where tool selection hints are contextual (e.g., ce-work's "read_file in Codex" hint) should be kept as intentional variation.

This approach:

- Saves ~2,800-4,000 bytes with near-zero risk (category b removal)
- Preserves portability for the most critical boilerplate (category a)
- Requires zero new infrastructure
- Establishes the canonical AGENTS.md sections as source of truth
- Enables drift detection in release:validate for category (a) per-file copies

**What about build-time injection?** Defer it. The savings from centralization (~3 KB incremental for category a) do not justify the infrastructure. If a future need arises -- such as a fourth target platform or a new category of shared instructions -- build-time injection can be reconsidered at that point with a concrete cost/benefit. For now, the dead content audit's condensing plus category (b) removal captures the practical value.
