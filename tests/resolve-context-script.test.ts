import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"

import {
  type RunResult,
  commitFile,
  createStubBin,
  gitEnv,
  initRepo as initRepoBase,
  runCommand,
  runGit,
  writeExecutable,
} from "./helpers/setup-test-repo"

const resolveContextScript = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "git-commit-push-pr",
  "scripts",
  "resolve-context.sh",
)

async function initRepo(initialBranch = "main"): Promise<string> {
  return initRepoBase(initialBranch, "resolve-context-repo-")
}

/** Parse KEY:value output into a record. */
function parseKeyValue(stdout: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of stdout.trim().split("\n")) {
    const idx = line.indexOf(":")
    if (idx > 0) {
      result[line.slice(0, idx)] = line.slice(idx + 1)
    }
  }
  return result
}

/** Run resolve-context.sh with stub bins on PATH. */
async function runResolveContext(
  repoRoot: string,
  stubBin: string,
  args: string[] = [],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return runCommand(["bash", resolveContextScript, ...args], repoRoot, {
    ...gitEnv,
    PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    ...extraEnv,
  })
}

/**
 * Create a repo with origin remote and a feature branch.
 * Returns { repoRoot, stubBin? } ready for runResolveContext.
 */
async function setupRepoWithOrigin(): Promise<string> {
  const seedRepo = await initRepo()
  await commitFile(seedRepo, "init.txt", "initial\n", "initial commit")
  await commitFile(seedRepo, "init.txt", "updated\n", "update main")

  // Create a bare remote and push
  const bareRemote = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-context-remote-"))
  await runGit(["init", "--bare", bareRemote], seedRepo)
  const bareUrl = pathToFileURL(bareRemote).toString()
  await runGit(["remote", "add", "origin", bareUrl], seedRepo)
  await runGit(["push", "origin", "main"], seedRepo)

  // Clone into fresh working repo
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-context-clone-"))
  await runCommand(["git", "clone", bareUrl, repoRoot], os.tmpdir(), gitEnv)

  // Create a feature branch
  await runGit(["checkout", "-b", "feature-abc"], repoRoot)
  await commitFile(repoRoot, "feature.txt", "feature\n", "feature work")

  return repoRoot
}

describe("resolve-context.sh", () => {
  test("feature branch with open PR: all fields populated", async () => {
    const repoRoot = await setupRepoWithOrigin()
    const stubBin = await createStubBin("pr-metadata-context")

    const result = await runResolveContext(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    const kv = parseKeyValue(result.stdout)
    expect(kv.DEFAULT_BRANCH).toBe("main")
    expect(kv.BASE_BRANCH).toBe("main")
    expect(kv.BASE_REMOTE).toBe("origin")
    expect(kv.BASE_REF_LOCAL).toBe("yes")
    expect(kv.PR_EXISTS).toBe("yes")
    expect(kv.PR_URL).toBe("https://github.com/EveryInc/compound-engineering-plugin/pull/42")
    expect(kv.PR_BASE).toBe("main")
  })

  test("no PR, feature branch: PR fields are none", async () => {
    const repoRoot = await setupRepoWithOrigin()
    const stubBin = await createStubBin("gh-fails")

    const result = await runResolveContext(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    const kv = parseKeyValue(result.stdout)
    expect(kv.DEFAULT_BRANCH).toBe("main")
    expect(kv.PR_EXISTS).toBe("no")
    expect(kv.PR_URL).toBe("none")
    expect(kv.PR_BASE).toBe("none")
    expect(kv.BASE_BRANCH).toBe("main")
    expect(kv.BASE_REMOTE).toBe("origin")
  })

  test("gh unavailable, origin/HEAD set: resolves default branch from origin/HEAD", async () => {
    const repoRoot = await setupRepoWithOrigin()

    // Set origin/HEAD symbolic ref
    await runGit(
      ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"],
      repoRoot,
    )

    const stubBin = await createStubBin("gh-fails")
    const result = await runResolveContext(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    const kv = parseKeyValue(result.stdout)
    expect(kv.DEFAULT_BRANCH).toBe("main")
    expect(kv.BASE_BRANCH).toBe("main")
  })

  test("gh unavailable, no origin/HEAD: falls back to common branch names", async () => {
    const repoRoot = await setupRepoWithOrigin()

    // Remove origin/HEAD if it exists (clone may or may not set it)
    await runCommand(
      ["git", "remote", "set-head", "origin", "--delete"],
      repoRoot,
      gitEnv,
    )

    const stubBin = await createStubBin("gh-fails")
    const result = await runResolveContext(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    const kv = parseKeyValue(result.stdout)
    // Should fall back to "main" via common branch name detection (origin/main exists)
    expect(kv.DEFAULT_BRANCH).toBe("main")
  })

  test("--default-branch flag short-circuits detection", async () => {
    const repoRoot = await setupRepoWithOrigin()
    const stubBin = await createStubBin("gh-fails")

    const result = await runResolveContext(repoRoot, stubBin, [
      "--default-branch",
      "develop",
    ])

    expect(result.exitCode).toBe(0)
    const kv = parseKeyValue(result.stdout)
    expect(kv.DEFAULT_BRANCH).toBe("develop")
  })

  test("--pr-base and --pr-url flags short-circuit PR detection", async () => {
    const repoRoot = await setupRepoWithOrigin()
    const stubBin = await createStubBin("gh-fails")

    const result = await runResolveContext(repoRoot, stubBin, [
      "--pr-base",
      "release-1.0",
      "--pr-url",
      "https://github.com/EveryInc/compound-engineering-plugin/pull/99",
    ])

    expect(result.exitCode).toBe(0)
    const kv = parseKeyValue(result.stdout)
    expect(kv.PR_EXISTS).toBe("yes")
    expect(kv.PR_BASE).toBe("release-1.0")
    expect(kv.PR_URL).toBe(
      "https://github.com/EveryInc/compound-engineering-plugin/pull/99",
    )
  })

  test("no remotes configured: outputs ERROR", async () => {
    // Create a repo with no remotes at all
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "init.txt", "initial\n", "initial commit")

    const stubBin = await createStubBin("gh-fails")
    const result = await runResolveContext(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ERROR:no remotes configured")
  })
})
