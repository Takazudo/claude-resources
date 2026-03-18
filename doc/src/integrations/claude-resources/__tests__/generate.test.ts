import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { generateClaudeResourcesDocs } from "../generate";

let tmpDir: string;
let claudeDir: string;
let docsDir: string;

function createFixture() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-res-test-"));

  // .claude/ directory
  claudeDir = path.join(tmpDir, ".claude");
  docsDir = path.join(tmpDir, "docs");
  fs.mkdirSync(docsDir, { recursive: true });

  // Commands
  const commandsDir = path.join(claudeDir, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(
    path.join(commandsDir, "test-cmd.md"),
    '---\ndescription: "A test command"\n---\n\nThis is a test command body.',
  );

  // Skills
  const skillDir = path.join(claudeDir, "skills", "test-skill");
  fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true });

  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    '---\nname: test-skill\ndescription: "A test skill"\n---\n\nSkill instructions here.',
  );
  fs.writeFileSync(
    path.join(skillDir, "references", "guide.md"),
    "# Guide\n\nSome guide content",
  );
  fs.writeFileSync(
    path.join(skillDir, "scripts", "run.sh"),
    "#!/bin/bash\n# Run the test",
  );
  fs.writeFileSync(
    path.join(skillDir, "assets", "template.md"),
    "# Template\n\nA template",
  );

  // Agents
  const agentsDir = path.join(claudeDir, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, "test-agent.md"),
    '---\nname: test-agent\ndescription: "A test agent"\nmodel: sonnet\n---\n\nAgent instructions here.',
  );

  // Root CLAUDE.md
  fs.writeFileSync(
    path.join(tmpDir, "CLAUDE.md"),
    "# Project\n\nProject instructions",
  );
}

describe("generateClaudeResourcesDocs", () => {
  beforeEach(() => {
    createFixture();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // File structure tests
  // ---------------------------------------------------------------------------

  describe("file structure", () => {
    it("generates correct directory structure", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      expect(fs.existsSync(path.join(docsDir, "claude"))).toBe(true);
      expect(fs.existsSync(path.join(docsDir, "claude-md"))).toBe(true);
      expect(fs.existsSync(path.join(docsDir, "claude-commands"))).toBe(true);
      expect(fs.existsSync(path.join(docsDir, "claude-skills"))).toBe(true);
      expect(fs.existsSync(path.join(docsDir, "claude-agents"))).toBe(true);
    });

    it("generates _category_.json with noPage for sub-categories", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const dirs = ["claude-md", "claude-commands", "claude-skills", "claude-agents"];
      for (const dir of dirs) {
        const catPath = path.join(docsDir, dir, "_category_.json");
        expect(fs.existsSync(catPath)).toBe(true);

        const cat = JSON.parse(fs.readFileSync(catPath, "utf8"));
        expect(cat).toHaveProperty("label");
        expect(cat).toHaveProperty("position");
        expect(cat).toHaveProperty("description");
        expect(cat.noPage).toBe(true);
      }
    });

    it("generates skill as flat .mdx file", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const flatPath = path.join(docsDir, "claude-skills", "test-skill.mdx");
      expect(fs.existsSync(flatPath)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Content tests
  // ---------------------------------------------------------------------------

  describe("content", () => {
    it("generates overview page with CategoryTreeNav", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const overview = fs.readFileSync(
        path.join(docsDir, "claude", "index.mdx"),
        "utf8",
      );
      expect(overview).toContain('<CategoryTreeNav category="claude" />');
    });

    it("skill page has correct frontmatter", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const skillPage = fs.readFileSync(
        path.join(docsDir, "claude-skills", "test-skill.mdx"),
        "utf8",
      );
      const parsed = matter(skillPage);

      expect(parsed.data.title).toBe("test-skill");
      expect(parsed.data.description).toBe("A test skill");
      expect(parsed.data.sidebar_label).toBe("test-skill");
    });

    it("skill page has file tree", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const skillPage = fs.readFileSync(
        path.join(docsDir, "claude-skills", "test-skill.mdx"),
        "utf8",
      );

      // Should contain tree-drawing characters
      expect(skillPage).toContain("├── ");
      expect(skillPage).toContain("└── ");
      expect(skillPage).toContain("test-skill/");
      expect(skillPage).toContain("SKILL.md");
    });

    it("skill page has links to sub-files that resolve correctly from the page URL", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const skillPage = fs.readFileSync(
        path.join(docsDir, "claude-skills", "test-skill.mdx"),
        "utf8",
      );

      // Links use ./<subpage> format (relative to the skill page URL which
      // already includes the skill dir, e.g. /docs/claude-skills/test-skill/)
      expect(skillPage).toContain("./ref-guide");
      expect(skillPage).toContain("./asset-template");

      // Must NOT contain the double-dir pattern ./<dir>/<subpage>
      expect(skillPage).not.toContain("./test-skill/ref-guide");
      expect(skillPage).not.toContain("./test-skill/asset-template");

      // Each linked sub-page must exist as a generated flat .mdx file
      // The file is flat (test-skill--ref-guide.mdx) but slug is nested
      const linkPattern = /\]\(\.\/([\w-]+)\)/g;
      let match;
      while ((match = linkPattern.exec(skillPage)) !== null) {
        const subPage = match[1];
        const targetFile = path.join(
          docsDir,
          "claude-skills",
          `test-skill--${subPage}.mdx`,
        );
        expect(
          fs.existsSync(targetFile),
          `Link target "test-skill--${subPage}.mdx" should exist`,
        ).toBe(true);
      }
    });

    it("agent page has model badge", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const agentPage = fs.readFileSync(
        path.join(docsDir, "claude-agents", "test-agent.mdx"),
        "utf8",
      );
      expect(agentPage).toContain("**Model:** `sonnet`");
    });
  });

  // ---------------------------------------------------------------------------
  // Sub-file page tests
  // ---------------------------------------------------------------------------

  describe("sub-file pages", () => {
    it("generates unlisted reference page", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const refPage = path.join(docsDir, "claude-skills", "test-skill--ref-guide.mdx");
      expect(fs.existsSync(refPage)).toBe(true);

      const parsed = matter(fs.readFileSync(refPage, "utf8"));
      expect(parsed.data.unlisted).toBe(true);
    });

    it("generates unlisted asset page for .md files", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const assetPage = path.join(docsDir, "claude-skills", "test-skill--asset-template.mdx");
      expect(fs.existsSync(assetPage)).toBe(true);

      const parsed = matter(fs.readFileSync(assetPage, "utf8"));
      expect(parsed.data.unlisted).toBe(true);
    });

    it("does NOT generate page for non-.md scripts", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const scriptPage = path.join(docsDir, "claude-skills", "test-skill--script-run.mdx");
      expect(fs.existsSync(scriptPage)).toBe(false);
    });

    it("sub-pages have custom slug for nested breadcrumbs", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const refPage = fs.readFileSync(
        path.join(docsDir, "claude-skills", "test-skill--ref-guide.mdx"),
        "utf8",
      );
      const parsed = matter(refPage);
      expect(parsed.data.slug).toBe("claude-skills/test-skill/ref-guide");
    });

    it("reference page content is correct", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const refPage = fs.readFileSync(
        path.join(docsDir, "claude-skills", "test-skill--ref-guide.mdx"),
        "utf8",
      );
      const parsed = matter(refPage);

      expect(parsed.data.title).toBe("Guide");
      expect(parsed.content).toContain("Some guide content");
    });
  });

  // ---------------------------------------------------------------------------
  // Category metadata tests
  // ---------------------------------------------------------------------------

  describe("category metadata", () => {
    it("_category_.json positions are ordered correctly", () => {
      generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      const readPos = (dir: string) => {
        const cat = JSON.parse(
          fs.readFileSync(path.join(docsDir, dir, "_category_.json"), "utf8"),
        );
        return cat.position;
      };

      expect(readPos("claude-md")).toBe(900);
      expect(readPos("claude-commands")).toBe(901);
      expect(readPos("claude-skills")).toBe(902);
      expect(readPos("claude-agents")).toBe(903);
    });
  });

  // ---------------------------------------------------------------------------
  // Return value test
  // ---------------------------------------------------------------------------

  describe("return value", () => {
    it("returns correct counts", () => {
      const result = generateClaudeResourcesDocs({
        claudeDir,
        projectRoot: tmpDir,
        docsDir,
      });

      expect(result).toEqual({
        claudemd: 1,
        commands: 1,
        skills: 1,
        agents: 1,
      });
    });
  });
});
