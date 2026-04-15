import { promises as fs } from "fs";
import path from "path";
import { parseFrontmatter } from "../utils/frontmatter";
import { readText } from "../utils/files";

export const MAX_DESCRIPTION_LENGTH = 250;
export const ALWAYS_LOADED_BUDGET = 18000;
export const SKILL_SIZE_LIMIT = 30720; // 30KB

export type ComponentInfo = {
  relativePath: string;
  name: string | undefined;
  description: string | undefined;
  disableModelInvocation: boolean;
  fileSizeBytes: number;
};

export type GuardrailResult = {
  errors: string[];
  warnings: string[];
  budgetUsage: {
    current: number;
    limit: number;
  };
};

export async function discoverComponents(pluginRoot: string): Promise<ComponentInfo[]> {
  const components: ComponentInfo[] = [];
  const warnings: string[] = [];

  // Discover skills: pluginRoot/skills/*/SKILL.md
  const skillsDir = path.join(pluginRoot, "skills");
  try {
    const skillDirs = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of skillDirs) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      try {
        const content = await readText(skillFile);
        const stat = await fs.stat(skillFile);
        const relativePath = `skills/${entry.name}/SKILL.md`;
        try {
          const { data } = parseFrontmatter(content, relativePath);
          components.push({
            relativePath,
            name: typeof data.name === "string" ? data.name : undefined,
            description: typeof data.description === "string" ? data.description : undefined,
            disableModelInvocation: data["disable-model-invocation"] === true,
            fileSizeBytes: stat.size,
          });
        } catch {
          warnings.push(`[warn] Could not parse frontmatter: ${relativePath}`);
          components.push({
            relativePath,
            name: undefined,
            description: undefined,
            disableModelInvocation: false,
            fileSizeBytes: stat.size,
          });
        }
      } catch {
        // SKILL.md doesn't exist in this directory, skip
      }
    }
  } catch {
    // skills/ directory doesn't exist
  }

  // Discover agents: pluginRoot/agents/**/*.md
  const agentsDir = path.join(pluginRoot, "agents");
  try {
    const agentFiles = await walkMdFiles(agentsDir);
    for (const agentFile of agentFiles) {
      const content = await readText(agentFile);
      const stat = await fs.stat(agentFile);
      const relativePath = path.relative(pluginRoot, agentFile);
      try {
        const { data } = parseFrontmatter(content, relativePath);
        components.push({
          relativePath,
          name: typeof data.name === "string" ? data.name : undefined,
          description: typeof data.description === "string" ? data.description : undefined,
          disableModelInvocation: data["disable-model-invocation"] === true,
          fileSizeBytes: stat.size,
        });
      } catch {
        warnings.push(`[warn] Could not parse frontmatter: ${relativePath}`);
        components.push({
          relativePath,
          name: undefined,
          description: undefined,
          disableModelInvocation: false,
          fileSizeBytes: stat.size,
        });
      }
    }
  } catch {
    // agents/ directory doesn't exist
  }

  return components;
}

export function checkDescriptionLengths(
  components: ComponentInfo[],
  maxLength: number = MAX_DESCRIPTION_LENGTH,
): string[] {
  const errors: string[] = [];
  for (const c of components) {
    if (c.description === undefined) continue;
    if (c.description.length > maxLength) {
      errors.push(
        `Description too long: ${c.relativePath} (${c.description.length} chars, max ${maxLength})`,
      );
    }
  }
  return errors;
}

export function checkAlwaysLoadedBudget(
  components: ComponentInfo[],
  budget: number = ALWAYS_LOADED_BUDGET,
): { errors: string[]; budgetUsage: { current: number; limit: number } } {
  const active = components.filter((c) => !c.disableModelInvocation);
  const contributions = active.map((c) => ({
    relativePath: c.relativePath,
    chars: (c.name?.length ?? 0) + (c.description?.length ?? 0),
  }));
  const current = contributions.reduce((sum, c) => sum + c.chars, 0);
  const errors: string[] = [];

  if (current > budget) {
    const top5 = [...contributions].sort((a, b) => b.chars - a.chars).slice(0, 5);
    errors.push(`Always-loaded budget exceeded: ${current.toLocaleString()} chars (max ${budget.toLocaleString()})`);
    for (const c of top5) {
      errors.push(`  ${c.relativePath} (${c.chars} chars)`);
    }
  }

  return { errors, budgetUsage: { current, limit: budget } };
}

export function checkSkillSizes(
  components: ComponentInfo[],
  sizeLimit: number = SKILL_SIZE_LIMIT,
): string[] {
  const warnings: string[] = [];
  for (const c of components) {
    if (!c.relativePath.startsWith("skills/")) continue;
    if (c.fileSizeBytes > sizeLimit) {
      warnings.push(
        `[warn] Large skill: ${c.relativePath} (${c.fileSizeBytes.toLocaleString()} bytes, suggested max ${sizeLimit.toLocaleString()})`,
      );
    }
  }
  return warnings;
}

export async function runTokenGuardrails(pluginRoot: string): Promise<GuardrailResult> {
  const components = await discoverComponents(pluginRoot);
  const descErrors = checkDescriptionLengths(components);
  const { errors: budgetErrors, budgetUsage } = checkAlwaysLoadedBudget(components);
  const sizeWarnings = checkSkillSizes(components);

  return {
    errors: [...descErrors, ...budgetErrors],
    warnings: sizeWarnings,
    budgetUsage,
  };
}

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
