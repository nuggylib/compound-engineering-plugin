<overview>
Testing agent-native apps requires different approaches than traditional unit testing. You're testing whether the agent achieves outcomes, not whether it calls specific functions. This guide provides concrete testing patterns for verifying your app is truly agent-native.
</overview>

<testing_philosophy>
## Testing Philosophy

### Test Outcomes, Not Procedures

**Traditional (procedure-focused):**
```typescript
// Testing that a specific function was called with specific args
expect(mockProcessFeedback).toHaveBeenCalledWith({
  message: "Great app!",
  category: "praise",
  priority: 2
});
```

**Agent-native (outcome-focused):**
```typescript
// Testing that the outcome was achieved
const result = await agent.process("Great app!");
const storedFeedback = await db.feedback.getLatest();

expect(storedFeedback.content).toContain("Great app");
expect(storedFeedback.importance).toBeGreaterThanOrEqual(1);
expect(storedFeedback.importance).toBeLessThanOrEqual(5);
// We don't care exactly how it categorized—just that it's reasonable
```

### Accept Variability

Agents solve problems differently each run. Verify end state (not path), accept reasonable ranges (not exact values), check presence of required elements (not exact format).
</testing_philosophy>

<can_agent_do_it_test>
## The "Can Agent Do It?" Test

For each UI feature, write a test prompt and verify the agent can accomplish it.

### Template

```typescript
describe('Agent Capability Tests', () => {
  test('Agent can add a book to library', async () => {
    const result = await agent.chat("Add 'Moby Dick' by Herman Melville to my library");

    // Verify outcome
    const library = await libraryService.getBooks();
    const mobyDick = library.find(b => b.title.includes("Moby Dick"));

    expect(mobyDick).toBeDefined();
    expect(mobyDick.author).toContain("Melville");
  });

  test('Agent can publish to feed', async () => {
    await libraryService.addBook({ id: "book_123", title: "1984" });
    await agent.chat("Write something about surveillance themes in my feed");
    const newItem = (await feedService.getItems()).find(item => item.bookId === "book_123");
    expect(newItem).toBeDefined();
    expect(newItem.content.toLowerCase()).toMatch(/surveillance|watching|control/);
  });

  test('Agent can search and save research', async () => {
    await libraryService.addBook({ id: "book_456", title: "Moby Dick" });
    await agent.chat("Research whale symbolism in Moby Dick");
    const files = await fileService.listFiles("Research/book_456/");
    expect(files.length).toBeGreaterThan(0);
    expect((await fileService.readFile(files[0])).toLowerCase()).toMatch(/whale|symbolism|melville/);
  });
});
```

### The "Write to Location" Test

A key litmus test: can the agent create content in specific app locations?

```typescript
describe('Location Awareness Tests', () => {
  const locations = [
    { userPhrase: "my reading feed", expectedTool: "publish_to_feed" },
    { userPhrase: "my library", expectedTool: "add_book" },
    { userPhrase: "my research folder", expectedTool: "write_file" },
    { userPhrase: "my profile", expectedTool: "write_file" },
  ];

  for (const { userPhrase, expectedTool } of locations) {
    test(`Agent knows how to write to "${userPhrase}"`, async () => {
      const result = await agent.chat(`Write a test note to ${userPhrase}`);
      expect(result.toolCalls).toContainEqual(expect.objectContaining({ name: expectedTool }));
    });
  }
});
```
</can_agent_do_it_test>

<surprise_test>
## The "Surprise Test"

A well-designed agent-native app lets the agent figure out creative approaches. Test this by giving open-ended requests.

### The Test

```typescript
describe('Agent Creativity Tests', () => {
  test('Agent can handle open-ended requests', async () => {
    await libraryService.addBook({ id: "1", title: "1984", author: "Orwell" });
    await libraryService.addBook({ id: "2", title: "Brave New World", author: "Huxley" });
    await libraryService.addBook({ id: "3", title: "Fahrenheit 451", author: "Bradbury" });

    const result = await agent.chat("Help me organize my reading for next month");
    // Should do something useful with library tools — we don't specify what
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls.some(c => ["read_library", "write_file", "publish_to_feed"].includes(c.name))).toBe(true);
  });

  test('Agent finds creative solutions', async () => {
    const result = await agent.chat("I want to understand the dystopian themes across my sci-fi books");
    // Agent might: comparison doc, research + relate, mind map, feed insights
    // Just verify it did something substantive
    expect(result.response.length).toBeGreaterThan(100);
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });
});
```

### What Failure Looks Like

```typescript
// If agent says "I can't" / "I don't have a tool" / "Could you clarify" for
// something it should handle -> context injection or capability gap
const result = await agent.chat("Help me prepare for a book club discussion");
expect(result.response).not.toContain("I can't");
expect(result.response).not.toContain("I don't have a tool");
```
</surprise_test>

<parity_testing>
## Automated Parity Testing

Ensure every UI action has an agent equivalent.

### Capability Map Testing

```typescript
// capability-map.ts — map every UI action to an agent tool (or N/A for UI-only)
export const capabilityMap = {
  "View library": "read_library", "Add book": "add_book", "Delete book": "delete_book",
  "Publish insight": "publish_to_feed", "Start research": "start_research",
  "View highlights": "read_library", "Edit profile": "write_file",
  "Search web": "web_search", "Export data": "N/A",
};

// parity.test.ts — iterate capabilityMap, verify each tool exists and is in system prompt
describe('Action Parity', () => {
  for (const [uiAction, toolName] of Object.entries(capabilityMap)) {
    if (toolName === 'N/A') continue;
    test(`"${uiAction}" has agent tool: ${toolName}`, () => {
      expect(getAgentTools().map(t => t.name)).toContain(toolName);
    });
    test(`${toolName} is documented in system prompt`, () => {
      expect(getSystemPrompt()).toContain(toolName);
    });
  }
});
```

### Context Parity Testing

```typescript
describe('Context Parity', () => {
  test('Agent sees all data that UI shows', async () => {
    await libraryService.addBook({ id: "1", title: "Test Book" });
    await feedService.addItem({ id: "f1", content: "Test insight" });
    const systemPrompt = await buildSystemPrompt();
    expect(systemPrompt).toContain("Test Book");
    expect(systemPrompt).toContain("Test insight");
  });

  test('Recent activity is visible to agent', async () => {
    await activityService.log({ action: "highlighted", bookId: "1" });
    const systemPrompt = await buildSystemPrompt();
    expect(systemPrompt).toMatch(/highlighted|researched/);
  });
});
```
</parity_testing>

<integration_testing>
## Integration Testing

Test the full flow from user request to outcome.

### End-to-End Flow Tests

```typescript
describe('End-to-End Flows', () => {
  test('Research flow: request -> web search -> file creation', async () => {
    const bookId = "book_123";
    await libraryService.addBook({ id: bookId, title: "Moby Dick" });
    await agent.chat("Research the historical context of whaling in Moby Dick");

    // Verify web search performed with relevant query
    expect(mockWebSearch.mock.calls.some(c => c[0].query.toLowerCase().includes("whaling"))).toBe(true);

    // Verify files created with relevant content
    const files = await fileService.listFiles(`Research/${bookId}/`);
    expect(files.length).toBeGreaterThan(0);
    expect((await fileService.readFile(files[0])).toLowerCase()).toMatch(/whale|whaling|nantucket|melville/);
  });

  test('Publish flow: request -> feed update -> content verified', async () => {
    await libraryService.addBook({ id: "book_1", title: "1984" });
    const feedBefore = await feedService.getItems();
    await agent.chat("Write something about Big Brother for my reading feed");
    const feedAfter = await feedService.getItems();
    expect(feedAfter.length).toBe(feedBefore.length + 1);
    /* verify new item content matches /big brother|surveillance|watching/ */
  });
});
```

### Failure Recovery Tests

```typescript
describe('Failure Recovery', () => {
  test('Agent handles missing book gracefully', async () => {
    const result = await agent.chat("Tell me about 'Nonexistent Book'");
    expect(result.error).toBeUndefined();
    expect(result.response.toLowerCase()).toMatch(/not found|don't see|can't find|library/);
  });

  test('Agent recovers from API failure', async () => {
    mockWebSearch.mockRejectedValueOnce(new Error("Network error"));
    const result = await agent.chat("Research this topic");
    expect(result.error).toBeUndefined();
    expect(result.response.toLowerCase()).toMatch(/couldn't search|unable to|try again/);
  });
});
```
</integration_testing>

<snapshot_testing>
## Snapshot Testing for System Prompts

Track changes to system prompts and context injection over time.

```typescript
describe('System Prompt Stability', () => {
  test('System prompt structure matches snapshot', async () => {
    const systemPrompt = await buildSystemPrompt();
    // Normalize dynamic data (IDs, titles, dates) then snapshot
    const structure = systemPrompt
      .replace(/id: \w+/g, 'id: [ID]')
      .replace(/"[^"]+"/g, '"[TITLE]"')
      .replace(/\d{4}-\d{2}-\d{2}/g, '[DATE]');
    expect(structure).toMatchSnapshot();
  });

  test('All capability sections are present', async () => {
    const prompt = await buildSystemPrompt();
    for (const section of ["Your Capabilities", "Available Books", "Recent Activity"]) {
      expect(prompt).toContain(section);
    }
  });
});
```
</snapshot_testing>

<manual_testing>
## Manual Testing Checklist

Some things are best tested manually during development:

### Natural Language Variation Test

Try multiple phrasings: "Add this to my feed" / "Write something in my reading feed" / "Publish an insight" / "Put this in the feed" -- all should work if context injection is correct.

### Edge Case Prompts

- "What can you do?" -> describe capabilities
- "Help me with my books" -> engage with library, not ask what "books" means
- "Write something" -> ask WHERE if unclear
- "Delete everything" -> confirm before destructive actions

### Confusion Test

- "What's in my research folder?" -> list files, not "what research folder?"
- "Show me my recent reading" -> show activity, not "what do you mean?"
- "Continue where I left off" -> reference recent activity
</manual_testing>

<ci_integration>
## CI/CD Integration

Add agent-native tests to your CI pipeline:

```yaml
# .github/workflows/test.yml — key steps
jobs:
  agent-tests:
    steps:
      - run: npm run test:parity          # No API key needed
      - run: npm run test:capabilities    # Needs ANTHROPIC_API_KEY
      - run: npm run test:system-prompt   # Completeness check
      - run: npm run generate:capability-map && git diff --exit-code capability-map.ts
```

### Cost-Aware Testing

Agent tests cost API tokens. Strategies to manage:

```typescript
const testConfig = {
  model: process.env.CI ? "claude-3-haiku" : "claude-3-opus",  // cheaper in CI
  maxTokens: 500,
};

// Cache responses for deterministic tests (24h TTL)
const cachedAgent = new CachedAgent({ cacheDir: ".test-cache", ttl: 86400000 });

// Run expensive tests only on main branch
if (process.env.GITHUB_REF === 'refs/heads/main') { /* full integration suite */ }
```
</ci_integration>

<test_utilities>
## Test Utilities

### Agent Test Harness

```typescript
class AgentTestHarness {
  private agent: Agent;
  private mockServices: MockServices;

  async setup() { /* createMockServices + createAgent with haiku for cost */ }
  async chat(message: string): Promise<AgentResponse> { return this.agent.chat(message); }
  async expectToolCall(toolName: string) { /* assert last response contains toolName */ }
  async expectOutcome(check: () => Promise<boolean>) { expect(await check()).toBe(true); }
  getState() { return { library: ..., feed: ..., files: ... }; }
}

// Usage
test('full flow', async () => {
  const harness = new AgentTestHarness();
  await harness.setup();
  await harness.chat("Add 'Moby Dick' to my library");
  await harness.expectToolCall("add_book");
  await harness.expectOutcome(async () => harness.getState().library.some(b => b.title.includes("Moby")));
});
```
</test_utilities>

<checklist>
## Testing Checklist

Automated Tests:
- [ ] "Can Agent Do It?" tests for each UI action
- [ ] Location awareness tests ("write to my feed")
- [ ] Parity tests (tool exists, documented in prompt)
- [ ] Context parity tests (agent sees what UI shows)
- [ ] End-to-end flow tests
- [ ] Failure recovery tests

Manual Tests:
- [ ] Natural language variation (multiple phrasings work)
- [ ] Edge case prompts (open-ended requests)
- [ ] Confusion test (agent knows app vocabulary)
- [ ] Surprise test (agent can be creative)

CI Integration:
- [ ] Parity tests run on every PR
- [ ] Capability tests run with API key
- [ ] System prompt completeness check
- [ ] Capability map drift detection
</checklist>
