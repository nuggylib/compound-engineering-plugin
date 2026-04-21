import { describe, expect, test } from "bun:test";
import {
  scoreQualityDelta,
  findingsMatch,
  parseFindings,
  levenshtein,
  type Finding,
  type EvaluationResult,
} from "../src/analysis/evaluator";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: "Missing null check",
    severity: "medium",
    file: "src/foo.ts",
    line: 42,
    confidence: 0.85,
    category: "correctness",
    ...overrides,
  };
}

function makeResult(
  findings: Finding[],
  overrides: Partial<EvaluationResult> = {},
): EvaluationResult {
  return {
    skillName: "test-skill",
    section: "baseline",
    taskItem: "fixture-1",
    findings,
    rawOutput: JSON.stringify(findings),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// --- findingsMatch ---

describe("findingsMatch", () => {
  test("matches identical findings", () => {
    const a = makeFinding();
    const b = makeFinding();
    expect(findingsMatch(a, b)).toBe(true);
  });

  test("does not match different files", () => {
    const a = makeFinding({ file: "src/a.ts" });
    const b = makeFinding({ file: "src/b.ts" });
    expect(findingsMatch(a, b)).toBe(false);
  });

  test("matches via substring containment", () => {
    const a = makeFinding({ title: "Missing null check in handler" });
    const b = makeFinding({ title: "Missing null check" });
    expect(findingsMatch(a, b)).toBe(true);
  });

  test("matches via Levenshtein distance < 3", () => {
    const a = makeFinding({ title: "Missing nul check" }); // 1 char diff
    const b = makeFinding({ title: "Missing null check" });
    expect(findingsMatch(a, b)).toBe(true);
  });

  test("does not match very different titles on same file", () => {
    const a = makeFinding({ title: "SQL injection risk" });
    const b = makeFinding({ title: "Missing error handler" });
    expect(findingsMatch(a, b)).toBe(false);
  });
});

// --- levenshtein ---

describe("levenshtein", () => {
  test("identical strings have distance 0", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  test("empty vs non-empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  test("single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  test("multiple differences", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

// --- parseFindings ---

describe("parseFindings", () => {
  test("parses valid JSON array", () => {
    const raw = JSON.stringify([makeFinding(), makeFinding({ title: "Other" })]);
    const findings = parseFindings(raw);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toBe("Missing null check");
  });

  test("extracts JSON from surrounding text", () => {
    const raw = `Here are the findings:\n${JSON.stringify([makeFinding()])}\n\nDone.`;
    const findings = parseFindings(raw);
    expect(findings).toHaveLength(1);
  });

  test("returns empty array for non-JSON", () => {
    const findings = parseFindings("This is not JSON at all");
    expect(findings).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    const findings = parseFindings("");
    expect(findings).toEqual([]);
  });

  test("filters out invalid findings", () => {
    const raw = JSON.stringify([
      makeFinding(),
      { notAFinding: true }, // no title or file
      makeFinding({ title: "Valid" }),
    ]);
    const findings = parseFindings(raw);
    expect(findings).toHaveLength(2);
  });
});

// --- scoreQualityDelta ---

describe("scoreQualityDelta", () => {
  test("identical findings produce all scores = 1.0", () => {
    const findings = [
      makeFinding(),
      makeFinding({ title: "Other issue", file: "src/bar.ts" }),
    ];
    const baseline = makeResult(findings);
    const variant = makeResult(findings);

    const delta = scoreQualityDelta(baseline, variant);
    expect(delta.coverage).toBeCloseTo(1.0);
    expect(delta.precision).toBeCloseTo(1.0);
    expect(delta.calibration).toBeCloseTo(1.0);
    expect(delta.compliance).toBeCloseTo(1.0);
    expect(delta.composite).toBeCloseTo(1.0);
  });

  test("variant missing 2 of 5 findings: coverage = 0.6", () => {
    const baseFindings = [
      makeFinding({ title: "Finding 1", file: "a.ts" }),
      makeFinding({ title: "Finding 2", file: "b.ts" }),
      makeFinding({ title: "Finding 3", file: "c.ts" }),
      makeFinding({ title: "Finding 4", file: "d.ts" }),
      makeFinding({ title: "Finding 5", file: "e.ts" }),
    ];
    const variantFindings = [
      makeFinding({ title: "Finding 1", file: "a.ts" }),
      makeFinding({ title: "Finding 3", file: "c.ts" }),
      makeFinding({ title: "Finding 5", file: "e.ts" }),
    ];

    const baseline = makeResult(baseFindings);
    const variant = makeResult(variantFindings);

    const delta = scoreQualityDelta(baseline, variant);
    expect(delta.coverage).toBeCloseTo(0.6);
    expect(delta.precision).toBeCloseTo(1.0);
  });

  test("variant with 2 extra findings: precision ~= 0.71", () => {
    const baseFindings = [
      makeFinding({ title: "Finding 1", file: "a.ts" }),
      makeFinding({ title: "Finding 2", file: "b.ts" }),
      makeFinding({ title: "Finding 3", file: "c.ts" }),
      makeFinding({ title: "Finding 4", file: "d.ts" }),
      makeFinding({ title: "Finding 5", file: "e.ts" }),
    ];
    const variantFindings = [
      ...baseFindings,
      makeFinding({ title: "Extra 1", file: "f.ts" }),
      makeFinding({ title: "Extra 2", file: "g.ts" }),
    ];

    const baseline = makeResult(baseFindings);
    const variant = makeResult(variantFindings);

    const delta = scoreQualityDelta(baseline, variant);
    expect(delta.coverage).toBeCloseTo(1.0);
    // 5 of 7 variant findings match baseline
    expect(delta.precision).toBeCloseTo(5 / 7, 1);
  });

  test("empty variant findings: coverage = 0, precision = 1.0", () => {
    const baseFindings = [
      makeFinding({ title: "Finding 1", file: "a.ts" }),
      makeFinding({ title: "Finding 2", file: "b.ts" }),
    ];

    const baseline = makeResult(baseFindings);
    const variant = makeResult([], { rawOutput: "[]" });

    const delta = scoreQualityDelta(baseline, variant);
    expect(delta.coverage).toBeCloseTo(0);
    expect(delta.precision).toBeCloseTo(1.0);
  });

  test("confidence shift affects calibration", () => {
    const baseFindings = [
      makeFinding({ title: "Issue A", file: "a.ts", confidence: 0.80 }),
      makeFinding({ title: "Issue B", file: "b.ts", confidence: 0.90 }),
    ];
    const variantFindings = [
      makeFinding({ title: "Issue A", file: "a.ts", confidence: 0.65 }),
      makeFinding({ title: "Issue B", file: "b.ts", confidence: 0.75 }),
    ];

    const baseline = makeResult(baseFindings);
    const variant = makeResult(variantFindings);

    const delta = scoreQualityDelta(baseline, variant);
    // Mean delta = (0.15 + 0.15) / 2 = 0.15, calibration = 1 - 0.15 = 0.85
    expect(delta.calibration).toBeCloseTo(0.85);
  });

  test("invalid JSON response: compliance = 0", () => {
    const baseFindings = [makeFinding()];
    const baseline = makeResult(baseFindings);
    const variant = makeResult([], {
      rawOutput: "{invalid json",
      section: "test-section",
    });

    const delta = scoreQualityDelta(baseline, variant);
    expect(delta.compliance).toBeCloseTo(0);
  });

  test("composite score uses correct weights", () => {
    // Construct scenario with known individual scores
    const baseFindings = [
      makeFinding({ title: "F1", file: "a.ts", confidence: 0.80 }),
      makeFinding({ title: "F2", file: "b.ts", confidence: 0.80 }),
    ];
    // Variant keeps F1 but misses F2
    const variantFindings = [
      makeFinding({ title: "F1", file: "a.ts", confidence: 0.80 }),
    ];

    const baseline = makeResult(baseFindings);
    const variant = makeResult(variantFindings);

    const delta = scoreQualityDelta(baseline, variant);
    // coverage = 1/2 = 0.5
    // precision = 1/1 = 1.0
    // calibration = 1 - 0 = 1.0 (matched finding has same confidence)
    // compliance = all valid fields
    const expected = 0.4 * 0.5 + 0.3 * 1.0 + 0.2 * delta.compliance + 0.1 * 1.0;
    expect(delta.composite).toBeCloseTo(expected);
  });

  test("both empty: all scores = 1.0", () => {
    const baseline = makeResult([], { rawOutput: "[]" });
    const variant = makeResult([], { rawOutput: "[]" });

    const delta = scoreQualityDelta(baseline, variant);
    expect(delta.coverage).toBeCloseTo(1.0);
    expect(delta.precision).toBeCloseTo(1.0);
    expect(delta.calibration).toBeCloseTo(1.0);
    expect(delta.composite).toBeCloseTo(1.0);
  });
});
