import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { parseSections, removeSection, type Section } from "./sections";
import { readText, ensureDir, copyDir } from "../utils/files";

export type AblationVariant = {
  skillName: string;
  removedSection: string;
  removedBytes: number;
  modifiedContent: string;
  tempDir: string;
};

export type VariantOptions = {
  only?: string[];
};

/**
 * Generate ablation variants for a skill by removing one section at a time.
 * Each variant copies the entire skill directory to a temp location and
 * replaces SKILL.md with the ablated version.
 *
 * @param skillPath - Absolute path to the skill directory (containing SKILL.md)
 * @param sections - Pre-parsed sections from parseSections()
 * @param options - Optional filters
 */
export async function generateVariants(
  skillPath: string,
  sections: Section[],
  options?: VariantOptions,
): Promise<AblationVariant[]> {
  const skillMdPath = path.join(skillPath, "SKILL.md");
  const originalContent = await readText(skillMdPath);
  const skillName = path.basename(skillPath);

  const targetSections = options?.only
    ? sections.filter((s) => options.only!.includes(s.name))
    : sections;

  const variants: AblationVariant[] = [];

  for (const section of targetSections) {
    const modifiedContent = removeSection(originalContent, section.name);
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `ablation-${skillName}-`),
    );

    // Copy the entire skill directory to temp
    await copyDir(skillPath, tempDir);

    // Overwrite SKILL.md with the ablated version
    const tempSkillMd = path.join(tempDir, "SKILL.md");
    await fs.writeFile(tempSkillMd, modifiedContent, "utf8");

    variants.push({
      skillName,
      removedSection: section.name,
      removedBytes: section.bytes,
      modifiedContent,
      tempDir,
    });
  }

  return variants;
}
