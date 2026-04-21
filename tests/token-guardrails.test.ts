import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  checkDescriptionLengths,
  checkAlwaysLoadedBudget,
  checkSkillSizes,
  discoverComponents,
  runTokenGuardrails,
  MAX_DESCRIPTION_LENGTH,
  ALWAYS_LOADED_BUDGET,
  SKILL_SIZE_LIMIT,
  type ComponentInfo,
} from "../src/release/token-guardrails";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "token-guardrails-"));
  tempRoots.push(root);
  return root;
}

function makeComponent(overrides: Partial<ComponentInfo> = {}): ComponentInfo {
  return {
    relativePath: "skills/test-skill/SKILL.md",
    name: "test-skill",
    description: "A short description.",
    disableModelInvocation: false,
    fileSizeBytes: 1000,
    ...overrides,
  };
}

// --- checkDescriptionLengths ---

describe("checkDescriptionLengths", () => {
  test("passes when all descriptions are under threshold", () => {
    const components = [
      makeComponent({ description: "Short desc" }),
      makeComponent({ relativePath: "agents/review/foo.md", description: "Also short" }),
    ];
    expect(checkDescriptionLengths(components)).toEqual([]);
  });

  test("fails when a description exceeds threshold", () => {
    const long = "x".repeat(300);
    const components = [
      makeComponent({ description: long }),
      makeComponent({ relativePath: "agents/review/foo.md", description: "Short" }),
    ];
    const errors = checkDescriptionLengths(components);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("300 chars");
    expect(errors[0]).toContain("skills/test-skill/SKILL.md");
  });

  test("reports all violations, not just the first", () => {
    const components = [
      makeComponent({ relativePath: "skills/a/SKILL.md", description: "x".repeat(300) }),
      makeComponent({ relativePath: "skills/b/SKILL.md", description: "y".repeat(400) }),
    ];
    const errors = checkDescriptionLengths(components);
    expect(errors).toHaveLength(2);
  });

  test("passes when description is exactly at threshold", () => {
    const exact = "x".repeat(MAX_DESCRIPTION_LENGTH);
    const components = [makeComponent({ description: exact })];
    expect(checkDescriptionLengths(components)).toEqual([]);
  });

  test("skips components with undefined description", () => {
    const components = [makeComponent({ description: undefined })];
    expect(checkDescriptionLengths(components)).toEqual([]);
  });

  test("passes for empty description", () => {
    const components = [makeComponent({ description: "" })];
    expect(checkDescriptionLengths(components)).toEqual([]);
  });

  test("respects custom maxLength parameter", () => {
    const components = [makeComponent({ description: "x".repeat(50) })];
    expect(checkDescriptionLengths(components, 30)).toHaveLength(1);
    expect(checkDescriptionLengths(components, 100)).toEqual([]);
  });
});

// --- checkAlwaysLoadedBudget ---

describe("checkAlwaysLoadedBudget", () => {
  test("passes when total is under budget", () => {
    const components = [
      makeComponent({ name: "skill-a", description: "Short" }),
    ];
    const { errors, budgetUsage } = checkAlwaysLoadedBudget(components);
    expect(errors).toEqual([]);
    expect(budgetUsage.current).toBe(7 + 5); // "skill-a" + "Short"
    expect(budgetUsage.limit).toBe(ALWAYS_LOADED_BUDGET);
  });

  test("fails when total exceeds budget", () => {
    const components = [
      makeComponent({ name: "a", description: "x".repeat(19000) }),
    ];
    const { errors } = checkAlwaysLoadedBudget(components);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("exceeded");
  });

  test("excludes components with disableModelInvocation", () => {
    const components = [
      makeComponent({ name: "active", description: "x".repeat(8000), disableModelInvocation: false }),
      makeComponent({ name: "disabled", description: "x".repeat(8000), disableModelInvocation: true }),
    ];
    const { errors, budgetUsage } = checkAlwaysLoadedBudget(components);
    expect(errors).toEqual([]);
    expect(budgetUsage.current).toBe(6 + 8000); // only "active" counted
  });

  test("handles missing name", () => {
    const components = [makeComponent({ name: undefined, description: "hello" })];
    const { budgetUsage } = checkAlwaysLoadedBudget(components);
    expect(budgetUsage.current).toBe(5); // only description
  });

  test("handles missing description", () => {
    const components = [makeComponent({ name: "myname", description: undefined })];
    const { budgetUsage } = checkAlwaysLoadedBudget(components);
    expect(budgetUsage.current).toBe(6); // only name
  });

  test("passes when total is exactly at budget", () => {
    const components = [makeComponent({ name: "", description: "x".repeat(ALWAYS_LOADED_BUDGET) })];
    const { errors } = checkAlwaysLoadedBudget(components);
    expect(errors).toEqual([]);
  });

  test("reports top 5 contributors on failure", () => {
    const components = Array.from({ length: 8 }, (_, i) =>
      makeComponent({
        relativePath: `skills/skill-${i}/SKILL.md`,
        name: `s${i}`,
        description: "x".repeat(3000),
      }),
    );
    const { errors } = checkAlwaysLoadedBudget(components);
    expect(errors.length).toBe(6); // 1 summary + 5 top contributors
  });

  test("populates budgetUsage even on pass", () => {
    const components = [makeComponent({ name: "a", description: "b" })];
    const { budgetUsage } = checkAlwaysLoadedBudget(components);
    expect(budgetUsage.current).toBe(2);
    expect(budgetUsage.limit).toBe(ALWAYS_LOADED_BUDGET);
  });
});

// --- checkSkillSizes ---

describe("checkSkillSizes", () => {
  test("passes when all skills are under limit", () => {
    const components = [makeComponent({ fileSizeBytes: 10000 })];
    expect(checkSkillSizes(components)).toEqual([]);
  });

  test("warns when a skill exceeds limit", () => {
    const components = [makeComponent({ fileSizeBytes: 50000 })];
    const warnings = checkSkillSizes(components);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("[warn]");
    expect(warnings[0]).toContain("50,000");
  });

  test("does not warn for agents over limit", () => {
    const components = [
      makeComponent({ relativePath: "agents/review/big.md", fileSizeBytes: 50000 }),
    ];
    expect(checkSkillSizes(components)).toEqual([]);
  });

  test("passes when skill is exactly at limit", () => {
    const components = [makeComponent({ fileSizeBytes: SKILL_SIZE_LIMIT })];
    expect(checkSkillSizes(components)).toEqual([]);
  });
});

// --- discoverComponents (integration) ---

describe("discoverComponents", () => {
  test("discovers skills and agents with valid frontmatter", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "my-skill"), { recursive: true });
    await mkdir(path.join(root, "agents", "review"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "my-skill", "SKILL.md"),
      `---\nname: my-skill\ndescription: "A test skill"\n---\n\n# My Skill\n`,
    );
    await writeFile(
      path.join(root, "agents", "review", "security.md"),
      `---\nname: security-reviewer\ndescription: "Reviews security"\n---\n\n# Security\n`,
    );

    const components = await discoverComponents(root);
    expect(components).toHaveLength(2);

    const skill = components.find((c) => c.relativePath.includes("skills/"));
    expect(skill?.name).toBe("my-skill");
    expect(skill?.description).toBe("A test skill");

    const agent = components.find((c) => c.relativePath.includes("agents/"));
    expect(agent?.name).toBe("security-reviewer");
  });

  test("handles disable-model-invocation flag", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "disabled-skill"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "disabled-skill", "SKILL.md"),
      `---\nname: disabled-skill\ndescription: "Not loaded"\ndisable-model-invocation: true\n---\n\n# Disabled\n`,
    );

    const components = await discoverComponents(root);
    expect(components).toHaveLength(1);
    expect(components[0].disableModelInvocation).toBe(true);
  });

  test("handles malformed frontmatter gracefully", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "bad-skill"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "bad-skill", "SKILL.md"),
      `---\nname: bad: unquoted: colon\n---\n\n# Bad\n`,
    );

    const components = await discoverComponents(root);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBeUndefined();
    expect(components[0].description).toBeUndefined();
  });

  test("skips directories without SKILL.md", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "empty-dir"), { recursive: true });
    await writeFile(path.join(root, "skills", "empty-dir", "README.md"), "# Not a skill\n");

    const components = await discoverComponents(root);
    expect(components).toEqual([]);
  });

  test("handles missing skills/ and agents/ directories", async () => {
    const root = await makeTempRoot();
    const components = await discoverComponents(root);
    expect(components).toEqual([]);
  });
});

// --- runTokenGuardrails (integration) ---

describe("runTokenGuardrails", () => {
  test("returns clean result when all checks pass", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "good-skill"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "good-skill", "SKILL.md"),
      `---\nname: good-skill\ndescription: "Short and sweet"\n---\n\n# Good\n`,
    );

    const result = await runTokenGuardrails(root);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.budgetUsage.current).toBeGreaterThan(0);
    expect(result.budgetUsage.limit).toBe(ALWAYS_LOADED_BUDGET);
  });

  test("reports description violation", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "verbose-skill"), { recursive: true });

    await writeFile(
      path.join(root, "skills", "verbose-skill", "SKILL.md"),
      `---\nname: verbose-skill\ndescription: "${"x".repeat(300)}"\n---\n\n# Verbose\n`,
    );

    const result = await runTokenGuardrails(root);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Description too long");
  });

  test("reports skill size warning without error", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "skills", "big-skill"), { recursive: true });

    const bigContent = `---\nname: big-skill\ndescription: "Big"\n---\n\n${"x".repeat(40000)}\n`;
    await writeFile(path.join(root, "skills", "big-skill", "SKILL.md"), bigContent);

    const result = await runTokenGuardrails(root);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("[warn]");
  });
});
