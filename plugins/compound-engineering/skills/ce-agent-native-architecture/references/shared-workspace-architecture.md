<overview>
Agents and users should work in the same data space, not separate sandboxes. When the agent writes a file, the user can see it. When the user edits something, the agent can read the changes. This creates transparency, enables collaboration, and eliminates the need for sync layers.

**Core principle:** The agent operates in the same filesystem as the user, not a walled garden.
</overview>

<why_shared_workspace>
## Why Shared Workspace?

### The Sandbox Anti-Pattern

Many agent implementations isolate the agent:

```
User Space <--sync--> Agent Space    # Separate sandboxes
```

Problems: sync layer needed, user can't inspect agent work, state duplication, consistency complexity.

### The Shared Workspace Pattern

```
┌─────────────────────────────────────────┐
│           Shared Workspace              │
├─────────────────────────────────────────┤
│ Documents/                              │
│ ├── Research/                           │
│ │   └── {bookId}/        ← Agent writes │
│ │       ├── full_text.txt               │
│ │       ├── introduction.md  ← User can edit │
│ │       └── sources/                    │
│ ├── Chats/               ← Both read/write │
│ └── profile.md           ← Agent generates, user refines │
└─────────────────────────────────────────┘
         ↑                    ↑
       User                 Agent
       (UI)               (Tools)
```

Benefits: mutual inspection/editing, no sync layer, complete transparency, single source of truth.
</why_shared_workspace>

<directory_structure>
## Designing Your Shared Workspace

### Structure by Domain

Organize by what the data represents, not who created it:

```
Documents/
├── Research/
│   └── {bookId}/
│       ├── full_text.txt        # Agent downloads
│       ├── introduction.md      # Agent generates, user can edit
│       ├── notes.md             # User adds, agent can read
│       └── sources/
│           └── {source}.md      # Agent gathers
├── Chats/
│   └── {conversationId}.json    # Both read/write
├── Exports/
│   └── {date}/                  # Agent generates for user
└── profile.md                   # Agent generates from photos
```

### Don't Structure by Actor

Avoid separating `user_created/` vs `agent_created/` directories -- this creates artificial boundaries.

### Use Conventions for Metadata

If you need to track who created/modified something:

```markdown
<!-- introduction.md -->
---
created_by: agent
created_at: 2024-01-15
last_modified_by: user
last_modified_at: 2024-01-16
---
# Introduction to Moby Dick
```
</directory_structure>

<file_tools>
## File Tools for Shared Workspace

Give the agent the same file primitives the app uses:

```swift
// iOS/Swift implementation
struct FileTools {
    static func readFile() -> AgentTool {
        tool(name: "read_file", description: "Read a file from the user's documents",
            parameters: ["path": .string("File path relative to Documents/")],
            execute: { params in
                let path = params["path"] as! String
                let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let fileURL = documentsURL.appendingPathComponent(path)
                return ToolResult(text: try String(contentsOf: fileURL))
            })
    }

    static func writeFile() -> AgentTool {
        tool(name: "write_file", description: "Write a file to the user's documents",
            parameters: ["path": .string("File path relative to Documents/"), "content": .string("File content")],
            execute: { params in /* resolve path -> createDirectory(withIntermediateDirectories) -> write atomically */ })
    }

    static func listFiles() -> AgentTool {
        tool(name: "list_files", description: "List files in a directory",
            parameters: ["path": .string("Directory path relative to Documents/")],
            execute: { params in /* resolve path -> contentsOfDirectory -> join with newline */ })
    }

    static func searchText() -> AgentTool {
        tool(name: "search_text", description: "Search for text across files",
            parameters: ["query": .string("Text to search for"), "path": .string("Directory to search in").optional()],
            execute: { params in /* search across documents, return matching files and snippets */ })
    }
}
```

### TypeScript/Node.js Implementation

```typescript
// Same primitives as Swift: read_file, write_file, list_files, append_file
const fileTools = [
  tool("read_file", "Read a file from the workspace",
    { path: z.string() },
    async ({ path }) => ({ text: await fs.readFile(path, 'utf-8') })),

  tool("write_file", "Write a file to the workspace",
    { path: z.string(), content: z.string() },
    async ({ path, content }) => {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content, 'utf-8');
      return { text: `Wrote ${path}` };
    }),

  tool("list_files", "List files in a directory",
    { path: z.string() },
    async ({ path }) => ({ text: (await fs.readdir(path)).join('\n') })),

  tool("append_file", "Append content to a file",
    { path: z.string(), content: z.string() },
    async ({ path, content }) => { /* fs.appendFile */ }),
];
```
</file_tools>

<ui_integration>
## UI Integration with Shared Workspace

The UI should observe the same files the agent writes to:

### Pattern 1: File-Based Reactivity (iOS)

```swift
class ResearchViewModel: ObservableObject {
    @Published var researchFiles: [ResearchFile] = []
    private var watcher: DirectoryWatcher?

    func startWatching(bookId: String) {
        /* resolve Research/{bookId} path -> DirectoryWatcher that reloads on change -> initial load */
    }
}

struct ResearchView: View {
    @StateObject var viewModel = ResearchViewModel()
    var body: some View { List(viewModel.researchFiles) { file in ResearchFileRow(file: file) } }
}
```

### Pattern 2: Shared Data Store

When file-watching isn't practical, use a shared data store:

```swift
// Shared service that both UI and agent tools use
class BookLibraryService: ObservableObject {
    static let shared = BookLibraryService()
    @Published var books: [Book] = []
    @Published var analysisRecords: [AnalysisRecord] = []

    func addAnalysisRecord(_ record: AnalysisRecord) { analysisRecords.append(record); saveToStorage() }
}

// Agent tool writes through the same service
tool("publish_to_feed", async ({ bookId, content, headline }) => {
    BookLibraryService.shared.addAnalysisRecord(AnalysisRecord(bookId: bookId, content: content, headline: headline))
    return { text: "Published to feed" }
})

// UI observes the same service -> auto-updates
struct FeedView: View {
    @StateObject var library = BookLibraryService.shared
    var body: some View { List(library.analysisRecords) { record in FeedItemRow(record: record) } }
}
```

### Pattern 3: Hybrid (Files + Index)

Use files for content, database for indexing:

```
Documents/
├── Research/
│   └── book_123/
│       └── introduction.md   # Actual content (file)

Database:
├── research_index
│   └── { bookId: "book_123", path: "Research/book_123/introduction.md", ... }
```

```swift
// Agent writes file + updates index
await writeFile("Research/\(bookId)/introduction.md", content)
await database.insert("research_index", { bookId, path, title: extractTitle(content), createdAt: Date() })

// UI queries index, then reads files on demand
let items = database.query("research_index", where: bookId == "book_123")
```
</ui_integration>

<collaboration_patterns>
## Agent-User Collaboration Patterns

### Pattern: Agent Drafts, User Refines

```
1. Agent generates introduction.md
2. User opens in Files app or in-app editor
3. User makes refinements
4. Agent can see changes via read_file
5. Future agent work builds on user refinements
```

The agent's system prompt should acknowledge this:

```markdown
## Working with User Content
Always read existing files before modifying them—the user may have made improvements.
If a file has been modified by the user, ask before overwriting.
```

### Pattern: User Seeds, Agent Expands

```
1. User creates notes.md with initial thoughts
2. User asks: "Research more about this"
3. Agent reads notes.md to understand context
4. Agent adds to notes.md or creates related files
5. User continues building on agent additions
```

### Pattern: Append-Only Collaboration

For chat logs or activity streams:

```markdown
<!-- activity.md - Both append, neither overwrites -->
## 2024-01-15
**User:** Started reading "Moby Dick"
**Agent:** Downloaded full text and created research folder
**User:** Added highlight about whale symbolism
**Agent:** Found 3 academic sources on whale symbolism
```
</collaboration_patterns>

<security_considerations>
## Security in Shared Workspace

### Scope the Workspace

Don't give agents access to the entire filesystem:

```swift
// GOOD: Scoped to app's documents — path is relative, guard against escape
let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
tool("read_file", { path }) {
    let fileURL = documentsURL.appendingPathComponent(path)
    guard fileURL.path.hasPrefix(documentsURL.path) else { throw ToolError("Invalid path") }
    return try String(contentsOf: fileURL)
}

// BAD: Absolute paths allow escape (can read /etc/passwd!)
```

### Protect Sensitive Files

```swift
let protectedPaths = [".env", "credentials.json", "secrets/"]
// Guard in each tool: if protectedPaths.any({ path.contains($0) }) -> throw ToolError
```

### Audit Agent Actions

```swift
// Log all file access: logger.info("[\(agentId)] \(action): \(path)")
```
</security_considerations>

<examples>
## Real-World Example: Every Reader

The Every Reader app uses shared workspace for research:

```
Documents/
├── Research/
│   └── book_moby_dick/
│       ├── full_text.txt           # Agent downloads from Gutenberg
│       ├── introduction.md         # Agent generates, personalized
│       ├── sources/
│       │   ├── whale_symbolism.md  # Agent researches
│       │   └── melville_bio.md     # Agent researches
│       └── user_notes.md           # User can add their own notes
├── Chats/
│   └── 2024-01-15.json             # Chat history
└── profile.md                       # Agent generated from photos
```

**Flow:** User adds book -> agent downloads text, researches sources, generates personalized introduction -> user views/edits in app or Files.app -> chat agent reads all context when answering questions.
</examples>

<icloud_sync>
## iCloud File Storage for Multi-Device Sync (iOS)

For agent-native iOS apps, use iCloud Drive's Documents folder for your shared workspace. This gives you **free, automatic multi-device sync** without building a sync layer or running a server.

### Why iCloud Documents?

| Approach | Cost | Complexity | Offline | Multi-Device |
|----------|------|------------|---------|--------------|
| Custom backend + sync | $$$ | High | Manual | Yes |
| CloudKit database | Free tier limits | Medium | Manual | Yes |
| **iCloud Documents** | Free (user's storage) | Low | Automatic | Automatic |

iCloud Documents: user's existing storage (free 5GB+), automatic cross-device sync, offline-capable, visible in Files.app, zero server costs.

### Implementation Pattern

```swift
func iCloudDocumentsURL() -> URL? {
    FileManager.default.url(forUbiquityContainerIdentifier: nil)?.appendingPathComponent("Documents")
}

class SharedWorkspace {
    let rootURL: URL

    init() {
        // iCloud if available, local Documents fallback
        self.rootURL = iCloudDocumentsURL() ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    func researchPath(for bookId: String) -> URL { rootURL.appendingPathComponent("Research/\(bookId)") }
    func journalPath() -> URL { rootURL.appendingPathComponent("Journal") }
}
```

### Directory Structure in iCloud

```
iCloud Drive/YourApp/Documents/       # Visible in Files.app
├── Journal/{user,agent}/2025-01-15.md  # Syncs across devices
├── Experiments/{name}/config.json+log.json
└── Research/{topic}/sources.md
```

### Handling Sync Conflicts

iCloud handles conflicts automatically, but you should design for it:

```swift
func readJournalEntry(at url: URL) throws -> JournalEntry {
    /* check .icloud extension -> startDownloadingUbiquitousItem -> throw; else decode JSON normally */
}

func writeJournalEntry(_ entry: JournalEntry, to url: URL) throws {
    /* NSFileCoordinator.coordinate(writingItemAt:options:.forReplacing) -> encode + write */
}
```

### What This Enables

Cross-device transparency: agent creates files on iPhone -> visible on iPad instantly. User edits on iPad -> iPhone sees changes. No sync code needed.

### Entitlements Required

Add to your app's entitlements:

```xml
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
    <string>iCloud.com.yourcompany.yourapp</string>
</array>
<key>com.apple.developer.icloud-services</key>
<array>
    <string>CloudDocuments</string>
</array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array>
    <string>iCloud.com.yourcompany.yourapp</string>
</array>
```

### When NOT to Use iCloud Documents

Sensitive data (use Keychain), high-frequency writes (latency), large media (use CloudKit Assets), multi-user sharing (use CloudKit).
</icloud_sync>

<checklist>
## Shared Workspace Checklist

Architecture:
- [ ] Single shared directory for agent and user data
- [ ] Organized by domain, not by actor
- [ ] File tools scoped to workspace (no escape)
- [ ] Protected paths for sensitive files

Tools:
- [ ] `read_file` - Read any file in workspace
- [ ] `write_file` - Write any file in workspace
- [ ] `list_files` - Browse directory structure
- [ ] `search_text` - Find content across files (optional)

UI Integration:
- [ ] UI observes same files agent writes
- [ ] Changes reflect immediately (file watching or shared store)
- [ ] User can edit agent-created files
- [ ] Agent reads user modifications before overwriting

Collaboration:
- [ ] System prompt acknowledges user may edit files
- [ ] Agent checks for user modifications before overwriting
- [ ] Metadata tracks who created/modified (optional)

Multi-Device (iOS):
- [ ] Use iCloud Documents for shared workspace (free sync)
- [ ] Fallback to local Documents if iCloud unavailable
- [ ] Handle `.icloud` placeholder files (trigger download)
- [ ] Use NSFileCoordinator for conflict-safe writes
</checklist>
