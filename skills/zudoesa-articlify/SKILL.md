---
name: zudoesa-articlify
description: "Convert conversation context into an esa article via the zudoesa-writer subagent. ONLY invoke when the user explicitly asks — NEVER proactively propose. Triggers: 'write esa article', 'esa記事', 'esaに書いて', 'articlify for esa', or /zudoesa-articlify. Gathers context, creates a writing brief, delegates to the writer subagent."
---

# Articlify for esa

Convert the current conversation into an esa article by crafting a detailed writing brief and delegating to the `zudoesa-writer` subagent.

## Argument: `--conversation`

When `$ARGUMENTS` contains `--conversation`, the article must preserve the actual
conversation as-is. This means:

- **NEVER summarize the conversation.** Reproduce the actual dialogue flow faithfully.
- **Keep casual utterances.** Words like 「なるほど」「ふーん」「どう思う？」「OK」

  「hum...」are meaningful conversational texture — they make the article sound
  natural and human. Removing them makes it look AI-auto-written.

- **Minimal rewriting only.** Typo fixes and light formatting are OK. Do NOT

  restructure, condense, or rephrase the user's words beyond that.

- **PRESERVE THE ORIGINAL LANGUAGE. DO NOT TRANSLATE.** This is critical. If the

  conversation was in English, keep it in English. If it was in Japanese, keep it
  in Japanese. If it was mixed, keep both languages as-is. Translating the
  conversation to Japanese destroys the original text — it is a total loss of the
  source material the user wanted to preserve. The whole point of `--conversation`
  is to capture the raw dialogue, and translation defeats that purpose. The
  surrounding frontmatter `title` and any minimal scaffolding headings MAY be in
  Japanese, but the conversation body itself must remain in its original language.

- **Include the brief in the writing prompt** with explicit instruction:

  "This is a conversation-style article with `--conversation` mode. Preserve the
  dialogue verbatim IN THE ORIGINAL LANGUAGE. Only fix typos and apply vocabulary
  rules. Do NOT summarize, restructure, or translate. If the conversation is in
  English, the article body must remain in English."

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

### Step 1.5: Handle images (if any)

If images were provided in the conversation (attached screenshots, diagrams, etc.):

1. **Determine the article slug** from the topic (e.g., `20260209-package-json-organization`)
2. **Create the image directory** in the esa repo:

   ```
   mkdir -p $HOME/repos/w/esa/doc/public/img/articles/YYYYMMDD-slug/
   ```

3. **Copy each image** to that directory with a descriptive filename:

   ```
   cp /path/to/source/image.png $HOME/repos/w/esa/doc/public/img/articles/YYYYMMDD-slug/descriptive-name.png
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

The brief should be written so that someone with zero context could write the full article from it alone.

### Step 3: Delegate to subagent

Use the Agent tool to spawn the `zudoesa-writer` subagent with `run_in_background: true` so the user is not blocked during writing:

```
Agent tool:
  subagent_type: zudoesa-writer
  run_in_background: true
  prompt: [the detailed writing brief from Step 2]
```

The subagent will:

- Read the repo's writing style guides
- Write the article following esa conventions (in Japanese by default, but preserving the original language when `--conversation` is specified)
- Set `sidebar_position` using the formula `999999999999 - YYYYMMDDHHMM` (ensures newest articles appear first)
- Save to the articles directory
- Run formatting checks

### Step 4: Verify sidebar_position

After the subagent completes, read the created article file and verify that:

- `sidebar_position` is present in the frontmatter
- The value follows the formula `999999999999 - YYYYMMDDHHMM`

If `sidebar_position` is missing or incorrect, fix it directly. This is critical — without it, the article appears at the bottom of the sidebar instead of the top.

### Step 5: Report back

After the subagent completes, report:

- The file path of the created article
- A brief summary of what was written

## Important Notes

- The writing brief is the ONLY context the subagent receives - make it thorough
- Include actual code snippets, error messages, and command outputs in the brief
- If the conversation involved multiple topics, ask the user which one to articlify
- **Images must be copied BEFORE delegating** - the subagent cannot see conversation images
- Include the full markdown image reference paths in the brief so the subagent can embed them
- $ARGUMENTS can provide additional guidance on focus or angle
