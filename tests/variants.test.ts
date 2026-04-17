import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { parseSections } from "../src/analysis/sections";
import { generateVariants } from "../src/analysis/variants";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

async function makeSkillDir(sections: string[], extraFiles?: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "variants-test-"));
  tempRoots.push(root);

  const skillContent = sections.join("\n\n");
  await writeFile(path.join(root, "SKILL.md"), skillContent, "utf8");

  if (extraFiles) {
    for (const [relPath, content] of Object.entries(extraFiles)) {
      const fullPath = path.join(root, relPath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }
  }

  return root;
}

describe("generateVariants", () => {
  test("skill with 3 sections generates 3 variants", async () => {
    const skillDir = await makeSkillDir([
      "## Section A\n\nContent A.",
      "## Section B\n\nContent B.",
      "## Section C\n\nContent C.",
    ]);

    const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const sections = parseSections(content);
    expect(sections).toHaveLength(3);

    const variants = await generateVariants(skillDir, sections);
    expect(variants).toHaveLength(3);

    // Track temp dirs for cleanup
    for (const v of variants) {
      tempRoots.push(v.tempDir);
    }

    // Each variant removes exactly one section
    expect(variants[0].removedSection).toBe("Section A");
    expect(variants[1].removedSection).toBe("Section B");
    expect(variants[2].removedSection).toBe("Section C");
  });

  test("each variant is missing exactly one section", async () => {
    const skillDir = await makeSkillDir([
      "## Alpha\n\nAlpha content.",
      "## Beta\n\nBeta content.",
      "## Gamma\n\nGamma content.",
    ]);

    const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const sections = parseSections(content);
    const variants = await generateVariants(skillDir, sections);

    for (const v of variants) {
      tempRoots.push(v.tempDir);
    }

    // Variant 0 should not contain Alpha but should contain Beta and Gamma
    expect(variants[0].modifiedContent).not.toContain("Alpha content");
    expect(variants[0].modifiedContent).toContain("Beta content");
    expect(variants[0].modifiedContent).toContain("Gamma content");

    // Variant 1 should not contain Beta
    expect(variants[1].modifiedContent).toContain("Alpha content");
    expect(variants[1].modifiedContent).not.toContain("Beta content");
    expect(variants[1].modifiedContent).toContain("Gamma content");
  });

  test("only filter limits variants to specified sections", async () => {
    const skillDir = await makeSkillDir([
      "## Section A\n\nA.",
      "## Section B\n\nB.",
      "## Section C\n\nC.",
      "## Section D\n\nD.",
      "## Section E\n\nE.",
    ]);

    const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const sections = parseSections(content);
    expect(sections).toHaveLength(5);

    const variants = await generateVariants(skillDir, sections, {
      only: ["Section B", "Section D"],
    });

    for (const v of variants) {
      tempRoots.push(v.tempDir);
    }

    expect(variants).toHaveLength(2);
    expect(variants[0].removedSection).toBe("Section B");
    expect(variants[1].removedSection).toBe("Section D");
  });

  test("temp directories contain modified SKILL.md plus original reference files", async () => {
    const skillDir = await makeSkillDir(
      ["## Main\n\nMain content.", "## Extra\n\nExtra content."],
      {
        "references/persona-catalog.md": "# Personas\n\nList of personas.",
        "references/schema.json": '{"type": "object"}',
      },
    );

    const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const sections = parseSections(content);
    const variants = await generateVariants(skillDir, sections);

    for (const v of variants) {
      tempRoots.push(v.tempDir);
    }

    // Check first variant's temp dir has both SKILL.md and reference files
    const variant = variants[0];
    const tempSkillMd = await readFile(path.join(variant.tempDir, "SKILL.md"), "utf8");
    expect(tempSkillMd).not.toContain("Main content");
    expect(tempSkillMd).toContain("Extra content");

    const tempPersonas = await readFile(
      path.join(variant.tempDir, "references", "persona-catalog.md"),
      "utf8",
    );
    expect(tempPersonas).toContain("List of personas");

    const tempSchema = await readFile(
      path.join(variant.tempDir, "references", "schema.json"),
      "utf8",
    );
    expect(tempSchema).toContain('"type": "object"');
  });

  test("variant has correct removedBytes", async () => {
    const sectionContent = "## Measured Section\n\nThis is exactly the content we measure.";
    const skillDir = await makeSkillDir([
      sectionContent,
      "## Other Section\n\nOther content.",
    ]);

    const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const sections = parseSections(content);
    const measuredSection = sections.find((s) => s.name === "Measured Section");
    expect(measuredSection).toBeDefined();

    const variants = await generateVariants(skillDir, sections);
    for (const v of variants) {
      tempRoots.push(v.tempDir);
    }

    const variant = variants.find((v) => v.removedSection === "Measured Section");
    expect(variant).toBeDefined();
    expect(variant!.removedBytes).toBe(measuredSection!.bytes);
  });
});
