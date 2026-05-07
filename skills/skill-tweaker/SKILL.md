---
name: skill-tweaker
description: "Fix, improve, or update existing Claude Code skills. Use when: (1) User reports a skill isn't working or triggering incorrectly, (2) User wants to adjust skill behavior, (3) User says 'fix skill', 'update skill', 'tweak skill', 'skill not working', 'skill triggers too often'. Edits SKILL.md frontmatter and body, scripts/references/assets, debugs trigger issues."
---

# Tweak Existing Skill

## Workflow

### Step 1: Identify the skill

Find skills at:

- `$HOME/.claude/skills/<name>/SKILL.md` (personal)
- `.claude/skills/<name>/SKILL.md` (project)

**Case-sensitivity check (IMPORTANT for macOS):** The skill file may be named `SKILL.md` (uppercase) or `skill.md` (lowercase). On case-insensitive filesystems (macOS), both resolve to the same file on disk, but git tracks them as separate entries. Before editing:

1. Check the actual filename in git: `git ls-files --stage '<skill-dir>/'`
2. If both `SKILL.md` and `skill.md` exist in the git index, remove the duplicate: `git rm --cached '<path>/SKILL.md'` (keep the one matching the project convention)
3. Always use the exact filename that exists in git when editing

Read the skill file and any referenced files (scripts/, references/, assets/).

### Step 2: Diagnose the issue

Common problems and fixes:

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Skill not triggering | Poor `description` | Rewrite with clear trigger keywords and scenarios. Claude tends to *undertrigger* — make the description slightly pushy (e.g. "Make sure to use this skill whenever the user mentions X, Y, or Z, even if they don't explicitly ask for it") |
| Skill triggers too often | Description too broad | Make description more specific; add `disable-model-invocation: true` for manual-only |
| Skill not visible | Exceeds character budget | Run `/context` to check; shorten description or increase `SLASH_COMMAND_TOOL_CHAR_BUDGET` |
| Wrong agent used in fork | `agent:` field incorrect | Change to correct agent name |
| Forked skill lacks context | Missing instructions | Skill content IS the prompt in fork mode - make it self-contained |
| Script fails | Bug or environment issue | Read and test the script |

### Step 3: Apply changes

**Inserting a new step into a numbered step list:** When a skill is structured as `Step 1`, `Step 2`, `Step 3`, ... and you need to add a new step between existing ones, **renumber the steps** so the sequence stays contiguous. Do NOT introduce fractional numbers like "Step 2.5", and do NOT insert "Step 0" at the start. Examples:

- Inserting between Step 2 and Step 3: the old Step 3 becomes Step 4, old Step 4 becomes Step 5, and so on. Update every reference to those numbers (body text, TODO checklists, cross-references, "proceed to Step N" wording).
- Inserting before Step 1: shift everything up by one — the new step becomes Step 1, old Step 1 becomes Step 2, etc.

After renumbering, grep the skill file for stale references (e.g., "Step 3" where you now mean "Step 4") and fix them. Also check any sibling files (scripts, references) that mention step numbers.

**Frontmatter fields reference:**

| Field | Description |
|-------|-------------|
| `name` | Skill name (lowercase, hyphens, max 64 chars) |
| `description` | What it does + when to use. Primary trigger mechanism |
| `disable-model-invocation` | `true` = manual only via `/skill-name` |
| `user-invocable` | `false` = hidden from `/` menu, Claude can still auto-invoke |
| `argument-hint` | Hint in autocomplete (e.g., `[filename]`) |
| `allowed-tools` | Tools allowed without permission when active |
| `model` | Model override when active |
| `context` | `fork` = run in isolated subagent context |
| `agent` | Agent type for fork: `Explore`, `Plan`, `general-purpose`, or custom agent name |
| `hooks` | Lifecycle hooks |

**Substitution variables:** `$ARGUMENTS`, `$0`, `$1`, `${CLAUDE_SESSION_ID}`

**Dynamic injection:** Use the exclamation-backtick pattern (e.g. exclamation + backtick-wrapped command) to run shell commands before skill content is sent to Claude.

**Writing principles when rewriting body content:**

- **Yellow flag: heavy-handed MUSTs.** All-caps "ALWAYS" / "NEVER" / "MUST" piled across the skill is usually a sign of overfitting. When you see this, try reframing with a one-sentence explanation of *why* the rule matters — modern models follow reasoning more reliably than rigid imperatives, and the prompt gets shorter.
- **Don't overfit to the one example that broke.** If the user reports the skill failed on a specific case, fix the underlying pattern rather than adding a special-case rule that only helps that one input.
- **Cut instructions that aren't pulling their weight.** If you can read the skill and not lose anything by deleting a sentence, delete it.

### Step 4: Format SKILL.md

Format the edited SKILL.md file using the mdx-formatter to ensure consistent markdown formatting:

```bash
pnpm dlx @takazudo/mdx-formatter --write <path-to-SKILL.md>
```

### Step 5: Path safety check

Scan the skill's SKILL.md and all referenced scripts/files for `~/` in file paths. Replace with `$HOME/`.

**Why:** `~` is a shell expansion feature. It is NOT expanded by Node.js `fs` operations, Python `open()`, or non-login shell contexts. Using `~/` in these contexts creates a literal directory named `~` inside the working directory instead of resolving to the user's home directory. This has caused real bugs where a `~/` directory was accidentally created inside a repo.

**What to check:**

- Any hardcoded path like `~/foo/bar` in scripts or skill instructions
- Shell commands wrapped in backtick injection that might be passed to Node.js
- File paths in references or asset configurations

**Replace with:** `$HOME/foo/bar` (expanded by both shell and most runtimes)

### Step 6: Verify

After editing:

1. YAML frontmatter parses without errors
2. Description matches intended trigger scenarios
3. Referenced files (scripts, references) exist and are correct
4. For forked skills: content is self-contained (no conversation history available)
5. SKILL.md body stays under 500 lines
6. No `~/` paths in file operations -- use `$HOME/` instead (see Step 5)

## Progressive Disclosure Reminder

If SKILL.md is getting too long (approaching 500 lines):

- Move detailed content to `references/` files
- Keep only core workflow and navigation in SKILL.md
- Reference split files clearly: "See [filename](references/filename.md) for details"
