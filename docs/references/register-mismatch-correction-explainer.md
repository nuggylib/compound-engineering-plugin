---
date: 2026-04-11
topic: register-mismatch-correction
purpose: Conceptual explainer for idea #26 from token-efficiency ideation
---

# Register Mismatch Correction: What It Means For You

**The concept in one sentence:** Register mismatch correction rewrites the plugin's skill files so they talk to Claude like a spec sheet talks to an engineer, not like a textbook talks to a student.

## The core insight

When you invoke `/ce:review`, the entire SKILL.md file (55KB for ce-review) loads into Claude's context window and *stays there for every single message* in your session. Every word in that file rides along on every API call, every sub-agent dispatch, every response. It's like paying rent on an apartment you furnished once but can never redecorate mid-lease.

Here's the problem: a chunk of that content is written for a *human reader who needs to understand why*, not for a *model that needs to know what to do*. The plugin is talking to Claude the way a tutorial talks to a student, when it should be talking the way a blueprint talks to a builder.

## What "register" means here

Register is a linguistics term for how you adjust your language based on who you're talking to. You already use register shifts instinctively:

| Register | Audience | Example |
|----------|----------|---------|
| Tutorial | Student learning a concept | "Cross-reviewer agreement is strong signal -- independent reviewers converging on the same issue is more reliable than any single reviewer's confidence." |
| Specification | Performer executing a task | "2+ reviewers on same fingerprint: boost confidence +0.10, cap 1.0." |

Both say the same thing. The specification version is 14 words. The tutorial version is 25. The extra 11 words explain *why* the rule exists. Claude doesn't need that explanation to follow the rule. It needs the rule.

## Where the analogy breaks down

Not all explanatory content is waste. Some inline rationale encodes *non-obvious design decisions* that would be lost if stripped. For example, "stop instead of falling back to `git diff HEAD`; a branch review without the base branch would only show uncommitted changes" -- the semiclause explains why the fallback is dangerous, which helps Claude make correct judgment calls at runtime when encountering edge cases.

The methodology distinguishes between:
- **Rationale that aids compliance** (keep it -- it shapes behavior at decision points)
- **Rationale that only aids understanding** (strip it -- it's for humans reading the source, not Claude executing it)

## What this looks like in practice

Here's a real example from ce-review today:

**Before (tutorial register):**
> Pass the resulting path list to the `project-standards` persona inside a `<standards-paths>` block in its review context (see Stage 4). The persona reads the files itself, targeting only the sections relevant to the changed file types. This keeps the orchestrator's work cheap (path discovery only) and avoids bloating the subagent prompt with content the reviewer may not fully need.

**After (specification register):**
> Pass the path list to `project-standards` in a `<standards-paths>` block in its review context. The persona reads files itself, targeting sections relevant to changed file types.

The stripped sentences ("This keeps the orchestrator's work cheap..." and "avoids bloating...") explain *why* the design works this way. Valuable for a human maintainer, zero value for Claude executing the instruction. In the rewrite, that rationale moves to an HTML comment (`<!-- why: ... -->`) -- invisible to the model, preserved for contributors.

## What changes for you as a user

**Nothing in your workflow changes.** You still type `/ce:review`, `/ce:plan`, `/ce:work` exactly as before. Same commands, same outputs, same behavior.

What changes is under the hood:

1. **Faster responses.** Less content per API call means lower latency, especially in long sessions where context accumulates.

2. **Better instruction compliance.** Hedging language ("You might want to consider...", "It's recommended to...") actually *reduces* how reliably Claude follows instructions. These markers signal optionality. Specification register ("Do X. Skip Y.") signals obligation. Removing hedging makes the instructions *more effective*, not just shorter.

3. **More headroom before compaction.** Claude's context window triggers auto-compaction at ~83.5% capacity. Every kilobyte saved in skill content pushes that threshold further out. When compaction hits, it summarizes your skill content rather than reloading it from disk -- and summaries lose ~60% of facts. Delaying compaction means your instructions stay intact longer.

4. **Lower cost per session.** Tokens cost money. A 20-30% reduction across 55KB of ce-review content, carried across a 30+ message review session, adds up.

## The estimated impact

| Skill | Current size | Est. reduction | Savings |
|-------|-------------|---------------|---------|
| ce-review | 55KB | 20-25% | 11-14KB |
| ce-compound-refresh | 48KB | 20-25% | 10-12KB |
| orchestrating-swarms | 48KB | 25-30% | 12-14KB |
| ce-plan | 42KB | 20-25% | 8-10KB |
| ce-work-beta | 32KB | 15-20% | 5-6KB |
| ce-compound | 31KB | 20-25% | 6-8KB |
| ce-work | 27KB | 15-20% | 4-5KB |
| **Top 7 total** | **283KB** | | **~56-69KB** |

That 56-69KB reduction is *per session, per message*. In a 30-message ce-review session, that's 1.7-2MB of tokens you're not paying for.

## What we're building

The deliverable is a **rewrite methodology** -- not the rewrites themselves yet. Think of it as the style guide that makes the rewrites systematic instead of ad-hoc:

1. **Pattern classification** -- a formal catalog of tutorial-register patterns to find and eliminate
2. **Rewrite rules** -- for each pattern class, the mechanical transformation to specification register
3. **Before/after examples** -- drawn from ce-review so the rules are grounded in real content
4. **Savings estimates** -- per skill, so we can sequence the rewrites by impact

Once the methodology exists, the actual rewrites become parallelizable grunt work that can be done skill-by-skill.
