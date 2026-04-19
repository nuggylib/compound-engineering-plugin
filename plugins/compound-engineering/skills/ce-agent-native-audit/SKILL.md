---
name: ce-agent-native-audit
description: Run comprehensive agent-native architecture review with scored principles
argument-hint: "[optional: specific principle to audit]"
disable-model-invocation: true
---

# Agent-Native Architecture Audit

## Core Principles to Audit

1. **Action Parity** - "Whatever the user can do, the agent can do"
2. **Tools as Primitives** - "Tools provide capability, not behavior"
3. **Context Injection** - "System prompt includes dynamic context about app state"
4. **Shared Workspace** - "Agent and user work in the same data space"
5. **CRUD Completeness** - "Every entity has full CRUD (Create, Read, Update, Delete)"
6. **UI Integration** - "Agent actions immediately reflected in UI"
7. **Capability Discovery** - "Users can discover what the agent can do"
8. **Prompt-Native Features** - "Features are prompts defining outcomes, not code"

## Workflow

### Step 1: Load the Agent-Native Skill

Invoke the agent-native-architecture skill:

```
/ce-agent-native-architecture
```

Select option 7 (action parity).

### Step 2: Launch Parallel Sub-Agents

Launch 8 parallel sub-agents using the Task tool with `subagent_type: Explore`, one for each principle. Each agent enumerates all instances in the codebase, checks compliance, provides a specific score (X out of Y), and lists gaps and recommendations.

| agent-name | trigger | output | focus |
|------------|---------|--------|-------|
| Action Parity auditor | always | scored-audit | user actions vs agent tools |
| Tools as Primitives auditor | always | scored-audit | primitive vs workflow classification |
| Context Injection auditor | always | scored-audit | dynamic state in system prompt |
| Shared Workspace auditor | always | scored-audit | same data space, no sandbox |
| CRUD Completeness auditor | always | scored-audit | full CRUD per entity |
| UI Integration auditor | always | scored-audit | agent actions reflected in UI |
| Capability Discovery auditor | always | scored-audit | 7 discovery mechanisms |
| Prompt-Native Features auditor | always | scored-audit | prompts over hardcoded logic |

Read `references/audit-prompts.md` for the sub-agent prompt matching the target principle(s). Each prompt contains the audit tasks and output format template. For single-principle dispatch, use only the matching prompt section. For all-principles dispatch, read the file once and dispatch all 8.

### Step 3: Compile Summary Report

Compile a summary:

```markdown
## Agent-Native Architecture Review: [Project Name]

### Overall Score Summary

| Core Principle | Score | Percentage | Status |
|----------------|-------|------------|--------|
| Action Parity | X/Y | Z% | ✅/⚠️/❌ |
| Tools as Primitives | X/Y | Z% | ✅/⚠️/❌ |
| Context Injection | X/Y | Z% | ✅/⚠️/❌ |
| Shared Workspace | X/Y | Z% | ✅/⚠️/❌ |
| CRUD Completeness | X/Y | Z% | ✅/⚠️/❌ |
| UI Integration | X/Y | Z% | ✅/⚠️/❌ |
| Capability Discovery | X/Y | Z% | ✅/⚠️/❌ |
| Prompt-Native Features | X/Y | Z% | ✅/⚠️/❌ |

**Overall Agent-Native Score: X%**

### Status Legend
- ✅ Excellent (80%+)
- ⚠️ Partial (50-79%)
- ❌ Needs Work (<50%)

### Top 10 Recommendations by Impact

| Priority | Action | Principle | Effort |
|----------|--------|-----------|--------|

### What's Working Excellently

[List top 5 strengths]
```

## Success Criteria

- [ ] All 8 sub-agents complete their audits
- [ ] Each principle has a specific numeric score (X/Y format)
- [ ] Summary table shows all scores and status indicators
- [ ] Top 10 recommendations are prioritized by impact
- [ ] Report identifies both strengths and gaps

## Optional: Single Principle Audit

If $ARGUMENTS specifies a single principle (e.g., "action parity"), only run that sub-agent and provide detailed findings for that principle alone.

Valid arguments:
- `action parity` or `1`
- `tools` or `primitives` or `2`
- `context` or `injection` or `3`
- `shared` or `workspace` or `4`
- `crud` or `5`
- `ui` or `integration` or `6`
- `discovery` or `7`
- `prompt` or `features` or `8`
