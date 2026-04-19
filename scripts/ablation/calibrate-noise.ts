#!/usr/bin/env bun
/**
 * Noise floor calibration: evaluate the SAME content twice and measure agreement.
 * This establishes the maximum achievable score given LLM variance.
 */
import path from "path";
import { parseArgs } from "util";
import { evaluate, scoreQualityDelta } from "../../src/analysis/evaluator";
import { readText, walkFiles } from "../../src/utils/files";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string" },
    fixture: { type: "string" },
  },
  strict: true,
});

if (!values.file) {
  console.error("Usage: bun scripts/ablation/calibrate-noise.ts --file <path> [--fixture <name>]");
  process.exit(1);
}

const repoRoot = process.cwd();
const targetPath = path.resolve(values.file);
const fixturesDir = path.join(repoRoot, "scripts", "ablation", "fixtures");

async function main() {
  const content = await readText(targetPath);
  const allFixtures = (await walkFiles(fixturesDir)).filter((f) => f.endsWith(".diff"));
  const fixtures = values.fixture
    ? allFixtures.filter((f) => path.basename(f, ".diff").includes(values.fixture!))
    : allFixtures;

  console.log(`\nNoise floor calibration: ${path.basename(targetPath)}`);
  console.log(`Content: ${Buffer.byteLength(content)} bytes (identical for both runs)`);
  console.log(`Fixtures: ${fixtures.map((f) => path.basename(f)).join(", ")}\n`);

  for (const fixturePath of fixtures) {
    const fixtureName = path.basename(fixturePath, ".diff");
    const diffContent = await readText(fixturePath);

    console.log(`  ${fixtureName}:`);
    console.log(`    Run A...`);
    const runA = await evaluate(content, diffContent, { runs: 1 });
    console.log(`    Run B...`);
    const runB = await evaluate(content, diffContent, { runs: 1 });

    const delta = scoreQualityDelta(runA, runB);
    console.log(
      `    composite=${delta.composite.toFixed(3)} ` +
      `(cov=${delta.coverage.toFixed(2)} prec=${delta.precision.toFixed(2)} ` +
      `cal=${delta.calibration.toFixed(2)} comp=${delta.compliance.toFixed(2)})`,
    );
    console.log(`    findings: A=${runA.findings.length} B=${runB.findings.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
