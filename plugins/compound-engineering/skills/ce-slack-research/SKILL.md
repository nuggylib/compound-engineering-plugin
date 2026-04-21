---
name: ce-slack-research
description: "Search Slack for organizational context and produce an interpreted research digest with cross-cutting analysis. Use when planning or brainstorming needs organizational knowledge from Slack."
---

# /ce-slack-research

## When to Use

Trigger when the user:
- Says "search slack for", "what did we discuss about", "slack context for", "organizational context about", "what does the team think about", or "any slack discussions on"
- Wants organizational knowledge from Slack during planning, brainstorming, or any task
- Needs to find prior team discussions, decisions, or domain knowledge in Slack channels

## Usage

```
/ce-slack-research [topic or question]
/ce-slack-research
```

## Examples

```
/ce-slack-research free trial
/ce-slack-research What did we say about free trial recently?
/ce-slack-research free trial in #proj-reverse-trial
/ce-slack-research onboarding flow after:2026-03-01
```

Input accepts keywords, natural language questions, or Slack search modifiers like channel hints (`in:#channel`) and date filters (`after:YYYY-MM-DD`).

## Execution

If no argument is provided, ask what topic to research. Use the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: ask in plain text and wait for a reply.

Dispatch `compound-engineering:research:slack-researcher` with the user's topic as the task prompt. Omit the `mode` parameter. <!-- why: letting the user's configured defaultMode apply -->

The agent returns a digest with:

- **Workspace identifier** so the user can verify the correct Slack instance was searched
- **Research-value assessment** (high / moderate / low / none) with justification
- **Findings organized by topic** with source channels and dates
- **Cross-cutting analysis** surfacing patterns across findings

If the agent reports that Slack is unavailable (MCP not connected or auth expired), relay the message to the user. Do not attempt alternative research methods.
