import { promises as fs } from "fs";
import path from "path";
import { readText } from "../utils/files";

export const OVERSIZED_SKILL_THRESHOLD = 40960; // 40 KB
export const DEFAULT_BOILERPLATE_THRESHOLD = 5;

export type StalenessResult = {
  errors: string[];
  warnings: string[];
};

const HARDCODED_YEAR_PATTERN = /current year is \d{4}/;
const DEPRECATED_TOOL_PATTERN = /\bTodoWrite\b|\bTodoRead\b/;
const DEPRECATED_TOOL_ALLOWLIST = new Set([
  "agents/review/project-standards-reviewer.md",
]);

/**
 * Recursively collect all .md files under a directory.
 */
async function walkMdFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkMdFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Check for hardcoded year references in skills/ and agents/ .md files.
 * Pattern: "current year is YYYY"
 */
export async function checkHardcodedYears(pluginRoot: string): Promise<string[]> {
  const errors: string[] = [];
  const dirs = [
    path.join(pluginRoot, "skills"),
    path.join(pluginRoot, "agents"),
  ];

  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = await walkMdFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const content = await readText(file);
      if (HARDCODED_YEAR_PATTERN.test(content)) {
        const relativePath = path.relative(pluginRoot, file);
        errors.push(`Hardcoded year reference: ${relativePath}`);
      }
    }
  }

  return errors;
}

/**
 * Check for deprecated tool references (TodoWrite, TodoRead) in skills/ .md files.
 * The allow-list exempts specific files that mention these tools as enforcement instructions.
 */
export async function checkDeprecatedTools(pluginRoot: string): Promise<string[]> {
  const errors: string[] = [];
  const skillsDir = path.join(pluginRoot, "skills");
  let files: string[] = [];
  try {
    files = await walkMdFiles(skillsDir);
  } catch {
    return [];
  }

  for (const file of files) {
    const relativePath = path.relative(pluginRoot, file);
    if (DEPRECATED_TOOL_ALLOWLIST.has(relativePath)) continue;

    const content = await readText(file);
    if (DEPRECATED_TOOL_PATTERN.test(content)) {
      errors.push(`Deprecated tool reference: ${relativePath}`);
    }
  }

  return errors;
}

/**
 * Warn if any SKILL.md exceeds the size threshold and lacks a sibling references/ directory.
 */
export async function checkOversizedSkills(
  pluginRoot: string,
  threshold: number = OVERSIZED_SKILL_THRESHOLD,
): Promise<string[]> {
  const warnings: string[] = [];
  const skillsDir = path.join(pluginRoot, "skills");

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      try {
        const stat = await fs.stat(skillFile);
        if (stat.size > threshold) {
          // Check for sibling references/ directory
          const refsDir = path.join(skillsDir, entry.name, "references");
          let hasRefs = false;
          try {
            const refsStat = await fs.stat(refsDir);
            hasRefs = refsStat.isDirectory();
          } catch {
            // no references/ directory
          }
          if (!hasRefs) {
            const relativePath = `skills/${entry.name}/SKILL.md`;
            warnings.push(
              `[warn] Oversized skill without references/: ${relativePath} (${stat.size.toLocaleString()} bytes, threshold ${threshold.toLocaleString()})`,
            );
          }
        }
      } catch {
        // SKILL.md doesn't exist, skip
      }
    }
  } catch {
    // skills/ directory doesn't exist
  }

  return warnings;
}

/**
 * Warn if the cross-platform question-tool boilerplate pattern appears in too many files.
 * Looks for files containing both "AskUserQuestion" and "request_user_input".
 */
export async function checkBoilerplateDensity(
  pluginRoot: string,
  threshold: number = DEFAULT_BOILERPLATE_THRESHOLD,
): Promise<string[]> {
  const warnings: string[] = [];
  const dirs = [
    path.join(pluginRoot, "skills"),
    path.join(pluginRoot, "agents"),
  ];

  const matchingFiles: string[] = [];
  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = await walkMdFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const content = await readText(file);
      if (content.includes("AskUserQuestion") && content.includes("request_user_input")) {
        matchingFiles.push(path.relative(pluginRoot, file));
      }
    }
  }

  if (matchingFiles.length > threshold) {
    warnings.push(
      `[warn] Cross-platform question-tool boilerplate appears in ${matchingFiles.length} files (threshold: ${threshold}). Consider extracting to a shared pattern.`,
    );
  }

  return warnings;
}

/**
 * The canonical set of cross-platform question tools.
 * Defined in AGENTS.md "Cross-Platform Interaction Convention" section.
 */
export const CANONICAL_QUESTION_TOOLS = ["AskUserQuestion", "request_user_input", "ask_user"];

/**
 * Warn when a file mentions some but not all canonical question tools.
 * Files with 2+ tools but missing one likely drifted from the canonical set.
 */
export async function checkQuestionToolDrift(pluginRoot: string): Promise<string[]> {
  const warnings: string[] = [];
  const dirs = [
    path.join(pluginRoot, "skills"),
    path.join(pluginRoot, "agents"),
  ];

  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = await walkMdFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const content = await readText(file);
      const found = CANONICAL_QUESTION_TOOLS.filter((tool) => content.includes(tool));
      if (found.length >= 2 && found.length < CANONICAL_QUESTION_TOOLS.length) {
        const missing = CANONICAL_QUESTION_TOOLS.filter((t) => !found.includes(t));
        const relativePath = path.relative(pluginRoot, file);
        warnings.push(
          `[warn] Question-tool drift in ${relativePath}: has ${found.join(", ")} but missing ${missing.join(", ")}`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Run all staleness checks against a plugin root directory.
 */
export async function validateContentStaleness(
  pluginRoot: string,
  boilerplateThreshold: number = DEFAULT_BOILERPLATE_THRESHOLD,
): Promise<StalenessResult> {
  const [yearErrors, toolErrors, oversizedWarnings, boilerplateWarnings, driftWarnings] =
    await Promise.all([
      checkHardcodedYears(pluginRoot),
      checkDeprecatedTools(pluginRoot),
      checkOversizedSkills(pluginRoot),
      checkBoilerplateDensity(pluginRoot, boilerplateThreshold),
      checkQuestionToolDrift(pluginRoot),
    ]);

  return {
    errors: [...yearErrors, ...toolErrors],
    warnings: [...oversizedWarnings, ...boilerplateWarnings, ...driftWarnings],
  };
}
