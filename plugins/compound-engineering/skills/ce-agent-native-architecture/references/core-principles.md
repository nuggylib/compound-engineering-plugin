# Core Principles

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
