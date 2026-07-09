# Referring to plan items in GitHub text — avoid accidental `#N` autolinks

Shared convention for every GitHub-posted artifact these workflows produce: epic / sub issue bodies, PR descriptions, progress + report comments, and plan logs that get posted as comments. Linked from `/big-plan`, `/x-as-pr`, and `/x-wt-teams`.

## The trap

GitHub renders a bare `#N` in any issue body, PR description, or comment as a **link to issue/PR number N** in that repo. That is exactly what you want when you mean a real tracked issue — but wrong when `#N` is only how you numbered your *own* content.

A plan commonly lists its topics, then refers back to them:

> 本トピックは以下2点を扱う。
>
> 1. **よくあるご質問セクションの新設** — …
> 2. **FAQPage構造化データの実装** — …
>
> - **FAQセクション（#1）**: 回答本文が必要 …
> - **FAQPage構造化データ（#2）**: `Question` + `acceptedAnswer.text` が必須 …

Posted to GitHub, `（#1）` and `（#2）` become links to issues/PRs #1 and #2 — unrelated, usually ancient, and confusing. The reader clicks expecting "the first topic" and lands somewhere random.

## The rule

When writing text destined for GitHub, refer to your **own in-document items without the `#`**. All of these read cleanly and never autolink:

- `item 1`, `(1)`, `1.` / `2.`
- `topic 1` / `topic A`, `the first sub-task`, or the item's own title (`the FAQ-section topic`)
- `Wave 2`, `Phase 3`, `Step 4`, `option 2`
- Japanese: `項目1`, `上記1.`, `(1)` — not `#1`

Prefer the item's **name** over its number when practical (`the FAQPage-structured-data topic`) — it survives reordering and needs no cross-reference at all.

## Keep genuine references as `#N`

A `#N` that points at a **real, existing issue or PR** is a correct autolink — keep it verbatim:

- `Depends on: #1493, #1494`
- `Supersedes: #2599`
- `Wave 1 (parallel): #1501, #1502, #1503` (the real created sub-issue numbers)

The distinction is simple: a **positional reference to something inside your own document** drops the `#`; a **reference to a tracked issue/PR by its real number** keeps it.
