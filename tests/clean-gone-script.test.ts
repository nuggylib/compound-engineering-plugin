import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"

import {
  type RunResult,
  commitFile,
  gitEnv,
  initRepo as initRepoBase,
  runCommand,
  runGit,
} from "./helpers/setup-test-repo"

const cleanGoneScript = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "git-clean-gone-branches",
  "scripts",
  "clean-gone",
)

async function initRepo(initialBranch = "main"): Promise<string> {
  return initRepoBase(initialBranch, "clean-gone-repo-")
}

/** Run the clean-gone script (discovery mode or delete subcommand). */
async function runCleanGone(
  cwd: string,
  args: string[] = [],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return runCommand(["bash", cleanGoneScript, ...args], cwd, {
    ...gitEnv,
    ...extraEnv,
  })
}

/**
 * Create a repo with a local bare remote, push branches, then delete remote
 * branches so they show as "gone" after fetch --prune.
 *
 * Returns { repoRoot, bareRemote } where repoRoot already has tracking branches
 * pointing at the (now-deleted) remote branches.
 */
async function setupGoneRepo(
  goneBranches: string[],
): Promise<{ repoRoot: string; bareRemote: string }> {
  // Seed repo
  const seedRepo = await initRepo()
  await commitFile(seedRepo, "init.txt", "initial\n", "initial commit")

  // Create branches we want to later mark as gone
  for (const branch of goneBranches) {
    await runGit(["checkout", "-b", branch], seedRepo)
    await commitFile(seedRepo, `${branch}.txt`, `${branch}\n`, `add ${branch}`)
    await runGit(["checkout", "main"], seedRepo)
  }

  // Create a bare remote and push everything
  const bareRemote = await fs.mkdtemp(path.join(os.tmpdir(), "clean-gone-remote-"))
  await runGit(["init", "--bare", bareRemote], seedRepo)
  const bareUrl = pathToFileURL(bareRemote).toString()
  await runGit(["remote", "add", "origin", bareUrl], seedRepo)
  await runGit(["push", "origin", "--all"], seedRepo)

  // Clone into a fresh working repo (so branches track the remote)
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clean-gone-clone-"))
  await runCommand(["git", "clone", bareUrl, repoRoot], os.tmpdir(), gitEnv)

  // Set up local tracking branches for each gone-to-be branch
  for (const branch of goneBranches) {
    await runGit(["checkout", "-b", branch, `origin/${branch}`], repoRoot)
  }
  await runGit(["checkout", "main"], repoRoot)

  // Delete the branches on the bare remote so they become "gone"
  for (const branch of goneBranches) {
    await runGit(["branch", "-D", branch], bareRemote)
  }

  // Fetch prune so the local tracking refs update to [gone]
  await runGit(["fetch", "--prune"], repoRoot)

  return { repoRoot, bareRemote }
}

describe("clean-gone (discovery mode)", () => {
  test("returns branch names for gone branches", async () => {
    const { repoRoot } = await setupGoneRepo(["feature-a", "feature-b"])
    const result = await runCleanGone(repoRoot)

    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n").filter(Boolean)
    expect(lines).toContain("feature-a")
    expect(lines).toContain("feature-b")
  })

  test("returns __NONE__ when no branches are gone", async () => {
    const seedRepo = await initRepo()
    await commitFile(seedRepo, "init.txt", "initial\n", "initial commit")

    const bareRemote = await fs.mkdtemp(path.join(os.tmpdir(), "clean-gone-remote-"))
    await runGit(["init", "--bare", bareRemote], seedRepo)
    const bareUrl = pathToFileURL(bareRemote).toString()
    await runGit(["remote", "add", "origin", bareUrl], seedRepo)
    await runGit(["push", "origin", "--all"], seedRepo)

    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clean-gone-clone-"))
    await runCommand(["git", "clone", bareUrl, repoRoot], os.tmpdir(), gitEnv)

    const result = await runCleanGone(repoRoot)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("__NONE__")
  })
})

describe("clean-gone delete subcommand", () => {
  test("deletes named branches and outputs DELETED lines", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    // Create two feature branches
    await runGit(["checkout", "-b", "feature-x"], repoRoot)
    await commitFile(repoRoot, "x.txt", "x\n", "feature x")
    await runGit(["checkout", "main"], repoRoot)

    await runGit(["checkout", "-b", "feature-y"], repoRoot)
    await commitFile(repoRoot, "y.txt", "y\n", "feature y")
    await runGit(["checkout", "main"], repoRoot)

    const result = await runCleanGone(repoRoot, ["delete", "feature-x", "feature-y"])

    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines).toContain("DELETED:feature-x")
    expect(lines).toContain("DELETED:feature-y")
  })

  test("outputs ERROR for nonexistent branch", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    const result = await runCleanGone(repoRoot, ["delete", "no-such-branch"])

    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines.length).toBe(1)
    expect(lines[0]).toMatch(/^ERROR:no-such-branch:/)
  })

  test("outputs ERROR when no branch names given", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    const result = await runCleanGone(repoRoot, ["delete"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ERROR:no branches specified")
  })

  test("removes worktree before deleting branch", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    // Create a branch and a worktree for it
    await runGit(["checkout", "-b", "wt-branch"], repoRoot)
    await commitFile(repoRoot, "wt.txt", "wt\n", "worktree branch")
    await runGit(["checkout", "main"], repoRoot)

    const wtDir = path.join(os.tmpdir(), `clean-gone-wt-${Date.now()}`)
    await runGit(["worktree", "add", wtDir, "wt-branch"], repoRoot)

    // Resolve the real path to handle macOS /var -> /private/var symlink
    const wtDirReal = await fs.realpath(wtDir)

    const result = await runCleanGone(repoRoot, ["delete", "wt-branch"])

    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    // The script outputs the path as git reports it, which resolves symlinks
    expect(lines[0]).toBe(`WORKTREE_REMOVED:${wtDirReal}`)
    expect(lines[1]).toBe("DELETED:wt-branch")
  })
})
