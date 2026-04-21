<overview>
Mobile is a first-class platform for agent-native apps. It has unique constraints and opportunities. This guide covers why mobile matters, iOS storage architecture, checkpoint/resume patterns, and cost-aware design.
</overview>

<why_mobile>
## Why Mobile Matters

Mobile devices offer unique advantages for agent-native apps:

### A File System
Agents can work with files naturally, using the same primitives that work everywhere else. The filesystem is the universal interface.

### Rich Context
A walled garden you get access to. Health data, location, photos, calendars—context that doesn't exist on desktop or web. This enables deeply personalized agent experiences.

### Local Apps
Everyone has their own copy of the app. This opens opportunities that aren't fully realized yet: apps that modify themselves, fork themselves, evolve per-user. App Store policies constrain some of this today, but the foundation is there.

### Cross-Device Sync
If you use the file system with iCloud, all devices share the same file system. The agent's work on one device appears on all devices—without you having to build a server.

### The Challenge

**Agents are long-running. Mobile apps are not.**

An agent might need 30 seconds, 5 minutes, or an hour to complete a task. But iOS will background your app after seconds of inactivity, and may kill it entirely to reclaim memory. The user might switch apps, take a call, or lock their phone mid-task.

This means mobile agent apps need:
- **Checkpointing** — Saving state so work isn't lost
- **Resuming** — Picking up where you left off after interruption
- **Background execution** — Using the limited time iOS gives you wisely
- **On-device vs. cloud decisions** — What runs locally vs. what needs a server
</why_mobile>

<ios_storage>
## iOS Storage Architecture

> **Needs validation:** This is an approach that works well, but better solutions may exist.

For agent-native iOS apps, use iCloud Drive's Documents folder for your shared workspace. This gives you **free, automatic multi-device sync** without building a sync layer or running a server.

### Why iCloud Documents?

| Approach | Cost | Complexity | Offline | Multi-Device |
|----------|------|------------|---------|--------------|
| Custom backend + sync | $$$ | High | Manual | Yes |
| CloudKit database | Free tier limits | Medium | Manual | Yes |
| **iCloud Documents** | Free (user's storage) | Low | Automatic | Automatic |

iCloud Documents:
- Uses user's existing iCloud storage (free 5GB, most users have more)
- Automatic sync across all user's devices
- Works offline, syncs when online
- Files visible in Files.app for transparency
- No server costs, no sync code to maintain

### Implementation: iCloud-First with Local Fallback

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
iCloud Drive/
└── YourApp/                          # Your app's container
    └── Documents/                    # Visible in Files.app
        ├── Journal/
        │   ├── user/
        │   │   └── 2025-01-15.md     # Syncs across devices
        │   └── agent/
        │       └── 2025-01-15.md     # Agent observations sync too
        ├── Research/
        │   └── {bookId}/
        │       ├── full_text.txt
        │       └── sources/
        ├── Chats/
        │   └── {conversationId}.json
        └── context.md                # Agent's accumulated knowledge
```

### Handling iCloud File States

iCloud files may not be downloaded locally. Handle this:

```swift
func readFile(at url: URL) throws -> String {
    /* check .icloud extension -> startDownloadingUbiquitousItem -> throw FileNotYetAvailableError; else read normally */
}

func writeFile(_ content: String, to url: URL) throws {
    /* NSFileCoordinator.coordinate(writingItemAt:options:.forReplacing) -> write atomically */
}
```

### What iCloud Enables

1. **User starts experiment on iPhone** → Agent creates config file
2. **User opens app on iPad** → Same experiment visible, no sync code needed
3. **Agent logs observation on iPhone** → Syncs to iPad automatically
4. **User edits journal on iPad** → iPhone sees the edit

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

- **Sensitive data** - Use Keychain or encrypted local storage instead
- **High-frequency writes** - iCloud sync has latency; use local + periodic sync
- **Large media files** - Consider CloudKit Assets or on-demand resources
- **Shared between users** - iCloud Documents is single-user; use CloudKit for sharing
</ios_storage>

<background_execution>
## Background Execution & Resumption

> **Needs validation:** These patterns work but better solutions may exist.

Mobile apps can be suspended or terminated at any time. Agents must handle this gracefully.

### The Challenge

```
User starts research agent
     ↓
Agent begins web search
     ↓
User switches to another app
     ↓
iOS suspends your app
     ↓
Agent is mid-execution... what happens?
```

### Checkpoint/Resume Pattern

Save agent state before backgrounding, restore on foreground:

```swift
class AgentOrchestrator: ObservableObject {
    @Published var activeSessions: [AgentSession] = []

    func handleAppWillBackground() {
        for session in activeSessions {
            saveCheckpoint(session)
            session.transition(to: .backgrounded)
        }
    }

    func handleAppDidForeground() {
        for session in activeSessions where session.state == .backgrounded {
            if let checkpoint = loadCheckpoint(session.id) {
                resumeFromCheckpoint(session, checkpoint)
            }
        }
    }

    private func saveCheckpoint(_ session: AgentSession) {
        /* persist AgentCheckpoint(sessionId, conversationHistory, pendingToolCalls, partialResults, timestamp) */
    }

    private func resumeFromCheckpoint(_ session: AgentSession, _ checkpoint: AgentCheckpoint) {
        /* restore messages + pendingToolCalls from checkpoint; if pending calls exist -> transition to .running -> executeNextTool */
    }
}
```

### State Machine for Agent Lifecycle

```swift
enum AgentState {
    case idle           // Not running
    case running        // Actively executing
    case waitingForUser // Paused, waiting for user input
    case backgrounded   // App backgrounded, state saved
    case completed      // Finished successfully
    case failed(Error)  // Finished with error
}

class AgentSession: ObservableObject {
    @Published var state: AgentState = .idle

    // Valid transitions: idle->[running], running->[waitingForUser,backgrounded,completed,failed],
    // waitingForUser->[running,backgrounded], backgrounded->[running,completed]
    func transition(to newState: AgentState) {
        /* validate against transition map -> warn on invalid -> update state */
    }
}
```

### Background Task Extension (iOS)

Request extra time when backgrounded during critical operations:

```swift
class AgentOrchestrator {
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    func handleAppWillBackground() {
        /* beginBackgroundTask -> save all checkpoints -> endBackgroundTask */
    }

    private func endBackgroundTask() {
        /* guard backgroundTask != .invalid -> UIApplication.shared.endBackgroundTask -> reset to .invalid */
    }
}
```

### User Communication

Let users know what's happening:

```swift
struct AgentStatusView: View {
    @ObservedObject var session: AgentSession

    var body: some View {
        /* switch session.state -> Label with icon/color per state (backgrounded=orange, running=blue, waitingForUser=green) */
    }
}
```
</background_execution>

<permissions>
## Permission Handling

Mobile agents may need access to system resources. Handle permission requests gracefully.

### Common Permissions

| Resource | iOS Permission | Use Case |
|----------|---------------|----------|
| Photo Library | PHPhotoLibrary | Profile generation from photos |
| Files | Document picker | Reading user documents |
| Camera | AVCaptureDevice | Scanning book covers |
| Location | CLLocationManager | Location-aware recommendations |
| Network | (automatic) | Web search, API calls |

### Permission-Aware Tools

Check permissions before executing:

```swift
struct PhotoTools {
    static func readPhotos() -> AgentTool {
        tool(name: "read_photos", description: "Read photos from the user's photo library",
            parameters: ["limit": .number("Maximum photos to read"), "dateRange": .string("Date range filter").optional()],
            execute: { params, context in
                let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
                switch status {
                case .authorized, .limited:
                    let photos = await fetchPhotos(params)
                    return ToolResult(text: "Found \(photos.count) photos", images: photos)
                case .denied, .restricted:
                    return ToolResult(text: "Photo access needed. Grant in Settings -> Privacy -> Photos.", isError: true)
                case .notDetermined:
                    return ToolResult(text: "Photo permission required. Please try again.", isError: true)
                @unknown default:
                    return ToolResult(text: "Unknown permission status", isError: true)
                }
            })
    }
}
```

### Graceful Degradation

When permissions aren't granted, offer alternatives:

```swift
func readPhotos() async -> ToolResult {
    /* check PHPhotoLibrary.authorizationStatus -> if denied/restricted: suggest Settings or direct sharing alternative (isError: false) */
}
```

### Permission Request Timing

Don't request permissions until needed:

```swift
// BAD: Request all permissions at launch (overwhelms user)
// GOOD: Request when the feature is used
tool("analyze_book_cover", async ({ image }) => {
    let status = await AVCaptureDevice.requestAccess(for: .video)
    /* if granted -> scanCover; else -> ToolResult explaining camera access needed */
})
```
</permissions>

<cost_awareness>
## Cost-Aware Design

Mobile users may be on cellular data or concerned about API costs. Design agents to be efficient.

### Model Tier Selection

Use the cheapest model that achieves the outcome:

```swift
enum ModelTier {
    case fast      // claude-3-haiku: ~$0.25/1M tokens
    case balanced  // claude-3-sonnet: ~$3/1M tokens
    case powerful  // claude-3-opus: ~$15/1M tokens

    var modelId: String {
        switch self {
        case .fast: return "claude-3-haiku-20240307"
        case .balanced: return "claude-3-sonnet-20240229"
        case .powerful: return "claude-3-opus-20240229"
        }
    }
}

// Match model to task complexity: quickLookup=.fast, chat/research/introWriter=.balanced, profileGenerator=.powerful
```

### Token Budgets

Limit tokens per agent session:

```swift
struct AgentConfig {
    let modelTier: ModelTier
    let maxInputTokens: Int
    let maxOutputTokens: Int
    let maxTurns: Int

    static let research = AgentConfig(modelTier: .balanced, maxInputTokens: 50_000, maxOutputTokens: 4_000, maxTurns: 20)
    static let quickChat = AgentConfig(modelTier: .fast, maxInputTokens: 10_000, maxOutputTokens: 1_000, maxTurns: 5)
}

class AgentSession {
    var totalTokensUsed: Int = 0

    func checkBudget() -> Bool { /* compare totalTokensUsed against config.maxInputTokens -> transition to .failed if exceeded */ }
}
```

### Network-Aware Execution

Defer heavy operations to WiFi:

```swift
class NetworkMonitor: ObservableObject {
    @Published var isOnWiFi: Bool = false
    @Published var isExpensive: Bool = false  // Cellular or hotspot
    private let monitor = NWPathMonitor()

    func startMonitoring() { /* NWPathMonitor pathUpdateHandler -> update isOnWiFi/isExpensive on main queue */ }
}

class AgentOrchestrator {
    @ObservedObject var network = NetworkMonitor()

    func startResearchAgent(for book: Book) async {
        /* if network.isExpensive -> showAlert with data cost estimate -> return if user declines; else runAgent */
    }
}
```

### Batch API Calls

Combine multiple small requests:

```swift
// BAD: Many small API calls
for book in books {
    await agent.chat("Summarize \(book.title)")
}

// GOOD: Batch into one request
let bookList = books.map { $0.title }.joined(separator: ", ")
await agent.chat("Summarize each of these books briefly: \(bookList)")
```

### Caching

Cache expensive operations:

```swift
class ResearchCache {
    private var cache: [String: CachedResearch] = [:]

    func getCachedResearch(for bookId: String) -> CachedResearch? {
        /* lookup by bookId -> check 24h expiry -> return cached or nil */
    }

    func cacheResearch(_ research: Research, for bookId: String) {
        /* store CachedResearch with current timestamp */
    }
}

// In research tool: check cache first -> if miss, webSearch then cache result
```

### Cost Visibility

Show users what they're spending:

```swift
struct AgentCostView: View {
    @ObservedObject var session: AgentSession

    var body: some View {
        /* VStack: headline "Session Stats" -> HStack with turn count + token count -> optional estimated cost in USD */
    }
}
```
</cost_awareness>

<offline_handling>
## Offline Graceful Degradation

Handle offline scenarios gracefully:

```swift
class ConnectivityAwareAgent {
    @ObservedObject var network = NetworkMonitor()

    func executeToolCall(_ toolCall: ToolCall) async -> ToolResult {
        /* check if tool requires network (web_search, web_fetch, call_api) -> if offline: return friendly message listing offline capabilities -> else executeOnline */
    }
}
```

### Offline-First Tools

Some tools should work entirely offline:

```swift
let offlineTools: Set<String> = ["read_file", "write_file", "list_files", "read_library", "search_local"]
let onlineTools: Set<String> = ["web_search", "web_fetch", "publish_to_cloud"]
let hybridTools: Set<String> = ["publish_to_feed"]  // Works offline, syncs later
```

### Queued Actions

Queue actions that require connectivity:

```swift
class OfflineQueue: ObservableObject {
    @Published var pendingActions: [QueuedAction] = []

    func queue(_ action: QueuedAction) { /* append + persist */ }
    func processWhenOnline() { /* observe network.$isConnected -> processPendingActions when true */ }
    private func processPendingActions() { /* iterate pending -> execute each -> remove on success */ }
}
```
</offline_handling>

<battery_awareness>
## Battery-Aware Execution

Respect device battery state:

```swift
class BatteryMonitor: ObservableObject {
    @Published var batteryLevel: Float = 1.0
    @Published var isCharging: Bool = false
    @Published var isLowPowerMode: Bool = false

    var shouldDeferHeavyWork: Bool { batteryLevel < 0.2 && !isCharging }

    func startMonitoring() {
        /* enable isBatteryMonitoringEnabled -> observe batteryLevelDidChange + NSProcessInfoPowerStateDidChange */
    }
}

class AgentOrchestrator {
    @ObservedObject var battery = BatteryMonitor()

    func startAgent(_ config: AgentConfig) async {
        /* if shouldDeferHeavyWork && config.isHeavy -> showAlert -> return if declined; downgrade to .fast in low power mode */
    }
}
```
</battery_awareness>

<on_device_vs_cloud>
## On-Device vs. Cloud

Understanding what runs where in a mobile agent-native app:

| Component | On-Device | Cloud |
|-----------|-----------|-------|
| Orchestration | ✅ | |
| Tool execution | ✅ (file ops, photo access, HealthKit) | |
| LLM calls | | ✅ (Anthropic API) |
| Checkpoints | ✅ (local files) | Optional via iCloud |
| Long-running agents | Limited by iOS | Possible with server |

### Implications

**Network required for reasoning:**
- The app needs network connectivity for LLM calls
- Design tools to degrade gracefully when network is unavailable
- Consider offline caching for common queries

**Data stays local:**
- File operations happen on device
- Sensitive data never leaves the device unless explicitly synced
- Privacy is preserved by default

**Long-running agents:**
For truly long-running agents (hours), consider a server-side orchestrator that can run indefinitely, with the mobile app as a viewer and input mechanism.
</on_device_vs_cloud>

<checklist>
## Mobile Agent-Native Checklist

**iOS Storage:**
- [ ] iCloud Documents as primary storage (or conscious alternative)
- [ ] Local Documents fallback when iCloud unavailable
- [ ] Handle `.icloud` placeholder files (trigger download)
- [ ] Use NSFileCoordinator for conflict-safe writes

**Background Execution:**
- [ ] Checkpoint/resume implemented for all agent sessions
- [ ] State machine for agent lifecycle (idle, running, backgrounded, etc.)
- [ ] Background task extension for critical saves (30 second window)
- [ ] User-visible status for backgrounded agents

**Permissions:**
- [ ] Permissions requested only when needed, not at launch
- [ ] Graceful degradation when permissions denied
- [ ] Clear error messages with Settings deep links
- [ ] Alternative paths when permissions unavailable

**Cost Awareness:**
- [ ] Model tier matched to task complexity
- [ ] Token budgets per session
- [ ] Network-aware (defer heavy work to WiFi)
- [ ] Caching for expensive operations
- [ ] Cost visibility to users

**Offline Handling:**
- [ ] Offline-capable tools identified
- [ ] Graceful degradation for online-only features
- [ ] Action queue for sync when online
- [ ] Clear user communication about offline state

**Battery Awareness:**
- [ ] Battery monitoring for heavy operations
- [ ] Low power mode detection
- [ ] Defer or downgrade based on battery state
</checklist>
