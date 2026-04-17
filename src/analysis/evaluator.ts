export type Finding = {
  title: string;
  severity: string;
  file: string;
  line?: number;
  confidence: number;
  category: string;
};

export type EvaluationResult = {
  skillName: string;
  section: string | "baseline";
  taskItem: string;
  findings: Finding[];
  rawOutput: string;
  timestamp: string;
};

export type QualityDelta = {
  coverage: number;
  precision: number;
  calibration: number;
  compliance: number;
  composite: number;
};

export type EvaluateOptions = {
  runs?: number;
  claudeCommand?: string;
};

const VALID_SEVERITIES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
  "p0",
  "p1",
  "p2",
  "p3",
]);

const REQUIRED_FIELDS: (keyof Finding)[] = [
  "title",
  "severity",
  "file",
  "confidence",
  "category",
];

/**
 * Run a single-prompt evaluation by invoking `claude --print`.
 * The skill content is used as reviewer instructions and the diff is the review target.
 */
export async function evaluate(
  skillContent: string,
  diffContent: string,
  options?: EvaluateOptions,
): Promise<EvaluationResult> {
  const runs = Math.min(options?.runs ?? 1, 3);
  const claudeCmd = options?.claudeCommand ?? "claude";

  const prompt = buildPrompt(skillContent, diffContent);
  const allFindings: Finding[][] = [];

  for (let i = 0; i < runs; i++) {
    const rawOutput = await invokeClaudeCli(claudeCmd, prompt);
    const findings = parseFindings(rawOutput);
    allFindings.push(findings);
  }

  // Use majority vote if multiple runs
  const findings = runs === 1
    ? allFindings[0]
    : majorityVote(allFindings);

  return {
    skillName: "",
    section: "baseline",
    taskItem: "",
    findings,
    rawOutput: "",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Invoke the claude CLI with --print flag.
 * Separated for testability -- tests can mock this function.
 */
export async function invokeClaudeCli(
  command: string,
  prompt: string,
): Promise<string> {
  const proc = Bun.spawn([command, "--print", "-p", prompt], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return output;
}

function buildPrompt(skillContent: string, diffContent: string): string {
  return `You are a code reviewer. Here are your instructions:

${skillContent}

Review this diff:

\`\`\`diff
${diffContent}
\`\`\`

Respond with a JSON array of findings, each with: title, severity, file, line, confidence, category.
Example: [{"title":"Missing null check","severity":"medium","file":"src/foo.ts","line":42,"confidence":0.85,"category":"correctness"}]

Return ONLY the JSON array, no other text.`;
}

/**
 * Parse findings from raw CLI output.
 * Attempts to extract a JSON array from the response.
 */
export function parseFindings(raw: string): Finding[] {
  try {
    // Try direct parse first
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeFinding).filter(Boolean) as Finding[];
    }
    return [];
  } catch {
    // Try to extract JSON array from surrounding text
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeFinding).filter(Boolean) as Finding[];
        }
      } catch {
        return [];
      }
    }
    return [];
  }
}

function normalizeFinding(raw: unknown): Finding | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title : "";
  const severity = typeof obj.severity === "string" ? obj.severity.toLowerCase() : "";
  const file = typeof obj.file === "string" ? obj.file : "";
  const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
  const category = typeof obj.category === "string" ? obj.category : "";
  const line = typeof obj.line === "number" ? obj.line : undefined;

  if (!title && !file) return null;

  return { title, severity, file, line, confidence, category };
}

/**
 * Majority vote across multiple runs.
 * A finding is included if it appears in more than half of the runs.
 */
function majorityVote(allFindings: Finding[][]): Finding[] {
  if (allFindings.length === 0) return [];
  if (allFindings.length === 1) return allFindings[0];

  const threshold = allFindings.length / 2;
  const candidates = allFindings[0];
  const result: Finding[] = [];

  for (const candidate of candidates) {
    let count = 0;
    for (const run of allFindings) {
      if (run.some((f) => findingsMatch(f, candidate))) {
        count++;
      }
    }
    if (count > threshold) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Check if two findings match using fuzzy title matching AND same file.
 * Match criteria: same file AND (exact title OR Levenshtein < 3 OR substring containment).
 */
export function findingsMatch(a: Finding, b: Finding): boolean {
  if (a.file !== b.file) return false;

  // Exact match
  if (a.title === b.title) return true;

  // Substring containment
  const aLower = a.title.toLowerCase();
  const bLower = b.title.toLowerCase();
  if (aLower.includes(bLower) || bLower.includes(aLower)) return true;

  // Levenshtein distance < 3
  if (levenshtein(aLower, bLower) < 3) return true;

  return false;
}

/**
 * Score the quality delta between a baseline and variant evaluation.
 */
export function scoreQualityDelta(
  baseline: EvaluationResult,
  variant: EvaluationResult,
): QualityDelta {
  const coverage = computeCoverage(baseline.findings, variant.findings);
  const precision = computePrecision(baseline.findings, variant.findings);
  const calibration = computeCalibration(baseline.findings, variant.findings);
  const compliance = computeCompliance(variant);

  const composite =
    0.4 * coverage +
    0.3 * precision +
    0.2 * compliance +
    0.1 * calibration;

  return { coverage, precision, calibration, compliance, composite };
}

/**
 * Coverage: fraction of baseline findings that appear in variant.
 */
function computeCoverage(baseline: Finding[], variant: Finding[]): number {
  if (baseline.length === 0) return 1.0;

  let matched = 0;
  for (const bf of baseline) {
    if (variant.some((vf) => findingsMatch(bf, vf))) {
      matched++;
    }
  }

  return matched / baseline.length;
}

/**
 * Precision: fraction of variant findings that match baseline.
 * 1.0 if variant has no findings (vacuously true).
 */
function computePrecision(baseline: Finding[], variant: Finding[]): number {
  if (variant.length === 0) return 1.0;

  let matched = 0;
  for (const vf of variant) {
    if (baseline.some((bf) => findingsMatch(vf, bf))) {
      matched++;
    }
  }

  return matched / variant.length;
}

/**
 * Calibration: 1 - mean absolute confidence delta for matched findings.
 * Returns 1.0 if no matched findings (no calibration signal).
 */
function computeCalibration(baseline: Finding[], variant: Finding[]): number {
  const deltas: number[] = [];

  for (const bf of baseline) {
    const match = variant.find((vf) => findingsMatch(bf, vf));
    if (match) {
      deltas.push(Math.abs(bf.confidence - match.confidence));
    }
  }

  if (deltas.length === 0) return 1.0;

  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return Math.max(0, 1 - meanDelta);
}

/**
 * Compliance: structural quality of variant output.
 * Checks that findings have valid required fields and severity values.
 */
function computeCompliance(result: EvaluationResult): number {
  if (result.findings.length === 0) {
    // Empty findings from a parse failure = compliance 0
    // Empty findings from a genuine "no issues" = compliance 1
    // We distinguish by checking rawOutput
    if (result.rawOutput && result.rawOutput.trim().length > 0) {
      const trimmed = result.rawOutput.trim();
      // A valid empty JSON array is a correct "no findings" response
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length === 0) {
          return 1.0;
        }
      } catch {
        // Not valid JSON -- fall through to failure check
      }
      // Non-empty output that didn't parse to a valid empty array = parse failure
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        return 0;
      }
    }
    return 1.0;
  }

  let totalChecks = 0;
  let passedChecks = 0;

  for (const finding of result.findings) {
    for (const field of REQUIRED_FIELDS) {
      totalChecks++;
      const val = finding[field];
      if (val !== undefined && val !== null && val !== "") {
        passedChecks++;
      }
    }

    // Check severity validity
    totalChecks++;
    if (VALID_SEVERITIES.has(finding.severity.toLowerCase())) {
      passedChecks++;
    }
  }

  return totalChecks === 0 ? 1.0 : passedChecks / totalChecks;
}

/**
 * Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}
