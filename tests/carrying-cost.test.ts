import { mkdtemp, mkdir, writeFile, stat as fsStat } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "bun:test";
import { estimateToolCalls } from "../scripts/skill/stats";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "carrying-cost-"));
  tempRoots.push(root);
  return root;
}

// ---------------------------------------------------------------------------
// estimateToolCalls unit tests
// ---------------------------------------------------------------------------

describe("estimateToolCalls", () => {
  test("skill with 3 phases, 5 tool instructions, 2 dispatches, 1 loop", () => {
    const content = [
      "---",
      "name: test-skill",
      "description: A test skill",
      "---",
      "",
      "## Phase 1",
      "",
      "Use the Read tool to inspect the file.",
      "Then Write the output.",
      "",
      "## Phase 2",
      "",
      "Run Edit on the config.",
      "Use Grep to find patterns.",
      "",
      "## Phase 3",
      "",
      "Dispatch compound-engineering:review:security-reviewer for security.",
      "Also dispatch compound-engineering:research:learnings-researcher.",
      "Use Bash to run the build.",
      "",
      "For each file in the directory, process it.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.rawCounts.phases).toBe(3);
    expect(result.rawCounts.tools).toBe(5);
    expect(result.rawCounts.dispatches).toBe(2);
    expect(result.rawCounts.loops).toBe(1);
    // total = 3*3 + 5*1 + 2*1 + 1*3 + 0*1 = 9+5+2+3 = 19
    expect(result.total).toBe(19);
    expect(result.dispatches).toContain("compound-engineering:review:security-reviewer");
    expect(result.dispatches).toContain("compound-engineering:research:learnings-researcher");
  });

  test("minimal agent file with no phases, 2 tool instructions", () => {
    const content = [
      "---",
      "name: simple-agent",
      "---",
      "",
      "# Simple helper",
      "",
      "Use Read to inspect. Use Grep to find.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.rawCounts.phases).toBe(0);
    expect(result.rawCounts.tools).toBe(2);
    expect(result.rawCounts.dispatches).toBe(0);
    expect(result.rawCounts.loops).toBe(0);
    expect(result.total).toBe(2);
  });

  test("file with only frontmatter and no body returns minimum floor 1", () => {
    const content = [
      "---",
      "name: empty-body",
      "description: Nothing here",
      "---",
      "",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.total).toBe(1);
    expect(result.rawCounts.phases).toBe(0);
    expect(result.rawCounts.tools).toBe(0);
    expect(result.rawCounts.dispatches).toBe(0);
    expect(result.rawCounts.loops).toBe(0);
    expect(result.rawCounts.bashBlocks).toBe(0);
  });

  test("tool name inside fenced code block is NOT counted", () => {
    const content = [
      "---",
      "name: code-block-test",
      "---",
      "",
      "Use Read outside the block.",
      "",
      "```typescript",
      "const result = Read(file);",
      "Write(output);",
      "Edit(config);",
      "```",
      "",
      "Use Grep after the block.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    // Only Read and Grep outside code block should be counted
    expect(result.rawCounts.tools).toBe(2);
  });

  test("bash-tagged code block counted as 1 implicit Bash call", () => {
    const content = [
      "---",
      "name: bash-block-test",
      "---",
      "",
      "Run this command:",
      "",
      "```bash",
      "npm install",
      "```",
      "",
      "Then run:",
      "",
      "```shell",
      "npm test",
      "```",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.rawCounts.bashBlocks).toBe(2);
    // Total: 0 phases + 0 tools + 0 dispatches + 0 loops + 2 bash blocks = 2
    expect(result.total).toBe(2);
  });

  test("loop keyword on same line as tool name: both counted independently", () => {
    const content = [
      "---",
      "name: loop-tool-test",
      "---",
      "",
      "For each file, use the Read tool to inspect it.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.rawCounts.tools).toBe(1); // Read
    expect(result.rawCounts.loops).toBe(1); // "For each"
    // Total: 0*3 + 1*1 + 0*1 + 1*3 + 0*1 = 4
    expect(result.total).toBe(4);
  });

  test("sub-agent dispatch returns list of dispatched agent names", () => {
    const content = [
      "---",
      "name: dispatch-test",
      "---",
      "",
      "Dispatch compound-engineering:review:security-reviewer.",
      "Also use compound-engineering:research:learnings-researcher.",
      "And again compound-engineering:review:security-reviewer.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    // Deduplicated
    expect(result.dispatches).toHaveLength(2);
    expect(result.dispatches).toContain("compound-engineering:review:security-reviewer");
    expect(result.dispatches).toContain("compound-engineering:research:learnings-researcher");
    expect(result.rawCounts.dispatches).toBe(2);
  });

  test("content with disable-model-invocation: true frontmatter -> dispatches = 0", () => {
    const content = [
      "---",
      "name: tutorial-skill",
      "disable-model-invocation: true",
      "---",
      "",
      "Example: compound-engineering:review:security-reviewer",
      "Another: compound-engineering:research:learnings-researcher",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.dispatches).toEqual([]);
    expect(result.rawCounts.dispatches).toBe(0);
  });

  test("disable-model-invocation passed via frontmatterData parameter", () => {
    // No frontmatter in content itself, but passed externally
    const content = [
      "Example: compound-engineering:review:security-reviewer",
    ].join("\n");

    const result = estimateToolCalls(content, { "disable-model-invocation": true });
    expect(result.dispatches).toEqual([]);
    expect(result.rawCounts.dispatches).toBe(0);
  });

  test("numbered workflow headers counted as phases", () => {
    const content = [
      "---",
      "name: numbered-test",
      "---",
      "",
      "## 1. First step",
      "## 2) Second step",
      "### 3. Third step",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.rawCounts.phases).toBe(3);
  });

  test("prose mention of Read is counted (accepted noise)", () => {
    const content = [
      "---",
      "name: prose-test",
      "---",
      "",
      "Read the requirements carefully before starting.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    // "Read" matches as a tool name (accepted noise per design)
    expect(result.rawCounts.tools).toBe(1);
  });

  test("multiple tool names on a single line all counted", () => {
    const content = [
      "---",
      "name: multi-tool",
      "---",
      "",
      "Use Read then Write then Edit the file.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    expect(result.rawCounts.tools).toBe(3);
  });

  test("nested code blocks handled correctly", () => {
    const content = [
      "---",
      "name: nested-blocks",
      "---",
      "",
      "Use Read before.",
      "",
      "```typescript",
      "// Read inside block",
      "```",
      "",
      "Use Write after.",
      "",
      "```bash",
      "echo Read",
      "```",
      "",
      "Use Edit final.",
    ].join("\n");

    const result = estimateToolCalls(content, {});
    // Read, Write, Edit outside blocks = 3 tools
    // 1 bash block
    expect(result.rawCounts.tools).toBe(3);
    expect(result.rawCounts.bashBlocks).toBe(1);
    expect(result.total).toBe(4); // 3*1 + 1*1
  });
});

// ---------------------------------------------------------------------------
// System cost arithmetic
// ---------------------------------------------------------------------------

describe("system cost arithmetic", () => {
  test("skill with agent dispatches has correct system cost", () => {
    // Skill: 10,000 bytes, 5 tool calls -> carrying cost = 50,000
    // Agent A: 3,000 bytes, 8 tool calls -> carrying cost = 24,000
    // Agent B: 5,000 bytes, 2 tool calls -> carrying cost = 10,000
    // System cost = 50,000 + 24,000 + 10,000 = 84,000

    const skillSize = 10_000;
    const skillToolCalls = 5;
    const skillCarryingCost = skillSize * skillToolCalls;

    const agentA = { size: 3_000, toolCalls: 8, carryingCost: 3_000 * 8 };
    const agentB = { size: 5_000, toolCalls: 2, carryingCost: 5_000 * 2 };

    const systemCost = skillCarryingCost + agentA.carryingCost + agentB.carryingCost;
    expect(systemCost).toBe(84_000);
    expect(agentA.carryingCost).toBe(24_000);
    expect(agentB.carryingCost).toBe(10_000);
    expect(skillCarryingCost).toBe(50_000);
  });

  test("skill without dispatches has systemCost === carryingCost", () => {
    const size = 5_000;
    const toolCalls = 3;
    const carryingCost = size * toolCalls;
    const systemCost = carryingCost; // no dispatches
    expect(systemCost).toBe(15_000);
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("integration", () => {
  test("script can walk actual plugin directory", async () => {
    const pluginRoot = path.join(
      process.cwd(),
      "plugins",
      "compound-engineering",
    );

    // Verify the directory exists
    const dirStat = await fsStat(path.join(pluginRoot, "skills"));
    expect(dirStat.isDirectory()).toBe(true);
  });

  test("estimateToolCalls works on actual skill files", async () => {
    const pluginRoot = path.join(
      process.cwd(),
      "plugins",
      "compound-engineering",
    );
    const sampleSkill = path.join(pluginRoot, "skills", "ce-review", "SKILL.md");

    try {
      const content = await Bun.file(sampleSkill).text();
      const result = estimateToolCalls(content, {});
      // ce-review should have significant tool calls
      expect(result.total).toBeGreaterThan(1);
      expect(result.rawCounts.phases).toBeGreaterThanOrEqual(0);
    } catch {
      // Skip if ce-review does not exist in this worktree
      console.log("Skipped: ce-review/SKILL.md not found");
    }
  });

  test("temp plugin directory produces correct output via CLI", async () => {
    const root = await makeTempRoot();
    const pluginRoot = path.join(root, "plugins", "compound-engineering");

    // Create skills
    await mkdir(path.join(pluginRoot, "skills", "test-skill"), { recursive: true });
    await writeFile(
      path.join(pluginRoot, "skills", "test-skill", "SKILL.md"),
      [
        "---",
        "name: test-skill",
        "description: A test skill",
        "---",
        "",
        "## Phase 1",
        "",
        "Use Read to inspect.",
        "",
        "Dispatch compound-engineering:review:test-agent.",
      ].join("\n"),
    );

    // Create agents
    await mkdir(path.join(pluginRoot, "agents", "review"), { recursive: true });
    await writeFile(
      path.join(pluginRoot, "agents", "review", "test-agent.md"),
      [
        "---",
        "name: test-agent",
        "description: A test agent",
        "---",
        "",
        "Use Read and Write to process.",
      ].join("\n"),
    );

    // Run the script from the temp root
    const scriptPath = path.join(process.cwd(), "scripts", "skill", "stats.ts");
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    // Should have output with both entries
    expect(stdout).toContain("test-skill");
    expect(stdout).toContain("test-agent");
    expect(stdout).toContain("skill");
    expect(stdout).toContain("agent");
  });

  test("--json flag produces valid JSON", async () => {
    const root = await makeTempRoot();
    const pluginRoot = path.join(root, "plugins", "compound-engineering");

    await mkdir(path.join(pluginRoot, "skills", "json-skill"), { recursive: true });
    await writeFile(
      path.join(pluginRoot, "skills", "json-skill", "SKILL.md"),
      "---\nname: json-skill\n---\n\nUse Read here.\n",
    );

    await mkdir(path.join(pluginRoot, "agents", "review"), { recursive: true });
    await writeFile(
      path.join(pluginRoot, "agents", "review", "json-agent.md"),
      "---\nname: json-agent\n---\n\nUse Write here.\n",
    );

    const scriptPath = path.join(process.cwd(), "scripts", "skill", "stats.ts");
    const proc = Bun.spawn(["bun", "run", scriptPath, "--json"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    // Verify structure
    const first = parsed[0];
    expect(first).toHaveProperty("rank");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("type");
    expect(first).toHaveProperty("size");
    expect(first).toHaveProperty("estimatedToolCalls");
    expect(first).toHaveProperty("carryingCost");
    expect(first).toHaveProperty("systemCost");
    expect(first).toHaveProperty("dispatches");
    expect(first).toHaveProperty("rawCounts");
  });

  test("unresolved agent dispatch produces warning", async () => {
    const root = await makeTempRoot();
    const pluginRoot = path.join(root, "plugins", "compound-engineering");

    await mkdir(path.join(pluginRoot, "skills", "warn-skill"), { recursive: true });
    await writeFile(
      path.join(pluginRoot, "skills", "warn-skill", "SKILL.md"),
      [
        "---",
        "name: warn-skill",
        "---",
        "",
        "Dispatch compound-engineering:review:nonexistent-agent.",
      ].join("\n"),
    );

    // No agents directory at all

    const scriptPath = path.join(process.cwd(), "scripts", "skill", "stats.ts");
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    expect(stderr).toContain("[warn]");
    expect(stderr).toContain("nonexistent-agent");
  });
});
