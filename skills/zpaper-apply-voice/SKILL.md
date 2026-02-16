---
name: zpaper-apply-voice
description: >
  Apply Takazudo's zpaper blog writing voice and vocabulary rules to text. Use when: (1) User wants
  to write or rewrite text in Takazudo's zpaper blog style, (2) User says 'apply voice', 'zpaper
  voice', 'zpaper文体で', 'zpaper風に書いて', 'ブログ文体を適用', (3) User provides text and wants it transformed to
  match the zpaper blog writing style. Reads the writing-style.md and vocabulary-rule.md from the
  zpaper repo and applies those rules to the given text.
---

# Apply zpaper Voice

Apply Takazudo's **zpaper** blog writing voice and vocabulary rules to incoming text.

## Voice Character Summary

The zpaper voice is a **personal blog/memo style**. Like sharing personal notes publicly — direct, relaxed, not overly polite. Fragment sentences are fine. The stance is "sharing" not "teaching".

Key traits:
- **Casual directness** — no roundabout preambles, get to the point
- **Personal blog tone** — not customer-facing, not formal, not slangy
- **Self-reference**: 「自分」or「Takazudo」. **Never**「筆者」(too formal)
- **Sentence endings**: 〜なので、それ。/ 〜わけで / 〜という感じ / 〜かなと / 〜良さそう / 〜的な / 〜の模様
- **Calm tone** — casual but not emotionally dramatic or slangy
- **Hedging via understatement**: 〜の模様 / 〜良さそう / 〜かなと
- **Avoid**: 〜でございます / 〜させていただきます / 〜いただければ幸いです / 〜を説明する / 〜を解説する / overly polite language / stiff literary style
- **Never invent emotions** — no `〜と感じた`, `〜に感動した`, `〜が嬉しかった` unless user explicitly states them

## When to Use

- User provides text and wants it written/rewritten in Takazudo's **zpaper** blog voice
- User says "zpaper voice", "zpaper文体で", "zpaper風に書いて", "ブログ文体で" etc.
- User wants to check or fix text to conform to the zpaper blog writing style

## Workflow

### Step 1: Read the rule files

**Always** read both rule files fresh at invocation time:

1. `$HOME/repos/w/zpaper/doc/docs/overview/writing-style.md`
2. `$HOME/repos/w/zpaper/doc/docs/overview/vocabulary-rule.md`

These files are the authoritative source of truth. Read them every time to pick up any updates.

### Step 2: Identify the input text

The input text comes from one of:
- Text provided directly in the conversation (before or after the skill invocation)
- $ARGUMENTS passed with the command
- A file path the user points to

If no text is obvious, ask the user what text they want the voice applied to.

### Step 3: Apply the rules

Transform or review the text using the voice character described above and the full details in the rule files. The rule files are the authority — the summary above is just for quick reference.

### Step 4: Output the result

Output the transformed text. If the input was already close to the style, note what minor adjustments were made.

If reviewing existing text (rather than transforming), point out specific violations and suggest fixes.

## Important Notes

- This skill transforms **text style/voice** only — it does not change the content or meaning
- The skill works on Japanese text. If English text is provided, translate to Japanese in the zpaper voice
- If $ARGUMENTS contains text, treat that as the input text to transform
- When in doubt about a style choice, refer back to the rule files — they are the authority
- The rules may be updated over time, which is why we re-read them every invocation
