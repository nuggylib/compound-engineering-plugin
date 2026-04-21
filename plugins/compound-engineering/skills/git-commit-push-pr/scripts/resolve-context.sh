#!/usr/bin/env bash
# Resolve default branch, base branch/remote, and PR metadata for git-commit-push-pr.
# Produces structured KEY:value output consumed by the skill's SKILL.md.
#
# Usage: bash scripts/resolve-context.sh [OPTIONS]
#
# Options:
#   --default-branch <name>   Skip default branch detection cascade
#   --pr-base <branch>        Skip gh pr view (requires --pr-url)
#   --pr-url <url>            Skip gh pr view (requires --pr-base)
#
# Output (one KEY:value per line):
#   DEFAULT_BRANCH:<name>
#   BASE_BRANCH:<name>
#   BASE_REMOTE:<remote>
#   BASE_REF_LOCAL:<yes|no>
#   PR_EXISTS:<yes|no>
#   PR_URL:<url|none>
#   PR_BASE:<branch|none>
#
# Exit: always 0. Errors emitted as ERROR:<message> lines.

set -euo pipefail

# --- Parse arguments ---
ARG_DEFAULT_BRANCH=""
ARG_PR_BASE=""
ARG_PR_URL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --default-branch)
      ARG_DEFAULT_BRANCH="$2"
      shift 2
      ;;
    --pr-base)
      ARG_PR_BASE="$2"
      shift 2
      ;;
    --pr-url)
      ARG_PR_URL="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# --- Guard: remotes must exist ---
if ! git remote 2>/dev/null | head -1 | grep -q .; then
  echo "ERROR:no remotes configured"
  exit 0
fi

# --- Helpers ---
has_gh() {
  command -v gh >/dev/null 2>&1
}

# --- Step 1: Resolve default branch (4-fallback cascade) ---
DEFAULT_BRANCH=""

if [ -n "$ARG_DEFAULT_BRANCH" ]; then
  DEFAULT_BRANCH="$ARG_DEFAULT_BRANCH"
fi

# Fallback 1: origin/HEAD symbolic ref
if [ -z "$DEFAULT_BRANCH" ]; then
  _symref=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
  if [ -n "$_symref" ]; then
    # Strip origin/ prefix
    DEFAULT_BRANCH=$(echo "$_symref" | sed 's#^origin/##')
  fi
fi

# Fallback 2: gh repo view
if [ -z "$DEFAULT_BRANCH" ] && has_gh; then
  DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)
fi

# Fallback 3: common branch names against remotes
if [ -z "$DEFAULT_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1; then
      DEFAULT_BRANCH="$candidate"
      break
    fi
  done
fi

# Fallback 4: hardcoded
if [ -z "$DEFAULT_BRANCH" ]; then
  DEFAULT_BRANCH="main"
fi

# --- Step 2: Resolve PR metadata ---
PR_EXISTS="no"
PR_URL="none"
PR_BASE="none"
PR_BASE_REMOTE=""

if [ -n "$ARG_PR_BASE" ] && [ -n "$ARG_PR_URL" ]; then
  # Short-circuit: caller provided PR metadata
  PR_EXISTS="yes"
  PR_URL="$ARG_PR_URL"
  PR_BASE="$ARG_PR_BASE"

  # Resolve remote from PR URL owner/repo
  _owner_repo=$(echo "$ARG_PR_URL" | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p')
  if [ -n "$_owner_repo" ]; then
    PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$_owner_repo\") || index(\$2, \"github.com/$_owner_repo\") {print \$1; exit}")
  fi
elif has_gh; then
  _pr_meta=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$_pr_meta" ]; then
    _pr_base_name=$(echo "$_pr_meta" | jq -r '.baseRefName // empty' 2>/dev/null || true)
    _pr_url=$(echo "$_pr_meta" | jq -r '.url // empty' 2>/dev/null || true)
    if [ -n "$_pr_base_name" ] && [ -n "$_pr_url" ]; then
      PR_EXISTS="yes"
      PR_URL="$_pr_url"
      PR_BASE="$_pr_base_name"

      # Resolve remote from PR URL owner/repo
      _owner_repo=$(echo "$_pr_url" | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p')
      if [ -n "$_owner_repo" ]; then
        PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$_owner_repo\") || index(\$2, \"github.com/$_owner_repo\") {print \$1; exit}")
      fi
    fi
  fi
fi

# --- Step 3: Resolve base branch and remote ---
# Priority:
# 1. PR metadata base (already resolved above)
# 2. Remote default branch via origin
# 3. gh repo view (shares result with default branch cascade)
# 4. Common branch names

BASE_BRANCH=""
BASE_REMOTE=""

# Priority 1: PR metadata
if [ "$PR_EXISTS" = "yes" ] && [ "$PR_BASE" != "none" ]; then
  BASE_BRANCH="$PR_BASE"
  if [ -n "$PR_BASE_REMOTE" ]; then
    BASE_REMOTE="$PR_BASE_REMOTE"
  else
    BASE_REMOTE="origin"
  fi
fi

# Priority 2: Use the default branch we already resolved, via origin
if [ -z "$BASE_BRANCH" ]; then
  if git rev-parse --verify "origin/$DEFAULT_BRANCH" >/dev/null 2>&1; then
    BASE_BRANCH="$DEFAULT_BRANCH"
    BASE_REMOTE="origin"
  fi
fi

# Priority 3: gh repo view (re-query only if default branch cascade used a non-gh source)
if [ -z "$BASE_BRANCH" ] && has_gh; then
  _gh_default=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)
  if [ -n "$_gh_default" ]; then
    BASE_BRANCH="$_gh_default"
    BASE_REMOTE="origin"
  fi
fi

# Priority 4: Common branch names
if [ -z "$BASE_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1; then
      BASE_BRANCH="$candidate"
      BASE_REMOTE="origin"
      break
    fi
  done
fi

# Last resort: use default branch with origin
if [ -z "$BASE_BRANCH" ]; then
  BASE_BRANCH="$DEFAULT_BRANCH"
  BASE_REMOTE="origin"
fi

# --- Step 4: Check whether the base ref is available locally ---
BASE_REF_LOCAL="no"
if git rev-parse --verify "$BASE_REMOTE/$BASE_BRANCH" >/dev/null 2>&1; then
  BASE_REF_LOCAL="yes"
fi

# --- Output ---
echo "DEFAULT_BRANCH:$DEFAULT_BRANCH"
echo "BASE_BRANCH:$BASE_BRANCH"
echo "BASE_REMOTE:$BASE_REMOTE"
echo "BASE_REF_LOCAL:$BASE_REF_LOCAL"
echo "PR_EXISTS:$PR_EXISTS"
echo "PR_URL:$PR_URL"
echo "PR_BASE:$PR_BASE"
