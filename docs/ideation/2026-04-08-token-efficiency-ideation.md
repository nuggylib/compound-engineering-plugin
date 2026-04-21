---
date: 2026-04-08
topic: token-efficiency
focus: Drastically improve compound-engineering plugin token efficiency across skills, agents, commands, and all markdown content entering LLM context windows
research-depth: 5 research agents (session 1) + 5 cross-domain ideation agents + 2 adversarial critics (session 2)
user-priorities: [session breakpoints, modular plugin, token awareness in all instructions]
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

### 14. Empirical Instruction Ablation Framework

**Description:** Build a test harness that A/B tests individual instruction blocks against task quality. Run the same task with and without each major section, score the output quality delta. Each paragraph gets a "value per token" score. Cut paragraphs with no measurable quality delta. The review pipeline provides a natural evaluation harness (run ce-review with/without specific instructions, measure whether findings change).

**Rationale:** 608KB of instructions and nobody has ever measured which ones change model behavior. Every other optimization assumes all content is load-bearing. This creates the feedback loop that makes all other decisions evidence-based rather than intuition-based. Scripts-first proved 60-75% of processing instructions are waste; the same ratio likely holds for behavioral instructions.

**Downsides:** Quality differences may be subtle and hard to score. Requires a representative task suite. Initial investment to build the harness.

**Confidence:** 90%
**Complexity:** Medium
**Status:** New

### 15. Plugin Module Unbundling

**Description:** Split the plugin into a core module (10-15 most-used skills/agents) and specialist modules installed separately. Users only load what they use daily. Rarely-fired specialists (data-migrations-reviewer, schema-drift-detector, dspy-ruby, orchestrating-swarms) move to opt-in tiers. Always-loaded overhead drops from descriptions for 43 skills to descriptions for ~12.

**Rationale:** Always-loaded overhead (57-77K tokens) includes descriptions for all 43 skills. A developer who only uses planning + review + work skills pays the same overhead as one who uses everything. Module unbundling reduces always-loaded cost proportionally to what's installed.

**Downsides:** Claude Code's plugin system may not support tiered installation natively. Requires restructuring plugin.json and marketplace packaging. Converter targets need to handle multi-module plugins.

**Confidence:** 75%
**Complexity:** High
**Status:** New

### 16. Circuit Breaker + Session Resumption Protocol

**Description:** At phase boundaries in multi-phase workflows, run a self-diagnostic (can I state the task intent? name the files I'm modifying? does my plan state match disk?). If 2+ answers are uncertain, write a structured continuation prompt to `.context/` containing: completed phases with artifact paths, current step, accumulated decisions, unresolved questions, and the exact invocation to resume. Recommend starting a fresh session with the continuation prompt.

**Rationale:** Compaction destroys 60% of facts. A brainstorm-plan-work-review session accumulates ~179KB of skill content. By Phase 3, the model has likely been through compaction and may be operating on stale context. The best token optimization is sometimes to start fresh. The continuation prompt makes session breaks a feature, not a failure mode. Directly addresses encouraging new sessions between breakpoints.

**Downsides:** Self-diagnostic accuracy depends on model introspection. False positives (unnecessary restart recommendations) waste user time. False negatives defeat the purpose.

**Confidence:** 70%
**Complexity:** Medium
**Status:** New

### 17. JIT Skill Specialization

**Description:** At invoke time, resolve mode-conditional branches and emit a specialized skill variant. ce-review in report-only mode strips fix/ship sections (12KB). ce-work for trivial tasks strips execution loop (16KB). At install time: resolve platform conditionals (36 cross-platform boilerplate occurrences become 0). Uses PreToolUse hooks to intercept skill loading, parse arguments, and write specialized variant to `.context/`.

**Rationale:** Skills carry dead conditional branches for inactive modes. Under context pressure, the model may confuse modes (applying autofix rules during report-only review). JIT specialization eliminates confusion by removing inapplicable content before the model sees it. This is compile-time constant folding applied to skill content. The converter infrastructure already parses platform conditionals but doesn't strip them.

**Downsides:** Requires parsing skill structure to identify mode boundaries. Hook-based interception adds load-time latency. Must handle edge cases where mode changes mid-session.

**Confidence:** 80%
**Complexity:** Medium-High
**Status:** New

### 18. Instruction Kolmogorov Compression

**Description:** Replace exhaustive instruction listings with minimal generative specifications the model can "decompress" using its training priors. adversarial-reviewer's 350-word expansion of 4 attack techniques (assumption violation, composition failures, cascade construction, abuse cases with sub-bullet examples) becomes a 28-word specification: "Construct multi-step failure scenarios. For each, specify trigger, execution path, and failure state." The model reconstructs the same expansion at inference time.

**Rationale:** Much of the instruction corpus is a decompression of what's already in the model's weights, performed at authoring time and burned into tokens. Shipping the compressed specification instead of the expansion saves 70-90% on those blocks. This is a design principle that applies to every skill, agent, and reference file. It reframes the problem from "how to compress text" to "how to write instructions already compressed by leveraging model priors."

**Cross-domain insight:** From algorithmic information theory -- the Kolmogorov complexity of a string is the length of the shortest program that produces it. For an LLM, the shortest prompt that produces the desired behavior is the Kolmogorov-optimal instruction.

**Downsides:** The model may decompress differently than intended under context pressure. Over-compression creates fragile instructions. Requires empirical validation via idea #14 (Ablation Framework).

**Confidence:** 70%
**Complexity:** Medium
**Status:** New

### 19. L3 Model Prior Elimination with Negative-Space Agent Redesign

**Description:** Two complementary changes: (a) Systematically audit and remove instructions restating model training knowledge across all 43 skills. Replace with trust signals ("Follow standard engineering practices"). (b) For review agents specifically, replace "what you hunt for" inclusion lists with compact exclusion boundaries ("here are the 5 things NOT your territory"). The model already knows what a correctness reviewer does from its identity line; the high-entropy information is the partition between reviewers, not the domain itself.

**Rationale:** Conservative estimate: 20-40% of skill content restates model priors. Review agents spend ~40% of tokens teaching the model things it knows (what XSS is, how to trace execution paths, what race conditions are). ce-work's 500-line branch setup teaches git commands. Negative-space design for agents reduces each from ~500 words to ~200 words by defining only the boundary with adjacent reviewers.

**Cross-domain insight:** From sculpture ("remove everything that isn't David") and constraint satisfaction in ML (defining feasible sets by boundaries, not interiors).

**Downsides:** Difficult to know where model priors end and novel constraints begin without empirical testing (#14). Risk of under-specifying. Negative-space design is untested with LLMs at this scale.

**Confidence:** 75%
**Complexity:** Medium
**Status:** New

### 20. Carrying Cost Budgeting

**Description:** Budget by `skill_size x estimated_tool_calls` (carrying cost), not raw file size. ce-review (55KB x 40 calls = 2.2M token-calls) costs 7-10x more than orchestrating-swarms (48KB x 3 calls). Use carrying cost as the primary metric in `bun run skill:stats` and as the prioritization framework for all future optimization.

**Rationale:** The existing optimization priority (largest files) may be wrong. Carrying cost reframes the question from "what is biggest?" to "what costs the most over its lifetime?" A 5KB skill triggering 50 tool calls costs 250K token-calls. A 30KB skill triggering 3 tool calls costs 90K token-calls. This changes which skills get optimized first and how aggressively.

**Downsides:** Estimated tool calls are approximations. Actual session lengths vary. Adds complexity to the budgeting model.

**Confidence:** 85%
**Complexity:** Low
**Status:** New

### 21. Pipeline Semantic Dedup + Anti-Interference Audit

**Description:** Audit co-loaded and pipeline-sequential skill pairs for: (a) semantic redundancy -- different text conveying the same constraint across skills (goes beyond existing idea #8's verbatim text dedup), and (b) conflicting instructions that worsen under compaction. ce-work re-teaches test discipline that ce-plan already established (~800-1200 tokens). ce-plan says "Do not pre-write implementation code"; ce-work says "Proceed directly to implementation" -- under compaction, phase boundaries may be lost and these become genuinely conflicting.

**Rationale:** Conflicting context causes 39% performance drop (the most damaging category in the context hygiene taxonomy). The brainstorm-plan-work pipeline accumulates ~179KB with no cross-skill coordination. Skills were authored independently and never audited for interaction effects. The ecological analogy: organisms in the same environment develop interaction protocols; skills in the same context window need the same analysis.

**Downsides:** Requires manual judgment about semantic overlap vs. intentional reinforcement. Primarily one-time audit value. Must maintain phase boundary clarity in each skill to prevent conflict.

**Confidence:** 75%
**Complexity:** Low-Medium
**Status:** New

### 22. Positional Attention Budgeting + Cognitive Chunking

**Description:** Restructure skills so highest-information-density content (novel constraints, boundary conditions, critical formulas) appears in the first 20% and last 10% of each skill. Organize each skill into 5-7 cognitive chunks with strong header anchors. Format critical invariants (confidence gates, routing rules, output schemas) as JSON/YAML for compaction survival rather than embedding them in prose.

**Rationale:** "Lost in the Middle" research shows 30%+ accuracy drop for mid-context information. ce-review puts critical routing tables and the confidence gate formula (11 tokens of irreplaceable information: "suppress below 0.60, P0 exception at 0.50") in the document middle where attention is weakest. Compaction survival hierarchy favors JSON/YAML and headers. Restructuring costs zero additional tokens while improving compliance and compaction resilience.

**Downsides:** Multi-turn sessions interleave tool results, partially breaking careful positioning. Compaction reorders content unpredictably. Benefits are hard to measure empirically.

**Confidence:** 60%
**Complexity:** Low
**Status:** New

### 23. Automated Instruction Minimization via Model Self-Compression

**Description:** For the top 10 largest skills, have the model rewrite instructions in the most token-efficient form it can still follow correctly. Test compressed versions against originals using the ablation harness (#14). The model understands its own attention patterns and priors better than any human author -- it knows which phrasings are redundant with its training data.

**Rationale:** Human-authored instructions optimize for human readability, not model parseability. The model may process "Branch: feature branch from default branch. Name: descriptive, derived from task." identically to ce-work's 30-line branch setup section. Letting the model compress systematically applies the "imperative form, avoid second person" rules exhaustively rather than sporadically.

**Downsides:** Highest-risk idea on the list. Compressed instructions may lose edge-case coverage. Semantic drift risk. Both critics flagged this as needing the ablation harness (#14) as safety net before any compressed version is adopted. Should be attempted only after ideas #14 and #19 establish what is safe to compress.

**Confidence:** 50%
**Complexity:** Medium
**Status:** New

### 24. Renormalization Group Flow -- Multi-Scale Instruction Hierarchy

**Description:** Design three self-consistent instruction tiers for each major skill: macro (~500 bytes, placed in CLAUDE.md, survives compaction via disk reload), meso (~3-5KB, the SKILL.md body, active operating instructions), micro (full detail in references/, loaded on demand). Each tier is a complete, valid operating specification, not a fragment. After compaction summarizes the meso tier, the macro tier in CLAUDE.md provides a degraded-but-functional fallback. Example macro for ce-review: "Multi-agent code reviewer. Dispatch specialist reviewers per diff content. Merge findings above 0.60 confidence gate. Output: structured findings JSON."

**Rationale:** Current compaction produces random fragments. A 55KB skill after compaction becomes an inconsistent mess -- some phases preserved, others lost, critical formulas summarized into vagueness. With RG flow, compaction naturally moves the system from fine-grained to coarse-grained operation. The macro tier still produces a functional (if simplified) review. This is the first idea that treats compaction as a natural physical process to design around, not fight against.

**Cross-domain insight:** From Kenneth Wilson's Nobel-winning renormalization group in physics. Effective theories change across scales -- classical mechanics is not "broken quantum mechanics," it is a valid theory at its scale. Each instruction tier is a valid operating specification at its scale.

**Downsides:** Requires authoring three tiers per skill. Macro tier adds to always-loaded CLAUDE.md overhead (~500 bytes x top 10 skills = ~5KB). Meso/micro boundary is judgmental. Only benefits skills likely to survive compaction (long sessions).

**Confidence:** 65%
**Complexity:** High
**Status:** New

### 25. Pidgin Instruction Language

**Description:** Formalize the emergent LLM-human instruction pidgin as an explicit authoring standard. Role assignment, hunting targets, thresholds, exclusions, output schemas -- in a minimal grammar with no English prose decoration. Security reviewer in pidgin: "Role: security-reviewer. Hunt: injection, auth-bypass, secrets-in-code, insecure-deser, SSRF. Threshold: 0.60. Not-yours: defense-in-depth, theoretical-physical, dev-https, generic-hardening. Output: JSON {reviewer, findings[], residual_risks[], testing_gaps[]}." 41 words vs. 428 in current prose.

**Rationale:** The model's training data contains the full expansion of every compressed term. "injection" decompresses to the full attack category because the model has read thousands of security documents. The pidgin exploits this shared knowledge systematically. Across 17 review agents at ~450 words each, pidginization could reduce the review agent corpus from ~7,650 words to ~750 words -- a 90% reduction on agent content.

**Cross-domain insight:** From contact linguistics (Bickerton, 1981). When two language communities with massive shared world knowledge make contact, they develop a pidgin -- radically simplified, maximum reliance on shared priors. LLM instruction is a natural pidginization candidate because the shared knowledge base is the entire internet.

**Downsides:** Untested whether LLMs respond as reliably to pidgin as to full prose. Risk of under-specification for edge cases. Requires empirical validation via ablation (#14). May reduce human readability for plugin contributors.

**Confidence:** 55%
**Complexity:** Medium
**Status:** New

### 26. Register Mismatch Correction -- Tutorial to Specification

**Description:** Rewrite all 43 skills from tutorial register (explanatory, motivational, hedging) to specification register (declarative, constraint-first, no motivation). Systematically cut three categories: (1) motivational framing ("better to ask questions now than build the wrong thing" -- 11 words, zero constraint for a model), (2) progressive explanation ("First check X. This is because Y" -- model needs "Check X" alone), (3) hedging markers ("You might want to consider...", "It's recommended to..." -- uncertainty markers that REDUCE instruction compliance by signaling optionality).

**Rationale:** The plugin addresses the model as a learner (tutorial register) when it needs to be addressed as a performer (specification register). ce-work opens with a 30-word restatement of its title. ce-review's mode detection uses 80+ words of motivational text per mode. Hedging markers ("Recommendation: Use worktree if:") signal optional guidance where the model needs binary routing. Estimated 20-30% reduction across all skills with zero behavior change.

**Cross-domain insight:** From sociolinguistic register theory (Halliday, Biber). Register is determined by tenor (relationship between speaker and addressee). Addressing a performer in tutorial register is like writing a legal contract in conversational English -- the content might be correct, but the register undermines precision.

**Downsides:** May reduce human readability for plugin contributors. Some explanatory content helps maintainers understand authorial intent. Need to preserve intent-carrying comments separately from performance-carrying instructions.

**Confidence:** 85%
**Complexity:** Low
**Status:** New

### 27. Schelling Point Architecture -- Spend Tokens Only on Divergences

**Description:** For each skill/agent, determine the model's natural behavior given ONLY the name, one-line description, and user request. Where this natural behavior matches the desired behavior (Schelling point), use explicit "rest markers" instead of full instructions: "Branch setup: standard conventions apply. Override: [specific exceptions]." Spend all token budget on non-Schelling behaviors -- the surprising, counterintuitive, or plugin-specific constraints the model would NOT naturally converge on.

**Rationale:** "You are a security reviewer" + a diff naturally produces injection/auth/SSRF hunting. The 21-line "What you're hunting for" section is largely a Schelling point. The confidence calibration (threshold = 0.60, P0 exception = 0.50) and "What you don't flag" sections are genuinely non-Schelling. Rest markers make the absence intentional and auditable -- distinguishing "consciously trusting priors" from "forgot to write instructions." Provides a formal decision criterion for keep/remove that complements ablation (#14): is this instruction Schelling or non-Schelling for this role?

**Cross-domain insight:** From Thomas Schelling's game theory (1960). Focal points where players coordinate without communication. Also from music theory: rests are notated, counted, and intentional -- silence IS an instruction. Also from markedness theory in linguistics: only encode exceptions (marked cases), not defaults (unmarked cases).

**Downsides:** Model behavior on rest markers is untested. Schelling-point identification requires empirical testing per model generation (behavior may shift). Risk of under-specification if the model's natural behavior drifts from assumed Schelling points.

**Confidence:** 60%
**Complexity:** Medium
**Status:** New

### 28. Cartographic Zoom Levels -- Cartouches for Orchestrators

**Description:** Create a 3-5 line "cartouche" (compact input/output contract) for each high-traffic skill. Orchestrators (lfg, slfg, ce-compound) route using the cartouche; only the executor loads the full skill. ce-plan cartouche: "Creates implementation plans in docs/plans/. Input: feature description or requirements path. Output: plan file path. Failures: non-software task (halts), empty input (prompts user)." Cartouches could be a frontmatter field (`cartouche:`) or a `references/cartouche.md`.

**Rationale:** Orchestrators currently trigger full skill loads for routing decisions that need only input/output contracts. lfg (1.7KB) dispatches 7 skills totaling ~200KB+. The orchestrator needs the map legend, not the map. With cartouches, the orchestrator carries ~300 bytes per downstream skill instead of triggering full loads. The executor loads the full skill in its own sub-agent context where it's actually needed.

**Cross-domain insight:** From cartographic generalization. A world map shows countries; a city map shows streets. The 1:1 map fallacy: a perfectly detailed map is the most useless. Cartouches on historical maps were the compact metadata blocks (title, scale, legend) helping navigators decide whether to consult the full chart.

**Downsides:** Requires dual maintenance (cartouche must track skill changes). May require platform-level support for cartouche-only loading. Useful only for orchestrator-pattern skills.

**Confidence:** 75%
**Complexity:** Low-Medium
**Status:** New

### 29. OODA Decision Manifests -- Pre-Position Decisions Before Context Decays

**Description:** For multi-step orchestrator skills (ce-review, ce-plan, ce-compound), pre-compute the full decision tree at session start and write to `.context/`. Each node contains: decision point, inputs needed, possible outcomes, and next node for each outcome. As context degrades over 30-50+ tool calls, the orchestrator reads the next decision from the manifest instead of re-deriving it from weakening mid-context instructions.

**Rationale:** By ce-review Stage 4, the original instructions are 30+ tool calls deep in mid-context where attention is 30%+ weaker ("Lost in the Middle"). The orchestrator makes its most complex decisions (persona selection, dispatch parameters) with the weakest signal. Decision manifests front-load the "Orient" step to message 1 when context is pristine, then execute from the manifest as context degrades.

**Cross-domain insight:** John Boyd's OODA loop (Observe-Orient-Decide-Act). You win by completing the loop faster than the adversary. In context management, the adversary is entropy. Externalizing Orient to disk at session start means the orchestrator operates inside entropy's OODA loop for the rest of the session.

**Downsides:** Pre-computed trees can't anticipate every runtime condition. Rigid manifests vs. flexible reasoning tradeoff. Adds skill design complexity. Only benefits long, multi-phase sessions.

**Confidence:** 60%
**Complexity:** Medium-High
**Status:** New

### 30. Congestion Pricing for Pipeline Sessions

**Description:** In multi-skill pipelines (brainstorm-plan-work-review), each subsequent skill loaded pays a "congestion surcharge": it must load a compressed variant proportional to existing context load. The first skill loads full content. The fourth skill (review, entering a ~70% consumed window) loads only its top 30% highest-value instructions (as ranked by ablation #14). Optionally, skills "reserve" capacity at pipeline start, forcing earlier skills to compress preemptively to leave room for later phases.

**Rationale:** The marginal cost of the Nth skill loaded is nonlinear: the skill that triggers compaction at 83.5% destroys 60% of ALL accumulated content, not just its own. ce-review entering a 70% consumed window at 55KB may trigger the compaction that destroys the brainstorm and plan state. Flat "load everything" pricing ignores this nonlinearity. Congestion pricing forces pipeline-aware compression; futures reservation prevents compaction crises by budgeting upfront.

**Cross-domain insight:** From congestion economics (London charge, Singapore ERP, peak electricity pricing). The marginal social cost of the Nth car on a highway is much higher than the 1st due to nonlinear congestion effects. Also from commodity futures: booking capacity you'll need later prevents spot-market crises (compaction = the context window's price spike).

**Downsides:** Requires estimating context utilization at skill-load time (no official API). Compressed variants must be pre-authored or generated by JIT specialization (#17). Adds orchestration complexity. The exact compaction trigger point (83.5%) is observed, not guaranteed.

**Confidence:** 55%
**Complexity:** High
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
| 17 | Shared Memory Constant Hoisting | Duplicate of existing idea #2 (Lean Agent Dispatch Pipeline) -- same mechanism, same savings estimate |
| 18 | Prototype-Chain Agent Inheritance | Duplicate of existing idea #2 (archetypes) with PL semantics framing |
| 19 | Token-Aware Authoring Tooling (standalone) | Already covered by existing idea #10 (Token Budget Guardrails). Novel carrying cost metric survives as idea #20 |
| 20 | Compaction-Resilient Architecture (standalone) | Components already covered: lazy thunks = existing #7, formatting = existing doc, chunking merged into idea #22 |
| 21 | Link-Time Dead Section Elimination | Incremental over existing release:validate; low ROI relative to implementation cost |
| 22 | Instruction Type System / Contract Checking | High build complexity for rare bug catches |
| 23 | AST Representation for Structured Instructions | Same fundamental problem as rejected #7 (Structural Template Compiler) repackaged |
| 24 | Backpressure-Driven Reviewer Dispatch | Overlaps existing idea #3 (Diff-Proportional Scaling) with token-budget framing |
| 25 | Content-Addressable Reference Dedup | Overlaps existing idea #8 (Cross-Skill Dedup) without novel benefit over simpler approaches |
| 26 | Post-Session Utilization Telemetry | High infrastructure cost, noisy signal from session transcripts |
| 27 | Instruction Half-Life / Staleness Detection | Process overhead exceeds one-time ablation value; better served by idea #14 |
| 28 | Immune System / Admission Control | Overlaps authoring linter (existing #10) and existing PR review process |
| 29 | Attention Half-Life Decay Compensation | Depends on PreCompact hook (#12); fragile mechanism for opaque compaction behavior |
| 30 | Synaptic Pruning Lifecycle | Concept merged into Plugin Module Unbundling (idea #15) |
| 31 | State Machine Representation | Same fundamental problem as rejected #7 (Structural Template Compiler) |
| 32 | Rate-Distortion Optimal Variants | Subsumed by Empirical Ablation (#14) with more actionable framing |
| 33 | Metabolic Rate Scoring | Subsumed by Carrying Cost Budgeting (#20); same insight, carrying cost is more operational |
| 34 | Genetic Algorithm for Instruction Minimization | Too experimental; Model Self-Compression (#23) is the lighter version |
| 35 | Copy-on-Write Agent Personas | Duplicate of existing idea #2 from systems architecture frame |
| 36 | Demand-Driven Compilation | Subsumed by JIT Skill Specialization (#17) |
| 37 | Interprocedural Constant Propagation | Subsumed by existing idea #2 + shared memory (rejected as dup #17) |
| 38 | Context Window Enclosure Act (property rights) | Overlaps carrying cost budgeting (#20) with legal metaphor; no actionable mechanism beyond budgets |
| 39 | Vickrey Auction for Reviewer Slots | Requires building a relevance classifier; diff-proportional (#3) + content-awareness is simpler |
| 40 | Pigouvian Tax on Context Pollution | Reframes pipeline semantic dedup (#21) without adding actionable mechanism |
| 41 | Opportunity Cost Ledger | Subsumed by carrying cost budgeting (#20); dollar-equivalent is one column |
| 42 | Comparative Advantage Reclassification | Restates script-first (#4) with Ricardian framing; same action |
| 43 | Instruction Inflation Index | Repricing per model generation subsumed by ablation framework (#14) run on current model |
| 44 | Futures Market for Context Reservations | Merged into congestion pricing (#30) as the reservation component |
| 45 | Gricean Quantity Violation Audit | Subsumed by ablation (#14) + prior elimination (#19) at sentence level |
| 46 | Pragmatic Implicature Compression | Three-tier hierarchy (identity/conventional/particularized) useful framing for #19 but not standalone |
| 47 | Information Structure Inversion (Topic vs Comment) | Topic-comment ratio measures same phenomenon as #19 from linguistic angle |
| 48 | Speech Act Decomposition (direct vs indirect) | Merged into register mismatch (#26) as a specific technique |
| 49 | Markedness-Only Specification | Merged into Schelling points (#27); markedness provides the formal criterion |
| 50 | Relevance-Theoretic Instruction Triage | Processing effort / cognitive effect ratio is ablation (#14) with a Sperber-Wilson framing |
| 51 | Entropy Pump (periodic state crystallization) | Overlaps PreCompact hook (#12) + circuit breaker (#16); continuous crystallization is same mechanism |
| 52 | Attention Conservation Law | Reframes carrying cost (#20) as physics; "negative attention value" noted but not standalone |
| 53 | Critical Opalescence (pre-compaction detection) | Precursor signals merged into circuit breaker (#16) as detection mechanism |
| 54 | Resonance Tuning (constructive/destructive interference) | Overlaps pipeline semantic dedup (#21) with wave interference framing |
| 55 | Wave-Particle Duality of Instructions | Interesting mental model; actions already covered by carrying cost (#20) + script-first (#4) |
| 56 | Minimum Action Principle (geodesic paths) | Subsumed by JIT specialization (#17); geodesic = task-specific variant |
| 57 | Quantum Superposition Collapse (precision tokens) | Instruction precision is ablation (#14) applied to ambiguity; no distinct mechanism |
| 58 | Demi-Glace Reduction | Restates prior elimination (#19) as culinary metaphor; same action |
| 59 | Wabi-Sabi Instructions | Philosophy merged into Schelling points (#27) as the authoring mindset |
| 60 | Desire Path Instrumentation | High infrastructure cost; overlaps rejected utilization telemetry (#26) |
| 61 | Progressive Disclosure Layers | Hook-based assembly mechanism merged into JIT specialization (#17) |
| 62 | IKEA Effect (model self-selects reviewers) | Inconsistent model self-selection vs. deterministic dispatch; fragile |
| 63 | Orchestral Scoring (dynamic instrumentation) | Dynamic voice by phase overlaps JIT specialization (#17) + congestion pricing (#30) |
| 64 | Counterpoint Voicing (harmonic intervals) | Restates pipeline semantic dedup (#21) with music framing |
| 65 | Economy of Force Audit | Restates plugin module unbundling (#15) with military framing |
| 66 | Nash Equilibrium Rebalancing | Multi-skill interaction ablation prohibitively expensive; theoretical |
| 67 | Theme and Variations (ur-workflow extraction) | Extends existing #2 (archetypes) + #8 (cross-skill dedup); tactic, not standalone |
| 68 | Norman Door Elimination (fix affordances) | Good principle but 2-5KB savings per skill; absorbed into register mismatch (#26) |
| 69 | Rests as Instruction (deliberate marked absence) | Merged into Schelling points (#27) as the marking mechanism |

## Implementation Sequencing

### Dependency Graph

```
PHASE 0: MEASUREMENT (foundation)
  #14 Empirical Ablation ─────────┬──> #19 L3/Negative-Space
                                  ├──> #25 Pidgin Language
                                  ├──> #27 Schelling Points
                                  ├──> #18 Kolmogorov Compression
                                  └──> #23 Model Self-Compression
  #20 Carrying Cost Budgeting ────> reorders priority of #1, #4, #7

PHASE 1: QUICK WINS (independent, parallel, no dependencies)
  #26 Register Mismatch ──────────> makes #25 Pidgin easier later
  #9  Description Trim
  #6  Merge ce-work/beta
  #5  Dead Content Audit
  #10 Token Guardrails ───────────> prevents regression from all later work

PHASE 2: STRUCTURAL DEDUP (parallel, independent of Phase 0)
  #2  Lean Agent Dispatch (archetypes + shared context)
  #8  Cross-Skill Dedup (centralize in AGENTS.md)
  #7  On-Demand Loading (ce-review @-inlines)
  #3  Diff-Proportional Scaling

PHASE 3: ABLATION-GUIDED (requires Phase 0 data)
  #19 L3/Negative-Space Agent Redesign
  #18 Kolmogorov Compression
  #27 Schelling Point Architecture
  #4  Script-First Extraction

PHASE 4: ARCHITECTURE (builds on Phases 1-3)
  #15 Module Unbundling
  #28 Cartographic Zoom / Cartouches
  #1  Queryable Reference Libraries
  #11 Compact Returns Generalization

PHASE 5: SESSION LIFECYCLE (builds on Phase 4)
  #16 Circuit Breaker + Resumption ──> enables #30
  #17 JIT Specialization
  #24 RG Flow (multi-scale hierarchy)
  #29 OODA Decision Manifests

PHASE 6: EXPERIMENTAL (requires validated foundation)
  #25 Pidgin Language (needs #14 + #26)
  #23 Model Self-Compression (needs #14, highest risk)
  #30 Congestion Pricing (needs #16 + context estimation)
  #12 PreCompact Hook
  #13 Phase Transition Markers
  #22 Positional Attention Budgeting
```

### Estimated Impact per Phase

| Phase | Effort | Token Savings | Key Unlock |
|-------|--------|--------------|------------|
| 0: Measurement | 1-2 weeks | 0 (enables everything) | Data for all decisions |
| 1: Quick Wins | 1 week, parallel | ~60-100KB corpus reduction | Regression prevention |
| 2: Structural | 2 weeks | ~100-160KB per review session | Agent dispatch efficiency |
| 3: Ablation-Guided | 2 weeks | 20-40% of remaining skill content | Evidence-based cuts |
| 4: Architecture | 2-3 weeks | ~30-40% always-loaded reduction | Modular plugin |
| 5: Session Lifecycle | 2-3 weeks | Prevents compaction damage | Multi-session workflows |
| 6: Experimental | Ongoing | Potentially 70-90% on agents | Novel authoring paradigm |

### Speed x Impact Ranking (Zero User Behavior Change)

| Rank | Idea | Time to Ship | Per-Session Savings | Why This Order |
|------|------|-------------|-------------------|----------------|
| 1 | #26 Register Mismatch | 1-2 days (top 7 skills) | ~56-85KB corpus | Universal impact, improves compliance, foundation for #25/#27 |
| 2 | #7 On-Demand Loading | 1 hour | 22-25KB/review | Fastest single change, ce-review only |
| 3 | #3 Diff-Proportional | 2-4 hours | 60-90KB on small diffs | One conditional in dispatch logic |
| 4 | #9 Description Trim | 2-3 hours | 8-10KB always-loaded | Enforce existing guideline |
| 5 | #6 Merge work/beta | 4-8 hours | 27KB dedup | Low risk, straightforward merge |
| 6 | #2 Lean Agent Dispatch | 1-2 weeks | ~144KB/review | Biggest single-step savings |
| 7 | #14 Ablation Framework | 1-2 weeks | 0 (measurement) | Unlocks 5 dependent ideas |
| 8 | #10 Token Guardrails | 2-3 hours | 0 (prevention) | Prevents regression |

### Recommended First Move

**#26 (Register Mismatch Correction)** is the highest-value starting point because:

1. **Universal impact**: Affects all 43 skills, not just one
2. **Improves behavior**: Removing hedging markers ("You might want to...") INCREASES instruction compliance -- compression that improves quality
3. **Incrementally shippable**: Start with ce-review (55KB, ~11-16KB reduction), then ce-plan, ce-work. See value after the first skill
4. **Foundation for later work**: A specification-register corpus is halfway to pidgin (#25) and Schelling points (#27)
5. **Zero user behavior change**: Same invocations, same outputs, fewer tokens, better compliance
6. **Prevents future bloat**: Establishes specification register as the authoring standard

Optionally ship #7 (On-Demand Loading, 1 hour) as a warm-up before starting #26.

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
- 2026-04-11: Cross-domain ideation pass -- 5 parallel sub-agents (information theory/model cognition, PL semantics/compiler design, systems architecture/distributed computing, biological systems/evolutionary, organizational process/meta-optimization). 40 raw ideas generated, 25 after dedup + 3 cross-cutting combinations, 10 survived adversarial filtering by 2 critic agents (pragmatist + visionary). Added ideas #14-23. Added 21 new rejections (#17-37). User priorities integrated: session breakpoints (#16), modular plugin (#15), token awareness in all instructions (#14, #18, #19, #20, #22). Key insight: Empirical Instruction Ablation (#14) is the foundational idea -- all other optimization is guesswork without measurement.
- 2026-04-11: Wild cross-domain ideation pass -- 5 parallel sub-agents (economics/market design, linguistics/pragmatics, physics/thermodynamics, industrial design/culinary/cartography, music theory/military strategy/game theory). 40 raw ideas generated, 7 survived against 32 rejections (#38-69). Added ideas #24-30. Standout insights: Renormalization Group Flow (#24) treats compaction as a natural process to design around; Pidgin Instruction Language (#25) achieves 90% reduction on agent content; Register Mismatch Correction (#26) is the most immediately actionable at 20-30% reduction across all skills. Total: 30 ranked ideas, 69 rejections, 120 raw candidates across 3 sessions and 12 sub-agents.
- 2026-04-11: Implementation sequencing pass -- Mapped dependency graph across all 30 ideas into 7 phases. Speed x impact ranking established. User criteria: fastest true value + zero user behavior change. Recommendation: #26 (Register Mismatch Correction) as first move, with #7 (On-Demand Loading) as optional 1-hour warm-up. Added implementation sequencing section with dependency graph, impact estimates, and recommended first move.
