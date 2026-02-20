---
name: zpaper-articlify
description: >
  Convert conversation context into a zpaper blog article by delegating to the zpaper-writer
  subagent. Use when: (1) User wants to write a zpaper blog article based on what was discussed, (2)
  User says 'write zpaper article', 'zpaper記事', 'zpaperに書いて', 'articlify for zpaper'. This skill
  gathers context from the conversation, creates a detailed writing brief, and delegates to the
  writer subagent.
---

# Articlify for zpaper

Convert the current conversation into a zpaper blog article by crafting a detailed writing brief and delegating to the `zpaper-writer` subagent.

## Workflow

### Step 1: Gather context from conversation

Review the conversation history and identify:
- What topic was discussed
- What was tried (approaches A, B, C...)
- What worked and what didn't
- Key technical details, code snippets, commands
- The conclusion or final approach taken
- Any opinions or insights expressed
- **Images**: Any images attached to the conversation (screenshots, diagrams, etc.)

### Step 1.3: Purge confidential information

Before crafting the writing brief, scan the gathered context for client-identifying information:

- Replace client/company names with generic placeholders (`acme-corp`, `some-client`)
- Anonymize project-specific file names and variable names (`some-project`, `SomeComponent`)
- Remove internal URLs and staging URLs
- Remove client-specific internal tool names

**Exception**: Takazudo's personal projects and Takazudo Modular are public — keep them as-is.

### Step 1.5: Handle images (if any)

If images were provided in the conversation (attached screenshots, diagrams, etc.):

1. **Determine the article slug** from the topic (e.g., `20260209-package-json-organization`)
2. **Create the image directory** in the zpaper repo:
   ```
   mkdir -p $HOME/repos/w/zpaper/doc/static/img/articles/YYYYMMDD-slug/
   ```
3. **Copy each image** to that directory with a descriptive filename:
   ```
   cp /path/to/source/image.png $HOME/repos/w/zpaper/doc/static/img/articles/YYYYMMDD-slug/descriptive-name.png
   ```
4. **Record the image paths** for the writing brief. The markdown reference format is:
   ```
   ![alt text](/img/articles/YYYYMMDD-slug/descriptive-name.png)
   ```

### Step 2: Craft the writing brief

Create a **detailed, self-contained prompt** that the writer subagent can use without any conversation context. The brief must include:

1. **Article topic**: Clear one-line description
2. **Background**: Why this was done, what motivated it
3. **Story arc**: The journey (tried X, it failed because Y, then tried Z which worked)
4. **Technical details**: Specific code, commands, configurations, error messages
5. **Key points to cover**: Bullet list of must-include content
6. **Images**: If images were copied in Step 1.5, list each with its markdown path and a description of what it shows and where it should be placed in the article
7. **Conclusion**: What was the outcome, what was learned
8. **Tone guidance**: Any specific angle or framing (if applicable)
9. **Suggested tags**: Suggest tag IDs from the tag list (the writer will read the tags doc). Suggest at most 7 tags — prefer broader tags over overly specific ones. See the tag selection rules in `doc/docs/overview/tags.md`.

The brief must not contain any client-identifying information. All confidential details should have been purged in Step 1.3.

The brief should be written so that someone with zero context could write the full article from it alone.

### Step 3: Delegate to subagent

Use the Task tool to spawn the `zpaper-writer` subagent:

```
Task tool:
  subagent_type: zpaper-writer
  prompt: [the detailed writing brief from Step 2]
```

The subagent will:
- Read the repo's writing style guides
- Write the draft article in Japanese following zpaper conventions
- Set `sidebar_position` using the formula `999999999999 - YYYYMMDDHHMM` (ensures newest articles appear first)
- Save to the draft articles directory (`doc/docs/articles/`)
- Run formatting checks
- Report the file path

### Step 4: Report back

After the subagent completes, report:
- The file path of the created draft article
- A brief summary of what was written
- Remind the user to run `/convert-to-article` when ready to publish to the blog

## Important Notes

- The writing brief is the ONLY context the subagent receives - make it thorough
- Include actual code snippets, error messages, and command outputs in the brief
- If the conversation involved multiple topics, ask the user which one to articlify
- **Images must be copied BEFORE delegating** - the subagent cannot see conversation images
- Include the full markdown image reference paths in the brief so the subagent can embed them
- $ARGUMENTS can provide additional guidance on focus or angle
- The subagent writes a **draft** in Docusaurus format — the conversion to blog MDX is a separate step via `/convert-to-article`
