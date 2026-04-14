---
title: "feat: Carrying Cost Budgeting"
type: feat
status: active
date: 2026-04-13
origin: docs/brainstorms/2026-04-13-carrying-cost-budgeting-requirements.md
---

# feat: Carrying Cost Budgeting

## Overview

Add a `bun run skill:stats` command that ranks all skills and agents by carrying cost (`file_size x estimated_tool_calls`) instead of raw file size. The heuristic estimates tool calls from structural signals in each file. The output replaces file-size ordering as the primary metric for prioritizing token efficiency work in Phases 2-4.

## Problem Frame

Token optimization currently sorts by raw file size. This misranks skills: ce-review (55KB x ~40 tool calls = 2.2M token-calls) costs 7-10x more per session than orchestrating-swarms (48KB x ~3 calls = 144K token-calls). A 5KB skill triggering 50 tool calls costs more than a 30KB skill triggering 3. Without carrying cost data, the roadmap may optimize the wrong skills first.

(see origin: `docs/brainstorms/2026-04-13-carrying-cost-budgeting-requirements.md`)

## Requirements Trace

**Heuristic formula**
- R1. Heuristic estimates tool_calls per skill/agent from structural signals: phase/stage headers, sub-agent dispatches, explicit tool instructions, and loop constructs
- R2. Runs statically on skill/agent files with no runtime data
- R3. Sub-agent dispatches carry a cost multiplier: each dispatched agent adds `agent_size x agent_tool_calls` to the dispatching skill's total system cost. This implements the brainstorm's "multiplier" requirement via recursive computation rather than a flat factor, because the actual cost depends on how many agents are dispatched and how complex each one is

**CLI command**
- R4. `bun run skill:stats` outputs a table: name, type (skill/agent), file size (bytes), estimated tool_calls, carrying cost, rank
- R5. Agents included alongside skills in the output
- R6. `--json` flag for machine-readable output; table is the default

**Integration**
- R7. Carrying cost rank identifies the top 5 optimization priorities for Phases 2-4. The `skill:stats` output is consumed by the meta-plan tracking table to reorder batch priorities

## Scope Boundaries

- Heuristic estimates only; no runtime telemetry or transcript parsing
- Does not modify `release:validate` (that is idea #10 Token Budget Guardrails)
- Does not implement any optimizations; only measures and ranks
- Covers `plugins/compound-engineering/` only (not `plugins/coding-tutor/`). Rationale: the token efficiency roadmap targets compound-engineering exclusively; coding-tutor has 2 skills and is not a priority
- Does not resolve `@`-directive expansion for size calculation (that is ablation territory, idea #14). Uses raw file size for the carrying cost numerator

## Context & Research

### Relevant Code and Patterns

- **File enumeration**: `src/release/metadata.ts` -- `countMarkdownFiles()`, `countSkillDirectories()`, `getCompoundEngineeringCounts()` walk the plugin tree. The stats command uses `walkFiles()` from `src/utils/files.ts` directly (simpler than adapting the count functions to also return content and paths)
- **Frontmatter parsing**: `src/utils/frontmatter.ts` -- `parseFrontmatter()` extracts metadata. Used to read agent category from frontmatter and to separate body content for heuristic analysis
- **File utilities**: `src/utils/files.ts` -- `walkFiles()`, `readText()`, `ensureDir()`. Reusable for directory walking and file reads
- **Script pattern**: `scripts/release/validate.ts` -- existing `bun run` script that imports from `src/`. Unlike `release:validate` (which has 3 scripts sharing `src/release/`), `skill:stats` is a single-consumer command, so all logic lives in the script file itself
- **Plugin structure**: Skills at `plugins/compound-engineering/skills/<name>/SKILL.md`, agents at `plugins/compound-engineering/agents/<category>/<name>.md`. 43 skills, 51 agents, 865KB total content

### Institutional Learnings

- **Script-first architecture** (`docs/solutions/skill-design/script-first-skill-architecture.md`): The heuristic is deterministic and belongs in a script, not model reasoning
- **Pass-paths learning** (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`): Validates the thesis that token costs compound across tool calls in a session

## Key Technical Decisions

- **Structural heuristic over manual annotation or transcript analysis**: Fully automated, deterministic, runs on every invocation. Accuracy is sufficient for prioritization ranking (relative ordering, not absolute counts). Heuristic can be recalibrated as runtime data becomes available from idea #14
- **Recursive sub-agent carrying cost over flat multiplier**: Instead of a flat 2x or 3x multiplier for sub-agent dispatches, compute actual recursive cost: `system_cost = own_size x own_tool_calls + sum(agent_size x agent_tool_calls)` for each dispatched agent. This is more accurate for skills like ce-review that dispatch 17 agents vs skills that dispatch 2. Implementation is straightforward since agent files are already enumerated. Recursion depth is 1 (agents don't dispatch sub-agents in this plugin)
- **Four signal categories with fixed weights**:
  - **Phase/stage headers** (`## Phase`, `## Stage`, `## Step`, numbered workflow headers): 3 tool calls each. Rationale: a typical phase involves read + process + write
  - **Explicit tool instructions** (tool name patterns: `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent`, `TaskCreate`): 1 tool call each. Count capitalized tool names at word boundaries on non-code-block lines. Feasibility testing confirmed that the verb+tool pattern (`use the Read tool`) has near-zero recall on real skill content -- skills describe operations via capability classes ("file-read tool", "file-search/glob tool") or prose, not by naming tools explicitly. Broader matching (capitalized tool name at word boundary, outside fenced code blocks) accepts some prose false positives but produces uniform noise that preserves relative ranking. Additionally, count fenced code blocks tagged as `bash` or `shell` as 1 implicit Bash tool call each
  - **Sub-agent dispatches** (fully-qualified agent references like `compound-engineering:category:name`, or `Agent` tool mentions with agent names): 1 tool call from orchestrator. Carrying cost contribution computed separately per R3. Skills with `disable-model-invocation: true` in frontmatter (e.g., orchestrating-swarms) are reference/tutorial documents; their agent references are examples, not real dispatches, and must be excluded from dispatch counting
  - **Loop constructs** (`for each`, `repeat for`, `iterate over`, `for every`): additive weight of 3 per loop keyword occurrence (same weight as a phase). Does not attempt scope-based multiplication of "enclosed" tool mentions -- markdown prose has no reliable scope boundaries, and the false positive rate on loop keywords is high (~58 matches across all skills, many of which are natural English prose like "for each section"). Additive counting preserves relative ranking without requiring prose-scope detection
  - **Minimum floor**: 1 tool call for any file (even a file with no detected signals participates in at least one turn)
  - These weights are calibratable. The output includes raw signal counts alongside the composite score so users can evaluate whether the weights distort rankings
- **Single self-contained script**: All heuristic logic and CLI output live in `scripts/skill/stats.ts`. No `src/analysis/` module. Rationale: this is the only consumer of the heuristic; extracting to `src/` creates a module directory with no second importer. If a future idea needs the heuristic, extract then. Package.json gets `"skill:stats": "bun run scripts/skill/stats.ts"`
- **Raw file size, not `@`-expanded size**: The carrying cost formula uses `stat` byte size for simplicity. `@`-directive expansion adds complexity and is already handled by idea #14's section remover. If `@`-expansion materially changes rankings, it can be added as a refinement after the ablation framework (idea #14) lands its `@`-expansion logic

## Open Questions

### Resolved During Planning

- **Exact heuristic weights for sub-agent dispatches vs simple Read calls**: Sub-agent dispatches count as 1 tool call from the orchestrator (same as any tool call) but contribute recursive carrying cost. A Read call counts as 1 tool call. The distinction is in the system-level carrying cost calculation, not the per-file tool_calls estimate
- **What multiplier for sub-agent dispatches?**: Recursive rather than flat. Each dispatched agent contributes `agent_size x agent_tool_calls` to the dispatching skill's system cost. No arbitrary multiplier needed
- **Where does the command live?**: `scripts/skill/stats.ts` (self-contained script with heuristic + CLI). Package.json script: `"skill:stats": "bun run scripts/skill/stats.ts"`

### Deferred to Implementation

- **Exact regex patterns for tool instruction detection**: Detection strategy is specified (capitalized tool names at word boundaries, outside code blocks, plus bash-tagged code blocks as implicit calls). Exact regex syntax for boundary detection and code-block state tracking tuned during implementation
- **Table formatting details**: Column widths, alignment, number formatting (e.g., `2.2M` vs `2,200,000`) decided during implementation based on terminal readability

## Implementation Units

- [ ] **Unit 1: skill:stats script with heuristic engine**

**Goal:** Self-contained script at `scripts/skill/stats.ts` that estimates tool calls per file, computes carrying cost and system cost, and outputs a ranked table.

**Requirements:** R1, R2, R3, R4, R5, R6, R7

**Dependencies:** None (imports only existing utilities from `src/utils/`)

**Files:**
- Create: `scripts/skill/stats.ts`
- Create: `tests/carrying-cost.test.ts`
- Modify: `package.json` (add `skill:stats` script)

**Approach:**

*Heuristic engine (exported functions for testability):*
- `estimateToolCalls(content: string): { total: number; dispatches: string[]; rawCounts: { phases: number; tools: number; dispatches: number; loops: number } }` -- strip frontmatter via `parseFrontmatter`, count signals in four categories, apply weights, return composite score + raw counts
- Signal detection:
  - Phase headers: `/^#{2,3}\s+(Phase|Stage|Step)\s+\d/mi` and `/^#{2,3}\s+\d+[\.\)]/m` (numbered workflow headers)
  - Tool instructions: capitalized tool names (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent`, `TaskCreate`) at word boundaries on non-code-block lines. Additionally, fenced code blocks tagged `bash` or `shell` count as 1 implicit Bash call each. Broader than verb+tool patterns (which have near-zero recall on real skills) but produces uniform noise across files
  - Sub-agent dispatches: `/compound-engineering:[a-z-]+:[a-z-]+/g` for fully-qualified names; also `Agent` tool references with agent names. Skip files where frontmatter contains `disable-model-invocation: true` (these are reference docs with example agent names, not real dispatches)
  - Loop constructs: `/\b(for\s+each|repeat\s+for|iterate\s+over|for\s+every)\b/gi`
- Minimum floor: `Math.max(total, 1)`

*CLI (script body):*
- Enumerate skills: walk `plugins/compound-engineering/skills/`, filter for directories containing `SKILL.md`, read each `SKILL.md`
- Enumerate agents: walk `plugins/compound-engineering/agents/`, filter for `*.md` files
- For each file: read content, get byte size from `stat`, run `estimateToolCalls`, compute carrying cost (`size * toolCalls`)
- Build agent lookup map: `compound-engineering:category:name` -> `{ size, toolCalls }` during agent enumeration pass
- For skills with sub-agent dispatches: resolve dispatched agent names via lookup map, compute system cost = `own carrying cost + sum(agent carrying costs)`. Inline arithmetic, no separate `computeSystemCost` function needed
- Sort by system cost descending (system cost = carrying cost for files without dispatches)
- Table output (default): Rank, Name, Type, Size, Est. Tool Calls, Carrying Cost, System Cost
- JSON output (`--json`): array of objects with all fields including raw signal counts
- Print summary: "Top 5 optimization priorities by system cost: ..."
- Print validation: "Ranking differs from file-size sort: yes/no" -- "yes" if the top 5 by system cost differs from the top 5 by raw file size

**Patterns to follow:**
- `scripts/release/validate.ts` for script structure, shebang, imports
- `src/utils/frontmatter.ts` for frontmatter stripping
- `src/utils/files.ts` for `walkFiles`, `readText`

**Test scenarios:**
- Happy path: skill content with 3 phases, 5 tool instructions, 2 dispatches, 1 loop -> expected total = `3*3 + 5*1 + 2*1 + 1*3 = 20`. Verify raw counts
- Happy path: minimal agent file with no phases, 2 tool instructions -> total = 2
- Happy path: file with only frontmatter and no body -> total = 1 (minimum floor)
- Edge case: tool name inside a fenced code block is not counted
- Edge case: "Read" as a prose word ("Read the requirements carefully") -- counted because it matches capitalized tool name at word boundary. This is accepted noise; test verifies the count is consistent
- Edge case: bash-tagged code block counted as 1 implicit Bash call
- Edge case: loop keyword on same line as tool name -> both counted independently (additive, no multiplier)
- Edge case: sub-agent dispatch returns list of dispatched agent names for system cost lookup
- Edge case: content with `disable-model-invocation: true` frontmatter -> dispatches = 0
- System cost arithmetic: skill (10KB, 5 calls) + 2 agents (3KB, 8 calls) and (5KB, 2 calls) -> `50000 + 24000 + 10000 = 84000`
- Integration: given a temp plugin directory with 2 skills and 3 agents, `bun run scripts/skill/stats.ts` produces correct ranked table
- Integration: `--json` flag produces valid JSON array
- Integration: skill dispatching an unknown agent -> warning logged, agent omitted from system cost
- Validation: ranking differs from pure file-size sort (at least one position swap)

**Verification:**
- `bun test tests/carrying-cost.test.ts` passes
- `bun run skill:stats` produces output for all 43 skills and 51 agents
- `bun run skill:stats --json | jq length` returns 94 (43 + 51)

## System-Wide Impact

- **Interaction graph:** No callbacks, middleware, or entry points affected. New standalone script. No existing code modified except package.json (additive script entry)
- **Error propagation:** If the heuristic produces inaccurate estimates, only the priority ranking is affected. No downstream code depends on these numbers programmatically
- **State lifecycle risks:** None. Read-only analysis of existing files
- **API surface parity:** None. Internal tooling, not user-facing
- **Unchanged invariants:** All skill and agent files remain unmodified. The carrying cost data is additive output

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Heuristic weights produce rankings that don't meaningfully differ from file-size sort | Success criterion explicitly checks for ranking differences. If rankings are identical, the weights need recalibration -- the problem frame guarantees they should differ (ce-review vs orchestrating-swarms) |
| Tool name detection overcounts prose mentions of "Read", "Edit", etc. | Broad matching is intentional after feasibility testing showed verb+tool patterns have near-zero recall. Overcounting is uniform across files, preserving relative ranking. Fenced code block exclusion prevents counting code examples |
| Sub-agent dispatch resolution fails for agents with non-standard naming | Warning logged, agent omitted from system cost. System cost degrades to carrying cost (still useful) |
| Reference/tutorial skills (e.g., orchestrating-swarms) inflate dispatch counts with example agent names | Frontmatter `disable-model-invocation: true` check excludes these files from dispatch counting. Any skill that is never invoked as a tool cannot have real dispatches |
| `@`-directive expansion omission undercounts ce-review by ~60% (48KB raw vs ~77KB expanded) | Known limitation documented in scope. If this materially affects rankings, `@`-expansion is added as a refinement after idea #14 lands |
| Loop keyword false positives in prose ("for each section") inflate counts | Additive weight (3 per keyword) bounds the impact. Raw loop count is included in output for assessment. High false positive rate (~58 matches across 43 skills) produces uniform noise |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-13-carrying-cost-budgeting-requirements.md](docs/brainstorms/2026-04-13-carrying-cost-budgeting-requirements.md)
- **Ideation source:** [docs/ideation/2026-04-08-token-efficiency-ideation.md](docs/ideation/2026-04-08-token-efficiency-ideation.md) (idea #20, line 328)
- **Meta execution plan:** [docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md](docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md)
- File utilities: `src/utils/files.ts`
- Frontmatter parser: `src/utils/frontmatter.ts`
- Plugin enumeration pattern: `src/release/metadata.ts`
- Script pattern: `scripts/release/validate.ts`
- Script-first learning: `docs/solutions/skill-design/script-first-skill-architecture.md`
