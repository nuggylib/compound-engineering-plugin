<overview>
How to design MCP tools following prompt-native principles. Tools should be primitives that enable capability, not workflows that encode decisions.

**Core principle:** Whatever a user can do, the agent should be able to do. Don't artificially limit the agent—give it the same primitives a power user would have.
</overview>

<principle name="primitives-not-workflows">
## Tools Are Primitives, Not Workflows

**Wrong approach:** Tools that encode business logic
```typescript
tool("process_feedback", {
  feedback: z.string(),
  category: z.enum(["bug", "feature", "question"]),
  priority: z.enum(["low", "medium", "high"]),
}, async ({ feedback, category, priority }) => {
  // Tool decides how to process
  const processed = categorize(feedback);
  const stored = await saveToDatabase(processed);
  const notification = await notify(priority);
  return { processed, stored, notification };
});
```

**Right approach:** Primitives that enable any workflow
```typescript
tool("store_item", {
  key: z.string(),
  value: z.any(),
}, async ({ key, value }) => {
  await db.set(key, value);
  return { text: `Stored ${key}` };
});

tool("send_message", {
  channel: z.string(),
  content: z.string(),
}, async ({ channel, content }) => {
  await messenger.send(channel, content);
  return { text: "Sent" };
});
```

The agent decides categorization, priority, and when to notify based on the system prompt.
</principle>

<principle name="descriptive-names">
## Tools Should Have Descriptive, Primitive Names

Names should describe the capability, not the use case:

| Wrong | Right |
|-------|-------|
| `process_user_feedback` | `store_item` |
| `create_feedback_summary` | `write_file` |
| `send_notification` | `send_message` |
| `deploy_to_production` | `git_push` |

The prompt tells the agent *when* to use primitives. The tool just provides *capability*.
</principle>

<principle name="simple-inputs">
## Inputs Should Be Simple

Tools accept data. They don't accept decisions.

**Wrong:** Tool accepts decisions
```typescript
tool("format_content", {
  content: z.string(),
  format: z.enum(["markdown", "html", "json"]),
  style: z.enum(["formal", "casual", "technical"]),
}, ...)
```

**Right:** Tool accepts data, agent decides format
```typescript
tool("write_file", {
  path: z.string(),
  content: z.string(),
}, ...)
// Agent decides to write index.html with HTML content, or data.json with JSON
```
</principle>

<principle name="rich-outputs">
## Outputs Should Be Rich

Return enough information for the agent to verify and iterate.

**Wrong:** Minimal output
```typescript
async ({ key }) => {
  await db.delete(key);
  return { text: "Deleted" };
}
```

**Right:** Rich output
```typescript
async ({ key }) => {
  const existed = await db.has(key);
  if (!existed) {
    return { text: `Key ${key} did not exist` };
  }
  await db.delete(key);
  return { text: `Deleted ${key}. ${await db.count()} items remaining.` };
}
```
</principle>

<design_template>
## Tool Design Template

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const serverName = createSdkMcpServer({
  name: "server-name",
  version: "1.0.0",
  tools: [
    // READ — rich output with isError
    tool("read_item", "Read an item by key",
      { key: z.string().describe("Item key") },
      async ({ key }) => {
        const item = await storage.get(key);
        return { content: [{ type: "text", text: item ? JSON.stringify(item, null, 2) : `Not found: ${key}` }], isError: !item };
      }),

    tool("list_items", "List all items, optionally filtered",
      { prefix: z.string().optional(), limit: z.number().default(100) },
      async ({ prefix, limit }) => { /* storage.list -> format count + keys */ }),

    // WRITE
    tool("store_item", "Store an item",
      { key: z.string(), value: z.any() },
      async ({ key, value }) => { await storage.set(key, value); return { content: [{ type: "text", text: `Stored ${key}` }] }; }),

    tool("delete_item", "Delete an item",
      { key: z.string() },
      async ({ key }) => { /* storage.delete -> report existed or not */ }),

    // EXTERNAL
    tool("call_api", "Make an HTTP request",
      { url: z.string().url(), method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"), body: z.any().optional() },
      async ({ url, method, body }) => { /* fetch -> return status + body, isError: !response.ok */ }),
  ],
});
```
</design_template>

<example name="feedback-server">
## Example: Feedback Storage Server

This server provides primitives for storing feedback. It does NOT decide how to categorize or organize feedback—that's the agent's job via the prompt.

```typescript
export const feedbackMcpServer = createSdkMcpServer({
  name: "feedback",
  version: "1.0.0",
  tools: [
    tool("store_feedback", "Store a feedback item",
      { item: z.object({ id: z.string(), author: z.string(), content: z.string(),
        importance: z.number().min(1).max(5), timestamp: z.string(),
        status: z.string().optional(), urls: z.array(z.string()).optional(), metadata: z.any().optional() }) },
      async ({ item }) => { /* db.feedback.insert -> confirm stored */ }),

    tool("list_feedback", "List feedback items",
      { limit: z.number().default(50), status: z.string().optional() },
      async ({ limit, status }) => { /* db.feedback.list -> JSON response */ }),

    tool("update_feedback", "Update a feedback item",
      { id: z.string(), updates: z.object({ status: z.string().optional(), importance: z.number().optional(), metadata: z.any().optional() }) },
      async ({ id, updates }) => { /* db.feedback.update -> confirm */ }),
  ],
});
```

The system prompt then tells the agent *how* to use these primitives:

```markdown
## Feedback Processing
When someone shares feedback: extract author/content/URLs, rate importance 1-5,
store via feedback.store_feedback, notify channel if importance 4-5.
```
</example>

<principle name="dynamic-capability-discovery">
## Dynamic Capability Discovery vs Static Tool Mapping

**This pattern is specifically for agent-native apps** where you want the agent to have full access to an external API—the same access a user would have. It follows the core agent-native principle: "Whatever the user can do, the agent can do."

If you're building a constrained agent with limited capabilities, static tool mapping may be intentional. But for agent-native apps integrating with HealthKit, HomeKit, GraphQL, or similar APIs:

**Static Tool Mapping (Anti-pattern for Agent-Native):**
Build individual tools for each API capability. Always out of date, limits agent to only what you anticipated.

```typescript
// ❌ Static: Hardcoded tool per API type (read_steps, read_heart_rate, read_sleep...)
// When HealthKit adds glucose tracking... you need a code change
```

**Dynamic Capability Discovery (Preferred):**
Build a meta-tool that discovers what's available, and a generic tool that can access anything.

```typescript
// ✅ Dynamic: 2 tools instead of N

// Discovery: returns what's available at runtime
tool("list_available_capabilities", async () => {
  const types = await healthKit.availableQuantityTypes();
  return { text: `Available: ${types.join(", ")}. Use read_health_data with any.` };
});

// Generic access: string type (NOT z.enum), API validates
tool("read_health_data", {
  dataType: z.string(), startDate: z.string(), endDate: z.string(),
  aggregation: z.enum(["sum", "average", "samples"]).optional()
}, async ({ dataType, startDate, endDate, aggregation }) => {
  return { text: JSON.stringify(await healthKit.query(dataType, startDate, endDate, aggregation), null, 2) };
});
```

**When to Use Each Approach:**

| Dynamic (Agent-Native) | Static (Constrained Agent) |
|------------------------|---------------------------|
| Agent should access anything user can | Agent has intentionally limited scope |
| External API with many endpoints (HealthKit, HomeKit, GraphQL) | Internal domain with fixed operations |
| API evolves independently of your code | Tightly coupled domain logic |
| You want full action parity | You want strict guardrails |

**The agent-native default is Dynamic.** Only use Static when you're intentionally limiting the agent's capabilities.

**Complete Dynamic Pattern:**

```swift
// 1. Discovery tool: enumerate available types at runtime
tool("list_health_types", "Get available health data types") { _ in
    /* list all HKQuantityTypeIdentifier, HKCategoryTypeIdentifier, HKCharacteristicTypeIdentifier */
    return ToolResult(text: "Available: \(quantityTypes), \(categoryTypes), \(characteristicTypes)")
}

// 2. Generic read: string dataType (not enum), API validates
tool("read_health_data", "Read any health metric",
    { dataType: z.string(), startDate: z.string(), endDate: z.string() }) { request in
    guard let type = HKQuantityTypeIdentifier(rawValue: request.dataType)
                     ?? HKCategoryTypeIdentifier(rawValue: request.dataType) else {
        return ToolResult(text: "Unknown type. Use list_health_types.", isError: true)
    }
    return ToolResult(text: try await healthStore.querySamples(type: type, start: startDate, end: endDate).formatted())
}

// 3. Context injection: inject authorized types into system prompt
func buildSystemPrompt() -> String {
    /* list healthService.getAuthorizedTypes() + point to list_health_types for discovery */
}
```

**Benefits:** Agent uses any API capability (even post-ship additions). API validates, not your enums. 2-3 tools vs N. Works with any introspectable API (HealthKit, GraphQL, OpenAPI).
</principle>

<principle name="crud-completeness">
## CRUD Completeness

Every data type the agent can create, it should be able to read, update, and delete. Incomplete CRUD = broken action parity.

```typescript
// ❌ Create-only: tool("create_experiment", ...) tool("write_journal_entry", ...)
// User: "Delete that experiment" -> Agent: "I can't do that"

// ✅ Full CRUD per entity:
// create_experiment, read_experiment, update_experiment, delete_experiment
// create_journal_entry, read_journal, update_journal_entry, delete_journal_entry
```

**CRUD Audit:** For each entity, verify create/read/update/delete all exist. Missing operations = users will ask and agent will fail.
</principle>

<checklist>
## MCP Tool Design Checklist

**Fundamentals:**
- [ ] Tool names describe capability, not use case
- [ ] Inputs are data, not decisions
- [ ] Outputs are rich (enough for agent to verify)
- [ ] CRUD operations are separate tools (not one mega-tool)
- [ ] No business logic in tool implementations
- [ ] Error states clearly communicated via `isError`
- [ ] Descriptions explain what the tool does, not when to use it

**Dynamic Capability Discovery (for agent-native apps):**
- [ ] For external APIs where agent should have full access, use dynamic discovery
- [ ] Include a `list_*` or `discover_*` tool for each API surface
- [ ] Use string inputs (not enums) when the API validates
- [ ] Inject available capabilities into system prompt at runtime
- [ ] Only use static tool mapping if intentionally limiting agent scope

**CRUD Completeness:**
- [ ] Every entity has create, read, update, delete operations
- [ ] Every UI action has a corresponding agent tool
- [ ] Test: "Can the agent undo what it just did?"
</checklist>
