---
name: w-update-wording-rule
description: >-
  Add or update wording rules (表記ルール) in the w repo's vocabulary-rule.md files. Use when: (1) User
  says 'add wording rule', 'update wording rule', '表記ルール追加', (2) User wants to add a new
  kanji/hiragana usage rule, (3) User provides a rule like 'X should be Y' with examples. Takes the
  rule description as argument.
user-invocable: true
argument-hint: rule description (e.g., ふうに should be 風に)
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
---

# Update Wording Rule

Add a new wording rule to all 4 `vocabulary-rule.md` files in the w repo.

## Target Files

All 4 files must be updated identically:

- `$HOME/repos/w/cg/doc/docs/overview/vocabulary-rule.md`
- `$HOME/repos/w/esa/doc/docs/overview/vocabulary-rule.md`
- `$HOME/repos/w/message/doc/docs/overview/vocabulary-rule.md`
- `$HOME/repos/w/zpaper/doc/docs/overview/vocabulary-rule.md`

## Process

1. Read the argument to understand the new rule. Expect format like:
   ```
   ふうに should be 風に

   そういうふうに → そういう風に
   そういうふうな → そういう風な
   ```
   The first line is the rule summary. Following lines are examples.

2. Read one of the target files to understand current structure and the last rule entry.

3. Compose a new rule section matching the existing format. Each rule section has:
- `### ` heading with the word pair (e.g., `### 「ふうに」と「風に」`)
- One-sentence explanation of when to use which form
- Markdown code block with `<!-- ✅ Good -->` and `<!-- ❌ Bad -->` examples
- `**判断基準:**` section with bullet points summarizing the decision criteria

4. Append the new section to the end of each target file. Use the Edit tool on all 4 files.

5. Report what was added.

## Example Output Section

For a rule "ふうに should be 風に":

```markdown

### 「風に」と「ふうに」

「風に」「風な」と漢字で表記する。「ふうに」「ふうな」とひらがなで書かない。

\`\`\`markdown
<!-- ✅ Good -->

そういう風に考えると、別の方法が良いかもしれません。
そういう風な書き方をする場合は注意が必要です。

<!-- ❌ Bad -->

そういうふうに考えると、別の方法が良いかもしれません。
そういうふうな書き方をする場合は注意が必要です。
\`\`\`

**判断基準:**

- 「〜風に」「〜風な」「〜風だ」→ 漢字「風」を使用
```

## Important

- Keep the same Docusaurus frontmatter and existing content intact
- The new rule is appended at the end of the file
- All 4 files must have identical content after the update
- Write the explanation and examples in Japanese
- If the user provides examples, use them. If not, generate appropriate ones
