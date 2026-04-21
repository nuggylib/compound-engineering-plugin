---
name: ce-demo-reel
description: "Capture visual demo reels (GIFs, terminal recordings, screenshots) for PR descriptions. Use when shipping observable changes that benefit from visual proof."
argument-hint: "[what to capture, e.g. 'the new settings page' or 'CLI output of the migrate command']"
---

# Demo Reel

Detect project type, recommend a capture tier, record visual evidence, upload to a public URL, and return markdown for PR inclusion.

## When to Use

Triggers:
- "add a demo", "record a GIF", "screenshot a feature", "show what changed visually", "create a demo reel", "capture evidence", "add proof to a PR", "create a before/after comparison"
- Shipping UI changes, CLI features, or any work with observable behavior
- Visual evidence needed for a PR description

**Evidence means USING THE PRODUCT, not running tests.** "I ran npm test" is test evidence. Evidence capture is running the actual CLI command, opening the web app, making the API call, or triggering the feature. The distinction is absolute -- test output is never labeled "Demo" or "Screenshots."

If real product usage is impractical (requires API keys, cloud deploy, paid services, bot tokens), say so explicitly: "Real evidence would require [X]. Recommending [fallback approach] instead." Do not silently skip to "no evidence needed" or substitute test output.

Never generate fake or placeholder image/GIF URLs. If upload fails, report the failure.

## Arguments

Parse `$ARGUMENTS`:
- **What to capture**: Use to guide which pages to visit, commands to run, or states to capture.
- If blank, infer what to capture from recoverable branch or PR context. If the target remains ambiguous after that, ask the user what they want to demonstrate before proceeding.

## Step 0: Discover Capture Target

Treat target discovery as stateless and branch-aware. <!-- why: the agent may be invoked in a fresh session after the work was already done --> Do not rely on conversation history or assume the caller knows the right artifact.

Rerun target discovery and validation before capturing anything, even when invoked by another skill with a caller-provided target.

Identify the best evidence target from the lightest available context:

- Current branch name
- Open PR title and description, if one exists
- Changed files and diff against the base branch
- Recent commits
- A plan file only when it is obviously referenced by the branch, PR, arguments, or caller context

Form a capture hypothesis: "The best evidence appears to be [behavior]."

Proceed without asking only when there is exactly one high-confidence observable behavior and a plausible way to exercise it from the workspace. Ask the user what to demonstrate when multiple behaviors are plausible, the diff does not reveal how to exercise the behavior, or the requested target cannot be mapped to a product surface.

Skip evidence with a clear reason when the diff is docs-only, markdown-only, config-only, CI-only, test-only, or a pure internal refactor with no observable output change.

## Step 1: Exercise the Feature

Before capturing anything, verify the feature works by actually using it:

- **CLI tool**: Run the new/changed command and confirm the output is correct
- **Web app**: Navigate to the new/changed page and confirm it renders correctly
- **Library**: Run example code using the new/changed API
- **Bug fix**: Reproduce the original bug scenario and confirm it's fixed

Use the workspace where the feature was built. If setup requires credentials or services, use the platform question tool (AskUserQuestion / request_user_input / ask_user) to ask the user.

## Step 2: Detect Project Type

If the diff touches a specific subdirectory with its own package manifest (e.g., `packages/cli/`, `apps/web/`), pass that as the root. Otherwise use the repo root.

```bash
python3 scripts/capture-demo.py detect --repo-root [TARGET_DIR]
```

Output: JSON with `type` and `reason`. The result is a signal, not a gate — if Step 0 context contradicts the script's classification, the agent's judgment wins.

## Step 3: Assess Change Type

Classify based on arguments if provided, otherwise use the diff context from Step 0.

**Change classification:**

1. **Involves motion or interaction?** (animations, typing flows, drag-and-drop, real-time updates, continuous CLI output) -> classify as `motion`.
2. **Involves discrete states?** (before/after UI, new page, command with output, API response) -> classify as `states`.

| Change characteristic | Classification |
|---|---|
| Animations, typing, drag-and-drop, streaming output | `motion` |
| New UI, before/after, command output, API responses | `states` |

**Feature vs bug fix -- what to demonstrate:**

- **New feature (`feat`)**: Demonstrate the feature working. Show the hero moment -- the feature doing its thing.
- **Bug fix (`fix`)**: Show before AND after. Reproduce the original broken state (if possible) then show the fix. If the broken state can't be reproduced (already fixed in the workspace), capture the fixed state and describe what was broken.

Infer feat vs fix from commit messages, branch name, or plan file frontmatter (`type: feat` or `type: fix`). If unclear, ask.

## Step 4: Tool Preflight

Run the preflight check:

```bash
python3 scripts/capture-demo.py preflight
```

Output: JSON with boolean availability for `agent_browser`, `vhs`, `silicon`, `ffmpeg`, `ffprobe`. Print a human-readable summary noting install commands for missing tools (e.g., `brew install charmbracelet/tap/vhs`, `brew install silicon`, `brew install ffmpeg`).

## Step 5: Create Run Directory

Create a per-run scratch directory in the OS temp location:

```bash
mktemp -d -t demo-reel-XXXXXX
```

Use the output as `RUN_DIR`. Pass this concrete run directory to every tier reference.

## Step 6: Recommend Tier and Ask User

Run the recommendation script with the project type from Step 2, change classification from Step 3, and preflight JSON from Step 4:

```bash
python3 scripts/capture-demo.py recommend --project-type [TYPE] --change-type [motion|states] --tools '[PREFLIGHT_JSON]'
```

Output: JSON with `recommended` (best tier), `available` (tiers whose tools are present), and `reasoning`.

Present the available tiers to the user via the platform question tool (AskUserQuestion / request_user_input / ask_user). Mark the recommended tier. Always include "No evidence needed" as a final option.

**Question:** "How should evidence be captured for this change?"

**Options** (show only tiers from the `available` list, order by recommendation):
1. **Browser reel** -- Agent-browser screenshots stitched into animated GIF. Best for web apps.
2. **Terminal recording** -- VHS terminal recording to GIF. Best for CLI tools with interaction/motion.
3. **Screenshot reel** -- Styled terminal frames stitched into animated GIF. Best for discrete CLI steps.
4. **Static screenshots** -- Individual PNGs. Fallback when other tools are unavailable.
5. **No evidence needed** -- The diff speaks for itself. Best for text-only or config changes.

If the question tool is unavailable (background agent, batch mode), present the numbered options and wait for the user's reply before proceeding.

## Step 7: Execute Selected Tier

Carry the capture hypothesis from Step 0 and the feature exercise results from Step 1 into tier execution. Substitute `[RUN_DIR]` in the tier reference with the concrete path from Step 5.

Load the appropriate reference file for the selected tier:

- **Browser reel** -> Read `references/tier-browser-reel.md`
- **Terminal recording** -> Read `references/tier-terminal-recording.md`
- **Screenshot reel** -> Read `references/tier-screenshot-reel.md`
- **Static screenshots** -> Read `references/tier-static-screenshots.md`
- **No evidence needed** -> Skip to output. Set `evidence_url` to null, `evidence_label` to null.

**Runtime failure fallback:** If the selected tier fails (tool crash, server inaccessible, empty output), fall back to the next available tier. Fallback order: browser reel -> static screenshots, terminal recording -> screenshot reel -> static screenshots, screenshot reel -> static screenshots. If static screenshots also fails, report the failure.

## Step 8: Upload and Approval

Read `references/upload-and-approval.md` for upload to a public host, user approval gate, and markdown embed generation.

## Output

Return these values to the caller:

```
=== Evidence Capture Complete ===
Tier: [browser-reel / terminal-recording / screenshot-reel / static / skipped]
Description: [1 sentence describing what the evidence shows]
URL: [public URL or "none" (multiple URLs comma-separated for static screenshots)]
=== End Evidence ===
```

The `Description` is a 1-line summary derived from the capture hypothesis in Step 0 (e.g., "CLI detect command classifying 3 project types and recommending capture tiers").

- `Tier: skipped` or `URL: "none"` means no evidence was captured.

**Label convention:**
- Browser reel, terminal recording, screenshot reel: label as "Demo"
- Static screenshots: label as "Screenshots"
- Test output is never labeled "Demo" or "Screenshots"
