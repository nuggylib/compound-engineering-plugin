<overview>
Architectural patterns for building agent-native systems. These patterns emerge from the five core principles: Parity, Granularity, Composability, Emergent Capability, and Improvement Over Time.

Features are outcomes achieved by agents operating in a loop, not functions you write. Tools are atomic primitives. The agent applies judgment; the prompt defines the outcome.

See also:
- [files-universal-interface.md](./files-universal-interface.md) for file organization and context.md patterns
- [agent-execution-patterns.md](./agent-execution-patterns.md) for completion signals and partial completion
- [product-implications.md](./product-implications.md) for progressive disclosure and approval patterns
</overview>

<pattern name="event-driven-agent">
## Event-Driven Agent Architecture

The agent runs as a long-lived process that responds to events. Events become prompts.

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Loop                                │
├─────────────────────────────────────────────────────────────┤
│  Event Source → Agent (Claude) → Tool Calls → Response      │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌───────────┐
    │ Content │    │   Self   │    │   Data    │
    │  Tools  │    │  Tools   │    │   Tools   │
    └─────────┘    └──────────┘    └───────────┘
    (write_file)   (read_source)   (store_item)
                   (restart)       (list_items)
```

**Key characteristics:** Events trigger agent turns. Agent decides response via system prompt. Tools are IO primitives. State persists via data tools.

**Example: Discord feedback bot**
```typescript
// Event source
client.on("messageCreate", (message) => {
  if (!message.author.bot) {
    runAgent({
      userMessage: `New message from ${message.author}: "${message.content}"`,
      channelId: message.channelId,
    });
  }
});

// System prompt defines behavior
const systemPrompt = `
When someone shares feedback:
1. Acknowledge their feedback warmly
2. Ask clarifying questions if needed
3. Store it using the feedback tools
4. Update the feedback site

Use your judgment about importance and categorization.
`;
```
</pattern>

<pattern name="two-layer-git">
## Two-Layer Git Architecture

For self-modifying agents, separate code (shared) from data (instance-specific).

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub (shared repo)                     │
│  - src/           (agent code)                              │
│  - site/          (web interface)                           │
│  - package.json   (dependencies)                            │
│  - .gitignore     (excludes data/, logs/)                   │
└─────────────────────────────────────────────────────────────┘
                          │
                     git clone
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Instance (Server)                           │
│                                                              │
│  FROM GITHUB (tracked):                                      │
│  - src/           → pushed back on code changes             │
│  - site/          → pushed, triggers deployment             │
│                                                              │
│  LOCAL ONLY (untracked):                                     │
│  - data/          → instance-specific storage               │
│  - logs/          → runtime logs                            │
│  - .env           → secrets                                 │
└─────────────────────────────────────────────────────────────┘
```

**Why:** Code is version-controlled with rollback. Data stays local. Site is generated from data, so reproducible.
</pattern>

<pattern name="multi-instance">
## Multi-Instance Branching

Each agent instance gets its own branch while sharing core code.

```
main                        # Shared features, bug fixes
├── instance/feedback-bot   # Every Reader feedback bot
├── instance/support-bot    # Customer support bot
└── instance/research-bot   # Research assistant
```

**Change flow:**
| Change Type | Work On | Then |
|-------------|---------|------|
| Core features | main | Merge to instance branches |
| Bug fixes | main | Merge to instance branches |
| Instance config | instance branch | Done |
| Instance data | instance branch | Done |

**Sync tools:**
```typescript
tool("self_deploy", "Pull latest from main, rebuild, restart", ...)
tool("sync_from_instance", "Merge from another instance", ...)
tool("propose_to_main", "Create PR to share improvements", ...)
```
</pattern>

<pattern name="site-as-output">
## Site as Agent Output

The agent generates and maintains a website as a natural output, not through specialized site tools.

```
Discord Message -> Agent extracts insights -> writes files via write_file -> git push -> deploy
```

**Key insight:** Don't build site generation tools. Give the agent file tools and teach it in the prompt how to create good sites.

```markdown
## Site Management
You maintain a public feedback site. On new feedback:
1. write_file to update site/public/content/feedback.json
2. Improve React components if needed
3. Commit + push to trigger Vercel deploy
You decide the structure. Make it clean with clear hierarchy and status organization.
```
</pattern>

<pattern name="approval-gates">
## Approval Gates Pattern

Separate "propose" from "apply" for dangerous operations.

```typescript
const pendingChanges = new Map<string, string>();

tool("write_file", async ({ path, content }) => {
  if (requiresApproval(path)) {
    pendingChanges.set(path, content);
    return { text: `Change requires approval.\n\n${generateDiff(path, content)}\n\nReply "yes" to apply.` };
  }
  writeFileSync(path, content);
  return { text: `Wrote ${path}` };
});

tool("apply_pending", async () => {
  /* iterate pendingChanges -> writeFileSync each -> clear map */
});
```

**What requires approval:**
- src/*.ts (agent code)
- package.json (dependencies)
- system prompt changes

**What doesn't:**
- data/* (instance data)
- site/* (generated content)
- docs/* (documentation)
</pattern>

<pattern name="unified-agent-architecture">
## Unified Agent Architecture

One execution engine, many agent types. All agents use the same orchestrator but with different configurations.

```
AgentOrchestrator (lifecycle, checkpoint/restore, tool execution, chat)
  |-- Research Agent: web_search, write_file, read_file
  |-- Chat Agent: read_library, publish_to_feed, web_search
  |-- Profile Agent: read_photos, write_file, analyze_image
```

**Implementation:**

```swift
// All agents use the same orchestrator
let session = try await AgentOrchestrator.shared.startAgent(
    config: ResearchAgent.create(book: book),  // Config varies
    tools: ResearchAgent.tools,                 // Tools vary
    context: ResearchAgent.context(for: book)   // Context varies
)

struct ResearchAgent {
    static var tools: [AgentTool] { [FileTools.readFile(), FileTools.writeFile(), WebTools.webSearch(), WebTools.webFetch()] }
    static func context(for book: Book) -> String {
        "You are researching \"\(book.title)\" by \(book.author). Save findings to Documents/Research/\(book.id)/"
    }
}

struct ChatAgent {
    static var tools: [AgentTool] { /* FileTools + BookTools.readLibrary + BookTools.publishToFeed + WebTools */ }
    static func context(library: [Book]) -> String { /* reading assistant prompt with available books */ }
}
```

**Benefits:** Consistent lifecycle, automatic checkpoint/resume, shared tool protocol, easy to add agent types, centralized error handling.
</pattern>

<pattern name="agent-to-ui-communication">
## Agent-to-UI Communication

When agents take actions, the UI should reflect them immediately. The user should see what the agent did.

**Pattern 1: Shared Data Store (Recommended)**

Agent writes through the same service the UI observes:

```swift
class BookLibraryService: ObservableObject {
    static let shared = BookLibraryService()
    @Published var books: [Book] = []
    @Published var feedItems: [FeedItem] = []
    func addFeedItem(_ item: FeedItem) { feedItems.append(item); persist() }
}

// Agent tool writes through shared service (same instance UI observes)
tool("publish_to_feed", async ({ bookId, content, headline }) => {
    BookLibraryService.shared.addFeedItem(FeedItem(bookId: bookId, content: content, headline: headline))
    return { text: "Published to feed" }
})

// UI: @StateObject var library = BookLibraryService.shared -> List auto-updates
```

**Pattern 2: File System Observation**

For file-based data, watch the file system:

```swift
class ResearchWatcher: ObservableObject {
    @Published var files: [URL] = []
    private var watcher: DirectoryWatcher?

    func watch(bookId: String) {
        /* DirectoryWatcher on Research/{bookId} -> reload on change; agent write_file triggers UI update automatically */
    }
}
```

**Pattern 3: Event Bus (Cross-Component)**

For complex apps with multiple independent components:

```typescript
const agentEvents = new EventEmitter();

// Agent tool emits events on action
tool("publish_to_feed", async ({ content }) => {
    const item = await feedService.add(content);
    agentEvents.emit('feed:new-item', item);
    return { text: "Published" };
});

// UI subscribes: useEffect -> agentEvents.on('feed:new-item', handler) -> cleanup on unmount
```

**What to avoid:**

```swift
// BAD: Agent writes directly to database, UI loads once at startup -> stale data
```
</pattern>

<pattern name="model-tier-selection">
## Model Tier Selection

Different agents need different intelligence levels. Use the cheapest model that achieves the outcome.

| Agent Type | Recommended Tier | Reasoning |
|------------|-----------------|-----------|
| Chat/Conversation | Balanced | Fast responses, good reasoning |
| Research | Balanced | Tool loops, not ultra-complex synthesis |
| Content Generation | Balanced | Creative but not synthesis-heavy |
| Complex Analysis | Powerful | Multi-document synthesis, nuanced judgment |
| Profile/Onboarding | Powerful | Photo analysis, complex pattern recognition |
| Simple Queries | Fast/Haiku | Quick lookups, simple transformations |

**Implementation:**

```swift
enum ModelTier {
    case fast      // claude-3-haiku: Quick, cheap, simple tasks
    case balanced  // claude-3-sonnet: Good balance for most tasks
    case powerful  // claude-3-opus: Complex reasoning, synthesis
}

struct AgentConfig {
    let modelTier: ModelTier
    let tools: [AgentTool]
    let systemPrompt: String
}

// Match tier to task: research=.balanced, profileAnalysis=.powerful, quickLookup=.fast
```

**Cost optimization:** Start balanced, upgrade only if quality insufficient. Use fast for tool-heavy loops. Reserve powerful for multi-source synthesis.
</pattern>

<design_questions>
## Questions to Ask When Designing

1. **Event triggers?** (messages, webhooks, timers, user requests)
2. **Primitives needed?** (read, write, call API, restart)
3. **Agent decisions vs hardcoded?** (agent: format, priority; hardcoded: security, approvals)
4. **Verification?** (health checks, build verification)
5. **Recovery?** (git rollback, approval gates)
6. **UI communication?** (shared store, file watching, events)
7. **Model tier per agent?** (fast, balanced, powerful)
8. **Shared infrastructure?** (unified orchestrator, shared tools)
</design_questions>
