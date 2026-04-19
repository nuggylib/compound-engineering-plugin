#!/usr/bin/env bun
/**
 * Kolmogorov compression validation script.
 *
 * Compares a compressed file against its pre-compression original (from git HEAD)
 * using the ablation evaluation framework.
 *
 * Usage:
 *   bun scripts/ablation/validate-kolmogorov.ts --file <path> [--fixture <name>] [--runs <n>] [--threshold <n>]
 *
 * The script:
 *   1. Gets original content via `git show HEAD:<path>`
 *   2. Evaluates original content against fixtures -> baseline
 *   3. Evaluates compressed content (current file) against same fixtures -> variant
 *   4. Compares using scoreQualityDelta()
 *   5. Reports pass/fail against threshold (default 0.95)
 */
import path from "path";
import crypto from "crypto";
import { parseArgs } from "util";
import { evaluate, scoreQualityDelta, type EvaluationResult } from "../../src/analysis/evaluator";
import { readText, writeJson, ensureDir, walkFiles, pathExists } from "../../src/utils/files";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string" },
    fixture: { type: "string" },
    runs: { type: "string", default: "1" },
    threshold: { type: "string", default: "0.95" },
    "baseline-ref": { type: "string", default: "HEAD" },
    "no-cache": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

if (!values.file) {
  console.error("Usage: bun scripts/ablation/validate-kolmogorov.ts --file <path>");
  process.exit(1);
}

const repoRoot = process.cwd();
const targetPath = path.resolve(values.file);
const targetName = path.basename(targetPath, ".md");
const fixtureFilter = values.fixture;
const runs = Math.min(parseInt(values.runs!, 10) || 1, 3);
const threshold = parseFloat(values.threshold!);
const baselineRef = values["baseline-ref"]!;
const noCache = values["no-cache"]!;
const dryRun = values["dry-run"]!;

const fixturesDir = path.join(repoRoot, "scripts", "ablation", "fixtures");
const resultsDir = path.join(repoRoot, ".context", "ablation", targetName);

async function getOriginalContent(filePath: string, ref: string): Promise<string> {
  const relPath = path.relative(repoRoot, filePath);
  const proc = Bun.spawn(["git", "show", `${ref}:${relPath}`], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: repoRoot,
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git show ${ref}:${relPath} failed: ${stderr.trim()}`);
  }
  return output;
}

async function main() {
  if (!(await pathExists(targetPath))) {
    console.error(`File not found: ${targetPath}`);
    process.exit(1);
  }

  // Load fixtures
  const allFixtureFiles = (await walkFiles(fixturesDir)).filter((f) => f.endsWith(".diff"));
  const fixtureFiles = fixtureFilter
    ? allFixtureFiles.filter((f) => path.basename(f, ".diff").includes(fixtureFilter))
    : allFixtureFiles;

  if (fixtureFiles.length === 0) {
    console.error(`No fixtures found in ${fixturesDir}`);
    process.exit(1);
  }

  // Get original and compressed content
  const originalContent = await getOriginalContent(targetPath, baselineRef);
  const compressedContent = await readText(targetPath);

  const originalBytes = Buffer.byteLength(originalContent);
  const compressedBytes = Buffer.byteLength(compressedContent);
  const savings = originalBytes - compressedBytes;
  const savingsPercent = ((savings / originalBytes) * 100).toFixed(1);

  console.log(`\nKolmogorov Validation: ${targetName}`);
  console.log(`  Original:   ${originalBytes.toLocaleString()} bytes (${baselineRef})`);
  console.log(`  Compressed: ${compressedBytes.toLocaleString()} bytes (working tree)`);
  console.log(`  Savings:    ${savings.toLocaleString()} bytes (${savingsPercent}%)`);
  console.log(`  Threshold:  composite > ${threshold}`);
  console.log(`  Fixtures:   ${fixtureFiles.map((f) => path.basename(f)).join(", ")}`);

  if (dryRun) {
    console.log("\n--dry-run: stopping before model invocations.");
    process.exit(0);
  }

  await ensureDir(resultsDir);

  // Check for cached original baseline
  const originalHash = crypto.createHash("sha256").update(originalContent).digest("hex").slice(0, 12);
  const baselineCachePath = path.join(resultsDir, `baseline-${originalHash}.json`);

  let baselineResults: Record<string, EvaluationResult> = {};
  if (!noCache && (await pathExists(baselineCachePath))) {
    console.log(`\nLoading cached original baseline (${originalHash})...`);
    baselineResults = JSON.parse(await readText(baselineCachePath));
  } else {
    console.log(`\nGenerating original baseline (${originalHash})...`);
    for (const fixturePath of fixtureFiles) {
      const fixtureName = path.basename(fixturePath, ".diff");
      const diffContent = await readText(fixturePath);
      console.log(`  Evaluating original against ${fixtureName}...`);
      const result = await evaluate(originalContent, diffContent, { runs });
      result.skillName = targetName;
      result.section = "baseline";
      result.taskItem = fixtureName;
      baselineResults[fixtureName] = result;
    }
    await writeJson(baselineCachePath, baselineResults);
    console.log(`  Cached to ${path.relative(repoRoot, baselineCachePath)}`);
  }

  // Evaluate compressed content
  console.log("\nEvaluating compressed content...");
  const compressedResults: Record<string, EvaluationResult> = {};
  for (const fixturePath of fixtureFiles) {
    const fixtureName = path.basename(fixturePath, ".diff");
    const diffContent = await readText(fixturePath);
    console.log(`  Evaluating compressed against ${fixtureName}...`);
    const result = await evaluate(compressedContent, diffContent, { runs });
    result.skillName = targetName;
    result.section = "kolmogorov-compressed";
    result.taskItem = fixtureName;
    compressedResults[fixtureName] = result;
  }

  // Compare
  console.log("\n--- Results ---\n");
  let allPassed = true;
  const deltas: Record<string, { delta: ReturnType<typeof scoreQualityDelta>; passed: boolean }> = {};

  for (const fixturePath of fixtureFiles) {
    const fixtureName = path.basename(fixturePath, ".diff");
    const baseline = baselineResults[fixtureName];
    const compressed = compressedResults[fixtureName];

    if (!baseline || !compressed) {
      console.log(`  ${fixtureName}: SKIP (missing data)`);
      continue;
    }

    const delta = scoreQualityDelta(baseline, compressed);
    const passed = delta.composite >= threshold;
    if (!passed) allPassed = false;

    deltas[fixtureName] = { delta, passed };

    const status = passed ? "PASS" : "FAIL";
    console.log(
      `  ${fixtureName}: ${status} composite=${delta.composite.toFixed(3)} ` +
      `(cov=${delta.coverage.toFixed(2)} prec=${delta.precision.toFixed(2)} ` +
      `cal=${delta.calibration.toFixed(2)} comp=${delta.compliance.toFixed(2)})`,
    );

    // Show finding counts for context
    console.log(
      `    findings: original=${baseline.findings.length} compressed=${compressed.findings.length}`,
    );
  }

  // Overall verdict
  const compositeAvg = Object.values(deltas).reduce((sum, d) => sum + d.delta.composite, 0) / Object.values(deltas).length;
  console.log(`\n  Average composite: ${compositeAvg.toFixed(3)}`);
  console.log(`  Verdict: ${allPassed ? "ALL PASS" : "FAIL -- regression detected"}`);

  // Save results
  const outputPath = path.join(resultsDir, `kolmogorov-${Date.now()}.json`);
  await writeJson(outputPath, {
    type: "kolmogorov-validation",
    target: targetName,
    targetPath: path.relative(repoRoot, targetPath),
    baselineRef,
    originalHash,
    originalBytes,
    compressedBytes,
    savings,
    savingsPercent: parseFloat(savingsPercent),
    threshold,
    timestamp: new Date().toISOString(),
    allPassed,
    compositeAvg,
    fixtures: deltas,
  });

  console.log(`\nResults saved to ${path.relative(repoRoot, outputPath)}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
