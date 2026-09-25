# Push-Trigger Check — should a `push` workflow have run for this merge commit?

The single documented recipe for answering one question: **a PR just merged into a target branch — was a `push`-triggered workflow supposed to run for the merge commit, and did one?**

`/watch-ci` (Step 2b) and `/prc` (post-merge watch) both need this answer and must give the same one. Read this file before either of them reports anything resembling *"no CI detected on the merge target branch."*

## TL;DR

**"No run exists for the merge commit" is not a result. It is a question.** For a branch that declares a `push` trigger it is the alarm condition — that exact wording was reported twice in `zudolab/zudo-text` while two production deploys were silently suppressed (#137).

The check is four data pulls and one decision:

1. Enumerate workflows **at the merge SHA**.
2. Decide which of them a push of this SHA to this branch *should* have triggered.
3. List the runs that actually exist for that SHA.
4. Classify into **exactly three** outcomes — `EXPECTED_RUN_MISSING`, `BENIGN_NO_TRIGGER`, `INCONCLUSIVE`.

`INCONCLUSIVE` is never benign. If you cannot prove a workflow was *not* supposed to run, you have not cleared the merge.

## Inputs

| Var | Meaning |
|---|---|
| `O` / `R` | owner / repo |
| `SHA` | the **merge commit** SHA on the target branch (`gh pr view <n> --json mergeCommit -q .mergeCommit.oid`) |
| `BR` | the target branch the PR merged into |

---

## Step 1 — Enumerate workflows at the merge SHA

Read the workflow files **at `SHA`, never at the branch tip.** The merge itself may have added, deleted, or re-filtered workflows, and the tip may already have moved on.

```bash
gh api "repos/$O/$R/contents/.github/workflows?ref=$SHA" \
  --jq '.[] | select(.name | test("\\.ya?ml$")) | .path'
```

Then fetch each file's content at the same ref:

```bash
gh api -H 'Accept: application/vnd.github.raw' "repos/$O/$R/contents/$WF_PATH?ref=$SHA"
```

(Use the raw `Accept` header rather than decoding `.content` yourself — the base64 payload arrives newline-wrapped and decodes inconsistently across platforms.)

A `404` on the directory means the repo has no workflows at this commit → `BENIGN_NO_TRIGGER` (reason: *no workflow files*). Any **other** error status is `INCONCLUSIVE`, not benign.

## Step 2 — Read the `push` trigger shape

Three spellings are all valid and all mean "this workflow has a `push` trigger". Handle every one:

| Shape | YAML | Filters |
|---|---|---|
| scalar | `on: push` | **none** — every branch, every path |
| list | `on: [push, pull_request]` | **none** — every branch, every path |
| map | `on:`<br>`  push:`<br>`    branches: [main]` | as declared |

Two map sub-cases that are easy to mis-read:

- `push:` with an **empty/null value** is the unfiltered form — same as scalar. It is *not* "no trigger":

  ```yaml
  on:
    push:
    pull_request:
  ```

- `push:` carrying **only** `tags:` / `tags-ignore:` does **not** match a branch push. Tag filters and branch filters are separate namespaces; a `push` block with only tag filters is irrelevant to a merge into `$BR`.

If the file has no `push` key in `on:` at all — `workflow_dispatch`-only, `schedule`-only, `pull_request`-only — the workflow is out of scope and contributes nothing to the verdict.

> **YAML caution.** A negation pattern must be quoted (`- '!main'`); a bare `!main` is a YAML *tag*, not a string. If your parse of a filter list is ambiguous, that is `INCONCLUSIVE` for that workflow — see Step 6.

## Step 3 — Evaluate the filters

### The two filter axes combine with AND

Branch filters and path filters are independent gates. **Both must admit the commit** for the workflow to trigger. Passing the branch filter tells you nothing about the path filter, and vice versa.

`branches` and `branches-ignore` cannot both appear for the same event (likewise `paths`/`paths-ignore`). If both are present, the workflow is malformed — `INCONCLUSIVE`.

### Patterns are ordered, and later entries override earlier ones

Within a single list, patterns are evaluated **top to bottom**. Each match flips a running verdict; the value after the last pattern wins. A `!negation` that matches after a positive match excludes; a positive that matches after a negation re-includes.

```
def included(patterns, ref):
    verdict = False
    for p in patterns:
        if p.startswith('!'):
            if glob(p[1:], ref): verdict = False
        else:
            if glob(p, ref): verdict = True
    return verdict
```

`branches:` → admit the branch when `included(patterns, BR)` is true.
`branches-ignore:` → run the same loop; admit the branch when the result is **false** (i.e. not ignored).
No branch filter at all → every branch is admitted.

### Glob semantics

| Token | Matches |
|---|---|
| `*` | zero or more characters, **but not `/`** |
| `**` | zero or more of any character, `/` included |
| `?` | exactly one character |
| `+` | one or more of the preceding character |
| `[abc]` / `[a-z]` | one character from the set/range |
| `!` (leading) | negates the pattern (ordered — see above) |

The `*`-does-not-cross-`/` rule is the usual source of a wrong verdict: `releases/*` matches `releases/v1` but **not** `releases/v1/hotfix`; `releases/**` matches both.

### Path filters need the changed-file list — paginated

```bash
gh api --paginate "repos/$O/$R/commits/$SHA" --jq '.files[].filename'
```

**`--paginate` is not optional.** Without it you see page one only, and a large merge silently truncates to a partial file list — which reads as a paths miss and produces a false "benign".

Two caveats:

- For a merge commit this endpoint reports the diff against the **first parent**, which is the right set: it is what the push event delivered to the target branch.
- The commit endpoint caps its `files` array (300 files; `--paginate` walks the pages up to that cap). If the returned count sits at the cap, **you cannot prove a paths miss** → `INCONCLUSIVE`, not benign. For a second opinion, compare against the first parent, which has a higher cap:

  ```bash
  PARENT=$(gh api "repos/$O/$R/commits/$SHA" --jq '.parents[0].sha')
  gh api --paginate "repos/$O/$R/compare/$PARENT...$SHA" --jq '.files[].filename'
  ```

### Applying a path filter

Run the same ordered `included()` loop per file, then:

- `paths:` → the workflow triggers if **at least one** changed file is included.
- `paths-ignore:` → the workflow triggers unless **every** changed file is ignored. One non-ignored file is enough to trigger.

An empty changed-file list (an empty merge commit) satisfies neither `paths:` nor "at least one non-ignored file" — a path-filtered workflow legitimately does not run.

## Step 4 — Check the things that suppress a run repo-wide

```bash
# Actions enabled for the repo at all?
gh api "repos/$O/$R/actions/permissions" --jq '.enabled'

# Per-workflow state: active | disabled_manually | disabled_inactivity | disabled_fork
gh api --paginate "repos/$O/$R/actions/workflows" --jq '.workflows[] | "\(.state)\t\(.path)"'
```

- `enabled: false` → `BENIGN_NO_TRIGGER` (reason: *Actions disabled repo-wide*). Say so explicitly; do not let it read as "no workflows".
- A workflow whose state is any `disabled_*` value is benign **as a disabled workflow**. The report must distinguish **"disabled"** from **"absent"** — they look identical in a run list and mean entirely different things to the reader.
- A workflow file present at `SHA` but missing from this API listing (freshly added in the merge, not yet registered) is **not** proof of anything → `INCONCLUSIVE` for that workflow.

## Step 5 — Find the runs that actually happened

Match on `headSha` **and** `event == "push"`. A `--branch`-only or `--commit`-only query can surface an unrelated commit's run and turn a real miss into a false green.

```bash
gh run list --repo "$O/$R" --all --limit 100 \
  --json name,workflowName,headSha,headBranch,event,status,conclusion,databaseId \
  | jq --arg sha "$SHA" '[.[] | select(.headSha == $sha and .event == "push")]'
```

`--all` is required: without it, runs belonging to **disabled** workflows are hidden, and you will report a disabled workflow as absent.

On a busy repo `--limit 100` can still miss the window. The exact server-side filter is more reliable when the run list is deep:

```bash
gh api --paginate "repos/$O/$R/actions/runs?head_sha=$SHA&event=push" \
  --jq '.workflow_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"'
```

### A cancelled run exists

`conclusion: "cancelled"` — typically a `concurrency:` group superseded by a newer push — is a **run that happened and was cancelled**. That is a cancellation to report, on its own terms. It is never `EXPECTED_RUN_MISSING`, and it is never a pass either. Same for `conclusion: "skipped"`: the run object exists, so the trigger fired; the skip is a job-level or `if:`-level outcome, not a missing trigger.

`status` values that are not yet `completed` (`queued`, `in_progress`, `waiting`, `requested`) mean the run exists and the answer is *not yet* — keep polling, do not classify.

## Step 6 — Classify: three outcomes, never two

| Outcome | When | Report as |
|---|---|---|
| `EXPECTED_RUN_MISSING` | ≥1 workflow passed Steps 2–4 and no matching run from Step 5 exists for it | **failure** |
| `BENIGN_NO_TRIGGER` | no workflow declares a matching `push` trigger, **or** all were excluded by `branches`/`paths` filters, **or** all matching ones are disabled, **or** Actions is disabled repo-wide | benign — **and name which reason** |
| `INCONCLUSIVE` | workflow YAML would not parse, an API call errored, the file list was truncated, or the evaluator cannot decide | **never benign — surface it** |

`INCONCLUSIVE` is a first-class outcome, not a rounding error. Do not collapse it into either neighbour: collapsing it toward benign is exactly the bug this file exists to prevent, and collapsing it toward failure trains the reader to ignore the alarm. Report it as *"could not determine whether CI should have run — <reason>"* and let the caller decide.

`BENIGN_NO_TRIGGER` without a stated reason is not a verdict. *"Benign: `deploy-web.yml` is the only `push: main` workflow and its `paths: tauri-app/**` filter matched none of the 7 changed files"* is a verdict.

### Explanations that are NOT evidence of benign

- **"No required status checks are configured."** Irrelevant. A deploy workflow need not be a required check — in the zudo-text incident the suppressed workflows never were. Branch-protection state says nothing about whether a `push` workflow should have run; do not cite it.
- **Fork-PR restrictions.** These govern workflows on PRs *from* forks. They do not explain a missing post-merge `push` run in the base repo. Never offer this as a cause.
- **"The PR checks were green."** Those are `pull_request` runs on the head SHA. They are a different event on a different commit.

## Step 7 — Likely cause, for `EXPECTED_RUN_MISSING` only

Read the merge commit message and **quote the offending line** in the report:

```bash
gh api "repos/$O/$R/commits/$SHA" --jq '.commit.message'
```

### Cause A — a skip marker in the commit message

Per GitHub's current documentation, a workflow that `on: push` or `on: pull_request` would otherwise trigger is not triggered if the commit message contains any of:

- `[skip ci]`
- `[ci skip]`
- `[no ci]`
- `[skip actions]`
- `[actions skip]`

or, as a trailer at the very end of the message preceded by two empty lines (and last, if other trailers are present):

- `skip-checks:true`
- `skip-checks: true`

Source: <https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs> (verified 2026-08-22).

Four points that decide real cases:

1. **The bracket markers match anywhere in the message — body included, not just the subject.** This is the whole squash hazard: under `squash_merge_commit_message: COMMIT_MESSAGES`, GitHub concatenates every branch commit *subject* into the squash commit *body*, so a marker in a start commit reaches the default branch and suppresses production deploys there. Grep the full message, never just the first line.
2. **Re-check the list against the live docs before trusting it.** The documented set has changed before. Only the seven forms above are documented; other CI systems' spellings (`[skip travis]`, `***NO_CI***`, `[skip azurepipelines]`) are **not** GitHub markers and are not a valid explanation for a missing run.
3. Skip instructions apply to `push` and `pull_request` only — they do not suppress `pull_request_target`, `schedule`, or `workflow_dispatch`.
4. A skipped-by-marker workflow leaves its associated checks **pending**, not skipped. "Pending forever" is a signature of this cause.

### Cause B — the merge was performed by Actions using `GITHUB_TOKEN`

An event created with the repository's `GITHUB_TOKEN` **does not create a new workflow run**. A merge pushed by a workflow (auto-merge bots, release automation, a `gh pr merge` step inside a job) therefore genuinely produces zero follow-on `push` runs, with no marker anywhere in the message. This is a distinct, real cause — name it alongside skip markers, not instead of them.

```bash
gh api "repos/$O/$R/commits/$SHA" --jq '{committer: .committer.login, author: .author.login}'
```

A `committer.login` of `web-flow` is the GitHub UI (normal — runs should fire). A bot login such as `github-actions[bot]` is the signal for this cause. A PAT or GitHub App token used instead of `GITHUB_TOKEN` does *not* suppress runs, so bot-authored is a lead, not a proof.

### Cause C — org / billing / policy

Spending limit reached, an org-level Actions policy, or a self-hosted-runner-only workflow with no runner. `gh api "repos/$O/$R/actions/permissions"` and the run list being empty for *all* workflows (not just one) point here.

---

## Worked examples

### 1 — Scalar `on: push`, no filters → run expected

```yaml
on: push
```

Unfiltered: every branch, every path. Step 3 is a no-op. If Step 5 returns no `push` run for `$SHA`, this is `EXPECTED_RUN_MISSING` with no ambiguity — there is no filter available to explain it away. Go to Step 7.

### 2 — Ordered negation on branches

```yaml
on:
  push:
    branches:
      - 'releases/**'
      - '!releases/**-rc'
      - 'releases/1.0.0-rc'
```

Merging into `releases/2.0.0-rc`: pattern 1 matches → `true`; pattern 2 matches → `false`; pattern 3 does not match → stays `false`. **Not triggered** → benign for this workflow (reason: *branch excluded by ordered negation*).

Merging into `releases/1.0.0-rc`: `true` → `false` → pattern 3 matches → back to `true`. **Triggered.** A missing run here is an alarm. Evaluating this list as an unordered set gets the second case backwards.

### 3 — Paths miss → the most likely false alarm; check it first

```yaml
on:
  push:
    branches: [main]
    paths: ['tauri-app/**']
```

Merge into `main` changing only `docs/readme.md` and `.github/ISSUE_TEMPLATE/bug.md`: branch filter admits, path filter admits nothing → the AND fails → `BENIGN_NO_TRIGGER`, reason *"paths filter `tauri-app/**` matched 0 of 2 changed files"*.

Two ways to get this wrong: skipping `--paginate` and seeing a truncated file list, or reporting bare "benign" without naming the filter and the file count. Always check this case before alarming — and always quote the numbers, because a truncated list and a genuine miss produce the same sentence otherwise.

### 4 — Disabled workflow → benign, but say "disabled", not "absent"

`deploy.yml` declares `on: push` with `branches: [main]`; the workflows API reports `state: disabled_manually`.

`BENIGN_NO_TRIGGER`, reason *"`deploy.yml` is disabled (`disabled_manually`) — it was not expected to run"*. Note this is only visible because Step 5 used `--all`; without it the workflow's absence from the run list is indistinguishable from suppression. Reporting this as "no CI configured" hides a deploy someone turned off and forgot.

### 5 — `workflow_dispatch`-only workflow → out of scope

```yaml
on:
  workflow_dispatch:
```

No `push` key. Contributes nothing — it is neither an expected run nor evidence of benign. If it is the *only* workflow in the repo, the verdict is `BENIGN_NO_TRIGGER`, reason *"no workflow declares a `push` trigger"*.

### 6 — A cancelled run → a cancellation, not a missing run

Step 5 returns one entry: `Deploy Web · completed · cancelled`, `event: push`, `headSha == $SHA`.

The trigger fired. This is **not** `EXPECTED_RUN_MISSING`. Report it as its own finding: *"`Deploy Web` ran for `abc1234` and was cancelled — likely superseded by a `concurrency` group; the deploy did not complete."* Do not report it as a pass either. Same handling for `conclusion: skipped`.

### 7 — Genuine `EXPECTED_RUN_MISSING`

`preview-deploy.yml` has `on: push` with `branches: [main]` and **no** `paths:` filter; the workflows API reports it `active`; repo Actions are enabled; the merge touched 12 files. Step 5 returns **zero** `push` runs for `$SHA`.

`EXPECTED_RUN_MISSING` — **failure**. Step 7 finds `[skip ci]` on line 4 of the merge commit body (a squashed start-commit subject). Report:

> **CI did not run for merge commit `a81aa72`.** `preview-deploy.yml` (`on: push`, `branches: [main]`, no path filter, state `active`) should have run; no `push` run exists for that SHA. Likely cause — a skip marker in the merge commit body:
> `    = start topic/foo dev = [skip ci]`
> The marker is documented as suppressing all `push` workflows for the commit. A production deploy was very likely suppressed.

Note what this report does *not* say: it does not mention required status checks, and it does not conclude "no CI detected on the merge target branch."

### 8 — Unparseable YAML → `INCONCLUSIVE`, never benign

`ci.yml` fails to parse (a tab in indentation, a truncated fetch, an unquoted `!main` read as a YAML tag).

You cannot say the workflow was expected to run, and you equally cannot say it was not. `INCONCLUSIVE`: *"could not evaluate `.github/workflows/ci.yml` at `abc1234` (YAML parse error at line 12) — unable to confirm whether a `push` run was expected."* Resist the pull to drop the unreadable file and classify on the rest; a single unevaluated workflow makes the whole merge unverified.

---

## Reporting contract

Whatever the caller does with the verdict, it must surface these three fields:

| Field | Example |
|---|---|
| outcome | `EXPECTED_RUN_MISSING` / `BENIGN_NO_TRIGGER` / `INCONCLUSIVE` |
| reason | the specific filter, state, or error — never bare "no CI detected" |
| evidence | workflow filename + trigger block, changed-file count, the run list, the quoted commit line |

**Never emit "No CI detected on the merge target branch" as a standalone conclusion.** It is the sentence that hid two production-deploy suppressions. Every path out of this recipe replaces it with an outcome, a reason, and evidence.
