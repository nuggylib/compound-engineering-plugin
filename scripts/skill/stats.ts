#!/usr/bin/env bun
import path from "path";
import { promises as fs } from "fs";
import { parseFrontmatter } from "../../src/utils/frontmatter";
import { walkFiles, readText } from "../../src/utils/files";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RawCounts = {
  phases: number;
  tools: number;
  dispatches: number;
  loops: number;
  bashBlocks: number;
};

export type ToolCallEstimate = {
  total: number;
  dispatches: string[];
  rawCounts: RawCounts;
};

export type FileEntry = {
  name: string;
  type: "skill" | "agent";
  filePath: string;
  qualifiedName: string;
  size: number;
  estimate: ToolCallEstimate;
  carryingCost: number;
  systemCost: number;
};

// ---------------------------------------------------------------------------
// Signal weights
// ---------------------------------------------------------------------------

const PHASE_WEIGHT = 3;
const TOOL_WEIGHT = 1;
const DISPATCH_WEIGHT = 1;
const LOOP_WEIGHT = 3;
const BASH_BLOCK_WEIGHT = 1;

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const PHASE_HEADER_RE = /^#{2,3}\s+(Phase|Stage|Step)\s+\d/im;
const NUMBERED_HEADER_RE = /^#{2,3}\s+\d+[.)]/m;
const DISPATCH_RE = /compound-engineering:[a-z-]+:[a-z-]+/g;
const LOOP_RE = /\b(for\s+each|repeat\s+for|iterate\s+over|for\s+every)\b/gi;

const TOOL_NAMES = [
  "Read", "Write", "Edit", "Bash", "Grep",
  "Glob", "WebFetch", "WebSearch", "Agent", "TaskCreate",
];

// Build a single regex for tool names at word boundaries
const TOOL_NAME_RE = new RegExp(
  `\\b(${TOOL_NAMES.join("|")})\\b`,
  "g",
);

// Fenced code block opener tagged as bash or shell
const BASH_BLOCK_OPEN_RE = /^```(?:bash|shell)\b/;

// ---------------------------------------------------------------------------
// Core heuristic
// ---------------------------------------------------------------------------

export function estimateToolCalls(
  content: string,
  frontmatterData: Record<string, unknown>,
): ToolCallEstimate {
  const { data, body } = parseFrontmatter(content);

  // Merge caller-supplied frontmatter with parsed frontmatter (parsed wins for overlap)
  const mergedData = { ...frontmatterData, ...data };

  const disableModel = mergedData["disable-model-invocation"] === true;

  const lines = body.split(/\r?\n/);

  // --- Phase headers ---
  let phases = 0;
  // We need to count all matches, not just first. Use per-line scanning.
  for (const line of lines) {
    if (PHASE_HEADER_RE.test(line) || NUMBERED_HEADER_RE.test(line)) {
      phases++;
    }
  }

  // --- Track code block state for tool name exclusion ---
  let insideCodeBlock = false;
  let tools = 0;
  let bashBlocks = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      if (insideCodeBlock) {
        // Closing a code block
        insideCodeBlock = false;
        continue;
      }
      // Opening a code block
      insideCodeBlock = true;
      if (BASH_BLOCK_OPEN_RE.test(trimmed)) {
        bashBlocks++;
      }
      continue;
    }

    if (!insideCodeBlock) {
      // Count tool names on lines outside code blocks
      const matches = line.match(TOOL_NAME_RE);
      if (matches) {
        tools += matches.length;
      }
    }
  }

  // --- Sub-agent dispatches ---
  let dispatches: string[] = [];
  if (!disableModel) {
    const dispatchMatches = body.match(DISPATCH_RE);
    if (dispatchMatches) {
      dispatches = [...new Set(dispatchMatches)];
    }
  }

  // --- Loop constructs ---
  let loops = 0;
  const loopMatches = body.match(LOOP_RE);
  if (loopMatches) {
    loops = loopMatches.length;
  }

  // --- Composite score ---
  const total = Math.max(
    phases * PHASE_WEIGHT +
    tools * TOOL_WEIGHT +
    dispatches.length * DISPATCH_WEIGHT +
    loops * LOOP_WEIGHT +
    bashBlocks * BASH_BLOCK_WEIGHT,
    1,
  );

  return {
    total,
    dispatches,
    rawCounts: {
      phases,
      tools,
      dispatches: dispatches.length,
      loops,
      bashBlocks,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCost(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const pluginRoot = path.join(process.cwd(), "plugins", "compound-engineering");
  const skillsRoot = path.join(pluginRoot, "skills");
  const agentsRoot = path.join(pluginRoot, "agents");

  const jsonMode = process.argv.includes("--json");

  // --- Enumerate agents first (needed for lookup map) ---
  const agentLookup = new Map<string, { size: number; toolCalls: number; carryingCost: number }>();
  const entries: FileEntry[] = [];

  // Walk agents
  let agentFiles: string[] = [];
  try {
    agentFiles = (await walkFiles(agentsRoot)).filter((f) => f.endsWith(".md"));
  } catch {
    // agents/ directory may not exist
  }

  for (const filePath of agentFiles) {
    const content = await readText(filePath);
    const stat = await fs.stat(filePath);
    const size = stat.size;

    const relativePath = path.relative(agentsRoot, filePath);
    const parts = relativePath.split(path.sep);
    // agents/<category>/<name>.md -> compound-engineering:<category>:<name>
    if (parts.length < 2) continue;
    const category = parts[parts.length - 2];
    const agentName = path.basename(filePath, ".md");
    const qualifiedName = `compound-engineering:${category}:${agentName}`;

    const estimate = estimateToolCalls(content, {});
    const carryingCost = size * estimate.total;

    agentLookup.set(qualifiedName, { size, toolCalls: estimate.total, carryingCost });

    entries.push({
      name: agentName,
      type: "agent",
      filePath,
      qualifiedName,
      size,
      estimate,
      carryingCost,
      systemCost: carryingCost, // agents have no sub-dispatches in this model
    });
  }

  // Walk skills
  let skillDirs: string[] = [];
  try {
    const allSkillFiles = await walkFiles(skillsRoot);
    const skillMdFiles = allSkillFiles.filter((f) => path.basename(f) === "SKILL.md");
    skillDirs = skillMdFiles;
  } catch {
    // skills/ directory may not exist
  }

  for (const filePath of skillDirs) {
    const content = await readText(filePath);
    const stat = await fs.stat(filePath);
    const size = stat.size;

    const skillDir = path.dirname(filePath);
    const skillName = path.basename(skillDir);
    const qualifiedName = `skill:${skillName}`;

    const estimate = estimateToolCalls(content, {});
    const carryingCost = size * estimate.total;

    // Compute system cost: own carrying cost + sum of resolved agent carrying costs
    let systemCost = carryingCost;
    const unresolvedAgents: string[] = [];

    for (const dispatch of estimate.dispatches) {
      const agentInfo = agentLookup.get(dispatch);
      if (agentInfo) {
        systemCost += agentInfo.carryingCost;
      } else {
        unresolvedAgents.push(dispatch);
      }
    }

    if (unresolvedAgents.length > 0 && !jsonMode) {
      for (const unresolved of unresolvedAgents) {
        console.error(`[warn] Unresolved agent dispatch in ${skillName}: ${unresolved}`);
      }
    }

    entries.push({
      name: skillName,
      type: "skill",
      filePath,
      qualifiedName,
      size,
      estimate,
      carryingCost,
      systemCost,
    });
  }

  // Sort by system cost descending
  entries.sort((a, b) => b.systemCost - a.systemCost);

  // --- Output ---
  if (jsonMode) {
    const jsonOutput = entries.map((e, i) => ({
      rank: i + 1,
      name: e.name,
      type: e.type,
      qualifiedName: e.qualifiedName,
      size: e.size,
      estimatedToolCalls: e.estimate.total,
      carryingCost: e.carryingCost,
      systemCost: e.systemCost,
      dispatches: e.estimate.dispatches,
      rawCounts: e.estimate.rawCounts,
    }));
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Table output
  const headers = ["Rank", "Name", "Type", "Size", "Est. Calls", "Carrying Cost", "System Cost"];
  const rows = entries.map((e, i) => [
    String(i + 1),
    e.name,
    e.type,
    formatNumber(e.size),
    String(e.estimate.total),
    formatCost(e.carryingCost),
    formatCost(e.systemCost),
  ]);

  // Compute column widths
  const colWidths = headers.map((h, col) => {
    const maxData = rows.reduce((max, row) => Math.max(max, row[col].length), 0);
    return Math.max(h.length, maxData);
  });

  // Print header
  const headerLine = headers.map((h, i) => {
    // Right-align numeric columns (0, 3, 4, 5, 6)
    const isNumeric = [0, 3, 4, 5, 6].includes(i);
    return isNumeric ? padLeft(h, colWidths[i]) : padRight(h, colWidths[i]);
  }).join("  ");
  console.log(headerLine);
  console.log(colWidths.map((w) => "-".repeat(w)).join("  "));

  // Print rows
  for (const row of rows) {
    const line = row.map((cell, i) => {
      const isNumeric = [0, 3, 4, 5, 6].includes(i);
      return isNumeric ? padLeft(cell, colWidths[i]) : padRight(cell, colWidths[i]);
    }).join("  ");
    console.log(line);
  }

  // --- Summary ---
  console.log("");
  const top5System = entries.slice(0, 5);
  console.log("Top 5 optimization priorities by system cost:");
  for (const e of top5System) {
    const dispatchNote = e.estimate.dispatches.length > 0
      ? ` (${e.estimate.dispatches.length} agent dispatches)`
      : "";
    console.log(`  ${e.name} (${e.type}) -- ${formatCost(e.systemCost)}${dispatchNote}`);
  }

  // --- Validation: compare top 5 by system cost vs top 5 by raw file size ---
  const top5BySize = [...entries]
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((e) => e.name);
  const top5BySystem = top5System.map((e) => e.name);

  const sameRanking = top5BySize.every((name, i) => name === top5BySystem[i]);
  console.log("");
  if (sameRanking) {
    console.log("Ranking validation: Top 5 by system cost matches top 5 by file size.");
  } else {
    console.log("Ranking validation: Top 5 by system cost DIFFERS from top 5 by file size.");
    console.log(`  By system cost: ${top5BySystem.join(", ")}`);
    console.log(`  By file size:   ${top5BySize.join(", ")}`);
  }
}

// Run if executed directly (not imported as a module for tests)
const isDirectRun = import.meta.main;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
