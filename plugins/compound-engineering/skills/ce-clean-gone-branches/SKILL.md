---
name: ce-clean-gone-branches
description: "Clean up local branches whose remote tracking branch is gone, including associated worktrees. Use when pruning stale local branches after remote deletion."
---

# Clean Gone Branches

## When to Use

Use this skill when the user:
- Says "clean up branches", "delete gone branches", "prune local branches", or "clean gone"
- Wants to remove stale local branches that no longer exist on the remote
- Needs to clean up associated worktrees for deleted remote branches

## Workflow

### Step 1: Discover gone branches

Run the discovery script:

```bash
bash scripts/clean-gone
```

[scripts/clean-gone](./scripts/clean-gone)

The script runs `git fetch --prune` first, then parses `git branch -vv` for branches marked `: gone]`.

If the script outputs `__NONE__`, report that no stale branches were found and stop.

### Step 2: Present branches and ask for confirmation

Show the user the list of branches that will be deleted. Format as a simple list:

```
These local branches have been deleted from the remote:

  - feature/old-thing
  - bugfix/resolved-issue
  - experiment/abandoned

Delete all of them? (y/n)
```

Wait for the user's answer via the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: present the list and wait for a reply.

Do not offer multi-selection or per-branch choices.

### Step 3: Delete confirmed branches

If the user confirms, run the delete subcommand with the confirmed branch list:

```bash
bash scripts/clean-gone delete <branch1> <branch2> ...
```

Parse the output lines:

- `WORKTREE_REMOVED:<path>` — a worktree was removed before branch deletion
- `DELETED:<branch>` — branch was successfully deleted
- `ERROR:<branch>:<message>` — branch deletion failed

Report results to the user. If the user declines, acknowledge and stop.
