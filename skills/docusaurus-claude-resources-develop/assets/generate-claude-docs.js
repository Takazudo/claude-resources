#!/usr/bin/env node
/**
 * Generate documentation for Claude Code resources
 * Discovers commands, skills, agents, and CLAUDE.md files
 * Generates MDX files and sidebar JSON for Docusaurus
 *
 * Configuration:
 *   CLAUDE_DIR  - Root directory containing Claude Code config (~/.claude/ or project .claude/)
 *   DOCS_PREFIX - Doc ID prefix for sidebar (default: "claude")
 *   SECTION_LABEL - Navbar/sidebar label (default: "Claude")
 *
 * Adjust the paths in the "Configuration" section below to match your project.
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

// =============================================================================
// Configuration - Adjust these paths for your project
// =============================================================================

// Where Claude Code resources live (commands/, skills/, agents/, CLAUDE.md)
const CLAUDE_DIR = path.resolve(__dirname, "../../..");

// Docusaurus root (where docusaurus.config.js lives)
const DOCUSAURUS_ROOT = path.resolve(__dirname, "..");

// Doc prefix used in sidebar IDs and output path
const DOCS_PREFIX = "claude";

// Label shown in navbar and index page
const SECTION_LABEL = "Claude";

// =============================================================================
// Derived paths (usually no need to change)
// =============================================================================

const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const AGENTS_DIR = path.join(CLAUDE_DIR, "agents");
const OUTPUT_DIR = path.join(DOCUSAURUS_ROOT, "docs", DOCS_PREFIX);
const OUTPUT_CLAUDEMD_DIR = path.join(OUTPUT_DIR, "claudemd");
const OUTPUT_COMMANDS_DIR = path.join(OUTPUT_DIR, "commands");
const OUTPUT_SKILLS_DIR = path.join(OUTPUT_DIR, "skills");
const OUTPUT_AGENTS_DIR = path.join(OUTPUT_DIR, "agents");
const DATA_DIR = path.join(DOCUSAURUS_ROOT, "src/data");

// =============================================================================
// Utility functions
// =============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanGeneratedFiles(dir, keepIndex = true) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    if (keepIndex && file === "index.mdx") return;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  });
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  items.forEach((item) => {
    const itemPath = path.join(dir, item);
    if (fs.statSync(itemPath).isDirectory()) {
      cleanDir(itemPath);
      fs.rmdirSync(itemPath);
    } else {
      fs.unlinkSync(itemPath);
    }
  });
}

/**
 * Escape angle brackets and curly braces in content for MDX compatibility.
 * Preserves content inside code blocks (``` ... ```) and inline code (` ... `).
 */
function escapeForMdx(content) {
  const htmlTags = new Set([
    "div", "span", "p", "a", "img", "br", "hr", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "blockquote",
    "table", "tr", "td", "th", "thead", "tbody", "tfoot", "colgroup", "col",
    "strong", "em", "b", "i", "u", "s", "del", "ins", "sub", "sup",
    "details", "summary", "figure", "figcaption", "mark", "small",
    "cite", "q", "abbr", "dfn", "time", "var", "samp", "kbd",
    "section", "article", "aside", "header", "footer", "nav", "main",
    "form", "input", "button", "select", "option", "textarea", "label",
    "fieldset", "legend", "dl", "dt", "dd", "caption",
  ]);

  // Split on code blocks first
  const codeBlockRegex = /(```[\s\S]*?```)/g;
  const parts = content.split(codeBlockRegex);

  return parts
    .map((part, index) => {
      // Odd indices are code blocks - leave untouched
      if (index % 2 === 1) return part;

      // For non-code-block text, split on inline code to preserve it
      const inlineCodeRegex = /(`[^`]+`)/g;
      const subParts = part.split(inlineCodeRegex);

      return subParts
        .map((subPart, subIndex) => {
          // Odd indices are inline code - leave untouched
          if (subIndex % 2 === 1) return subPart;

          return subPart
            // Escape angle brackets that look like JSX tags (but not standard HTML)
            .replace(/<([A-Za-z][A-Za-z0-9_-]*)>/g, (match, name) => {
              if (htmlTags.has(name.toLowerCase())) return match;
              return `&lt;${name}&gt;`;
            })
            .replace(/<(-+|=+)/g, "&lt;$1")
            .replace(/<(\d)/g, "&lt;$1")
            // Escape curly braces (MDX interprets them as JSX expressions)
            .replace(/\{/g, "&#123;")
            .replace(/\}/g, "&#125;");
        })
        .join("");
    })
    .join("");
}

// =============================================================================
// CLAUDE.md generation
// =============================================================================

function findClaudeMdFiles(dir, excludeDirs) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);
  items.forEach((item) => {
    const itemPath = path.join(dir, item);
    if (excludeDirs.some((d) => itemPath.startsWith(d))) return;

    let stat;
    try {
      stat = fs.statSync(itemPath);
    } catch {
      // Skip broken symlinks or inaccessible paths
      return;
    }
    if (stat.isDirectory()) {
      results.push(...findClaudeMdFiles(itemPath, excludeDirs));
    } else if (item === "CLAUDE.md") {
      results.push(itemPath);
    }
  });

  return results;
}

function generateClaudemdDocs() {
  console.log("\n  Generating CLAUDE.md documentation...");

  cleanDir(OUTPUT_CLAUDEMD_DIR);

  const excludeDirs = [
    path.join(DOCUSAURUS_ROOT, "docs"),
    path.join(DOCUSAURUS_ROOT, "node_modules"),
    path.join(DOCUSAURUS_ROOT, ".docusaurus"),
    path.join(DOCUSAURUS_ROOT, "build"),
    path.join(CLAUDE_DIR, ".git"),
  ];

  const files = findClaudeMdFiles(CLAUDE_DIR, excludeDirs).filter(
    (f) => !f.includes("node_modules")
  );

  if (files.length === 0) {
    console.log("    No CLAUDE.md files found");
    return [];
  }

  ensureDir(OUTPUT_CLAUDEMD_DIR);
  const claudemds = [];

  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const relPath = path.relative(CLAUDE_DIR, filePath);
    const displayPath = `/${relPath}`;
    const dirPart = path.dirname(relPath);
    const slug = dirPart === "." ? "root" : dirPart.replace(/\//g, "--");

    claudemds.push({ displayPath, slug, relPath });

    const mdxContent = `---
title: "${displayPath}"
description: "CLAUDE.md at ${displayPath}"
---

# ${displayPath}

**Path:** \`${relPath}\`

${escapeForMdx(content.trim())}
`;

    const outputPath = path.join(OUTPUT_CLAUDEMD_DIR, `${slug}.mdx`);
    fs.writeFileSync(outputPath, mdxContent);
    console.log(`    ${displayPath}`);
  });

  claudemds.sort((a, b) => {
    if (a.slug === "root") return -1;
    if (b.slug === "root") return 1;
    return a.displayPath.localeCompare(b.displayPath);
  });

  const claudemdList = claudemds
    .map((item) => `- [\`${item.displayPath}\`](./${item.slug}.mdx)`)
    .join("\n");

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# CLAUDE.md

CLAUDE.md files found in this project.

CLAUDE.md files provide project-specific instructions to Claude Code.

## Files (${claudemds.length})

${claudemdList}
`;

  fs.writeFileSync(path.join(OUTPUT_CLAUDEMD_DIR, "index.mdx"), indexContent);
  return claudemds;
}

// =============================================================================
// Commands generation
// =============================================================================

function generateCommandsDocs() {
  console.log("\n  Generating commands documentation...");

  ensureDir(OUTPUT_COMMANDS_DIR);
  cleanGeneratedFiles(OUTPUT_COMMANDS_DIR);

  if (!fs.existsSync(COMMANDS_DIR)) {
    console.log("    Commands directory not found");
    return [];
  }

  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".md"));
  const commands = [];

  files.forEach((file) => {
    const filePath = path.join(COMMANDS_DIR, file);
    const content = fs.readFileSync(filePath, "utf8");
    const { data, content: bodyContent } = matter(content);

    const name = file.replace(/\.md$/, "");
    const description = data.description || "";

    commands.push({ name, description });

    const mdxContent = `---
title: "/${name}"
description: "${description.replace(/"/g, '\\"')}"
---

# /${name}

${escapeForMdx(bodyContent.trim())}
`;

    const outputPath = path.join(OUTPUT_COMMANDS_DIR, `${name}.mdx`);
    fs.writeFileSync(outputPath, mdxContent);
    console.log(`    /${name}`);
  });

  commands.sort((a, b) => a.name.localeCompare(b.name));

  const commandsList = commands
    .map((cmd) => `- [\`/${cmd.name}\`](./${cmd.name}.mdx) - ${cmd.description}`)
    .join("\n");

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# Commands

Claude Code custom commands reference.

## Available Commands (${commands.length})

${commandsList}
`;

  fs.writeFileSync(path.join(OUTPUT_COMMANDS_DIR, "index.mdx"), indexContent);
  return commands;
}

// =============================================================================
// Skills generation
// =============================================================================

function getSkillReferences(skillDir) {
  const refsDir = path.join(SKILLS_DIR, skillDir, "references");
  if (!fs.existsSync(refsDir)) return [];

  return fs
    .readdirSync(refsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const filePath = path.join(refsDir, f);
      const content = fs.readFileSync(filePath, "utf8");
      const name = f.replace(/\.md$/, "");
      const h1Match = content.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1] : name;
      return { name, title, content };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function generateSkillsDocs() {
  console.log("\n  Generating skills documentation...");

  cleanDir(OUTPUT_SKILLS_DIR);
  ensureDir(OUTPUT_SKILLS_DIR);

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log("    Skills directory not found");
    return [];
  }

  const dirs = fs.readdirSync(SKILLS_DIR).filter((d) => {
    const skillPath = path.join(SKILLS_DIR, d);
    return (
      fs.statSync(skillPath).isDirectory() &&
      fs.existsSync(path.join(skillPath, "SKILL.md"))
    );
  });

  const skills = [];

  dirs.forEach((dir) => {
    const skillPath = path.join(SKILLS_DIR, dir, "SKILL.md");
    const content = fs.readFileSync(skillPath, "utf8");

    let data, bodyContent;
    try {
      const parsed = matter(content);
      data = parsed.data;
      bodyContent = parsed.content;
    } catch (err) {
      console.log(`    Skipping ${dir} (YAML parse error: ${err.reason || err.message})`);
      return;
    }

    const name = data.name || dir;
    const description = data.description || "";
    const references = getSkillReferences(dir);

    skills.push({ name, dir, description, references });

    const hasReferences = references.length > 0;
    const hasScripts = fs.existsSync(path.join(SKILLS_DIR, dir, "scripts"));
    const hasAssets = fs.existsSync(path.join(SKILLS_DIR, dir, "assets"));

    let resourcesNote = "";
    if (hasReferences || hasScripts || hasAssets) {
      const resourceList = [hasScripts && "scripts", hasAssets && "assets"].filter(Boolean);
      resourcesNote = `
:::info Bundled Resources
This skill includes: ${hasReferences ? `[references](#references)` : ""}${hasReferences && resourceList.length > 0 ? ", " : ""}${resourceList.join(", ")}
:::
`;
    }

    let referencesSection = "";
    if (references.length > 0) {
      const refLinks = references
        .map((ref) => `- [${ref.title}](./${dir}/${ref.name}.mdx)`)
        .join("\n");
      referencesSection = `

## References

${refLinks}
`;
    }

    const mdxContent = `---
title: "${name}"
description: "${description.replace(/"/g, '\\"').substring(0, 200)}${description.length > 200 ? "..." : ""}"
---

# ${name}

${resourcesNote}

${escapeForMdx(bodyContent.trim())}
${referencesSection}
`;

    const outputPath = path.join(OUTPUT_SKILLS_DIR, `${dir}.mdx`);
    fs.writeFileSync(outputPath, mdxContent);
    console.log(`    ${name}`);

    if (references.length > 0) {
      const skillRefsOutputDir = path.join(OUTPUT_SKILLS_DIR, dir);
      ensureDir(skillRefsOutputDir);

      references.forEach((ref) => {
        const refMdxContent = `---
title: "${ref.title}"
---

# ${ref.title}

**Skill:** [${name}](../${dir}.mdx)

---

${escapeForMdx(ref.content.trim())}
`;
        const refOutputPath = path.join(skillRefsOutputDir, `${ref.name}.mdx`);
        fs.writeFileSync(refOutputPath, refMdxContent);
      });
    }
  });

  skills.sort((a, b) => a.name.localeCompare(b.name));

  const skillsList = skills
    .map((skill) => {
      const shortDesc =
        skill.description.length > 100
          ? skill.description.substring(0, 100) + "..."
          : skill.description;
      const refCount = skill.references.length > 0 ? ` (${skill.references.length} refs)` : "";
      return `- [\`${skill.name}\`](./${skill.dir}.mdx)${refCount} - ${shortDesc}`;
    })
    .join("\n");

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# Skills

Claude Code skills reference.

## Available Skills (${skills.length})

${skillsList}
`;

  fs.writeFileSync(path.join(OUTPUT_SKILLS_DIR, "index.mdx"), indexContent);
  return skills;
}

// =============================================================================
// Agents generation
// =============================================================================

function generateAgentsDocs() {
  console.log("\n  Generating agents documentation...");

  ensureDir(OUTPUT_AGENTS_DIR);
  cleanGeneratedFiles(OUTPUT_AGENTS_DIR);

  if (!fs.existsSync(AGENTS_DIR)) {
    console.log("    Agents directory not found");
    return [];
  }

  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  const agents = [];

  files.forEach((file) => {
    const filePath = path.join(AGENTS_DIR, file);
    const content = fs.readFileSync(filePath, "utf8");

    let data, bodyContent;
    try {
      const parsed = matter(content);
      data = parsed.data;
      bodyContent = parsed.content;
    } catch (err) {
      console.log(`    Skipping ${file} (YAML parse error: ${err.reason || err.message})`);
      return;
    }

    const name = data.name || file.replace(/\.md$/, "");
    const description = data.description || "";
    const model = data.model || "";

    agents.push({ name, file: file.replace(/\.md$/, ""), description, model });

    const modelBadge = model ? `**Model:** \`${model}\`` : "";
    const mdxContent = `---
title: "${name}"
description: "${description.replace(/"/g, '\\"')}"
---

# ${name}

${modelBadge}

${escapeForMdx(bodyContent.trim())}
`;

    const outputPath = path.join(OUTPUT_AGENTS_DIR, `${file.replace(/\.md$/, "")}.mdx`);
    fs.writeFileSync(outputPath, mdxContent);
    console.log(`    ${name}`);
  });

  agents.sort((a, b) => a.name.localeCompare(b.name));

  const agentsList = agents
    .map((agent) => {
      const modelInfo = agent.model ? ` (${agent.model})` : "";
      return `- [\`${agent.name}\`](./${agent.file}.mdx)${modelInfo} - ${agent.description}`;
    })
    .join("\n");

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# Agents

Claude Code subagents reference.

## Available Agents (${agents.length})

${agentsList}
`;

  fs.writeFileSync(path.join(OUTPUT_AGENTS_DIR, "index.mdx"), indexContent);
  return agents;
}

// =============================================================================
// Index page and sidebar generation
// =============================================================================

function generateIndex(claudemds, commands, skills, agents) {
  console.log("\n  Generating index page...");

  ensureDir(OUTPUT_DIR);

  const contentLines = [
    claudemds.length > 0 &&
      `- **[CLAUDE.md](./claudemd/index.mdx)** (${claudemds.length}) - Project-specific instructions`,
    commands.length > 0 &&
      `- **[Commands](./commands/index.mdx)** (${commands.length}) - Custom slash commands`,
    skills.length > 0 &&
      `- **[Skills](./skills/index.mdx)** (${skills.length}) - Skill packages with specialized capabilities`,
    agents.length > 0 &&
      `- **[Agents](./agents/index.mdx)** (${agents.length}) - Custom subagents`,
  ].filter(Boolean);

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# ${SECTION_LABEL}

Claude Code configuration reference.

## Contents

${contentLines.join("\n")}
`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "index.mdx"), indexContent);
}

function generateSidebar(claudemds, commands, skills, agents) {
  console.log("\n  Generating sidebar...");

  const P = DOCS_PREFIX; // shorthand

  const skillItems = skills.map((skill) => {
    if (skill.references && skill.references.length > 0) {
      return {
        type: "category",
        label: skill.name,
        collapsed: true,
        link: { type: "doc", id: `${P}/skills/${skill.dir}` },
        items: skill.references.map((ref) => `${P}/skills/${skill.dir}/${ref.name}`),
      };
    } else {
      return `${P}/skills/${skill.dir}`;
    }
  });

  const sidebarConfig = [
    `${P}/index`,
    ...(claudemds.length > 0
      ? [
          {
            type: "category",
            label: "CLAUDE.md",
            collapsed: false,
            link: { type: "doc", id: `${P}/claudemd/index` },
            items: claudemds.map((item) => `${P}/claudemd/${item.slug}`),
          },
        ]
      : []),
    ...(commands.length > 0
      ? [
          {
            type: "category",
            label: "Commands",
            collapsed: false,
            link: { type: "doc", id: `${P}/commands/index` },
            items: commands.map((cmd) => `${P}/commands/${cmd.name}`),
          },
        ]
      : []),
    ...(skills.length > 0
      ? [
          {
            type: "category",
            label: "Skills",
            collapsed: false,
            link: { type: "doc", id: `${P}/skills/index` },
            items: skillItems,
          },
        ]
      : []),
    ...(agents.length > 0
      ? [
          {
            type: "category",
            label: "Agents",
            collapsed: false,
            link: { type: "doc", id: `${P}/agents/index` },
            items: agents.map((agent) => `${P}/agents/${agent.file}`),
          },
        ]
      : []),
  ];

  ensureDir(DATA_DIR);
  const sidebarFile = path.join(DATA_DIR, `${DOCS_PREFIX}-sidebar.json`);
  fs.writeFileSync(sidebarFile, JSON.stringify(sidebarConfig, null, 2) + "\n");
  console.log(`    ${sidebarFile}`);
}

// =============================================================================
// Main
// =============================================================================

function main() {
  console.log(`Generating Claude Code documentation...`);
  console.log(`  Source: ${CLAUDE_DIR}`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  ensureDir(DATA_DIR);

  // Clean entire output directory to remove stale files from previous versions
  cleanDir(OUTPUT_DIR);
  ensureDir(OUTPUT_DIR);

  const claudemds = generateClaudemdDocs();
  const commands = generateCommandsDocs();
  const skills = generateSkillsDocs();
  const agents = generateAgentsDocs();

  generateIndex(claudemds, commands, skills, agents);
  generateSidebar(claudemds, commands, skills, agents);

  console.log(`\nDone: ${claudemds.length} CLAUDE.md, ${commands.length} commands, ${skills.length} skills, ${agents.length} agents`);
}

main();
