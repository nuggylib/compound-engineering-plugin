# Anti-Patterns

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
