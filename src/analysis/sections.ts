import { parseFrontmatter, formatFrontmatter } from "../utils/frontmatter";

export type Section = {
  name: string;
  level: number;
  startLine: number;
  endLine: number;
  bytes: number;
  content: string;
  containsFileRefs: boolean;
};

const HEADER_RE = /^(#{2,3})\s+(.+)$/;
const FILE_REF_RE = /@\.\//;
const BACKTICK_PATH_RE = /`[^\s`]*\/[^\s`]+`/;

/**
 * Parse markdown content into sections split at H2/H3 boundaries.
 * Frontmatter is stripped before parsing.
 */
export function parseSections(content: string): Section[] {
  const { body } = parseFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const sections: Section[] = [];
  let current: {
    name: string;
    level: number;
    startLine: number;
    contentLines: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADER_RE);
    if (match) {
      // Close previous section
      if (current) {
        sections.push(finalizeSection(current, i - 1));
      }
      current = {
        name: match[2].trim(),
        level: match[1].length,
        startLine: i,
        contentLines: [lines[i]],
      };
    } else if (current) {
      current.contentLines.push(lines[i]);
    }
    // Lines before the first header are ignored (preamble)
  }

  // Close final section
  if (current) {
    sections.push(finalizeSection(current, lines.length - 1));
  }

  return sections;
}

function finalizeSection(
  current: { name: string; level: number; startLine: number; contentLines: string[] },
  endLine: number,
): Section {
  // Trim trailing blank lines from content for accurate byte count,
  // but keep the raw content including them for full-fidelity removal.
  const rawContent = current.contentLines.join("\n");
  const containsFileRefs =
    FILE_REF_RE.test(rawContent) || BACKTICK_PATH_RE.test(rawContent);

  return {
    name: current.name,
    level: current.level,
    startLine: current.startLine,
    endLine,
    bytes: Buffer.byteLength(rawContent, "utf8"),
    content: rawContent,
    containsFileRefs,
  };
}

/**
 * Remove a named section (and its child sub-sections) from markdown content.
 * Returns the content with frontmatter preserved and the target section stripped.
 * If the section name is not found, the original content is returned unchanged.
 */
export function removeSection(content: string, sectionName: string): string {
  const { data, body } = parseFrontmatter(content);
  const lines = body.split(/\r?\n/);

  let removing = false;
  let removeLevel = 0;
  const kept: string[] = [];

  for (const line of lines) {
    const match = line.match(HEADER_RE);
    if (match) {
      const level = match[1].length;
      const name = match[2].trim();

      if (name === sectionName) {
        removing = true;
        removeLevel = level;
        continue;
      }

      // Stop removing when we hit a header at the same or higher level
      if (removing && level <= removeLevel) {
        removing = false;
      }
    }

    if (!removing) {
      kept.push(line);
    }
  }

  const resultBody = kept.join("\n");

  // Reconstruct with frontmatter if it existed
  const hasFrontmatter = content.trimStart().startsWith("---");
  if (hasFrontmatter && Object.keys(data).length > 0) {
    return formatFrontmatter(data, resultBody);
  }

  return resultBody;
}
