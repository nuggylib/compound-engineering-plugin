# Phase 1 Research Task Specifications

Four parallel research tasks for Full Mode Phase 1. Each returns TEXT DATA only -- must NOT write files.

---

## Context Analyzer

Extract conversation history. Read `references/schema.yaml` for enum validation and track classification (bug vs knowledge from problem_type). Read `references/yaml-schema.md` for category mapping.

- **Bug track fields:** symptoms, root_cause, resolution_type
- **Knowledge track fields:** applies_when (symptoms/root_cause/resolution_type optional)
- Incorporate auto memory excerpts as supplementary evidence
- Return: YAML frontmatter skeleton (with `category:` mapped from problem_type), category path, filename (`[sanitized-problem-slug]-[date].md`), track
- Do not invent enum values or force cross-track fields

---

## Solution Extractor

Read `references/schema.yaml` for track classification. Auto memory supplements conversation (conversation takes priority; contradictions -> cautionary context).

**Bug track:** Problem, Symptoms, What Didn't Work, Solution (code before/after), Why This Works, Prevention (concrete examples)

**Knowledge track:** Context, Guidance (code examples), Why This Matters, When to Apply, Examples (before/after)

---

## Related Docs Finder

Search `docs/solutions/`, find cross-references, related GitHub issues, stale/contradicted docs.

**Overlap assessment** (5 dimensions: problem statement, root cause, solution approach, referenced files, prevention rules): **High** 4-5 match, **Moderate** 2-3 match, **Low** 0-1 match.

**Search strategy (grep-first):** Extract keywords -> narrow to category dir if clear -> parallel content-search on frontmatter (`title:`, `tags:`, `module:`, `component:` patterns) -> >25 hits: re-narrow; <3: broaden -> read frontmatter only (30 lines) to score -> fully read strong/moderate matches. Return distilled links, not raw content.

**GitHub:** `gh issue list --search "<keywords>" --state all --limit 5`. Fallback: MCP tools or skip.

---

## Session Historian

Dispatch as `compound-engineering:research:session-historian`. <!-- why: session files live outside working directory; background agents may lack access -->
Mid-tier model (`model: "sonnet"`). Omit `mode` parameter. Pass: specific problem description, git branch, working directory, "only relevant findings" instruction. Output format:

```
- What was tried before
- What didn't work
- Key decisions
- Related context
```

Return structured digest or "no relevant prior sessions".
