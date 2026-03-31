import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { escapeForMdx } from "./escape-for-mdx";

export interface ClaudeResourcesConfig {
  claudeDir: string;
  projectRoot?: string;
  docsDir: string;
}

interface ClaudeMdItem {
  displayPath: string;
  slug: string;
  relPath: string;
}

interface CommandItem {
  name: string;
  description: string;
}

interface SkillReference {
  name: string;
  title: string;
  content: string;
}

interface SkillItem {
  name: string;
  dir: string;
  description: string;
  references: SkillReference[];
}

interface AgentItem {
  name: string;
  file: string;
  description: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function parseFrontmatter(content: string) {
  try {
    return matter(content);
  } catch {
    return null;
  }
}

function escapeTitle(s: string): string {
  return s.replace(/"/g, '\\"');
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
}

function writeCategoryFiles(
  outputDir: string,
  label: string,
  position: number,
  description: string,
  categorySlug: string,
) {
  ensureDir(outputDir);
  const meta: Record<string, unknown> = { label, position, description };
  fs.writeFileSync(
    path.join(outputDir, "_category_.json"),
    JSON.stringify(meta, null, 2) + "\n",
  );
  const index = `---
title: "${label}"
description: "${description}"
sidebar_position: 0
generated: true
---

<CategoryNav category="${categorySlug}" />
`;
  fs.writeFileSync(path.join(outputDir, "index.mdx"), index);
}

// ---------------------------------------------------------------------------
// CLAUDE.md discovery
// ---------------------------------------------------------------------------

function findClaudeMdFiles(dir: string, excludeDirs: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const item of fs.readdirSync(dir)) {
    if (item === "node_modules") continue;
    const itemPath = path.join(dir, item);
    if (excludeDirs.some((d) => itemPath.startsWith(d))) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(itemPath);
    } catch {
      continue; // broken symlinks
    }
    if (stat.isDirectory()) {
      results.push(...findClaudeMdFiles(itemPath, excludeDirs));
    } else if (item === "CLAUDE.md") {
      results.push(itemPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// CLAUDE.md generation
// ---------------------------------------------------------------------------

function generateClaudemdDocs(
  config: ClaudeResourcesConfig,
): ClaudeMdItem[] {
  const projectRoot = config.projectRoot ?? path.dirname(config.claudeDir);
  const outputDir = path.join(config.docsDir, "claude-md");

  cleanDir(outputDir);

  const excludeDirs = [
    path.join(projectRoot, ".git"),
    path.join(projectRoot, "node_modules"),
    path.join(projectRoot, "worktrees"),
    path.join(config.docsDir),
  ];

  writeCategoryFiles(outputDir, "CLAUDE.md", 900, "Project-specific instructions", "claude-md");

  const files = findClaudeMdFiles(projectRoot, excludeDirs);
  if (files.length === 0) return [];

  const items: ClaudeMdItem[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const relPath = path.relative(projectRoot, filePath);
    const displayPath = `/${relPath}`;
    const dirPart = path.dirname(relPath);
    const slug = dirPart === "." ? "root" : dirPart.replace(/\//g, "--");

    items.push({ displayPath, slug, relPath });

    const pos = items.length + 1;
    const mdx = `---
title: "${escapeTitle(displayPath)}"
description: "CLAUDE.md at ${escapeTitle(displayPath)}"
sidebar_position: ${pos}
sidebar_label: "${escapeTitle(relPath)}"
generated: true
---

**Path:** \`${relPath}\`

${escapeForMdx(content.trim())}
`;
    fs.writeFileSync(path.join(outputDir, `${slug}.mdx`), mdx);
  }

  // Sort: root first, then alphabetically
  items.sort((a, b) => {
    if (a.slug === "root") return -1;
    if (b.slug === "root") return 1;
    return a.displayPath.localeCompare(b.displayPath);
  });

  return items;
}

// ---------------------------------------------------------------------------
// Commands generation
// ---------------------------------------------------------------------------

function generateCommandsDocs(config: ClaudeResourcesConfig): CommandItem[] {
  const commandsDir = path.join(config.claudeDir, "commands");
  const outputDir = path.join(config.docsDir, "claude-commands");

  cleanDir(outputDir);
  writeCategoryFiles(outputDir, "Commands", 901, "Custom slash commands", "claude-commands");

  if (!fs.existsSync(commandsDir)) return [];

  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return [];

  const items: CommandItem[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(commandsDir, file), "utf8");
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const name = file.replace(/\.md$/, "");
    const description = (parsed.data.description as string) || "";

    items.push({ name, description });

    const mdx = `---
title: "${escapeTitle(name)}"
description: "${escapeTitle(description)}"
sidebar_label: "${escapeTitle(name)}"
generated: true
---

${escapeForMdx(parsed.content.trim())}
`;
    fs.writeFileSync(path.join(outputDir, `${name}.mdx`), mdx);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  return items;
}

// ---------------------------------------------------------------------------
// Skills generation
// ---------------------------------------------------------------------------

type TreeEntry =
  | { isDir: false; name: string }
  | { isDir: true; name: string; children: string[] };

function getSkillFileTree(
  skillDir: string,
  subDirs: { name: string; files: string[] }[],
): string {
  const lines: string[] = [`${skillDir}/`];
  const entries: TreeEntry[] = [{ isDir: false, name: "SKILL.md" }];

  for (const sub of subDirs) {
    entries.push({ isDir: true, name: sub.name, children: sub.files });
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const prefix = isLast ? "└── " : "├── ";

    if (!entry.isDir) {
      lines.push(`${prefix}${entry.name}`);
    } else {
      lines.push(`${prefix}${entry.name}/`);
      for (let j = 0; j < entry.children.length; j++) {
        const child = entry.children[j];
        const childIsLast = j === entry.children.length - 1;
        const continuation = isLast ? "    " : "│   ";
        const childPrefix = childIsLast ? "└── " : "├── ";
        lines.push(`${continuation}${childPrefix}${child}`);
      }
    }
  }

  return lines.join("\n");
}

function getScriptDescription(filePath: string): string {
  try {
    const topLines = fs.readFileSync(filePath, "utf8").split("\n", 2);
    // Skip shebang, use second line if available
    const commentLine = topLines[0].startsWith("#!")
      ? topLines[1] || ""
      : topLines[0];
    // Match # comments (shell/python) or // comments (JS/TS)
    const match = commentLine.match(/^(?:#|\/\/)\s*(.+)/);
    return match ? ` — ${match[1]}` : "";
  } catch {
    return "";
  }
}

function getSkillReferences(
  skillsDir: string,
  skillDir: string,
): SkillReference[] {
  const refsDir = path.join(skillsDir, skillDir, "references");
  if (!fs.existsSync(refsDir)) return [];

  return fs
    .readdirSync(refsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = fs.readFileSync(path.join(refsDir, f), "utf8");
      const name = f.replace(/\.md$/, "");
      const h1Match = content.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1] : name;
      return { name, title, content };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function generateSkillsDocs(config: ClaudeResourcesConfig): SkillItem[] {
  const skillsDir = path.join(config.claudeDir, "skills");
  const outputDir = path.join(config.docsDir, "claude-skills");

  cleanDir(outputDir);
  writeCategoryFiles(outputDir, "Skills", 902, "Skill packages", "claude-skills");

  if (!fs.existsSync(skillsDir)) return [];

  const dirs = fs.readdirSync(skillsDir).filter((d) => {
    const skillPath = path.join(skillsDir, d);
    try {
      return (
        fs.statSync(skillPath).isDirectory() &&
        fs.existsSync(path.join(skillPath, "SKILL.md"))
      );
    } catch {
      return false; // broken symlinks
    }
  });

  if (dirs.length === 0) return [];

  const items: SkillItem[] = [];

  for (const dir of dirs) {
    const content = fs.readFileSync(
      path.join(skillsDir, dir, "SKILL.md"),
      "utf8",
    );
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const name = (parsed.data.name as string) || dir;
    const description = (parsed.data.description as string) || "";
    const references = getSkillReferences(skillsDir, dir);

    items.push({ name, dir, description, references });

    const scriptFiles = listFiles(path.join(skillsDir, dir, "scripts"));
    const assetFiles = listFiles(path.join(skillsDir, dir, "assets"));
    const refFiles = references.map((r) => `${r.name}.md`);

    // Collect non-empty subdirectories for tree display
    const subDirs: { name: string; files: string[] }[] = [];
    if (scriptFiles.length > 0) subDirs.push({ name: "scripts", files: scriptFiles });
    if (refFiles.length > 0) subDirs.push({ name: "references", files: refFiles });
    if (assetFiles.length > 0) subDirs.push({ name: "assets", files: assetFiles });

    // File tree + links to renderable .md sub-files
    let fileStructureSection = "";
    if (subDirs.length > 0) {
      const tree = `\`\`\`\n${getSkillFileTree(dir, subDirs)}\n\`\`\``;

      // Collect links to all .md sub-files that get pages
      // Links use ./<subpage> which resolves correctly from the skill page URL
      // (the page URL already includes the dir, e.g. /docs/claude-skills/<dir>/)
      const links: string[] = [];
      for (const ref of references) {
        links.push(`- [references/${ref.name}.md](./ref-${ref.name})`);
      }
      for (const f of scriptFiles.filter((s) => s.endsWith(".md"))) {
        const slug = f.replace(/\.md$/, "");
        links.push(`- [scripts/${f}](./script-${slug})`);
      }
      for (const f of assetFiles.filter((a) => a.endsWith(".md"))) {
        const slug = f.replace(/\.md$/, "");
        links.push(`- [assets/${f}](./asset-${slug})`);
      }

      const linkList = links.length > 0 ? `\n\n${links.join("\n")}` : "";
      fileStructureSection = `## File Structure\n\n${tree}${linkList}`;
    }

    const shortDesc = description.length > 200
      ? description.substring(0, 200) + "..."
      : description;

    const body = [
      fileStructureSection,
      escapeForMdx(parsed.content.trim()),
    ]
      .filter(Boolean)
      .join("\n\n");

    const mdx = `---
title: "${escapeTitle(name)}"
description: "${escapeTitle(shortDesc)}"
sidebar_label: "${escapeTitle(name)}"
generated: true
---

${body}`;

    // Write skill page as flat file
    fs.writeFileSync(path.join(outputDir, `${dir}.mdx`), mdx);

    // Generate unlisted sub-pages (flat files with custom slug for nested breadcrumbs)
    // File: <dir>--ref-<name>.mdx, slug: claude-skills/<dir>/ref-<name>
    const skillSlugBase = `claude-skills/${dir}`;

    for (const ref of references) {
      const subSlug = `${skillSlugBase}/ref-${ref.name}`;
      const refMdx = `---
title: "${escapeTitle(ref.title)}"
slug: "${subSlug}"
unlisted: true
generated: true
---

${escapeForMdx(ref.content.trim())}
`;
      fs.writeFileSync(path.join(outputDir, `${dir}--ref-${ref.name}.mdx`), refMdx);
    }

    for (const f of scriptFiles.filter((s) => s.endsWith(".md"))) {
      const slug = f.replace(/\.md$/, "");
      const subSlug = `${skillSlugBase}/script-${slug}`;
      const raw = fs.readFileSync(
        path.join(skillsDir, dir, "scripts", f),
        "utf8",
      );
      const h1Match = raw.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1] : slug;
      fs.writeFileSync(
        path.join(outputDir, `${dir}--script-${slug}.mdx`),
        `---\ntitle: "${escapeTitle(title)}"\nslug: "${subSlug}"\nunlisted: true\ngenerated: true\n---\n\n${escapeForMdx(raw.trim())}\n`,
      );
    }

    for (const f of assetFiles.filter((a) => a.endsWith(".md"))) {
      const slug = f.replace(/\.md$/, "");
      const subSlug = `${skillSlugBase}/asset-${slug}`;
      const raw = fs.readFileSync(
        path.join(skillsDir, dir, "assets", f),
        "utf8",
      );
      const h1Match = raw.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1] : slug;
      fs.writeFileSync(
        path.join(outputDir, `${dir}--asset-${slug}.mdx`),
        `---\ntitle: "${escapeTitle(title)}"\nslug: "${subSlug}"\nunlisted: true\ngenerated: true\n---\n\n${escapeForMdx(raw.trim())}\n`,
      );
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  return items;
}

// ---------------------------------------------------------------------------
// Agents generation
// ---------------------------------------------------------------------------

function generateAgentsDocs(config: ClaudeResourcesConfig): AgentItem[] {
  const agentsDir = path.join(config.claudeDir, "agents");
  const outputDir = path.join(config.docsDir, "claude-agents");

  cleanDir(outputDir);
  writeCategoryFiles(outputDir, "Agents", 903, "Custom subagents", "claude-agents");

  if (!fs.existsSync(agentsDir)) return [];

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return [];

  const items: AgentItem[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(agentsDir, file), "utf8");
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const name = (parsed.data.name as string) || file.replace(/\.md$/, "");
    const description = (parsed.data.description as string) || "";
    const model = (parsed.data.model as string) || "";
    const fileSlug = file.replace(/\.md$/, "");

    items.push({ name, file: fileSlug, description, model });

    const modelBadge = model ? `**Model:** \`${model}\`\n` : "";

    const mdx = `---
title: "${escapeTitle(name)}"
description: "${escapeTitle(description)}"
sidebar_label: "${escapeTitle(name)}"
generated: true
---

${modelBadge}
${escapeForMdx(parsed.content.trim())}
`;
    fs.writeFileSync(path.join(outputDir, `${fileSlug}.mdx`), mdx);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function generateClaudeResourcesDocs(config: ClaudeResourcesConfig) {
  const claudemds = generateClaudemdDocs(config);
  const commands = generateCommandsDocs(config);
  const skills = generateSkillsDocs(config);
  const agents = generateAgentsDocs(config);

  // Remove stale directories no longer managed by generators
  for (const stale of ["claude", "getting-started"]) {
    const staleDir = path.join(config.docsDir, stale);
    if (fs.existsSync(staleDir)) {
      fs.rmSync(staleDir, { recursive: true, force: true });
    }
  }

  return {
    claudemd: claudemds.length,
    commands: commands.length,
    skills: skills.length,
    agents: agents.length,
  };
}
