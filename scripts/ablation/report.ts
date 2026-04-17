#!/usr/bin/env bun
import path from "path";
import { parseArgs } from "util";
import { readText, walkFiles, pathExists, ensureDir } from "../../src/utils/files";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    skill: { type: "string" },
    json: { type: "boolean", default: false },
    threshold: { type: "string", default: "0.05" },
  },
  strict: true,
});

const skillFilter = values.skill;
const jsonOutput = values.json!;
const threshold = parseFloat(values.threshold!);

const repoRoot = process.cwd();
const ablationRoot = path.join(repoRoot, ".context", "ablation");

type QualityDelta = {
  coverage: number;
  precision: number;
  calibration: number;
  compliance: number;
  composite: number;
};

type SectionResult = {
  section: string;
  removedBytes: number;
  fixtures: Record<string, {
    evaluation: unknown;
    qualityDelta: QualityDelta | null;
  }>;
};

type RunData = {
  runId: string;
  skill: string;
  contentHash: string;
  timestamp: string;
  runs: number;
  fixtures: string[];
  results: SectionResult[];
};

type AggregatedSection = {
  section: string;
  bytes: number;
  meanComposite: number;
  meanCoverage: number;
  meanPrecision: number;
  meanCalibration: number;
  meanCompliance: number;
  fixtureCount: number;
  isCutCandidate: boolean;
};

async function main() {
  if (!(await pathExists(ablationRoot))) {
    console.error(`No ablation results found at ${ablationRoot}`);
    process.exit(1);
  }

  // Discover skill directories
  const entries = await Bun.$`ls ${ablationRoot}`.text();
  const skillDirs = entries.trim().split("\n").filter(Boolean);

  const targetSkills = skillFilter
    ? skillDirs.filter((d) => d === skillFilter)
    : skillDirs;

  if (targetSkills.length === 0) {
    console.error(`No results found${skillFilter ? ` for skill: ${skillFilter}` : ""}`);
    process.exit(1);
  }

  for (const skill of targetSkills) {
    const skillDir = path.join(ablationRoot, skill);
    const files = await walkFiles(skillDir);
    const runFiles = files.filter((f) => path.basename(f).startsWith("run-") && f.endsWith(".json"));

    if (runFiles.length === 0) {
      console.error(`No run results found for skill: ${skill}`);
      continue;
    }

    // Load all run data
    const allRuns: RunData[] = [];
    for (const file of runFiles) {
      const raw = await readText(file);
      allRuns.push(JSON.parse(raw));
    }

    // Aggregate section results across all runs
    const sectionMap = new Map<string, { deltas: QualityDelta[]; bytes: number }>();

    for (const run of allRuns) {
      for (const result of run.results) {
        if (!sectionMap.has(result.section)) {
          sectionMap.set(result.section, { deltas: [], bytes: result.removedBytes });
        }
        const entry = sectionMap.get(result.section)!;
        for (const fixture of Object.values(result.fixtures)) {
          if (fixture.qualityDelta) {
            entry.deltas.push(fixture.qualityDelta);
          }
        }
      }
    }

    // Compute aggregated scores
    const aggregated: AggregatedSection[] = [];
    for (const [section, data] of sectionMap) {
      if (data.deltas.length === 0) continue;

      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const meanComposite = mean(data.deltas.map((d) => d.composite));
      const meanCoverage = mean(data.deltas.map((d) => d.coverage));
      const meanPrecision = mean(data.deltas.map((d) => d.precision));
      const meanCalibration = mean(data.deltas.map((d) => d.calibration));
      const meanCompliance = mean(data.deltas.map((d) => d.compliance));

      aggregated.push({
        section,
        bytes: data.bytes,
        meanComposite,
        meanCoverage,
        meanPrecision,
        meanCalibration,
        meanCompliance,
        fixtureCount: data.deltas.length,
        isCutCandidate: meanComposite < threshold,
      });
    }

    // Sort by composite delta ascending (lowest delta = least impact = best cut candidate)
    aggregated.sort((a, b) => a.meanComposite - b.meanComposite);

    if (jsonOutput) {
      const output = {
        skill,
        sectionsAnalyzed: aggregated.length,
        cutCandidates: aggregated.filter((s) => s.isCutCandidate),
        totalCutBytes: aggregated
          .filter((s) => s.isCutCandidate)
          .reduce((sum, s) => sum + s.bytes, 0),
        sections: aggregated,
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      generateMarkdownReport(skill, aggregated);
    }
  }
}

function generateMarkdownReport(skill: string, sections: AggregatedSection[]) {
  const cutCandidates = sections.filter((s) => s.isCutCandidate);
  const totalBytes = sections.reduce((sum, s) => sum + s.bytes, 0);
  const cutBytes = cutCandidates.reduce((sum, s) => sum + s.bytes, 0);
  const savingsPct = totalBytes > 0 ? ((cutBytes / totalBytes) * 100).toFixed(1) : "0.0";

  const lines: string[] = [];
  lines.push(`# Ablation Report: ${skill}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Sections analyzed: ${sections.length}`);
  lines.push(`- Zero-delta cut candidates: ${cutCandidates.length}`);
  lines.push(`- Total bytes in cut candidates: ${cutBytes.toLocaleString()}`);
  lines.push(`- Potential savings: ${savingsPct}% of analyzed section content`);
  lines.push("");

  // Section rankings table
  lines.push("## Section Rankings (by composite delta, ascending)");
  lines.push("");
  lines.push("| Rank | Section | Bytes | Composite | Coverage | Precision | Calibration | Compliance | Cut? |");
  lines.push("|------|---------|------:|:---------:|:--------:|:---------:|:-----------:|:----------:|:----:|");

  // Sort by composite ascending for ranking (least valuable sections first)
  const ranked = [...sections].sort((a, b) => a.meanComposite - b.meanComposite);

  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i];
    const cut = s.isCutCandidate ? "yes" : "";
    lines.push(
      `| ${i + 1} | ${s.section} | ${s.bytes.toLocaleString()} | ${s.meanComposite.toFixed(3)} | ${s.meanCoverage.toFixed(2)} | ${s.meanPrecision.toFixed(2)} | ${s.meanCalibration.toFixed(2)} | ${s.meanCompliance.toFixed(2)} | ${cut} |`,
    );
  }
  lines.push("");

  // Cut candidates detail
  if (cutCandidates.length > 0) {
    lines.push(`## Cut Candidates (composite < ${threshold})`);
    lines.push("");
    for (const s of cutCandidates) {
      lines.push(`- **${s.section}** -- ${s.bytes.toLocaleString()} bytes, composite ${s.meanComposite.toFixed(3)}`);
    }
    lines.push("");
  }

  // Caveats
  lines.push("## Caveats");
  lines.push("");
  lines.push("- Interaction effects not tested (removing A+B may differ from removing A then B)");
  lines.push("- Single-prompt evaluation captures screening signal, not full pipeline fidelity");

  const fileRefSections = sections.filter((s) =>
    // We don't have containsFileRefs in aggregated data, so note this limitation
    false,
  );
  lines.push("- Sections with file references may have indirect effects not captured by ablation");
  lines.push("");

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
