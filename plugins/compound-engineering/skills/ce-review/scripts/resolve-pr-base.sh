#!/usr/bin/env bash
# Resolve the PR base branch and compute the merge-base for ce:review PR-path scope.
# Handles fork-safe remote resolution, fetch fallback, and shallow-clone recovery.
#
# Usage: bash scripts/resolve-pr-base.sh --base <branch> [--base-repo <owner/repo>]
# Output: BASE:<sha> on success, ERROR:<message> on failure.

set -euo pipefail

BASE_BRANCH=""
BASE_REPO=""

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --base-repo)
      BASE_REPO="$2"
      shift 2
      ;;
    *)
      echo "ERROR:Unknown argument: $1"
      exit 0
      ;;
  esac
done

if [ -z "$BASE_BRANCH" ]; then
  echo "ERROR:--base is required"
  exit 0
fi

PR_BASE_REMOTE=""
BASE_REF=""

# Resolve the base ref from the correct remote (fork-safe)
if [ -n "$BASE_REPO" ]; then
  # Match base-repo against git remote fetch URLs
  PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$BASE_REPO\") || index(\$2, \"github.com/$BASE_REPO\") {print \$1; exit}")

  if [ -n "$PR_BASE_REMOTE" ]; then
    # Always fetch -- a locally cached ref may be stale, producing a
    # merge-base that predates squash-merged work and inflating the diff.
    git fetch --no-tags "$PR_BASE_REMOTE" "$BASE_BRANCH:refs/remotes/$PR_BASE_REMOTE/$BASE_BRANCH" 2>/dev/null \
      || git fetch --no-tags "$PR_BASE_REMOTE" "$BASE_BRANCH" 2>/dev/null \
      || true
    BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$BASE_BRANCH" 2>/dev/null || true)
  fi

  # No matching remote -- attempt direct fetch from GitHub URL
  if [ -z "$BASE_REF" ] && [ -z "$PR_BASE_REMOTE" ]; then
    if git fetch --no-tags "https://github.com/$BASE_REPO.git" "$BASE_BRANCH" 2>/dev/null; then
      BASE_REF=$(git rev-parse --verify FETCH_HEAD 2>/dev/null || true)
    fi
  fi

  # Fall back to bare local ref
  if [ -z "$BASE_REF" ]; then
    BASE_REF=$(git rev-parse --verify "$BASE_BRANCH" 2>/dev/null || true)
  fi
else
  # No base-repo -- try origin/<base> directly
  if git remote get-url origin >/dev/null 2>&1; then
    # Always fetch -- same rationale as the fork-safe path above.
    git fetch --no-tags origin "$BASE_BRANCH:refs/remotes/origin/$BASE_BRANCH" 2>/dev/null \
      || git fetch --no-tags origin "$BASE_BRANCH" 2>/dev/null \
      || true
    BASE_REF=$(git rev-parse --verify "origin/$BASE_BRANCH" 2>/dev/null || true)
  fi

  # Fall back to bare local ref
  if [ -z "$BASE_REF" ]; then
    BASE_REF=$(git rev-parse --verify "$BASE_BRANCH" 2>/dev/null || true)
  fi
fi

# Compute merge-base
if [ -n "$BASE_REF" ]; then
  BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""

  # Shallow clone recovery -- attempt unshallow fetch and retry
  if [ -z "$BASE" ] && [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" = "true" ]; then
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch --no-tags --unshallow origin 2>/dev/null || true
      BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
    fi
    if [ -z "$BASE" ] && [ -n "$PR_BASE_REMOTE" ] && [ "$PR_BASE_REMOTE" != "origin" ]; then
      git fetch --no-tags --unshallow "$PR_BASE_REMOTE" 2>/dev/null || true
      BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
    fi
  fi
else
  BASE=""
fi

if [ -n "$BASE" ]; then
  echo "BASE:$BASE"
else
  echo "ERROR:Unable to resolve PR base branch $BASE_BRANCH locally. Fetch the base branch and rerun."
fi
