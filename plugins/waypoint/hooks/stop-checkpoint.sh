#!/usr/bin/env bash
# Waypoint Stop hook: ensure a session checkpoint is written before the agent ends.
#
# If .context/checkpoint.md was modified within the last 5 minutes, the stop
# proceeds. Otherwise, the hook blocks and instructs the agent to write one.

set -euo pipefail

CHECKPOINT=".context/checkpoint.md"
MAX_AGE=300  # 5 minutes in seconds

if [ -f "$CHECKPOINT" ]; then
  now=$(date +%s)
  if [[ "$(uname)" == "Darwin" ]]; then
    mod_time=$(stat -f %m "$CHECKPOINT")
  else
    mod_time=$(stat -c %Y "$CHECKPOINT")
  fi
  age=$(( now - mod_time ))

  if [ "$age" -lt "$MAX_AGE" ]; then
    # Checkpoint is fresh -- approve the stop
    echo '{}'
    exit 0
  fi
fi

# Checkpoint is stale or missing -- block the stop and instruct the agent
cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "Session checkpoint not written yet.",
  "systemMessage": "Before ending this session, write a checkpoint to `.context/checkpoint.md`. Use this structure:\n\n---\ndate: <today>\nbranch: <current git branch>\n---\n\n## Done\n- <completed work with file paths or commit SHAs>\n\n## Next\n- <the specific next step, with enough context to start cold>\n\n## Decisions\n- <any decisions or context that would be lost without this file>\n\n## Resume\n<exact instruction to resume: branch to check out, files to read, command to run>\n\nKeep it under 40 lines. After writing the checkpoint, end the session."
}
HOOK_OUTPUT
