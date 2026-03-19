import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CLAUDE_DIR = resolve(ROOT, "..");

const { getWatchDirs } = await import("../watch-dirs.js");

describe("getWatchDirs", () => {
  const dirs = getWatchDirs(ROOT);

  it("includes doc/src/", () => {
    assert.ok(
      dirs.includes(join(ROOT, "src")),
      `Expected dirs to include ${join(ROOT, "src")}`,
    );
  });

  it("would include doc/public/ if it exists", () => {
    const publicDir = join(ROOT, "public");
    if (existsSync(publicDir)) {
      assert.ok(dirs.includes(publicDir));
    } else {
      // public/ doesn't exist in this project — correctly excluded
      assert.ok(!dirs.includes(publicDir));
    }
  });

  it("includes ~/.claude/ root (for CLAUDE.md changes)", () => {
    assert.ok(
      dirs.some((d) => d === CLAUDE_DIR),
      `Expected dirs to include ${CLAUDE_DIR}, got: ${dirs.join(", ")}`,
    );
  });

  it("includes ~/.claude/commands/", () => {
    const commandsDir = join(CLAUDE_DIR, "commands");
    assert.ok(
      dirs.includes(commandsDir),
      `Expected dirs to include ${commandsDir}`,
    );
  });

  it("includes ~/.claude/skills/", () => {
    const skillsDir = join(CLAUDE_DIR, "skills");
    assert.ok(
      dirs.includes(skillsDir),
      `Expected dirs to include ${skillsDir}`,
    );
  });

  it("includes ~/.claude/agents/", () => {
    const agentsDir = join(CLAUDE_DIR, "agents");
    assert.ok(
      dirs.includes(agentsDir),
      `Expected dirs to include ${agentsDir}`,
    );
  });

  it("only includes directories that exist on disk", () => {
    for (const dir of dirs) {
      assert.ok(existsSync(dir), `Directory ${dir} does not exist`);
    }
  });
});
