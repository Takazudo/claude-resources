#!/usr/bin/env node
/**
 * Generate documentation for Claude Code global commands and skills
 * Reads from ~/.claude/commands/ and ~/.claude/skills/
 * Generates MDX files for Docusaurus
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

// Paths relative to this script
const CLAUDE_DIR = path.join(__dirname, "../../..");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const AGENTS_DIR = path.join(CLAUDE_DIR, "agents");
const OUTPUT_CLAUDE_DIR = path.join(__dirname, "../docs/claude");
const OUTPUT_CLAUDEMD_DIR = path.join(OUTPUT_CLAUDE_DIR, "claudemd");
const OUTPUT_COMMANDS_DIR = path.join(OUTPUT_CLAUDE_DIR, "commands");
const OUTPUT_SKILLS_DIR = path.join(OUTPUT_CLAUDE_DIR, "skills");
const OUTPUT_AGENTS_DIR = path.join(OUTPUT_CLAUDE_DIR, "agents");
const DATA_DIR = path.join(__dirname, "../src/data");

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Escape angle brackets in content for MDX compatibility
 * MDX treats < as JSX tag start, so we need to escape angle brackets
 * that are not part of valid HTML or code blocks
 */
function escapeForMdx(content) {
  // Valid HTML tags that should not be escaped
  const htmlTags = new Set([
    'div', 'span', 'p', 'a', 'img', 'br', 'hr', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote',
    'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'colgroup', 'col',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup',
    'details', 'summary', 'figure', 'figcaption', 'mark', 'small',
    'cite', 'q', 'abbr', 'dfn', 'time', 'var', 'samp', 'kbd',
    'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
    'form', 'input', 'button', 'select', 'option', 'textarea', 'label',
    'fieldset', 'legend', 'dl', 'dt', 'dd', 'caption'
  ]);

  // Split content to preserve code blocks (``` ... ```)
  const codeBlockRegex = /(```[\s\S]*?```)/g;
  const parts = content.split(codeBlockRegex);

  return parts.map((part, index) => {
    // Odd indices are code blocks - don't escape them
    if (index % 2 === 1) {
      return part;
    }

    // For non-code-block parts, escape angle brackets
    return part
      // Escape placeholder patterns: <word>, <word-word>, etc.
      .replace(/<([A-Za-z][A-Za-z0-9_-]*)>/g, (match, name) => {
        if (htmlTags.has(name.toLowerCase())) {
          return match;
        }
        return `&lt;${name}&gt;`;
      })
      // Escape arrow patterns: <-, <--, <=, etc.
      .replace(/<(-+|=+)/g, '&lt;$1')
      // Escape comparison patterns: <5, <10, etc.
      .replace(/<(\d)/g, '&lt;$1');
  }).join('');
}

/**
 * Clean generated files (except index.mdx)
 */
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

/**
 * Recursively find all CLAUDE.md files in the project
 */
function findClaudeMdFiles(dir, excludeDirs) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);
  items.forEach((item) => {
    const itemPath = path.join(dir, item);
    if (excludeDirs.some((d) => itemPath.startsWith(d))) return;

    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      results.push(...findClaudeMdFiles(itemPath, excludeDirs));
    } else if (item === "CLAUDE.md") {
      results.push(itemPath);
    }
  });

  return results;
}

/**
 * Generate CLAUDE.md documentation
 */
function generateClaudemdDocs() {
  console.log("\n📄 Generating CLAUDE.md documentation...");

  // Clean previous output
  cleanDir(OUTPUT_CLAUDEMD_DIR);

  // Directories to exclude from search
  const excludeDirs = [
    path.join(CLAUDE_DIR, "doc", "site", "docs"),
    path.join(CLAUDE_DIR, "doc", "site", "node_modules"),
    path.join(CLAUDE_DIR, "doc", "site", ".docusaurus"),
    path.join(CLAUDE_DIR, "doc", "site", "build"),
    path.join(CLAUDE_DIR, ".git"),
  ];

  // Also exclude node_modules anywhere
  const allExcludeDirs = [...excludeDirs];

  const files = findClaudeMdFiles(CLAUDE_DIR, allExcludeDirs).filter((f) => {
    // Extra safety: skip any node_modules paths
    return !f.includes("node_modules");
  });

  if (files.length === 0) {
    console.log("  No CLAUDE.md files found");
    return [];
  }

  ensureDir(OUTPUT_CLAUDEMD_DIR);
  const claudemds = [];

  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const relPath = path.relative(CLAUDE_DIR, filePath);
    // Display path: /CLAUDE.md, /doc/CLAUDE.md, etc.
    const displayPath = `/${relPath}`;
    // Slug: root for top-level, dir--subdir for nested
    const dirPart = path.dirname(relPath);
    const slug = dirPart === "." ? "root" : dirPart.replace(/\//g, "--");

    claudemds.push({ displayPath, slug, relPath });

    const mdxContent = `---
title: "${displayPath}"
description: "CLAUDE.md at ${displayPath}"
---

# ${displayPath}

**Path:** \`~/.claude/${relPath}\`

${escapeForMdx(content.trim())}
`;

    const outputPath = path.join(OUTPUT_CLAUDEMD_DIR, `${slug}.mdx`);
    fs.writeFileSync(outputPath, mdxContent);
    console.log(`  ${displayPath} → docs/claude/claudemd/${slug}.mdx`);
  });

  // Sort: root first, then alphabetically
  claudemds.sort((a, b) => {
    if (a.slug === "root") return -1;
    if (b.slug === "root") return 1;
    return a.displayPath.localeCompare(b.displayPath);
  });

  // Generate index.mdx
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
  console.log(`  → docs/claude/claudemd/index.mdx`);

  return claudemds;
}

/**
 * Generate commands documentation
 */
function generateCommandsDocs() {
  console.log("\n📝 Generating commands documentation...");

  ensureDir(OUTPUT_COMMANDS_DIR);
  cleanGeneratedFiles(OUTPUT_COMMANDS_DIR);

  if (!fs.existsSync(COMMANDS_DIR)) {
    console.log("  ⚠️  Commands directory not found");
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

    // Generate MDX file
    const mdxContent = `---
title: "/${name}"
description: "${description.replace(/"/g, '\\"')}"
---

# /${name}

${escapeForMdx(bodyContent.trim())}
`;

    const outputPath = path.join(OUTPUT_COMMANDS_DIR, `${name}.mdx`);
    fs.writeFileSync(outputPath, mdxContent);
    console.log(`  /${name} → docs/claude/commands/${name}.mdx`);
  });

  // Sort commands alphabetically
  commands.sort((a, b) => a.name.localeCompare(b.name));

  // Generate index.mdx
  const commandsList = commands
    .map((cmd) => `- [\`/${cmd.name}\`](./${cmd.name}.mdx) - ${cmd.description}`)
    .join("\n");

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# Commands

Global Claude Code custom commands reference.

These commands are available globally from \`~/.claude/commands/\`.

## Available Commands (${commands.length})

${commandsList}
`;

  fs.writeFileSync(path.join(OUTPUT_COMMANDS_DIR, "index.mdx"), indexContent);
  console.log(`  → docs/claude/commands/index.mdx`);

  return commands;
}

/**
 * Clean directory recursively
 */
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
 * Get reference markdown files for a skill
 */
function getSkillReferences(skillDir) {
  const refsDir = path.join(SKILLS_DIR, skillDir, "references");
  if (!fs.existsSync(refsDir)) return [];

  return fs.readdirSync(refsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const filePath = path.join(refsDir, f);
      const content = fs.readFileSync(filePath, "utf8");
      const name = f.replace(/\.md$/, "");

      // Try to extract title from first H1 or use filename
      const h1Match = content.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1] : name;

      return { name, title, content };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Generate skills documentation
 */
function generateSkillsDocs() {
  console.log("\n🛠️  Generating skills documentation...");

  // Clean the entire skills output directory (including subdirectories)
  cleanDir(OUTPUT_SKILLS_DIR);
  ensureDir(OUTPUT_SKILLS_DIR);

  if (!fs.existsSync(SKILLS_DIR)) {
    console.log("  ⚠️  Skills directory not found");
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
      console.log(`  ⚠️  Skipping ${dir} (YAML parse error: ${err.reason || err.message})`);
      return; // Skip this skill
    }

    const name = data.name || dir;
    const description = data.description || "";

    // Get reference markdown files
    const references = getSkillReferences(dir);

    skills.push({ name, dir, description, references });

    // Check for additional resources
    const hasReferences = references.length > 0;
    const hasScripts = fs.existsSync(path.join(SKILLS_DIR, dir, "scripts"));
    const hasAssets = fs.existsSync(path.join(SKILLS_DIR, dir, "assets"));

    // Build resources note with links to references
    let resourcesNote = "";
    if (hasReferences || hasScripts || hasAssets) {
      const resourceList = [
        hasScripts && "scripts",
        hasAssets && "assets",
      ].filter(Boolean);

      resourcesNote = `
:::info Bundled Resources
This skill includes: ${hasReferences ? `[references](#references)` : ""}${hasReferences && resourceList.length > 0 ? ", " : ""}${resourceList.join(", ")}
:::
`;
    }

    // Build references section with links
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

    // Generate MDX file for skill
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
    console.log(`  ${name} → docs/claude/skills/${dir}.mdx`);

    // Generate reference pages
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
        console.log(`    └─ ${ref.name} → docs/claude/skills/${dir}/${ref.name}.mdx`);
      });
    }
  });

  // Sort skills alphabetically
  skills.sort((a, b) => a.name.localeCompare(b.name));

  // Generate index.mdx
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

Global Claude Code skills reference.

These skills are available globally from \`~/.claude/skills/\`.

## Available Skills (${skills.length})

${skillsList}
`;

  fs.writeFileSync(path.join(OUTPUT_SKILLS_DIR, "index.mdx"), indexContent);
  console.log(`  → docs/claude/skills/index.mdx`);

  return skills;
}

/**
 * Generate agents documentation
 */
function generateAgentsDocs() {
  console.log("\n🤖 Generating agents documentation...");

  ensureDir(OUTPUT_AGENTS_DIR);
  cleanGeneratedFiles(OUTPUT_AGENTS_DIR);

  if (!fs.existsSync(AGENTS_DIR)) {
    console.log("  ⚠️  Agents directory not found");
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
      console.log(`  ⚠️  Skipping ${file} (YAML parse error: ${err.reason || err.message})`);
      return;
    }

    const name = data.name || file.replace(/\.md$/, "");
    const description = data.description || "";
    const model = data.model || "";
    const color = data.color || "";

    agents.push({ name, file: file.replace(/\.md$/, ""), description, model, color });

    // Generate MDX file
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
    console.log(`  ${name} → docs/claude/agents/${file.replace(/\.md$/, "")}.mdx`);
  });

  // Sort agents alphabetically
  agents.sort((a, b) => a.name.localeCompare(b.name));

  // Generate index.mdx
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

Global Claude Code subagents reference.

These agents are available globally from \`~/.claude/agents/\`.

## Available Agents (${agents.length})

${agentsList}
`;

  fs.writeFileSync(path.join(OUTPUT_AGENTS_DIR, "index.mdx"), indexContent);
  console.log(`  → docs/claude/agents/index.mdx`);

  return agents;
}

/**
 * Generate Claude index page
 */
function generateClaudeIndex(claudemds, commands, skills, agents) {
  console.log("\n📚 Generating Claude index page...");

  ensureDir(OUTPUT_CLAUDE_DIR);

  const contentLines = [
    claudemds.length > 0 && `- **[CLAUDE.md](./claudemd/index.mdx)** (${claudemds.length}) - Project-specific instructions`,
    commands.length > 0 && `- **[Commands](./commands/index.mdx)** (${commands.length}) - Custom slash commands`,
    skills.length > 0 && `- **[Skills](./skills/index.mdx)** (${skills.length}) - Skill packages with specialized capabilities`,
    agents.length > 0 && `- **[Agents](./agents/index.mdx)** (${agents.length}) - Custom subagents`,
  ].filter(Boolean);

  const treeLines = [
    claudemds.length > 0 && `├── CLAUDE.md     # Project instructions (${claudemds.length} files)`,
    commands.length > 0 && `├── commands/     # Custom slash commands (${commands.length} files)`,
    skills.length > 0 && `├── skills/       # Skill packages (${skills.length} dirs)`,
    agents.length > 0 && `├── agents/       # Custom subagent definitions (${agents.length} files)`,
    `├── settings.json # Claude Code settings`,
    `└── ...`,
  ].filter(Boolean);

  const indexContent = `---
sidebar_position: 1
pagination_next: null
pagination_prev: null
---

# Claude

Global Claude Code configuration reference.

This section contains documentation for global Claude Code settings located in \`~/.claude/\`.

## Contents

${contentLines.join("\n")}

## Directory Structure

\`\`\`
~/.claude/
${treeLines.join("\n")}
\`\`\`
`;

  fs.writeFileSync(path.join(OUTPUT_CLAUDE_DIR, "index.mdx"), indexContent);
  console.log("  → docs/claude/index.mdx");
}

/**
 * Generate unified sidebar for Claude category
 */
function generateClaudeSidebar(claudemds, commands, skills, agents) {
  console.log("\n🗂️  Generating Claude sidebar...");

  // Build skill items with optional reference sub-items
  const skillItems = skills.map((skill) => {
    if (skill.references && skill.references.length > 0) {
      // Skill with references - create a category
      return {
        type: "category",
        label: skill.name,
        collapsed: true,
        link: { type: "doc", id: `claude/skills/${skill.dir}` },
        items: skill.references.map((ref) => `claude/skills/${skill.dir}/${ref.name}`),
      };
    } else {
      // Skill without references - just a doc link
      return `claude/skills/${skill.dir}`;
    }
  });

  const sidebarConfig = [
    "claude/index",
    // Only include CLAUDE.md category when files exist
    ...(claudemds.length > 0
      ? [
          {
            type: "category",
            label: "CLAUDE.md",
            collapsed: false,
            link: { type: "doc", id: "claude/claudemd/index" },
            items: claudemds.map((item) => `claude/claudemd/${item.slug}`),
          },
        ]
      : []),
    ...(commands.length > 0
      ? [
          {
            type: "category",
            label: "Commands",
            collapsed: false,
            link: { type: "doc", id: "claude/commands/index" },
            items: commands.map((cmd) => `claude/commands/${cmd.name}`),
          },
        ]
      : []),
    ...(skills.length > 0
      ? [
          {
            type: "category",
            label: "Skills",
            collapsed: false,
            link: { type: "doc", id: "claude/skills/index" },
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
            link: { type: "doc", id: "claude/agents/index" },
            items: agents.map((agent) => `claude/agents/${agent.file}`),
          },
        ]
      : []),
  ];

  fs.writeFileSync(
    path.join(DATA_DIR, "claude-sidebar.json"),
    JSON.stringify(sidebarConfig, null, 2) + "\n"
  );
  console.log("  → src/data/claude-sidebar.json");
}

/**
 * Main function
 */
function main() {
  console.log("🚀 Generating Claude Code documentation...");
  console.log(`   Source: ${CLAUDE_DIR}`);

  ensureDir(DATA_DIR);
  ensureDir(OUTPUT_CLAUDE_DIR);

  const claudemds = generateClaudemdDocs();
  const commands = generateCommandsDocs();
  const skills = generateSkillsDocs();
  const agents = generateAgentsDocs();

  generateClaudeIndex(claudemds, commands, skills, agents);
  generateClaudeSidebar(claudemds, commands, skills, agents);

  console.log(`\n✅ Generated documentation:`);
  console.log(`   - ${claudemds.length} CLAUDE.md files`);
  console.log(`   - ${commands.length} commands`);
  console.log(`   - ${skills.length} skills`);
  console.log(`   - ${agents.length} agents`);
}

main();
