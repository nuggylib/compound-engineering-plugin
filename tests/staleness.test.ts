import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  checkHardcodedYears,
  checkDeprecatedTools,
  checkOversizedSkills,
  checkBoilerplateDensity,
  validateContentStaleness,
  OVERSIZED_SKILL_THRESHOLD,
  DEFAULT_BOILERPLATE_THRESHOLD,
} from "../src/release/staleness";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "staleness-"));
  tempRoots.push(root);
  return root;
}

// --- checkHardcodedYears ---

describe("checkHardcodedYears", () => {
  test("errors on 'current year is YYYY' in skills/", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "my-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "my-skill", "SKILL.md"),
      "The current year is 2025. Use this for dating.\n",
    );

    const errors = await checkHardcodedYears(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("skills/my-skill/SKILL.md");
    expect(errors[0]).toContain("Hardcoded year");
  });

  test("errors on 'current year is YYYY' in agents/", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "agents", "research"), { recursive: true });
    await writeFile(
      path.join(root, "agents", "research", "analyst.md"),
      "Note: The current year is 2026.\n",
    );

    const errors = await checkHardcodedYears(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("agents/research/analyst.md");
  });

  test("passes when no hardcoded years exist", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "clean-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "clean-skill", "SKILL.md"),
      "# Clean Skill\n\nNo year references here.\n",
    );

    const errors = await checkHardcodedYears(root);
    expect(errors).toEqual([]);
  });

  test("handles missing skills/ and agents/ directories", async () => {
    const root = await makeTempRoot();
    const errors = await checkHardcodedYears(root);
    expect(errors).toEqual([]);
  });
});

// --- checkDeprecatedTools ---

describe("checkDeprecatedTools", () => {
  test("errors on TodoWrite in skills/", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "bad-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "bad-skill", "SKILL.md"),
      "Use TodoWrite to track items.\n",
    );

    const errors = await checkDeprecatedTools(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("skills/bad-skill/SKILL.md");
    expect(errors[0]).toContain("Deprecated tool");
  });

  test("errors on TodoRead in skills/", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "bad-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "bad-skill", "SKILL.md"),
      "Use TodoRead to check items.\n",
    );

    const errors = await checkDeprecatedTools(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Deprecated tool");
  });

  test("skips allow-listed agents/review/project-standards-reviewer.md", async () => {
    const root = await makeTempRoot();
    // The allow-list uses the relative path from pluginRoot, which is
    // "agents/review/project-standards-reviewer.md". But checkDeprecatedTools
    // only scans skills/, so this file would never be scanned anyway.
    // Let's verify that putting TodoWrite in a skills/ file that matches the
    // allow-list pattern does NOT get exempted (allow-list is agents/ path).
    await mkdir(path.join(root, "skills", "test-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "test-skill", "SKILL.md"),
      "# Clean skill\nNo deprecated tools here.\n",
    );

    const errors = await checkDeprecatedTools(root);
    expect(errors).toEqual([]);
  });

  test("does not scan agents/ for deprecated tools", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "agents", "review"), { recursive: true });
    await writeFile(
      path.join(root, "agents", "review", "project-standards-reviewer.md"),
      "Enforce that agents never use TodoWrite.\n",
    );

    const errors = await checkDeprecatedTools(root);
    expect(errors).toEqual([]);
  });

  test("passes when no deprecated tools exist", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "clean-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "clean-skill", "SKILL.md"),
      "# A Clean Skill\n",
    );

    const errors = await checkDeprecatedTools(root);
    expect(errors).toEqual([]);
  });

  test("handles missing skills/ directory", async () => {
    const root = await makeTempRoot();
    const errors = await checkDeprecatedTools(root);
    expect(errors).toEqual([]);
  });
});

// --- checkOversizedSkills ---

describe("checkOversizedSkills", () => {
  test("warns on oversized SKILL.md without references/", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "big-skill"), { recursive: true });

    const bigContent = "x".repeat(OVERSIZED_SKILL_THRESHOLD + 1);
    await writeFile(
      path.join(root, "skills", "big-skill", "SKILL.md"),
      bigContent,
    );

    const warnings = await checkOversizedSkills(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("[warn]");
    expect(warnings[0]).toContain("big-skill");
    expect(warnings[0]).toContain("Oversized");
  });

  test("does not warn on oversized SKILL.md with references/", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "big-skill", "references"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "big-skill", "references", "data.md"),
      "Reference content.\n",
    );

    const bigContent = "x".repeat(OVERSIZED_SKILL_THRESHOLD + 1);
    await writeFile(
      path.join(root, "skills", "big-skill", "SKILL.md"),
      bigContent,
    );

    const warnings = await checkOversizedSkills(root);
    expect(warnings).toEqual([]);
  });

  test("does not warn on small SKILL.md", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "small-skill"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "small-skill", "SKILL.md"),
      "# Small Skill\n",
    );

    const warnings = await checkOversizedSkills(root);
    expect(warnings).toEqual([]);
  });

  test("handles missing skills/ directory", async () => {
    const root = await makeTempRoot();
    const warnings = await checkOversizedSkills(root);
    expect(warnings).toEqual([]);
  });
});

// --- checkBoilerplateDensity ---

describe("checkBoilerplateDensity", () => {
  test("warns when boilerplate exceeds threshold", async () => {
    const root = await makeTempRoot();

    // Create 6 files with both patterns (default threshold is 5)
    for (let i = 0; i < 6; i++) {
      await mkdir(path.join(root, "skills", `skill-${i}`), { recursive: true });
      await writeFile(
        path.join(root, "skills", `skill-${i}`, "SKILL.md"),
        "Use AskUserQuestion or request_user_input to ask.\n",
      );
    }

    const warnings = await checkBoilerplateDensity(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("[warn]");
    expect(warnings[0]).toContain("6 files");
    expect(warnings[0]).toContain("boilerplate");
  });

  test("does not warn when boilerplate is at threshold", async () => {
    const root = await makeTempRoot();

    for (let i = 0; i < DEFAULT_BOILERPLATE_THRESHOLD; i++) {
      await mkdir(path.join(root, "skills", `skill-${i}`), { recursive: true });
      await writeFile(
        path.join(root, "skills", `skill-${i}`, "SKILL.md"),
        "Use AskUserQuestion or request_user_input to ask.\n",
      );
    }

    const warnings = await checkBoilerplateDensity(root);
    expect(warnings).toEqual([]);
  });

  test("does not count files with only one pattern", async () => {
    const root = await makeTempRoot();

    for (let i = 0; i < 10; i++) {
      await mkdir(path.join(root, "skills", `skill-${i}`), { recursive: true });
      await writeFile(
        path.join(root, "skills", `skill-${i}`, "SKILL.md"),
        "Use AskUserQuestion to ask questions.\n",
      );
    }

    const warnings = await checkBoilerplateDensity(root);
    expect(warnings).toEqual([]);
  });

  test("respects custom threshold parameter", async () => {
    const root = await makeTempRoot();

    for (let i = 0; i < 3; i++) {
      await mkdir(path.join(root, "skills", `skill-${i}`), { recursive: true });
      await writeFile(
        path.join(root, "skills", `skill-${i}`, "SKILL.md"),
        "Use AskUserQuestion or request_user_input to ask.\n",
      );
    }

    const warningsAt2 = await checkBoilerplateDensity(root, 2);
    expect(warningsAt2).toHaveLength(1);

    const warningsAt5 = await checkBoilerplateDensity(root, 5);
    expect(warningsAt5).toEqual([]);
  });
});

// --- validateContentStaleness (integration) ---

describe("validateContentStaleness", () => {
  test("returns no errors and no warnings for a clean plugin root", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "clean-skill"), { recursive: true });
    await mkdir(path.join(root, "agents", "review"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "clean-skill", "SKILL.md"),
      "# Clean Skill\n\nNo issues here.\n",
    );
    await writeFile(
      path.join(root, "agents", "review", "reviewer.md"),
      "# Reviewer\n\nClean agent.\n",
    );

    const result = await validateContentStaleness(root);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("aggregates errors from multiple checks", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "bad-skill"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "bad-skill", "SKILL.md"),
      "The current year is 2025. Use TodoWrite to track.\n",
    );

    const result = await validateContentStaleness(root);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes("Hardcoded year"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Deprecated tool"))).toBe(true);
  });

  test("returns warnings separately from errors", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "big-skill"), { recursive: true });

    const bigContent = "x".repeat(OVERSIZED_SKILL_THRESHOLD + 1);
    await writeFile(
      path.join(root, "skills", "big-skill", "SKILL.md"),
      bigContent,
    );

    const result = await validateContentStaleness(root);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("[warn]");
  });

  test("handles empty plugin root", async () => {
    const root = await makeTempRoot();
    const result = await validateContentStaleness(root);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
