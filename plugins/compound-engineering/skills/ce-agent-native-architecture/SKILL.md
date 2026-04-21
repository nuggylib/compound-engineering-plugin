---
name: ce-agent-native-architecture
description: Build applications where agents are first-class citizens. Use this skill when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.
---

<objective>
Build applications where agents are first-class citizens operating in a loop with atomic tools, achieving outcomes described in prompts.
</objective>

<intake>
## What aspect of agent-native architecture do you need help with?

1. **Design architecture** - Plan a new agent-native system
2. **Files & workspace** - Files as interface, shared workspace
3. **Tool design** - Primitives, dynamic discovery, CRUD
4. **Domain tools** - When to add vs stay with primitives
5. **Execution patterns** - Completion signals, partial completion
6. **System prompts** - Behavior in prompts, judgment criteria
7. **Context injection** - Runtime app state in agent prompts
8. **Action parity** - Agents can do everything users can
9. **Self-modification** - Agents safely evolve themselves
10. **Product design** - Progressive disclosure, approval patterns
11. **Mobile patterns** - iOS storage, checkpoint/resume
12. **Testing** - Capability and parity tests
13. **Refactoring** - Make existing code agent-native

Specify a number, describe the topic, or ask a question.
</intake>

<routing>

| Input | Reference |
|-------|-----------|
| 1, "design", "architecture", "plan" | `references/architecture-patterns.md` + `references/architecture-checklist.md` |
| 2, "files", "workspace", "filesystem" | `references/files-universal-interface.md` + `references/shared-workspace-architecture.md` |
| 3, "tool", "mcp", "primitive", "crud" | `references/mcp-tool-design.md` |
| 4, "domain tool", "when to add" | `references/from-primitives-to-domain-tools.md` |
| 5, "execution", "completion", "loop" | `references/agent-execution-patterns.md` |
| 6, "prompt", "system prompt" | `references/system-prompt-design.md` |
| 7, "context", "inject", "runtime" | `references/dynamic-context-injection.md` |
| 8, "parity", "ui action" | `references/action-parity-discipline.md` |
| 9, "self-modify", "evolve" | `references/self-modification.md` |
| 10, "product", "progressive", "approval" | `references/product-implications.md` |
| 11, "mobile", "ios", "checkpoint" | `references/mobile-patterns.md` |
| 12, "test", "testing", "verify" | `references/agent-native-testing.md` |
| 13, "refactor", "existing", "migrate" | `references/refactoring-to-prompt-native.md` |
| "principles", "philosophy" | `references/core-principles.md` |
| "anti-pattern", "mistake", "avoid" | `references/anti-patterns.md` |
| "checklist", "review architecture" | `references/architecture-checklist.md` |
| "quick start", "getting started" | `references/quick-start.md` |
| "success criteria", "done" | `references/success-criteria.md` |

Match the user's query to the most relevant topic above, then read that reference.
For cross-cutting questions, load 2-3 relevant references.
If no topic matches, re-present the intake menu.

</routing>

<reference_index>
All 19 files in `references/`:

- `core-principles.md` -- parity, granularity, composability, emergent capability
- `architecture-patterns.md` -- event-driven, unified orchestrator, agent-to-UI
- `architecture-checklist.md` -- pre-implementation verification checklist
- `quick-start.md` -- minimal code for an agent-native feature
- `files-universal-interface.md` -- why files, organization, context.md
- `shared-workspace-architecture.md` -- shared data space, UI integration
- `mcp-tool-design.md` -- tool design, dynamic discovery, CRUD
- `from-primitives-to-domain-tools.md` -- when to graduate from primitives
- `agent-execution-patterns.md` -- completion signals, partial completion
- `system-prompt-design.md` -- features as prompts, judgment criteria
- `dynamic-context-injection.md` -- runtime context, what to inject
- `action-parity-discipline.md` -- capability mapping, parity audit
- `self-modification.md` -- git-based evolution, guardrails
- `product-implications.md` -- progressive disclosure, latent demand
- `mobile-patterns.md` -- iOS storage, checkpoint/resume, cost awareness
- `agent-native-testing.md` -- testing outcomes, parity tests
- `refactoring-to-prompt-native.md` -- migrating existing code
- `anti-patterns.md` -- common mistakes and specific anti-patterns
- `success-criteria.md` -- definition of done, checklists
</reference_index>

<behavioral_guidelines>
- Present intake menu on first activation; wait for input before loading references.
- Read matched reference(s) then apply to the user's situation.
- Option 1 loads both `architecture-patterns.md` and `architecture-checklist.md`.
- Option 2 loads both `files-universal-interface.md` and `shared-workspace-architecture.md`.
- Architecture review requests load `architecture-checklist.md` as an audit.
- Load at most 3 reference files per query.
</behavioral_guidelines>
