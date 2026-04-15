---
name: ce-sessions
description: "Search and ask questions about your coding agent session history. Use when asking what you worked on, what was tried before, or any question about past agent sessions."
---

# /ce-sessions

Search your session history.

## Usage

```
/ce-sessions [question or topic]
/ce-sessions
```

## Pre-resolved context

**Repo name (pre-resolved):** !`common=$(git rev-parse --git-common-dir 2>/dev/null); if [ "$common" = ".git" ]; then basename "$(git rev-parse --show-toplevel 2>/dev/null)"; else basename "$(dirname "$common")"; fi`

**Git branch (pre-resolved):** !`git rev-parse --abbrev-ref HEAD 2>/dev/null`

If either value still contains a backtick command string or is empty, omit it from the dispatch — the agent derives it at runtime.

## Execution

If no argument is provided, ask what the user wants to know about their session history. Use the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: ask in plain text and wait for a reply.

Dispatch `compound-engineering:research:session-historian` with the user's question as the task prompt. <!-- why: omitting mode lets the user's configured permission settings apply --> Omit the `mode` parameter. Include in the dispatch prompt:

- The user's question
- The current working directory
- The repo name and git branch from pre-resolved context (only if they resolved to plain values — do not pass literal command strings)
