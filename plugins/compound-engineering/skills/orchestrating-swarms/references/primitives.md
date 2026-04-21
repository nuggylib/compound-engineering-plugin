# Primitives

| Primitive | What It Is | File Location |
|-----------|-----------|---------------|
| **Agent** | A Claude instance that can use tools. The orchestrator is an agent; spawned instances are subagents. | N/A (process) |
| **Team** | A named group of agents working together. One leader, multiple teammates. | `~/.claude/teams/{name}/config.json` |
| **Teammate** | An agent that joined a team. Has a name, color, inbox. Spawned via Task with `team_name` + `name`. | Listed in team config |
| **Leader** | The agent that created the team. Receives teammate messages, approves plans/shutdowns. | First member in config |
| **Task** | A work item with subject, description, status, owner, and dependencies. | `~/.claude/tasks/{team}/N.json` |
| **Inbox** | JSON file where an agent receives messages from teammates. | `~/.claude/teams/{name}/inboxes/{agent}.json` |
| **Message** | A JSON object sent between agents. Can be text or structured (shutdown_request, idle_notification, etc). | Stored in inbox files |
| **Backend** | How teammates run. Auto-detected: `in-process` (same Node.js, invisible), `tmux` (separate panes, visible), `iterm2` (split panes in iTerm2). See `references/spawn-backends.md`. | Auto-detected based on environment |

## How They Connect

```mermaid
flowchart TB
    subgraph TEAM[TEAM]
        Leader[Leader - you]
        T1[Teammate 1]
        T2[Teammate 2]

        Leader <-->|messages via inbox| T1
        Leader <-->|messages via inbox| T2
        T1 <-.->|can message| T2
    end

    subgraph TASKS[TASK LIST]
        Task1["#1 completed: Research<br/>owner: teammate1"]
        Task2["#2 in_progress: Implement<br/>owner: teammate2"]
        Task3["#3 pending: Test<br/>blocked by #2"]
    end

    T1 --> Task1
    T2 --> Task2
    Task2 -.->|unblocks| Task3
```

## Lifecycle

```mermaid
flowchart LR
    A[1. Create Team] --> B[2. Create Tasks]
    B --> C[3. Spawn Teammates]
    C --> D[4. Work]
    D --> E[5. Coordinate]
    E --> F[6. Shutdown]
    F --> G[7. Cleanup]
```

## Message Flow

```mermaid
sequenceDiagram
    participant L as Leader
    participant T1 as Teammate 1
    participant T2 as Teammate 2
    participant Tasks as Task List

    L->>Tasks: TaskCreate (3 tasks)
    L->>T1: spawn with prompt
    L->>T2: spawn with prompt

    T1->>Tasks: claim task #1
    T2->>Tasks: claim task #2

    T1->>Tasks: complete #1
    T1->>L: send findings (inbox)

    Note over Tasks: #3 auto-unblocks

    T2->>Tasks: complete #2
    T2->>L: send findings (inbox)

    L->>T1: requestShutdown
    T1->>L: approveShutdown
    L->>T2: requestShutdown
    T2->>L: approveShutdown

    L->>L: cleanup
```
