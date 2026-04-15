---
name: ce-worktree
description: This skill manages Git worktrees for isolated parallel development. It handles creating, listing, switching, and cleaning up worktrees with a simple interactive interface, following KISS principles.
---

# Git Worktree Manager

## CRITICAL: Always Use the Manager Script

**NEVER call `git worktree add` directly.** Always use the `worktree-manager.sh` script. It handles:
1. Copying `.env`, `.env.local`, `.env.test`, etc. from main repo
2. Trusting dev tool configs with branch-aware safety rules:
   - mise: auto-trust only when unchanged from a trusted baseline branch
   - direnv: auto-allow only for trusted base branches; review worktrees stay manual
3. Adding `.worktrees` to `.gitignore`
4. Creating consistent directory structure

```bash
# ✅ CORRECT - Always use the script
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh create feature-name

# ❌ WRONG - Never do this directly
git worktree add .worktrees/feature-name -b feature-name main
```

## When to Use

1. **Code Review (`/ce-review`)**: If NOT already on the target branch, offer worktree for isolated review
2. **Feature Work (`/ce-work`)**: Always ask if user wants parallel worktree or live branch work
3. **Parallel Development**: When working on multiple features simultaneously
4. **Cleanup**: After completing work in a worktree

## Usage

```bash
# Create a new worktree (copies .env files automatically)
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh create feature-login

# List all worktrees
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh list

# Switch to a worktree
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh switch feature-login

# Copy .env files to an existing worktree (if they weren't copied)
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh copy-env feature-login

# Clean up completed worktrees
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh cleanup
```

## Commands

### `create <branch-name> [from-branch]`

Create a new worktree with the given branch name.

**Options:**
- `branch-name` (required): The name for the new branch and worktree
- `from-branch` (optional): Base branch to create from (defaults to `main`)

**Example:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh create feature-login
```

**What happens:**
1. Checks if worktree already exists
2. Updates the base branch from remote
3. Creates new worktree and branch
4. **Copies all .env files from main repo** (.env, .env.local, .env.test, etc.)
5. **Trusts dev tool configs** with branch-aware safety rules:
   - trusted bases (`main`, `develop`, `dev`, `trunk`, `staging`, `release/*`) compare against themselves
   - other branches compare against the default branch
   - direnv auto-allow is skipped on non-trusted bases <!-- why: .envrc can source unchecked files -->
6. Shows path for cd-ing to the worktree

### `list` or `ls`

List all worktrees with their branches and status.

**Example:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh list
```

**Output shows:**
- Worktree name
- Branch name
- Which is current (marked with ✓)
- Main repo status

### `switch <name>` or `go <name>`

Switch to an existing worktree.

**Example:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh switch feature-login
```

Optional: If name not provided, lists worktrees and prompts for selection.

### `cleanup` or `clean`

Clean up inactive worktrees interactively.

**Example:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh cleanup
```

**What happens:**
1. Lists all inactive worktrees
2. Asks for confirmation
3. Removes selected worktrees
4. Cleans up empty directories

## Workflow Examples

### Code Review with Worktree

```bash
# Claude Code recognizes you're not on the PR branch
# Offers: "Use worktree for isolated review? (y/n)"

# You respond: yes
# Script runs (copies .env files automatically):
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh create pr-123-feature-name

# You're now in isolated worktree for review with all env vars
cd .worktrees/pr-123-feature-name

# After review, return to main:
cd ../..
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh cleanup
```

### Parallel Feature Development

```bash
# For first feature (copies .env files):
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh create feature-login

# Later, start second feature (also copies .env files):
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh create feature-notifications

# List what you have:
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh list

# Switch between them as needed:
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh switch feature-login

# Return to main and cleanup when done:
cd .
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh cleanup
```

## Integration with Workflows

### `/ce-code-review`

```
1. Check current branch
2. If ALREADY on target branch (PR branch or requested branch) → stay there, no worktree needed
3. If DIFFERENT branch than the review target → offer worktree:
   "Use worktree for isolated review? (y/n)"
   - yes → call ce-worktree skill
   - no → proceed with PR diff on current branch
```

### `/ce-work`

```
1. Ask: "How do you want to work?
   1. New branch on current worktree (live work)
   2. Worktree (parallel work)"

2. If choice 1 → create new branch normally
3. If choice 2 → call ce-worktree skill to create from main
```

## Troubleshooting

### "Worktree already exists"

The script will offer to switch to it instead.

### "Cannot remove worktree: it is the current worktree"

Switch to the main repo first, then clean up:

```bash
cd $(git rev-parse --show-toplevel)
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh cleanup
```

### Identify current worktree

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh list
```

### .env files missing in worktree

Copy .env files to a worktree created without them (e.g., via raw `git worktree add`):

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/scripts/worktree-manager.sh copy-env feature-name
```

Return to main repo: `cd $(git rev-parse --show-toplevel)`

## Technical Details

### Directory Structure

```
.worktrees/
├── feature-login/          # Worktree 1
│   ├── .git
│   ├── app/
│   └── ...
├── feature-notifications/  # Worktree 2
│   ├── .git
│   ├── app/
│   └── ...
└── ...

.gitignore (updated to include .worktrees)
```

### Internals

- Each worktree gets its own branch via `git worktree add`
- Worktrees share git objects with the main repo (no duplication)
- Changes in one worktree do not affect others
- Push from any worktree
