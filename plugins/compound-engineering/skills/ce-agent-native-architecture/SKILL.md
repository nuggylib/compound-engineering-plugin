---
name: ce-agent-native-architecture
description: Build applications where agents are first-class citizens. Use this skill when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.
---

<why_now>
## Why Now

Claude Code proved that an LLM with bash and file tools, looping until an objective is achieved, accomplishes complex multi-step tasks autonomously. The same architecture applies far beyond coding — file organization, reading lists, workflow automation.

The Claude Code SDK makes this accessible: build applications where features are outcomes described in prompts, achieved by an agent with tools operating in a loop.
</why_now>

<core_principles>
## Core Principles

### 1. Parity

**Every UI action must be achievable through agent tools.**

<!-- why: Without parity, agents cannot help with trivial user-facing actions. -->

Ensure the agent has tools (or combinations of tools) that achieve the same outcomes as the UI — not a 1:1 button-to-tool mapping, but outcome equivalence. Sometimes a single tool (`create_note`), sometimes composed primitives (`write_file` to a notes directory with formatting).

When adding any UI capability, verify the agent can achieve the same outcome. If not, add the necessary tools or primitives.

| User Action | How Agent Achieves It |
|-------------|----------------------|
| Create a note | `write_file` to notes directory, or `create_note` tool |
| Tag a note as urgent | `update_file` metadata, or `tag_note` tool |
| Search notes | `search_files` or `search_notes` tool |
| Delete a note | `delete_file` or `delete_note` tool |

**Test:** Pick any UI action, describe it to the agent. Can it accomplish the outcome?

---

### 2. Granularity

**Prefer atomic primitives. Features are outcomes achieved by an agent operating in a loop.**

Tools are primitive capabilities (read file, write file, run bash, store record, send notification). A **feature** is an outcome described in a prompt, achieved by an agent looping with tools until done.

**Less granular (limits the agent):**
```
Tool: classify_and_organize_files(files)
→ You wrote the decision logic
→ Agent executes your code
→ To change behavior, you refactor
```

**More granular (empowers the agent):**
```
Tools: read_file, write_file, move_file, list_directory, bash
Prompt: "Organize the user's downloads folder. Analyze each file,
        determine appropriate locations based on content and recency,
        and move them there."
Agent: Operates in a loop—reads files, makes judgments, moves things,
       checks results—until the folder is organized.
→ Agent makes the decisions
→ To change behavior, you edit the prompt
```

The more atomic the tools, the more flexibly the agent composes them. Bundling decision logic into tools moves judgment back into code.

**Test:** To change feature behavior, edit prose or refactor code?

---

### 3. Composability

**With atomic tools and parity, create new features by writing new prompts.**

Example — a "weekly review" feature:

```
"Review files modified this week. Summarize key changes. Based on
incomplete items and approaching deadlines, suggest three priorities
for next week."
```

The agent uses `list_files`, `read_file`, and judgment to accomplish this. No weekly-review code written — just an outcome description.

Ship new features by adding prompts. Users customize behavior by modifying prompts or creating their own (e.g., "When I say 'file this,' move to my Action folder and tag it urgent").

<!-- why: Composability breaks if tools encode too much logic or the agent lacks parity with users. -->

**Test:** Can a new feature be added via a new prompt section, without new code?

---

### 4. Emergent Capability

**The agent accomplishes things not explicitly designed for.**

With atomic tools, parity, and composable prompts, users ask for unanticipated things — and the agent figures them out.

*"Cross-reference my meeting notes with my task list and tell me what I've committed to but haven't scheduled."*

No "commitment tracker" feature exists. The agent reads notes, reads tasks, reasons about them in a loop, and delivers the answer.

**The flywheel:**
1. Build with atomic tools and parity
2. Users ask for unanticipated things
3. Agent composes tools to accomplish them (or fails, revealing a gap)
4. Observe patterns in requests
5. Add domain tools or prompts for common patterns
6. Repeat

**Test:** Give the agent an open-ended domain-relevant request. Can it figure out a reasonable approach in a loop? If it says "I don't have a feature for that," the architecture is too constrained.

---

### 5. Improvement Over Time

**Agent-native applications improve through accumulated context and prompt refinement — no code changes required.**

**Accumulated context:** Maintain state across sessions via `context.md` (layer one) or structured memory and learned preferences (advanced).

**Prompt refinement at multiple levels:**
- **Developer level:** Ship updated prompts that change agent behavior for all users
- **User level:** Users customize prompts for their workflow
- **Agent level:** Agent modifies its own prompts based on feedback (advanced)

**Self-modification (advanced):** Agents that edit their own prompts or code. For production: add approval gates, automatic checkpoints for rollback, and health checks.

**Test:** Does the application work better after a month of use than on day one, without code changes?
</core_principles>

<intake>
## What aspect of agent-native architecture do you need help with?

1. **Design architecture** - Plan a new agent-native system from scratch
2. **Files & workspace** - Use files as the universal interface, shared workspace patterns
3. **Tool design** - Build primitive tools, dynamic capability discovery, CRUD completeness
4. **Domain tools** - Know when to add domain tools vs stay with primitives
5. **Execution patterns** - Completion signals, partial completion, context limits
6. **System prompts** - Define agent behavior in prompts, judgment criteria
7. **Context injection** - Inject runtime app state into agent prompts
8. **Action parity** - Ensure agents can do everything users can do
9. **Self-modification** - Enable agents to safely evolve themselves
10. **Product design** - Progressive disclosure, latent demand, approval patterns
11. **Mobile patterns** - iOS storage, background execution, checkpoint/resume
12. **Testing** - Test agent-native apps for capability and parity
13. **Refactoring** - Make existing code more agent-native

**Wait for response before proceeding.**
</intake>

<routing>
| Response | Action |
|----------|--------|
| 1, "design", "architecture", "plan" | Read `references/architecture-patterns.md`, then apply Architecture Checklist below |
| 2, "files", "workspace", "filesystem" | Read `references/files-universal-interface.md` and `references/shared-workspace-architecture.md` |
| 3, "tool", "mcp", "primitive", "crud" | Read `references/mcp-tool-design.md` |
| 4, "domain tool", "when to add" | Read `references/from-primitives-to-domain-tools.md` |
| 5, "execution", "completion", "loop" | Read `references/agent-execution-patterns.md` |
| 6, "prompt", "system prompt", "behavior" | Read `references/system-prompt-design.md` |
| 7, "context", "inject", "runtime", "dynamic" | Read `references/dynamic-context-injection.md` |
| 8, "parity", "ui action", "capability map" | Read `references/action-parity-discipline.md` |
| 9, "self-modify", "evolve", "git" | Read `references/self-modification.md` |
| 10, "product", "progressive", "approval", "latent demand" | Read `references/product-implications.md` |
| 11, "mobile", "ios", "android", "background", "checkpoint" | Read `references/mobile-patterns.md` |
| 12, "test", "testing", "verify", "validate" | Read `references/agent-native-testing.md` |
| 13, "review", "refactor", "existing" | Read `references/refactoring-to-prompt-native.md` |

</routing>

<architecture_checklist>
## Architecture Review Checklist

Verify these **before implementation**:

### Core Principles
- [ ] **Parity:** Every UI action has a corresponding agent capability
- [ ] **Granularity:** Tools are primitives; features are prompt-defined outcomes
- [ ] **Composability:** New features can be added via prompts alone
- [ ] **Emergent Capability:** Agent handles open-ended requests in the domain

### Tool Design
- [ ] **Dynamic vs Static:** For external APIs with full agent access, use Dynamic Capability Discovery
- [ ] **CRUD Completeness:** Every entity has create, read, update, AND delete
- [ ] **Primitives not Workflows:** Tools enable capability, don't encode business logic
- [ ] **API as Validator:** Use `z.string()` inputs when the API validates, not `z.enum()`

### Files & Workspace
- [ ] **Shared Workspace:** Agent and user work in same data space
- [ ] **context.md Pattern:** Agent reads/updates context file for accumulated knowledge
- [ ] **File Organization:** Entity-scoped directories with consistent naming

### Agent Execution
- [ ] **Completion Signals:** Agent has explicit `complete_task` tool (not heuristic detection)
- [ ] **Partial Completion:** Multi-step tasks track progress for resume
- [ ] **Context Limits:** Designed for bounded context from the start

### Context Injection
- [ ] **Available Resources:** System prompt includes what exists (files, data, types)
- [ ] **Available Capabilities:** System prompt documents tools with user vocabulary
- [ ] **Dynamic Context:** Context refreshes for long sessions (or provide `refresh_context` tool)

### UI Integration
- [ ] **Agent → UI:** Agent changes reflect in UI (shared service, file watching, or event bus)
- [ ] **No Silent Actions:** Agent writes trigger UI updates immediately
- [ ] **Capability Discovery:** Users can discover what the agent can do

### Mobile (if applicable)
- [ ] **Checkpoint/Resume:** Handle iOS app suspension gracefully
- [ ] **iCloud Storage:** iCloud-first with local fallback for multi-device sync
- [ ] **Cost Awareness:** Model tier selection (Haiku/Sonnet/Opus)

**Address each checkbox explicitly in the architecture plan.**
</architecture_checklist>

<quick_start>
## Quick Start: Build an Agent-Native Feature

**Step 1: Define atomic tools**
```typescript
const tools = [
  tool("read_file", "Read any file", { path: z.string() }, ...),
  tool("write_file", "Write any file", { path: z.string(), content: z.string() }, ...),
  tool("list_files", "List directory", { path: z.string() }, ...),
  tool("complete_task", "Signal task completion", { summary: z.string() }, ...),
];
```

**Step 2: Write behavior in the system prompt**
```markdown
## Your Responsibilities
When asked to organize content, you should:
1. Read existing files to understand the structure
2. Analyze what organization makes sense
3. Create/move files using your tools
4. Use your judgment about layout and formatting
5. Call complete_task when you're done

You decide the structure. Make it good.
```

**Step 3: Let the agent work in a loop**
```typescript
const result = await agent.run({
  prompt: userMessage,
  tools: tools,
  systemPrompt: systemPrompt,
  // Agent loops until it calls complete_task
});
```
</quick_start>

<reference_index>
## Reference Files

All references in `references/`:

**Core Patterns:**
- `references/architecture-patterns.md` - Event-driven, unified orchestrator, agent-to-UI
- `references/files-universal-interface.md` - Why files, organization patterns, context.md
- `references/mcp-tool-design.md` - Tool design, dynamic capability discovery, CRUD
- `references/from-primitives-to-domain-tools.md` - When to add domain tools, graduating to code
- `references/agent-execution-patterns.md` - Completion signals, partial completion, context limits
- `references/system-prompt-design.md` - Features as prompts, judgment criteria

**Agent-Native Disciplines:**
- `references/dynamic-context-injection.md` - Runtime context, what to inject
- `references/action-parity-discipline.md` - Capability mapping, parity workflow
- `references/shared-workspace-architecture.md` - Shared data space, UI integration
- `references/product-implications.md` - Progressive disclosure, latent demand, approval
- `references/agent-native-testing.md` - Testing outcomes, parity tests

**Platform-Specific:**
- `references/mobile-patterns.md` - iOS storage, checkpoint/resume, cost awareness
- `references/self-modification.md` - Git-based evolution, guardrails
- `references/refactoring-to-prompt-native.md` - Migrating existing code
</reference_index>

<anti_patterns>
## Anti-Patterns

### Common Approaches That Aren't Fully Agent-Native

**Agent as router** — Agent determines intent and calls the right function. Intelligence used to route, not act — a fraction of agent capability.

**Build the app, then add agent** — Features built as code, then exposed to agent. No emergent capability.

**Request/response thinking** — Agent gets input, does one thing, returns output. Misses the loop: agent pursues an outcome, handles unexpected situations along the way.

**Defensive tool design** — Over-constrained tool inputs (strict enums, validation at every layer) prevent the agent from doing unanticipated things.

**Happy path in code, agent just executes** — Code handles all edge cases; agent is just a caller. Agent-native lets the agent handle edge cases with judgment.

---

### Specific Anti-Patterns

**THE CARDINAL SIN: Agent executes your code instead of figuring things out**

```typescript
// WRONG - You wrote the workflow, agent just executes it
tool("process_feedback", async ({ message }) => {
  const category = categorize(message);      // Your code decides
  const priority = calculatePriority(message); // Your code decides
  await store(message, category, priority);   // Your code orchestrates
  if (priority > 3) await notify();           // Your code decides
});

// RIGHT - Agent figures out how to process feedback
tools: store_item, send_message  // Primitives
prompt: "Rate importance 1-5 based on actionability, store feedback, notify if >= 4"
```

**Workflow-shaped tools** — `analyze_and_organize` bundles judgment into the tool. Break into primitives; let the agent compose them.

**Context starvation** — Agent doesn't know what resources exist.
```
User: "Write something about Catherine the Great in my feed"
Agent: "What feed? I don't understand what system you're referring to."
```
Fix: Inject available resources, capabilities, and vocabulary into system prompt.

**Orphan UI actions** — UI action with no agent equivalent. Fix: maintain parity.

**Silent actions** — Agent changes state, UI doesn't update. Fix: shared data stores with reactive binding or file system observation.

**Heuristic completion detection** — Detecting completion via heuristics (consecutive iterations without tool calls, checking output files). Fix: require explicit `complete_task` tool. <!-- why: Heuristic detection is fragile and produces false positives. -->

**Static tool mapping for dynamic APIs** — 50 tools for 50 API endpoints when `discover` + `access` gives more flexibility.
```typescript
// WRONG - Every API type needs a hardcoded tool
tool("read_steps", ...)
tool("read_heart_rate", ...)
tool("read_sleep", ...)
// When glucose tracking is added... code change required

// RIGHT - Dynamic capability discovery
tool("list_available_types", ...)  // Discover what's available
tool("read_health_data", { dataType: z.string() }, ...)  // Access any type
```

**Incomplete CRUD** — Agent can create but not update or delete.
```typescript
// User: "Delete that journal entry"
// Agent: "I don't have a tool for that"
tool("create_journal_entry", ...)  // Missing: update, delete
```
Fix: Every entity needs full CRUD.

**Sandbox isolation** — Agent works in separate data space from user.
```
Documents/
├── user_files/        ← User's space
└── agent_output/      ← Agent's space (isolated)
```
Fix: Shared workspace where both operate on same files.

**Gates without reason** — Domain tool is the only way to do something without an intentional access restriction. Keep primitives available unless there is a specific reason to gate.

**Artificial capability limits** — Restricting agent capabilities based on vague safety concerns rather than specific risks. Restrict only for identified risks, not general caution.
</anti_patterns>

<success_criteria>
## Success Criteria

An agent-native application meets these criteria:

### Architecture
- [ ] The agent can achieve anything users can achieve through the UI (parity)
- [ ] Tools are atomic primitives; domain tools are shortcuts, not gates (granularity)
- [ ] New features can be added by writing new prompts (composability)
- [ ] The agent accomplishes tasks not explicitly designed for (emergent capability)
- [ ] Changing behavior means editing prompts, not refactoring code

### Implementation
- [ ] System prompt includes dynamic context about app state
- [ ] Every UI action has a corresponding agent tool (action parity)
- [ ] Agent tools are documented in system prompt with user vocabulary
- [ ] Agent and user work in the same data space (shared workspace)
- [ ] Agent actions are immediately reflected in the UI
- [ ] Every entity has full CRUD (Create, Read, Update, Delete)
- [ ] Agents explicitly signal completion (no heuristic detection)
- [ ] context.md or equivalent for accumulated knowledge

### Product
- [ ] Simple requests work immediately with no learning curve
- [ ] Power users can push the system in unexpected directions
- [ ] User demand discovered by observing what they ask the agent to do
- [ ] Approval requirements match stakes and reversibility

### Mobile (if applicable)
- [ ] Checkpoint/resume handles app interruption
- [ ] iCloud-first storage with local fallback
- [ ] Background execution uses available time wisely
- [ ] Model tier matched to task complexity

---

### The Ultimate Test

**Describe a domain-relevant outcome with no specific feature built for it.**

If the agent figures out how to accomplish it in a loop — agent-native. If it says "I don't have a feature for that" — architecture is too constrained.
</success_criteria>

