#!/usr/bin/env bun
import path from "path";
import crypto from "crypto";
import { parseArgs } from "util";
import { parseSections } from "../../src/analysis/sections";
import { generateVariants } from "../../src/analysis/variants";
import { evaluate, scoreQualityDelta, type EvaluationResult } from "../../src/analysis/evaluator";
import { readText, writeJson, ensureDir, walkFiles, pathExists } from "../../src/utils/files";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    skill: { type: "string", default: "ce-review" },
    section: { type: "string" },
    fixture: { type: "string" },
    runs: { type: "string", default: "1" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const skillName = values.skill!;
const sectionFilter = values.section;
const fixtureFilter = values.fixture;
const runs = Math.min(parseInt(values.runs!, 10) || 1, 3);
const dryRun = values["dry-run"]!;

const repoRoot = process.cwd();
const skillPath = path.join(repoRoot, "plugins", "compound-engineering", "skills", skillName);
const fixturesDir = path.join(repoRoot, "scripts", "ablation", "fixtures");
const resultsDir = path.join(repoRoot, ".context", "ablation", skillName);

async function main() {
  // 1. Validate skill path
  const skillMdPath = path.join(skillPath, "SKILL.md");
  if (!(await pathExists(skillMdPath))) {
    console.error(`Skill not found: ${skillMdPath}`);
    process.exit(1);
  }

  // 2. Parse sections
  const skillContent = await readText(skillMdPath);
  const sections = parseSections(skillContent);

  console.log(`\nSkill: ${skillName}`);
  console.log(`Sections found: ${sections.length}`);
  console.log(`Total bytes: ${sections.reduce((sum, s) => sum + s.bytes, 0).toLocaleString()}\n`);

  // Display section inventory
  console.log("Section inventory:");
  for (const s of sections) {
    const refs = s.containsFileRefs ? " [has file refs]" : "";
    console.log(`  H${s.level} "${s.name}" -- ${s.bytes.toLocaleString()} bytes${refs}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: stopping before model invocations.");
    process.exit(0);
  }

  // 3. Load fixtures
  const allFixtureFiles = (await walkFiles(fixturesDir)).filter((f) => f.endsWith(".diff"));
  const fixtureFiles = fixtureFilter
    ? allFixtureFiles.filter((f) => path.basename(f, ".diff").includes(fixtureFilter))
    : allFixtureFiles;

  if (fixtureFiles.length === 0) {
    console.error(`No fixtures found in ${fixturesDir}`);
    process.exit(1);
  }

  console.log(`\nFixtures: ${fixtureFiles.map((f) => path.basename(f)).join(", ")}`);

  // 4. Prepare results directory
  await ensureDir(resultsDir);

  // 5. Content hash for baseline caching
  const contentHash = crypto.createHash("sha256").update(skillContent).digest("hex").slice(0, 12);
  const baselinePath = path.join(resultsDir, `baseline-${contentHash}.json`);

  // 6. Run baseline evaluations (or load from cache)
  let baselineResults: Record<string, EvaluationResult> = {};
  if (await pathExists(baselinePath)) {
    console.log("\nLoading cached baseline...");
    const raw = await readText(baselinePath);
    baselineResults = JSON.parse(raw);
  } else {
    console.log("\nRunning baseline evaluations...");
    for (const fixturePath of fixtureFiles) {
      const fixtureName = path.basename(fixturePath, ".diff");
      const diffContent = await readText(fixturePath);
      console.log(`  Evaluating baseline against ${fixtureName}...`);
      const result = await evaluate(skillContent, diffContent, { runs });
      result.skillName = skillName;
      result.section = "baseline";
      result.taskItem = fixtureName;
      baselineResults[fixtureName] = result;
    }
    await writeJson(baselinePath, baselineResults);
    console.log(`  Baseline cached to ${path.relative(repoRoot, baselinePath)}`);
  }

  // 7. Generate and evaluate variants
  const targetSections = sectionFilter
    ? sections.filter((s) => s.name === sectionFilter)
    : sections;

  if (targetSections.length === 0) {
    console.error(`\nNo sections matched filter: "${sectionFilter}"`);
    process.exit(1);
  }

  console.log(`\nEvaluating ${targetSections.length} ablation variants...`);

  const variants = await generateVariants(skillPath, sections, {
    only: sectionFilter ? [sectionFilter] : undefined,
  });

  const runId = `run-${Date.now()}`;
  const runResults: Record<string, unknown>[] = [];

  for (const variant of variants) {
    console.log(`\n  Ablating: "${variant.removedSection}" (${variant.removedBytes.toLocaleString()} bytes)`);

    const variantSkillContent = variant.modifiedContent;
    const sectionResults: Record<string, unknown> = {
      section: variant.removedSection,
      removedBytes: variant.removedBytes,
      fixtures: {} as Record<string, unknown>,
    };

    for (const fixturePath of fixtureFiles) {
      const fixtureName = path.basename(fixturePath, ".diff");
      const diffContent = await readText(fixturePath);

      console.log(`    vs ${fixtureName}...`);
      const variantResult = await evaluate(variantSkillContent, diffContent, { runs });
      variantResult.skillName = skillName;
      variantResult.section = variant.removedSection;
      variantResult.taskItem = fixtureName;

      const baseline = baselineResults[fixtureName];
      const delta = baseline
        ? scoreQualityDelta(baseline, variantResult)
        : null;

      (sectionResults.fixtures as Record<string, unknown>)[fixtureName] = {
        evaluation: variantResult,
        qualityDelta: delta,
      };

      if (delta) {
        console.log(`      composite: ${delta.composite.toFixed(3)} (cov=${delta.coverage.toFixed(2)} prec=${delta.precision.toFixed(2)} cal=${delta.calibration.toFixed(2)} comp=${delta.compliance.toFixed(2)})`);
      }
    }

    runResults.push(sectionResults);

    // Clean up temp dir
    await Bun.$`rm -rf ${variant.tempDir}`.quiet();
  }

  // 8. Write results
  const outputPath = path.join(resultsDir, `${runId}.json`);
  await writeJson(outputPath, {
    runId,
    skill: skillName,
    contentHash,
    timestamp: new Date().toISOString(),
    runs,
    fixtures: fixtureFiles.map((f) => path.basename(f)),
    results: runResults,
  });

  console.log(`\nResults written to ${path.relative(repoRoot, outputPath)}`);
  console.log("Run `bun run ablation:report` to generate the ranked report.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
