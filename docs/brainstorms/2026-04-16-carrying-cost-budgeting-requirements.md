---
date: 2026-04-16
topic: carrying-cost-budgeting
idea: 20
phase: 0
status: brainstormed
---

# Carrying Cost Budgeting

## Problem Frame

Token optimization currently sorts by raw file size. This misranks skills: ce-review (55KB x ~40 tool calls = 2.2M token-calls) costs 7-10x more per session than orchestrating-swarms (48KB x ~3 calls = 144K token-calls). A 5KB skill triggering 50 tool calls costs more than a 30KB skill triggering 3. Without carrying cost data, the roadmap may optimize the wrong skills first.

Carrying cost = `file_size x estimated_tool_calls`. This reframes optimization priority from "what is biggest?" to "what costs the most over its lifetime in context?"

## Requirements

### R1. Heuristic tool-call estimation

Estimate tool calls per skill/agent from structural signals in the file content:
- Phase/stage headers: each phase involves ~3 tool calls (read + process + write)
- Explicit tool instructions: tool name mentions on non-code-block lines
- Sub-agent dispatches: fully-qualified agent references (`compound-engineering:category:name`)
- Loop constructs: additive weight per loop keyword occurrence

Runs statically, no runtime data needed.

### R2. Recursive sub-agent carrying cost

Sub-agent dispatches carry a cost multiplier: each dispatched agent adds `agent_size x agent_tool_calls` to the dispatching skill's total system cost. Recursion depth is 1 (agents in this plugin don't dispatch sub-agents).

### R3. CLI command

`bun run skill:stats` outputs a ranked table: name, type (skill/agent), file size, estimated tool calls, carrying cost, system cost, rank. Includes `--json` flag for machine-readable output.

### R4. Agents included alongside skills

The same heuristic applies to agent files. Both appear in the unified ranking.

### R5. Priority identification

Output identifies the top 5 optimization priorities by system cost. Reports whether the carrying cost ranking differs from the file-size ranking.

## Scope Boundaries

- Heuristic estimates only; no runtime telemetry
- Does not modify `release:validate`
- Does not implement optimizations; only measures and ranks
- Covers `plugins/compound-engineering/` only
- Uses raw file size, not `@`-expanded size

## Approach

Single self-contained script at `scripts/skill/stats.ts`. All heuristic logic and CLI output in one file. Package.json gets `"skill:stats": "bun run scripts/skill/stats.ts"`. Imports only existing utilities from `src/utils/`.

### Signal weights

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Phase/stage headers | 3 per header | Read + process + write per phase |
| Tool name mentions | 1 per mention | One tool call per instruction |
| Bash code blocks | 1 per block | Implicit Bash tool call |
| Sub-agent dispatches | 1 per dispatch | One Agent tool call (carrying cost computed separately) |
| Loop constructs | 3 per keyword | Similar scope to a phase |
| Minimum floor | 1 | Every file participates in at least one turn |

### Detection strategy

- Phase headers: `^#{2,3}\s+(Phase|Stage|Step)\s+\d` and numbered workflow headers
- Tool names: capitalized tool names (Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Agent, TaskCreate) at word boundaries, outside fenced code blocks
- Bash code blocks: fenced blocks tagged `bash` or `shell`
- Dispatches: `compound-engineering:[a-z-]+:[a-z-]+` pattern. Skip files with `disable-model-invocation: true` frontmatter
- Loops: `for each`, `repeat for`, `iterate over`, `for every`

## Success Criteria

1. `bun run skill:stats` produces output for all 42 skills and 51 agents
2. Top 5 by system cost differs from top 5 by raw file size (validates the heuristic adds signal)
3. ce-review ranks higher than orchestrating-swarms by system cost (despite similar file size)
4. JSON output is valid and includes raw signal counts for weight recalibration

## Open Questions

Resolved during planning; see `docs/plans/2026-04-13-002-feat-carrying-cost-budgeting-plan.md` for decisions on heuristic weights, sub-agent cost model, and script architecture.
