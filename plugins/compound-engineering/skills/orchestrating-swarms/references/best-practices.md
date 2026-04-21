# Best Practices

## 1. Always Cleanup
Call `cleanup` when done. Do not leave orphaned teams.

## 2. Use Meaningful Names
```javascript
// Good
name: "security-reviewer"
name: "oauth-implementer"
name: "test-writer"

// Bad
name: "worker-1"
name: "agent-2"
```

## 3. Write Clear Prompts
Specify exact steps for workers:
```javascript
// Good
prompt: `
  1. Review app/models/user.rb for N+1 queries
  2. Check all ActiveRecord associations have proper includes
  3. Document any issues found
  4. Send findings to team-lead via Teammate write
`

// Bad
prompt: "Review the code"
```

## 4. Use Task Dependencies
Prefer system-managed unblocking over manual polling:
```javascript
// Good: Auto-unblocking
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })

// Bad: Manual polling
"Wait until task #1 is done, check every 30 seconds..."
```

## 5. Check Inboxes for Results
Workers send results to the leader's inbox:
```bash
cat ~/.claude/teams/{team}/inboxes/team-lead.json | jq '.'
```

## 6. Handle Worker Failures
- 5-minute heartbeat timeout per worker
- Reclaim tasks from crashed workers
- Include retry logic in worker prompts

## 7. Prefer write Over broadcast
`broadcast` sends N messages for N teammates. Use `write` for targeted communication.

## 8. Match Agent Type to Task
- **Explore** for searching/reading
- **Plan** for architecture design
- **general-purpose** for implementation
- **Specialized reviewers** for specific review types

## Quick Reference

### Spawn Subagent (No Team)
```javascript
Task({ subagent_type: "Explore", description: "Find files", prompt: "..." })
```

### Spawn Teammate (With Team)
```javascript
Teammate({ operation: "spawnTeam", team_name: "my-team" })
Task({ team_name: "my-team", name: "worker", subagent_type: "general-purpose", prompt: "...", run_in_background: true })
```

### Message Teammate
```javascript
Teammate({ operation: "write", target_agent_id: "worker-1", value: "..." })
```

### Create Task Pipeline
```javascript
TaskCreate({ subject: "Step 1", description: "..." })
TaskCreate({ subject: "Step 2", description: "..." })
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })
```

### Shutdown Team
```javascript
Teammate({ operation: "requestShutdown", target_agent_id: "worker-1" })
// Wait for approval...
Teammate({ operation: "cleanup" })
```
