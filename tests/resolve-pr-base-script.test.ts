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

const resolvePrBaseScript = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-review",
  "scripts",
  "resolve-pr-base.sh",
)

async function initRepo(initialBranch = "main"): Promise<string> {
  return initRepoBase(initialBranch, "resolve-pr-base-repo-")
}

/** Run resolve-pr-base.sh with arguments. */
async function runResolvePrBase(
  repoRoot: string,
  args: string[] = [],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return runCommand(["bash", resolvePrBaseScript, ...args], repoRoot, {
    ...gitEnv,
    ...extraEnv,
  })
}

/**
 * Set up a working repo with origin remote and pre-populated tracking refs.
 * Uses update-ref to populate refs directly (avoids reliance on the script's
 * internal fetch logic, which may differ across git versions).
 *
 * Returns { repoRoot, mainSha } where the repo is on a feature branch with
 * origin/main pointing at mainSha.
 */
async function setupRepoWithOrigin(): Promise<{ repoRoot: string; mainSha: string }> {
  const repoRoot = await initRepo()
  await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")
  const mainSha = await commitFile(repoRoot, "init.txt", "updated\n", "update main")

  await runGit(["checkout", "-b", "feature"], repoRoot)
  await commitFile(repoRoot, "feature.txt", "feature\n", "feature work")

  // Add a real remote (bare repo) so `git remote get-url origin` succeeds,
  // and pre-populate the tracking ref via update-ref.
  const bareRemote = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-pr-base-bare-"))
  await runGit(["init", "--bare", bareRemote], repoRoot)
  const bareUrl = pathToFileURL(bareRemote).toString()
  await runGit(["remote", "add", "origin", bareUrl], repoRoot)
  await runGit(["update-ref", "refs/remotes/origin/main", mainSha], repoRoot)

  return { repoRoot, mainSha }
}

describe("resolve-pr-base.sh", () => {
  test("base repo matches origin remote: outputs BASE:<sha>", async () => {
    const { repoRoot, mainSha } = await setupRepoWithOrigin()

    const result = await runResolvePrBase(repoRoot, ["--base", "main"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^BASE:[0-9a-f]{40}$/)
    // The merge-base should be the main sha (feature branched from main's tip)
    expect(result.stdout.trim()).toBe(`BASE:${mainSha}`)
  })

  test("empty --base-repo falls back to origin", async () => {
    const { repoRoot, mainSha } = await setupRepoWithOrigin()

    // Pass only --base (no --base-repo) -> should resolve via origin
    const result = await runResolvePrBase(repoRoot, ["--base", "main"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${mainSha}`)
  })

  test("--base not provided: outputs ERROR", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    const result = await runResolvePrBase(repoRoot, [])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ERROR:--base is required")
  })

  test("unreachable base branch: outputs ERROR", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    // No remote, no local branch named "nonexistent"
    const result = await runResolvePrBase(repoRoot, ["--base", "nonexistent"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^ERROR:/)
  })

  test("base repo matches non-origin remote (fork): resolves via correct remote", async () => {
    // Build a working repo with two remotes (origin = fork, upstream = upstream)
    // and pre-populate refs via update-ref to avoid real SSH/HTTP network access.
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")
    const upstreamMainSha = await commitFile(
      repoRoot,
      "init.txt",
      "upstream\n",
      "upstream main",
    )

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature work")

    // Create a diverged fork-main commit (on a detached branch off the first commit)
    const initialSha = await runGit(["rev-list", "--max-parents=0", "HEAD"], repoRoot)
    await runGit(["checkout", "--detach", initialSha], repoRoot)
    await commitFile(repoRoot, "fork.txt", "fork\n", "fork main diverges")
    const forkMainSha = await runGit(["rev-parse", "HEAD"], repoRoot)
    await runGit(["checkout", "feature"], repoRoot)

    // Add remotes with GitHub-style SSH URLs so awk pattern matching works
    await runGit(
      ["remote", "add", "origin", "git@github.com:MyFork/repo.git"],
      repoRoot,
    )
    await runGit(
      ["remote", "add", "upstream", "git@github.com:UpstreamOrg/repo.git"],
      repoRoot,
    )

    // Populate remote tracking refs directly
    await runGit(
      ["update-ref", "refs/remotes/origin/main", forkMainSha],
      repoRoot,
    )
    await runGit(
      ["update-ref", "refs/remotes/upstream/main", upstreamMainSha],
      repoRoot,
    )

    const result = await runResolvePrBase(repoRoot, [
      "--base",
      "main",
      "--base-repo",
      "UpstreamOrg/repo",
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^BASE:[0-9a-f]{40}$/)
    // Should resolve against upstream/main, not origin/main
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })
})
