---
date: 2026-04-08
topic: token-efficiency
focus: Drastically improve compound-engineering plugin token efficiency across skills, agents, commands, and all markdown content entering LLM context windows
research-depth: 5 parallel research agents covering context mechanics, industry patterns, repo audit, context hygiene, and institutional knowledge
---

# Ideation: Token Efficiency Overhaul

## Codebase Context

- Plugin total: ~1.47 MB / ~375K tokens across 43 skills, 51 agents, 56 reference files
- Top 7 skills: ce-review (55KB), ce-compound-refresh (48KB), orchestrating-swarms (48KB), ce-plan (42KB), ce-work-beta (32KB), ce-compound (31KB), ce-work (27KB) = 283KB, 46% of all skill content
- 51 agent files total 287KB; 17 of 28 review agents share identical boilerplate (confidence calibration, output format, suppression rules)
- 56 reference files total 512KB; largest: agent-native-architecture (188KB/14 files), dspy-ruby (80KB/5 files)
- Prior work reduced always-loaded budget from 50.5K to 10.4K chars (79% reduction)
- Documented patterns exist but aren't consistently applied: script-first (7/43 skills), compact returns (1/43 skills), pass paths not content
- Skills load fully at trigger time and persist across every message for the entire session
- Cross-platform interaction boilerplate appears 36 times across 21 files (~6.5-9KB of pure repetition)
- ce-review eagerly @-inlines 5 reference files (29KB) that are only needed at specific stages
- 10 skill descriptions exceed 550 bytes, violating the existing 100-250 char guideline

### Institutional Knowledge Applied

- Agent descriptions must be 100-250 chars; examples belong in body, not description (plan 2026-02-08)
- Script-first processing yields 60-75% savings by moving mechanical work to bundled scripts (docs/solutions/skill-design/)
- Pass paths not content to sub-agents; instruction phrasing affects tool call counts 7x (docs/solutions/skill-design/)
- Compact returns: sub-agents write detail to disk, return only merge-tier fields (ce-review implementation, commit a5ce094)
- Bounded output by default; MCP tool definitions burn tens of thousands of tokens loading schemas (docs/solutions/agent-friendly-cli-principles.md)
- Conditional/late-sequence extraction defers 43-77% of skill content to reference files loaded on demand (applied to ce-plan, ce-brainstorm, ce-ideate, document-review)
- Pre-resolution via `!` backtick syntax moves deterministic context lookups to load time, reducing runtime tool calls (applied to git-commit-push-pr)
- Pipeline separation (brainstorm/plan/work) prevents false optimizations: never skip agents that gather categorically different information (docs/solutions/skill-design/research-agent-pipeline-separation)
- release:validate has zero token-related checks; no guardrails against regression to pre-optimization state

### Context Window Mechanics

| Fact | Value | Evidence |
|------|-------|----------|
| 1M context window (Opus 4.6 / Sonnet 4.6) | ~967K usable after 33K autocompact buffer | Documented (GA March 2026) |
| Always-loaded overhead (system prompt + tools + CLAUDE.md chain + descriptions) | ~57-77K tokens | Documented + estimated |
| Available for work on 1M | ~92-94% | Calculated |
| Available for work on 200K | ~62-72% | Calculated |
| Compaction trigger | ~83.5% of window | Observed (not officially documented) |
| Skill descriptions after compaction | Lost (`noSurviveCompact: true`) | Documented (context window visualization) |
| Invoked skill content after compaction | Summarized, not re-loaded from disk | Documented + bug reports (#13919, #20466) |
| CLAUDE.md after compaction | Re-loaded from disk (guaranteed survivor) | Documented |
| Sub-agent baseline overhead | ~3-4K tokens (system prompt + CLAUDE.md + tools) | Documented |
| Multi-agent token multiplier | 4-7x single-agent; teams ~15x | Documented (Anthropic costs page) |
| Tool results after compaction | Cleared first | Documented |

### Context Hygiene Principles

Context pollution taxonomy, ranked by damage to output quality:

1. **Conflicting context** (most damaging): contradictory instructions from different skills/agents. Models silently pick whichever has stronger positional attention. Research shows 39% average performance drop.
1. **Stale context**: outdated file contents, superseded plans, old test results. Causes confidently wrong actions.
1. **Irrelevant context**: skill A content persisting through unrelated task B. Competes for attention, triggers "context rot" (30%+ accuracy drop when relevant info competes with irrelevant).
1. **Noise context**: verbose tool outputs, debug logs, full file reads already acted upon. Tool outputs consume 80%+ of tokens in typical agent trajectories.
1. **Duplicate context** (least quality damage, highest token waste): same info from multiple sources.

Compaction survival hierarchy: JSON/YAML (highest) > Markdown headers + bullets > tables > code blocks > numbered lists > flowing prose (lowest). Headers serve as recovery anchors. Factory.ai found compaction destroys 60% of facts and 54% of project constraints.

Industry convergence on "context engineering" (Anthropic, Manus, Factory.ai): select, compress, order, isolate, format. Optimal dispatch granularity: sub-agent prompt overhead should be 1/10th to 1/50th of working context. Manus uses multi-agent architectures exclusively for context isolation.

## Ranked Ideas

### 1. Reclassify Encyclopedia Skills as Queryable Reference Libraries

**Description:** orchestrating-swarms (48KB), agent-native-architecture (22KB + 188KB refs = 210KB), and dspy-ruby (23KB + 80KB refs = 103KB) are reference encyclopedias, not workflows. Convert to thin router SKILL.md files (~3-5KB) with topic-indexed reference sections loaded on demand based on the user's question.

**Rationale:** 361KB of content loads monolithically when a user asks a single question. A developer asking "how do I spawn a teammate" doesn't need the full swarm encyclopedia. On-demand section loading cuts per-invocation cost by 70-80%. agent-native-architecture already has a keyword-to-reference routing table (lines 179-190), proving the pattern is viable.

**Industry validation:** Anthropic's "just-in-time" retrieval pattern maintains lightweight identifiers and dynamically loads data at runtime. Manus and LangGraph both use file-based retrieval for large reference material. Redis research shows naive full-context loading of a 25K-token document across 5 steps consumes 125K+ tokens vs on-demand chunking. The "carrying cost" principle (from conditional extraction pattern) compounds the waste: 48KB loaded at message 3 is present in every subsequent API call.

**Downsides:** Requires restructuring 3 large skills. Router must correctly map questions to sections or the user gets incomplete answers. Cross-cutting questions may need multiple sections loaded.

**Confidence:** 90% (raised from 85% based on industry validation and carrying cost evidence)
**Complexity:** Medium
**Status:** Unexplored

### 2. Lean Agent Dispatch Pipeline (Archetypes + Shared Context Dedup)

**Description:** Two complementary changes: (a) Extract shared boilerplate from the 28 review agents into base archetypes, reducing each agent to its unique delta (~15-20 lines of hunting targets + exclusions out of ~48-100 total lines). (b) Write shared dispatch context (subagent template + schema + diff scope rules) to .context/ once per review session; pass the file path to each sub-agent instead of duplicating 16KB+ per reviewer.

**Rationale:** 17 review agents share identical confidence calibration, output format, and suppression rules word-for-word. The subagent-template already overlaps with per-agent content. With 8-10 reviewers dispatched per session, shared context dedup alone eliminates ~100-160KB of duplicated content. Archetypes make maintenance changes propagate from one template edit.

**Industry validation:** Manus's principle: "share memory by communicating, don't communicate by sharing memory" (borrowed from Go concurrency). Google ADK explicitly scopes what sub-agents see. MindStudio recommends 1,000-2,000 token output constraints per file-reading sub-agent. Sub-agents don't inherit parent context (each gets a fresh ~3-4K token baseline), so writing shared context to disk once and having each agent read it is the optimal dedup pattern.

**Downsides:** Build-time expansion needed for 10+ converter targets. Shared context file approach may not work on all target platforms. Archetype savings are ~25% per agent, not 40% as initially estimated.

**Confidence:** 85% (raised from 80% based on industry validation)
**Complexity:** Medium-High
**Status:** Unexplored

### 3. Diff-Proportional Reviewer Scaling

**Description:** Cap the number of dispatched reviewers proportional to diff size: <50 lines = max 4, 50-200 = max 6, 200-500 = max 8, 500+ = full roster. Prioritize by expected relevance to diff content when capped.

**Rationale:** Each reviewer adds ~16KB of shared prompt overhead plus the full diff. A 10-line typo fix triggering 8+ reviewers wastes 60-90KB of context. One conditional in the reviewer dispatch logic with near-zero downside.

**Industry validation:** Research on optimal dispatch granularity shows sub-agent prompt overhead (~3-4K tokens baseline) should be 1/10th to 1/50th of working context. For a 10-line diff (~200 tokens of actual content), dispatching 8 reviewers each with 3-4K overhead is a 120-160x overhead ratio, violating the rule by 12-16x. The "too fine-grained dispatch" anti-pattern is well-documented.

**Constraint:** Must respect pipeline separation -- never skip agents that gather categorically different information. Diff-proportional scaling reduces the number of reviewers, not the categories of review. If a 10-line diff touches auth middleware, the security reviewer must still be included even if the total is capped.

**Downsides:** Must correctly prioritize which reviewers to include when capped. Risk of missing a critical finding from an excluded reviewer on small diffs.

**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 4. Systematic Script-First Extraction (Top 5 Procedural Skills)

**Description:** Audit the 5 most procedural skills (git-commit-push-pr, rclone, git-worktree, git-clean-gone-branches, ce-review scope detection) and extract deterministic operations into co-located scripts. Only 7/43 skills currently use scripts.

**Rationale:** git-commit-push-pr (25KB) is almost entirely step-by-step shell recipes that could be a script. ce-review's Stage 1 scope detection is 131 lines of deterministic git commands used once. Moving to scripts reduces token cost and improves reliability.

**Quantified precedent:** claude-permissions-optimizer dropped from ~100K to ~35K tokens per run (65% reduction) after script-first extraction. The biggest single win was moving classification into the script; the second was removing the reference document load instruction. Anti-patterns to avoid: "instruction-only optimization" (adding "don't do X" without a script alternative), "hybrid classification" (script + model both classifying), "dual rule definitions" (rules in script AND SKILL.md that drift apart).

**Downsides:** 60-75% headline savings are cherry-picked from best cases. Judgment-heavy skills won't benefit. Restates existing documented guidance that hasn't been systematically applied.

**Confidence:** 75%
**Complexity:** Medium
**Status:** Unexplored

### 5. Dead Content Elimination Audit

**Description:** Manual audit of all 43 skills and 51 agents for dead content: deprecated workflow instructions, duplicated paragraphs, redundant examples, verbose prose. Wire a lightweight staleness check into release:validate.

**Rationale:** Organic growth across 94 content files accumulates dead weight. Conservative estimate: 10-20% bloat. Low risk, immediate savings. Repo audit found specific dead content clusters: "current year is 2026" stamps (10 files), permission mode boilerplate (3 files), and reference files with 30-40% reducible code examples (mobile-patterns.md, shared-workspace-architecture.md).

**Downsides:** Cannot be automated (no AST for prose). One-time savings, not compounding. Requires careful human review.

**Confidence:** 70%
**Complexity:** Low
**Status:** Unexplored

### 6. Merge ce-work and ce-work-beta

**Description:** Only 84 diff lines apart. ce-work-beta adds an "External Delegate Mode" section. Merge into a single skill with a mode flag. Note: ce-compound/ce-compound-refresh are NOT duplicates (905 diff lines) and should not be merged.

**Rationale:** Eliminates ~27KB of near-duplicate content and halves maintenance burden. Audit found these skills share ~24KB of identical content across 6 sections (Test Discovery, Test Scenario Completeness, System-Wide Test Check, execution posture, Phase 0, Phase 1, branch setup). Precedent: deepen-plan was successfully merged into ce-plan as Phase 5.3.

**Bonus opportunity:** After merge, extract the shared test discipline blocks (Test Discovery, Test Scenario Completeness, System-Wide Test Check) into `references/test-discipline.md`. This content is generic enough for future skills that execute work.

**Downsides:** Must verify ce-work-beta is the intended successor.

**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

### 7. Eager @-Inline to On-Demand Loading (ce-review)

**Description:** Convert ce-review's 5 `@`-inlined reference files (29KB total) from eager loading to backtick path references with stage-specific reads. Currently inlined: persona-catalog.md (5.9KB, Stage 3), subagent-template.md (7.3KB, Stage 4), diff-scope.md (1.8KB, Stage 4), findings-schema.JSON (6.6KB, Stage 4), review-output-template.md (7.3KB, Stage 6).

**Rationale:** All 29KB resolves at trigger time and is carried in every subsequent message for the entire session. The subagent-template and findings-schema are injected into sub-agent prompts (correctly), but also persist in the orchestrator's context where they serve no purpose after dispatch. The review-output-template is only needed in Stage 6 but occupies context from Stage 1. Converting to on-demand reads saves ~22-25KB of carried context per review session.

**Constraint check:** AGENTS.md Skill Compliance Checklist says to use `@` for "small structural files under ~150 lines." The subagent-template is 107 lines and findings-schema is 134 lines -- both near threshold. With compact returns reducing what the orchestrator needs to carry, the threshold guidance should be re-evaluated: the orchestrator no longer needs the full schema in its own context, only when assembling a sub-agent prompt.

**Downsides:** Slightly increases tool call count (5 Read calls during the review). Must verify each stage's instructions correctly reference the file path.

**Confidence:** 90%
**Complexity:** Low
**Status:** New

### 8. Cross-Skill Instruction Dedup (Centralize in AGENTS.md)

**Description:** Extract two categories of instruction boilerplate that repeat verbatim across many skills into single AGENTS.md paragraphs:

(a) **Cross-platform interaction boilerplate** (36 occurrences across 21 files, ~6.5-9KB): The `AskUserQuestion/request_user_input/ask_user` platform compatibility sentence. Some skills repeat it multiple times internally (git-commit-push-pr: 6 occurrences, ce-plan: 4, ce-compound: 3). Replace with a single AGENTS.md "Cross-Platform Interaction Convention" paragraph; skills reference with one sentence.

(b) **Native tool guidance** (32 occurrences across 17 files, ~3-4KB): "Use the native content-search tool (e.g., Grep in Claude Code)" and variants. AGENTS.md already contains this; individual agents/skills shouldn't re-state it.

**Rationale:** ~9.5-13KB of corpus-wide duplication reduced to ~200 bytes of references. AGENTS.md is loaded into every agent's context, so the centralizing reference is available without additional loads. Skills only pay for one reference sentence instead of the full boilerplate.

**Downsides:** Cross-platform portability: converted skills on non-Claude-Code platforms would lose the AGENTS.md reference. Mitigated by keeping the AGENTS.md paragraph brief enough to inline at build time for other targets.

**Confidence:** 85%
**Complexity:** Low
**Status:** New

### 9. Always-Loaded Description Trim

**Description:** Audit the 10 longest skill descriptions (all >550 bytes) and reduce to the existing 100-250 char guideline. Move trigger phrase lists into the skill body. Worst offenders: ce-plan (896 bytes, 12 trigger phrases), ce-brainstorm (708 bytes, 9 trigger phrases), claude-permissions-optimizer (682 bytes, 7 trigger phrases), git-commit-push-pr (676 bytes, 8 trigger phrases), onboarding (669 bytes, 9 trigger phrases).

**Rationale:** Skill descriptions are always-loaded and have `noSurviveCompact: true` -- they're NOT re-injected after compaction. Verbose descriptions waste always-loaded budget while alive and provide no benefit after compaction. The 100-250 char guideline already exists in AGENTS.md but is being violated. Estimated savings: ~8-10KB of always-loaded context.

**Note on rejected idea #12:** The prior rejection stated "~1,500 remaining token savings is noise." That estimate was about the overall budget, not specifically about verbose descriptions violating the existing guideline. The 8-10KB here is the gap between current descriptions and the already-agreed 250-char limit.

**Downsides:** Risk that shorter descriptions reduce routing accuracy. Mitigated by testing the 10 trimmed descriptions against the same user queries to verify routing still works.

**Confidence:** 90%
**Complexity:** Low
**Status:** New

### 10. Token Budget Guardrails in release:validate

**Description:** Add 3 static checks to the existing release:validate CI step:

1. **Description length check:** Fail if any skill/agent description exceeds 250 characters (the existing guideline).
1. **Always-loaded budget check:** Sum all always-loaded content (descriptions + names) and fail if total exceeds a configured threshold (e.g., 12K chars, ~15% above current 10.4K).
1. **Skill size warning:** Warn (not fail) if any SKILL.md exceeds 30KB for workflow skills or 5KB for router-pattern skills.

**Rationale:** The prior optimization reduced always-loaded from 50.5K to 10.4K chars (79%). Without guardrails, organic growth will regress toward the pre-optimization state. The ideation rejection #14 ("Token CI Pipeline reduces to a linter with 2 rules") dismissed this as too simple, but even simple linting prevents regression. Two rules is still two rules.

**Downsides:** Hard fails can block releases for cosmetic reasons. Mitigated by using warnings (not failures) for skill size thresholds and keeping description limits aligned with the existing guideline.

**Confidence:** 95%
**Complexity:** Low
**Status:** New

### 11. Compact Returns Generalization

**Description:** Extend the compact returns pattern (currently only in ce-review) to every skill that dispatches sub-agents: ce-compound (4 sub-agents), ce-plan deepening (research agents), ce-ideate (idea agents), ce-brainstorm (research agents), document-review (reviewer agents), ce-compound-refresh.

**Rationale:** Each sub-agent currently returns its full analysis to the orchestrator. With compact returns, sub-agents write full detail to `.context/` and return only summary/merge-tier fields. ce-review demonstrated the pattern works with graceful degradation (if file write fails, compact return still provides everything the merge needs). ce-plan's deepening workflow already has a "direct vs artifact-backed" mode selection, but doesn't yet use it consistently.

**Industry validation:** Anthropic guidance: "If an agent writes a 500-line code file, the chat history should not contain the file content; it should only contain the file path." Manus's "context quarantine": sub-agents explore extensively (tens of thousands of tokens) but return only 1,000-2,000 token summaries. JetBrains Junie's "observation masking" replaces raw tool results with summaries at zero quality cost on SWE-bench.

**Downsides:** Requires defining merge-tier vs detail-tier fields for each skill's sub-agent schema. Some skills may not have a natural merge/detail split.

**Confidence:** 85%
**Complexity:** Medium
**Status:** New

### 12. PreCompact Hook for Critical State Preservation

**Description:** Add a PreCompact hook to the plugin that writes critical session state to a recovery file before auto-compaction triggers. State includes: current task intent, active file paths, pending findings, branch and commit state, which skills are loaded. Optionally, a PostCompact hook re-injects a pointer to the recovery file.

**Rationale:** Compaction destroys 60% of facts and 54% of project constraints (academic research). Skill descriptions have `noSurviveCompact: true`. Tool results are cleared first. A PreCompact hook (available since v2.1.76) can snapshot critical state to disk before the lossy compaction pass. The context-mode plugin demonstrates this pattern with SQLite + FTS5 for <2KB priority-tiered snapshots.

**Downsides:** PreCompact hooks fire just before compaction, adding latency. The exact compaction behavior is opaque and undocumented, so optimizing against it is fragile. Must keep the snapshot small enough to be useful without becoming another context burden.

**Confidence:** 60%
**Complexity:** Medium
**Status:** New

### 13. Phase Transition Markers for Multi-Skill Sessions

**Description:** Add explicit phase transition markers to multi-phase skills (ce-compound, ce-work, ce-plan). When a workflow phase completes, emit a structured signal: what phase finished, what artifacts were produced (with paths), what context is no longer needed, what phase starts next.

**Rationale:** A brainstorm -> plan -> work -> review session carries ~179KB of cumulative skill content. Phase transition markers provide soft deprecation signals to both the model ("brainstorm instructions are no longer relevant") and the compactor ("prioritize current phase content"). CLAUDE.md compaction hints ("when compacting, deprioritize completed skill content") work because CLAUDE.md is re-loaded from disk after compaction, so the hints persist.

**Distinction from rejected idea #9 (Phased Skill Loading):** This does not attempt to evict or partially load skills. It only provides information to the model and compactor about what is important NOW. No enforcement mechanism, just signal.

**Downsides:** Depends on LLM compliance with soft signals. No guarantee the compactor respects deprecation hints. May add false confidence that context is being managed when it is not.

**Confidence:** 55%
**Complexity:** Low
**Status:** New

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Skill Completion Signaling | Claude Code has no context eviction API |
| 2 | Build-Time Skill Minification | Markdown structure aids LLM parsing; real formatting overhead is 5-8%, not 30-40%. Headers serve as compaction recovery anchors (Factory.ai) |
| 3 | Skills as MCP Tools | Inverts platform design, breaks all converters, requires running server process. MCP schemas themselves consume 60-80% of token usage (Speakeasy research) |
| 4 | Named Convention Tokens | LLMs have no macro expander; build-time expansion just replicates minification |
| 5 | Ephemeral Context Bus | Over-architects what compact returns already solve |
| 6 | Adaptive Complexity Scaling | 129 skill variants, unvalidated usage assumptions, maintenance nightmare |
| 7 | Structural Template Compiler | Multi-month rewrite; YAML source format adds permanent toolchain complexity |
| 8 | Skill Lifecycle Management (combo) | Bundles two non-viable ideas (no partial loading enforcement, no eviction API) |
| 9 | Phased Skill Loading (generic) | Depends on LLM compliance with soft instructions; degrades under context pressure |
| 10 | Reference File Index | Adds indirection over what better SKILL.md instructions already accomplish |
| 11 | Compact Return Byte Budgets | Existing field-based compact returns sufficient; byte budgets add unhelpful rigidity |
| 12 | Description Budget Compression | Prior 79% reduction already optimized the overall budget. Remaining opportunity is limited to enforcing the existing 250-char guideline (see idea #9) |
| 13 | Compaction-Aware Checkpointing | Optimizes against opaque, undocumented compaction behavior. PreCompact hook (idea #12) is a lighter-weight version with the same risk |
| 14 | Token CI Pipeline (combo) | Original combo included rejected minification. The guardrail subset survives as idea #10 |
| 15 | LLMLingua-Style Token Pruning | Requires separate pre-processing model. Corrupts code syntax. Destroys Markdown structure. Designed for RAG of natural language docs, not agent instructions |
| 16 | Session-Level Context Budget Estimator | Estimating remaining context requires undocumented internal state. Useful in theory but unreliable without official API support. Monitor as Claude Code evolves |

## Research Sources

Industry and academic sources informing this ideation:

- Anthropic: [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic: [Explore the Context Window](https://code.claude.com/docs/en/context-window) (interactive visualization, v2.1.94)
- Manus: [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) (multi-agent isolation, KV-cache)
- Factory.ai: [Evaluating Context Compression](https://factory.ai/news/evaluating-compression) (36K messages, compaction destroys 60% of facts)
- Speakeasy: [Reducing MCP Token Usage by 100x](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2) (dynamic toolsets, 96-97% reduction)
- LLMLingua: [Prompt Compression Survey (NAACL 2025)](https://aclanthology.org/2025.naacl-long.368/)
- Liu et al.: [Lost in the Middle](https://cs.stanford.edu/~nfliu/papers/lost-in-the-middle.arxiv2023.pdf) (30%+ accuracy drop for mid-context info)
- Kemple: [Measuring Context Pollution](https://kurtiskemple.com/blog/measuring-context-pollution/) (CP formula and thresholds)
- Context Mode Plugin: [GitHub](https://github.com/mksglu/context-mode) (PreCompact snapshot pattern)
- Claude Code Issues: [#13919](https://github.com/anthropics/claude-code/issues/13919) (skill loss after compaction), [#20466](https://github.com/anthropics/claude-code/issues/20466) (skill re-invocation after compaction)

## Session Log

- 2026-04-08: Initial ideation -- 48 raw ideas from 6 sub-agents, 22 after dedup + 3 cross-cutting combinations, 6 survived adversarial filtering by 2 skeptical critic agents
- 2026-04-08: Deep research pass -- 5 parallel research agents (context mechanics, industry patterns, repo token audit, context hygiene, institutional knowledge). Added context mechanics table, hygiene taxonomy, and industry validation. Modified ideas #1-6 with quantified evidence and industry precedent. Added 7 new ideas (#7-13). Added 2 new rejections (#15-16). Revised rejection #12 and #14 to account for surviving subsets. Key finding: skill descriptions have `noSurviveCompact: true` (lost after compaction). Total addressable waste across new findings: ~65-95KB.
