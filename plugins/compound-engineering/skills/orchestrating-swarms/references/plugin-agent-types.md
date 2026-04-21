# Plugin Agent Types

From the `compound-engineering` plugin (examples):

## Review Agents
```javascript
// Security review
Task({
  subagent_type: "compound-engineering:review:security-sentinel",
  description: "Security audit",
  prompt: "Audit this PR for security vulnerabilities"
})

// Performance review
Task({
  subagent_type: "compound-engineering:review:performance-oracle",
  description: "Performance check",
  prompt: "Analyze this code for performance bottlenecks"
})

// Rails code review
Task({
  subagent_type: "compound-engineering:review:kieran-rails-reviewer",
  description: "Rails review",
  prompt: "Review this Rails code for best practices"
})

// Architecture review
Task({
  subagent_type: "compound-engineering:review:architecture-strategist",
  description: "Architecture review",
  prompt: "Review the system architecture of the authentication module"
})

// Code simplicity
Task({
  subagent_type: "compound-engineering:review:code-simplicity-reviewer",
  description: "Simplicity check",
  prompt: "Check if this implementation can be simplified"
})
```

**All review agents from compound-engineering:**
- `agent-native-reviewer` - Ensures features work for agents too
- `architecture-strategist` - Architectural compliance
- `code-simplicity-reviewer` - YAGNI and minimalism
- `data-integrity-guardian` - Database and data safety
- `data-migration-expert` - Migration validation
- `deployment-verification-agent` - Pre-deploy checklists
- `dhh-rails-reviewer` - DHH/37signals Rails style
- `julik-frontend-races-reviewer` - JavaScript race conditions
- `kieran-python-reviewer` - Python best practices
- `kieran-rails-reviewer` - Rails best practices
- `kieran-typescript-reviewer` - TypeScript best practices
- `pattern-recognition-specialist` - Design patterns and anti-patterns
- `performance-oracle` - Performance analysis
- `security-sentinel` - Security vulnerabilities

## Research Agents
```javascript
// Best practices research
Task({
  subagent_type: "compound-engineering:research:best-practices-researcher",
  description: "Research auth best practices",
  prompt: "Research current best practices for JWT authentication in Rails 2024-2026"
})

// Framework documentation
Task({
  subagent_type: "compound-engineering:research:framework-docs-researcher",
  description: "Research Active Storage",
  prompt: "Gather comprehensive documentation about Active Storage file uploads"
})

// Git history analysis
Task({
  subagent_type: "compound-engineering:research:git-history-analyzer",
  description: "Analyze auth history",
  prompt: "Analyze the git history of the authentication module to understand its evolution"
})
```

**All research agents:**
- `best-practices-researcher` - External best practices
- `framework-docs-researcher` - Framework documentation
- `git-history-analyzer` - Code archaeology
- `learnings-researcher` - Search docs/solutions/
- `repo-research-analyst` - Repository patterns

## Design Agents
```javascript
Task({
  subagent_type: "compound-engineering:design:figma-design-sync",
  description: "Sync with Figma",
  prompt: "Compare implementation with Figma design at [URL]"
})
```

## Workflow Agents
```javascript
Task({
  subagent_type: "compound-engineering:workflow:bug-reproduction-validator",
  description: "Validate bug",
  prompt: "Reproduce and validate this reported bug: [description]"
})
```
