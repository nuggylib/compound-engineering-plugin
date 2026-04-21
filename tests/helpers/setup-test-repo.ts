/**
 * Shared test helpers for Bash script golden-output tests.
 *
 * Provides git-repo scaffolding, command runners, and stub-binary factories
 * used across resolve-base, clean-gone, resolve-context, and resolve-pr-base tests.
 */
import { promises as fs } from "fs"
import os from "os"
import path from "path"

/** Git environment that suppresses interactive prompts and sets stable author info. */
export const gitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
}

export type RunResult = {
  exitCode: number
  stderr: string
  stdout: string
}

/** Run an arbitrary command, capturing stdout, stderr, and exit code. */
export async function runCommand(
  cmd: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: env ?? process.env,
    stderr: "pipe",
    stdout: "pipe",
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stderr, stdout }
}

/** Run a git command, throwing on non-zero exit. Returns trimmed stdout. */
export async function runGit(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await runCommand(["git", ...args], cwd, env ?? gitEnv)
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.exitCode}).\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }

  return result.stdout.trim()
}

/** Create a fresh git repo in a temp directory. Returns the repo root path. */
export async function initRepo(
  initialBranch = "main",
  prefix = "test-repo-",
): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  await runGit(["init", "-b", initialBranch], repoRoot)
  return repoRoot
}

/** Write a file, stage it, commit, and return the resulting HEAD sha. */
export async function commitFile(
  repoRoot: string,
  relativePath: string,
  content: string,
  message: string,
): Promise<string> {
  const filePath = path.join(repoRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
  await runGit(["add", relativePath], repoRoot)
  await runGit(["commit", "-m", message], repoRoot)
  return runGit(["rev-parse", "HEAD"], repoRoot)
}

/** Write a file and make it executable (+x). */
export async function writeExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content)
  await fs.chmod(filePath, 0o755)
}

/**
 * Create a temporary bin directory with stub executables.
 *
 * Supported modes:
 * - "gh-fails": `gh` always exits 1.
 * - "pr-metadata": `gh pr view` returns JSON with baseRefName/url; `jq` stub parses it.
 * - "pr-metadata-context": `gh pr view` returns JSON for resolve-context (baseRefName/url);
 *    `gh repo view` returns defaultBranchRef; `jq` stub handles both.
 *
 * For custom stubs, pass mode as a string and post-process the returned binDir yourself,
 * or use writeExecutable directly.
 */
export async function createStubBin(
  mode: "gh-fails" | "pr-metadata" | "pr-metadata-context",
): Promise<string> {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "stub-bin-"))

  if (mode === "gh-fails") {
    await writeExecutable(path.join(binDir, "gh"), "#!/usr/bin/env bash\nexit 1\n")
    return binDir
  }

  if (mode === "pr-metadata") {
    await writeExecutable(
      path.join(binDir, "gh"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '%s' '{"baseRefName":"main","url":"https://github.com/EveryInc/compound-engineering-plugin/pull/123"}'
  exit 0
fi
exit 1
`,
    )

    await writeExecutable(
      path.join(binDir, "jq"),
      `#!/usr/bin/env bun
const args = process.argv.slice(2).filter((arg) => arg !== "-r")
const query = args[args.length - 1] ?? ""
const input = await new Response(Bun.stdin.stream()).text()
const data = input.trim() ? JSON.parse(input) : {}

let output = ""
if (query === ".baseRefName // empty") {
  output = data.baseRefName ?? ""
} else if (query === ".url // empty") {
  output = data.url ?? ""
} else if (query === ".defaultBranchRef.name") {
  output = data.defaultBranchRef?.name ?? ""
} else {
  console.error(\`unsupported jq query: \${query}\`)
  process.exit(1)
}

process.stdout.write(String(output))
`,
    )

    return binDir
  }

  // "pr-metadata-context" mode: supports both `gh pr view` and `gh repo view`
  await writeExecutable(
    path.join(binDir, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '%s' '{"baseRefName":"main","url":"https://github.com/EveryInc/compound-engineering-plugin/pull/42"}'
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '%s' '{"defaultBranchRef":{"name":"main"}}'
  exit 0
fi
exit 1
`,
  )

  await writeExecutable(
    path.join(binDir, "jq"),
    `#!/usr/bin/env bun
const args = process.argv.slice(2).filter((arg) => arg !== "-r")
const query = args[args.length - 1] ?? ""
const input = await new Response(Bun.stdin.stream()).text()
const data = input.trim() ? JSON.parse(input) : {}

let output = ""
if (query === ".baseRefName // empty") {
  output = data.baseRefName ?? ""
} else if (query === ".url // empty") {
  output = data.url ?? ""
} else if (query === ".defaultBranchRef.name") {
  output = data.defaultBranchRef?.name ?? ""
} else {
  console.error(\`unsupported jq query: \${query}\`)
  process.exit(1)
}

process.stdout.write(String(output))
`,
  )

  return binDir
}
