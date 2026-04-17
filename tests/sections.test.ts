import { describe, expect, test } from "bun:test";
import { parseSections, removeSection } from "../src/analysis/sections";

describe("parseSections", () => {
  test("parses file with 3 H2 sections", () => {
    const content = `## Section One

Content of section one.

## Section Two

Content of section two.
More content here.

## Section Three

Final content.`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe("Section One");
    expect(sections[0].level).toBe(2);
    expect(sections[1].name).toBe("Section Two");
    expect(sections[2].name).toBe("Section Three");

    // Each section should have non-zero bytes
    for (const s of sections) {
      expect(s.bytes).toBeGreaterThan(0);
    }
  });

  test("handles nested H3 under H2", () => {
    const content = `## Parent Section

Parent content.

### Child One

Child one content.

### Child Two

Child two content.

## Next Section

Next content.`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(4);
    expect(sections[0].name).toBe("Parent Section");
    expect(sections[0].level).toBe(2);
    expect(sections[1].name).toBe("Child One");
    expect(sections[1].level).toBe(3);
    expect(sections[2].name).toBe("Child Two");
    expect(sections[2].level).toBe(3);
    expect(sections[3].name).toBe("Next Section");
    expect(sections[3].level).toBe(2);
  });

  test("flags section with @./ file reference", () => {
    const content = `## Normal Section

No file refs here.

## Ref Section

Load this: @./references/foo.md

## Another Normal

Still no refs.`;

    const sections = parseSections(content);
    expect(sections[0].containsFileRefs).toBe(false);
    expect(sections[1].containsFileRefs).toBe(true);
    expect(sections[2].containsFileRefs).toBe(false);
  });

  test("flags section with backtick path reference", () => {
    const content = `## Code Section

See \`references/persona-catalog.md\` for details.`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].containsFileRefs).toBe(true);
  });

  test("returns empty array for frontmatter-only file", () => {
    const content = `---
name: test-skill
description: "A test"
---

Some preamble text without any headers.`;

    const sections = parseSections(content);
    expect(sections).toEqual([]);
  });

  test("handles empty section (header with no content before next header)", () => {
    const content = `## Empty Section
## Next Section

Some content here.`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe("Empty Section");
    // The empty section contains only its header line
    expect(sections[0].content).toBe("## Empty Section");
  });

  test("strips frontmatter before parsing", () => {
    const content = `---
name: my-skill
description: "A skill"
---

Preamble.

## First Section

Content.`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("First Section");
    // Ensure the section does not contain frontmatter
    expect(sections[0].content).not.toContain("---");
  });

  test("ignores H1 and H4+ headers", () => {
    const content = `# Title

Intro.

## Real Section

Content.

#### Deep Header

Deep content.`;

    const sections = parseSections(content);
    // Only the H2 section should be detected; H1 is preamble, H4 is inside the H2
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Real Section");
    // H4 content should be part of the H2 section
    expect(sections[0].content).toContain("#### Deep Header");
  });

  test("section bytes match UTF-8 encoding", () => {
    const content = `## Unicode Section

Emoji: \u{1F600}\u{1F389}\u{1F680}`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    // Each emoji is 4 bytes in UTF-8, header + newline + text line
    expect(sections[0].bytes).toBe(Buffer.byteLength(sections[0].content, "utf8"));
  });
});

describe("removeSection", () => {
  test("removes a named H2 section", () => {
    const content = `## Keep This

Keep content.

## Remove This

Remove content.

## Also Keep

Also keep content.`;

    const result = removeSection(content, "Remove This");
    expect(result).toContain("Keep This");
    expect(result).toContain("Also Keep");
    expect(result).not.toContain("Remove This");
    expect(result).not.toContain("Remove content");
  });

  test("removing H2 also removes its H3 children", () => {
    const content = `## Parent

Parent content.

### Child One

Child content.

### Child Two

More child content.

## Sibling

Sibling content.`;

    const result = removeSection(content, "Parent");
    expect(result).not.toContain("Parent content");
    expect(result).not.toContain("Child One");
    expect(result).not.toContain("Child Two");
    expect(result).toContain("Sibling");
    expect(result).toContain("Sibling content");
  });

  test("returns original content when section not found", () => {
    const content = `## Section A

Content A.

## Section B

Content B.`;

    const result = removeSection(content, "Nonexistent Section");
    expect(result).toBe(content);
  });

  test("preserves frontmatter when removing section", () => {
    const content = `---
name: test-skill
description: "A test"
---

## Keep Section

Keep.

## Remove Section

Remove.`;

    const result = removeSection(content, "Remove Section");
    expect(result).toContain("name: test-skill");
    expect(result).toContain("Keep Section");
    expect(result).not.toContain("Remove Section");
  });

  test("removes only the targeted H3 section, not siblings", () => {
    const content = `## Parent

Parent content.

### Keep Child

Keep this child.

### Remove Child

Remove this child.

### Also Keep Child

Keep this too.`;

    const result = removeSection(content, "Remove Child");
    expect(result).toContain("Parent");
    expect(result).toContain("Keep Child");
    expect(result).not.toContain("Remove Child");
    expect(result).not.toContain("Remove this child");
    expect(result).toContain("Also Keep Child");
  });
});
