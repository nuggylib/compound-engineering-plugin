---
title: "refactor: Schelling-Point Negative-Space Agent Optimization"
type: refactor
status: completed
date: 2026-04-18
origin:
  - docs/brainstorms/2026-04-16-l3-negative-space-agent-redesign-requirements.md
  - docs/brainstorms/2026-04-16-schelling-point-architecture-requirements.md
ideas: [19, 27]
---

# refactor: Schelling-Point Negative-Space Agent Optimization (#19 + #27)

## Overview

Combine the Schelling Point taxonomy (#27) with negative-space rewriting (#19) to remove model-prior content from review agents. The Schelling taxonomy classifies what to cut; negative-space design determines how to rewrite what remains.

Ablation data from 6 agents (5 targeted + 1 canary) provides empirical calibration. The brainstorms' theoretical predictions overestimated removable content by ~40%, so this plan uses conservative, per-agent decisions driven by composite scores rather than category-level assumptions.

## Problem Frame

28 review agents total 131,537 bytes. The brainstorms estimated 54% is Schelling (model-prior) content, projecting ~53KB of savings. Ablation reveals the actual picture is more nuanced: some agents are entirely Schelling (cli-readiness-reviewer: all sections 1.000), while others are almost entirely load-bearing (adversarial-reviewer: most sections <0.50).

(see origins for full analysis)

## Ablation Reality Check

The brainstorms predicted "What you're hunting for" sections are Strong Schelling across all agents. Ablation disproves this:

| Agent | "Hunting" composite | Prediction | Reality |
|-------|-------------------:|------------|---------|
| cli-readiness-reviewer | 1.000 | Strong Schelling | Confirmed |
| project-standards-reviewer | 0.874 | Strong Schelling | Borderline confirmed |
| correctness-reviewer | 0.497 | Strong Schelling | **Load-bearing** |
| adversarial-reviewer | 0.492 | Non-Schelling | Confirmed load-bearing |

**Calibration insight:** Agents with broad, generic domains (cli-readiness, project-standards) have Schelling hunting sections. Agents with specific methodology or trace instructions (correctness, adversarial) have load-bearing hunting sections. The model knows WHAT to look for but benefits from HOW to look for it.

### Full ablation summary (6 agents, 62 sections, 47,986B)

| Tier | Composite range | Sections | Bytes | % of total |
|------|----------------|----------|------:|----------:|
| Schelling (safe to remove) | > 0.85 | 7 | 8,262 | 17% |
| Moderate (compress, don't delete) | 0.50 - 0.85 | 35 | 20,838 | 43% |
| Load-bearing (retain fully) | < 0.50 | 20 | 18,886 | 39% |

### Per-agent ablation profiles

**cli-readiness-reviewer** (4 sections, 4,420B): All sections 1.000. Entirely Schelling. Full rewrite safe.

**project-standards-reviewer** (6 sections, 6,178B): Range 0.798-0.911. High Schelling. Hunting (0.874) and evidence (0.911) sections compressible.

**correctness-reviewer** (4 sections, 2,963B): Hunting 0.497 (load-bearing), calibration 0.725, don't-flag 0.726, output 0.663. Mixed: retain hunting, compress calibration.

**adversarial-reviewer** (9 sections, 7,399B): Composition failures 0.358, assumption violation 0.443, depth calibration 0.483. Mostly load-bearing. Cascade (0.613) and abuse cases (0.527) moderate.

**agent-native-reviewer** (19 sections, 8,649B): Uniform 0.486-0.671. Distributed value across all sections. No easy cuts.

**cli-agent-readiness-reviewer** (23 sections, ~19,000B): Framework sections 0.380-0.420. Principles 0.382-0.539. Value IS the framework-specific detail.

## Requirements Trace

| Req (from brainstorms) | Summary | Addressed by |
|------------------------|---------|-------------|
| #19-R1: Remove model-prior content | Identify and remove instructions restating model priors | Unit 1 classification, Units 2-4 rewrites |
| #19-R2: Negative-space boundaries | Define agents by exclusion, not inclusion | Units 2-4 (territory/not-territory format) |
| #19-R3: Ablation validation | Every removal validated empirically | Unit 5 |
| #27-R1: Schelling taxonomy | Classify sections as Strong/Weak/Non/Anti-Schelling | Unit 1 |
| #27-R2: Rest markers | Auditable deletion with override surface | Deferred (see Key Decisions) |
| #27-R3: Anti-Schelling retention | Retain corrective instructions that override model defaults | Units 2-4 (retain all don't-flag content for load-bearing agents) |

## Scope Boundaries

### In Scope

- Schelling classification of all 28 review agents
- Negative-space rewrites for Schelling-dominant agents (ablation composite > 0.85)
- Graduated compression for moderate agents (0.50-0.85)
- Ablation validation of rewrites on 4+ agents
- Savings measurement and documentation

### Out of Scope

- Skill file rewrites (skills have 9-17% Schelling ratio; low ROI vs agents at 38-63%)
- Legacy agent redesign to structured format (separate concern; this plan works with existing formats)
- Rest marker syntax (deferred; simple deletion + compressed replacements are sufficient)
- Combinatorial ablation (removing multiple sections simultaneously)
- Automated Schelling classification tooling
- Output format dedup (already addressed by #2 Lean Agent Dispatch)

## Key Technical Decisions

### Graduated compression over rest markers

The #27 brainstorm proposed `<!-- rest: ... -->` HTML comment markers. This plan uses graduated compression instead (paragraph -> sentence -> phrase). Rationale:

1. Ablation shows the model does NOT reliably converge from role name alone for many agents. Rest markers assume it does.
2. Graduated compression preserves behavioral anchoring while reducing bytes.
3. Rest markers add ~30-60 tokens each with unvalidated behavioral effect.
4. Simple deletion with commit documentation achieves the same auditability without runtime cost.

Rest markers remain a valid future enhancement if graduated compression proves insufficient.

### Per-agent decisions over per-section-type rules

The brainstorms assumed section types (hunting, don't-flag, calibration) have consistent Schelling-ness across agents. Ablation disproves this. This plan classifies per-agent, using the ablation-calibrated expert judgment protocol from #27:

1. Expert judgment classifies each agent's sections.
2. Agents similar to ablated agents (same class, similar domain breadth) inherit the ablated agent's profile.
3. Dissimilar agents get conservative treatment (retain unless clearly Schelling).

### Identity paragraphs are compressible across all agents

Every ablated agent shows the identity paragraph contributes minimally to findings (the frontmatter description already establishes the role). Compress identity paragraphs from ~300B to ~80B across all agents: keep role name and one methodological sentence, remove elaboration.

### Anti-Schelling content always retained

"What you don't flag" sections contain corrective instructions (Anti-Schelling). Ablation scores for these sections:
- adversarial: 0.462 (load-bearing)
- correctness: 0.726 (moderate)
- project-standards: 0.825 (moderate-high)
- cli-readiness: 0.925 (Schelling -- but this agent is entirely Schelling)

Default: retain all "don't flag" content unless the agent is fully Schelling. This protects against the highest-risk misclassification (removing a corrective constraint causes the model to produce wrong behavior).

## Implementation Units

- [x] **Unit 1: Schelling classification manifest**

**Goal:** Classify all 28 review agents into optimization tiers using expert judgment calibrated by ablation data.

**Dependencies:** None (ablation data already exists)

**Files:**
- Create: `.context/ablation/schelling-classification.md`

**Approach:**

Classify each agent into one of four tiers:

| Tier | Criterion | Action | Expected agents |
|------|-----------|--------|-----------------|
| T1: Full Schelling | All sections > 0.85 (ablated) or broad generic domain with no unique methodology (expert judgment) | Full negative-space rewrite | cli-readiness-reviewer, plus 2-4 tiered personas |
| T2: Partial Schelling | Some sections > 0.85, some < 0.85 (ablated) or broad domain with some unique calibration (expert) | Compress Schelling sections, retain load-bearing | project-standards, correctness, plus 8-10 tiered/opinionated personas |
| T3: Load-bearing | Most sections < 0.50 (ablated) or unique methodology throughout (expert) | Minimal changes (identity compression only) | adversarial, cli-agent-readiness, plus 2-4 specialists |
| T4: Distributed value | All sections moderate 0.50-0.70 (ablated) or procedural multi-step format (expert) | Identity compression only | agent-native, plus 2-3 legacy agents |

**Expert judgment calibration rules:**

1. Tiered personas (security, performance, testing, maintainability, reliability, api-contract, data-migrations) inherit from correctness-reviewer profile (T2). Their hunting sections contain domain-specific trace instructions.
2. Opinionated personas (dhh-rails, kieran-*) are likely T3 (their "opinions" are non-Schelling by definition).
3. Legacy overlap agents (security-sentinel, performance-oracle, etc.) with redesigned counterparts are likely T1 (their content is redundant with the redesigned version AND model priors).
4. Unique legacy agents (deployment-verification, schema-drift-detector) are likely T4 (procedural, distributed value).

Output format:

```markdown
| Agent | Tier | Predicted savings | Rationale |
|-------|------|------------------:|-----------|
| cli-readiness-reviewer | T1 | 3,800B | Ablation: all 1.000 |
| ... | ... | ... | ... |
```

**Verification:**
- Classification covers all 28 agents
- Each classification cites ablation data or expert-judgment calibration rule
- Total predicted savings calculated

---

- [x] **Unit 2: T1 full negative-space rewrites**

**Goal:** Rewrite Schelling-dominant agents to minimal negative-space format.

**Dependencies:** Unit 1 (classification manifest)

**Files:**
- Modify: `plugins/compound-engineering/agents/review/cli-readiness-reviewer.md`
- Modify: other T1 agents identified in Unit 1

**Approach:**

For each T1 agent, rewrite to this template:

```markdown
---
[existing frontmatter unchanged]
---

# {Agent Name}

{One sentence: role + methodology, ~80B}

## Territory

{Comma-separated list of owned concerns, ~100-200B}
{One behavioral instruction if unique, ~50B}

## Not your territory

{Boundary list from existing "What you don't flag", retained fully}

## Output

Return findings as JSON. `"reviewer": "{name}"`.
```

**Worked example -- cli-readiness-reviewer:**

Current: 4,420B body (excluding frontmatter)
Proposed: ~500B body

The model produces identical findings with or without any section (all 1.000). The rewrite keeps only:
- Territory summary (what domain, not how -- the model knows how)
- Boundaries (retained from "What you don't flag" as insurance)
- Output directive

**Estimated savings:** 3,800-4,000B per T1 agent. If 3-5 agents are T1: 11-20KB total.

**Verification:**
- Each rewritten agent passes `bun run release:validate`
- Rewritten agents are syntactically valid (frontmatter parses, sections present)

---

- [x] **Unit 3: T2 graduated compression**

**Goal:** Compress Schelling sections in mixed agents while retaining load-bearing sections.

**Dependencies:** Unit 1 (classification manifest)

**Files:**
- Modify: T2 agent files (estimated 8-12 agents)

**Approach:**

For each T2 agent, apply graduated compression per section:

**Sections with composite > 0.80 (Schelling):**
Replace paragraph-length definitions with sentence-level summaries.

Before (correctness-reviewer, "Confidence calibration", 712B):
```
### High confidence (0.80+)
You can trace the full execution path from input to bug...
[3 paragraphs of explanation]
```

After (~200B):
```
High (0.80+): full traceable path from input to bug.
Moderate (0.60-0.79): pattern present, path not fully confirmable.
Below 0.60: suppress.
```

**Sections with composite 0.50-0.80 (moderate):**
Compress to sentence-level but retain all unique behavioral instructions.

**Sections with composite < 0.50 (load-bearing):**
Retain fully. Do not modify.

**Identity paragraphs (all agents):**
Compress from ~300B to ~80B. Keep role name + one methodology sentence.

Before: "You are a logic and behavioral correctness expert who reads code by mentally executing it -- tracing inputs through branches, tracking state across calls, and asking 'what happens when this value is X?'"

After: "Logic and behavioral correctness expert. Mentally execute code, tracing inputs through branches."

**Estimated savings:** 400-800B per T2 agent (identity + Schelling section compression). If 8-12 agents are T2: 3.2-9.6KB total.

**Verification:**
- Each compressed agent retains all content from sections with composite < 0.50
- No "What you don't flag" content removed
- Word count of retained load-bearing sections unchanged

---

- [x] **Unit 4: T3/T4 identity-only compression**

**Goal:** Apply minimal compression to load-bearing and distributed-value agents.

**Dependencies:** Unit 1 (classification manifest)

**Files:**
- Modify: T3 and T4 agent files (estimated 8-12 agents)

**Approach:**

For T3 and T4 agents, only compress the identity paragraph (~200B savings per agent). All other content retained as-is.

This is conservative by design. These agents have empirically load-bearing or uniformly moderate content. The savings are small per agent but compound across 8-12 agents.

**Estimated savings:** ~200B per agent. Total: 1.6-2.4KB.

**Verification:**
- Only identity paragraphs changed
- All other content byte-identical to original

---

- [x] **Unit 5: Ablation validation**

**Goal:** Confirm no quality regression in rewritten agents.

**Dependencies:** Units 2, 3, 4

**Files:**
- Read: `.context/ablation/*/run-*.json` (existing baselines)
- Create: `.context/ablation/*/run-*.json` (post-rewrite runs)

**Approach:**

Run ablation on 4 rewritten agents spanning all tiers:
1. One T1 agent (full rewrite): cli-readiness-reviewer
2. Two T2 agents (graduated compression): correctness-reviewer + one other
3. One T3/T4 agent (identity-only): adversarial-reviewer

Command per agent:
```bash
bun run scripts/ablation/run.ts --file plugins/compound-engineering/agents/review/{agent}.md --runs 1 --fixture buggy
```

**Pass criteria:**
- T1 agents: composite must remain >= 0.85 (the model was already doing the job without the content)
- T2 agents: composite must not drop more than 0.10 from pre-rewrite baseline
- T3/T4 agents: composite must not drop more than 0.05 (minimal changes = minimal risk)

**Regression protocol:**
If any agent fails validation:
1. Identify which compression caused the regression (diff the rewrite)
2. Restore the specific content that was removed/compressed
3. Re-run ablation to confirm fix
4. Update the classification manifest with the finding

**Verification:**
- All 4 validation runs complete without regression
- Results documented in `.context/ablation/validation-summary.md`

---

- [x] **Unit 6: Documentation and meta-plan updates**

**Goal:** Record results and update tracking.

**Dependencies:** Unit 5

**Files:**
- Modify: `docs/plans/2026-04-13-meta-token-efficiency-execution-plan.md` (tracking table)
- Modify: `.context/ablation/schelling-classification.md` (update with actual vs predicted)

**Approach:**

1. Update meta-plan tracking table: mark #19 and #27 as "done" with execution artifacts.
2. Record actual savings vs predicted savings in classification manifest.
3. Note any classification corrections discovered during validation.

**Verification:**
- Meta-plan tracking table updated
- Savings documented

## Savings Projection

| Tier | Agents | Per-agent savings | Total savings |
|------|-------:|------------------:|--------------:|
| T1: Full rewrite | 3-5 | 3,000-4,000B | 9,000-20,000B |
| T2: Graduated compression | 8-12 | 400-800B | 3,200-9,600B |
| T3/T4: Identity-only | 8-12 | ~200B | 1,600-2,400B |
| **Total** | **28** | | **13,800-32,000B** |

**Conservative estimate: ~15KB. Moderate estimate: ~25KB.**

This is lower than the brainstorms' 53KB projection because ablation showed many "obviously Schelling" sections are actually load-bearing. The plan trades aggressive savings for quality preservation.

## Execution Order

1. Unit 1 (classification): ~30 min. Read all 28 agents, classify using calibration rules.
2. Units 2-4 (rewrites): Execute in parallel by tier. T1 first (highest savings per agent), T2 second, T3/T4 third.
3. Unit 5 (validation): After all rewrites. ~4 ablation runs.
4. Unit 6 (documentation): After validation passes.

## Dependencies on Prior Work

| Idea | Status | How this plan uses it |
|------|--------|----------------------|
| #14 Ablation Framework | done | Provides empirical classification data and validation mechanism |
| #2 Lean Agent Dispatch | done | Extracted shared output format; individual agents need only `"reviewer": "{name}"` |
| #26 Register Mismatch | done | Content is in specification register, making Schelling classification cleaner |
| #20 Carrying Cost | done | Agents are mostly low carrying cost (loaded once per review); savings are per-invocation, not per-tool-call |

## What This Unlocks

- **#18 Kolmogorov Compression:** Runs AFTER this plan. Compresses the remaining non-Schelling content (makes unique instructions shorter). This plan removes redundant content first.
- **#4 Script-First Extraction:** Independent. Can run in parallel.
- **Batch 5+ ideas:** Reduced agent sizes lower the baseline for all future measurement.
