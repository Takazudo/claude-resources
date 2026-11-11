# 開発ループ詳細

各段に「汎用ルール」と「OSC実例での具体値」を分けて書く。具体値は [osc-example.md](osc-example.md) の1プロジェクトでレビュー・実行されたもので、他プロジェクトでは設定ファイルで置き換える。

## 1. 範囲を決める

- repo指示(CLAUDE.md / AGENTS.md / CONTRIBUTING)を読み、owner範囲、正確なsource/tooling commit、dirtyファイルの持ち主、公開/非公開の境界を確定する
- 元データと最初の失敗を保存する。候補編集は隔離したパスで行う
- native実行の前に受入条件を質問の形で書く(例: 「501個の期待pad identityが過不足なく一致するか」)。答えられない質問はこのlaneで扱わない

## 2. source-onlyのレビューと負例

- 変更と負例(hash不一致、identity 1件欠落、timeout、cleanup失敗、ownership不一致)を独立レビューする
- workflowのactionsは40桁commit SHA、KiCad imageは `@sha256:` digestで固定
- workflow/tooling SHA と board/source SHA を分ける。toolingを直しても凍結sourceは動かさない
- 期待hashや期待identityを、通すためだけに更新しない
- 固定wrapper(OSCでは `scripts/kicad/run.sh`)の副作用を監査する。OSCのwrapperは1コマンドにつき2 container(version確認 + 本体)を起動する

## 3. 実行環境(汎用の上限は設定で明示)

| 項目 | 汎用ルール | OSC実例 |
| --- | --- | --- |
| runner | 使い捨てGitHub-hosted、self-hosted不可 | `ubuntu-24.04` |
| 並列 | 1 job、1 worker | 同左 |
| 期限 | job > 各step合計 > native step > controller予算 + upload余裕 | job 20分 / step合計19分 / native step 9分 / controller 480秒 |
| container | CPU・memory・PID上限を明示、check中はnetwork none | 1 CPU / 512MiB / 64 PIDs / `--network none` |
| image | digest固定、pullは明示的な別段 | `docker pull` 120秒 |
| ログ | コマンドごとに上限 | 1MiB |
| 成果物 | 名前allowlist、総量上限、保持期限 | receipt.json / tests.json / inventory.json、100MiB、7日 |
| 権限 | `contents: read`、secretsなし、`persist-credentials: false` | 同左 |
| 禁止 | pickle cache、workspace全体archive、自動push/採用、chained workflow | 同左 |
| concurrency | immutableな凍結identityでgroup、`cancel-in-progress: false` | `osc-smoke-<frozen SHA>` |

## 4. mode

- **smoke**: 変更しない固定wrapperと固定version設定で、CLIとpcbnewのversion probeだけを実行。入力の before/after hash を比較。OSCの初版smoke adapterはoracleのmountをそのまま使う(read-only mountを強制するとは書かない)
- **identity**: 加えて固定公開boardを読み、期待pad identity(UUID/ref/pad/net)の厳密集合と照合。adapterがsource mountを `:ro` に書き換え、payloadを `:ro` で追加し、mount aliasや `--network` 変更を拒否する
- 書込み可能な隔離HOMEはscratch専用

## 5. container所有

[containment.md](containment.md)。要点: `docker run` を所有付きの create/start に変換、CIDを記録、ownership確認後に自分のものだけ削除し不在を確認。不確実なら fail closed。

## 6. 公開・merge・dispatch

- 現在のユーザー許可とrepo方針の範囲内のみ([authority.md](authority.md))
- 公開されたdiff/headが正確にレビュー済みのものか、CIと独立レビューを確認。通常merge、bypassなし
- dispatchは1回。runIDをすぐ記録。応答が不明なら既存runを確認してから次を考える
- 変更のない失敗を再実行しない

## 7. 成果物を読む

- 許可された経路で、allowlistの小さな成果物だけ取得。hashを取り、source/tooling/version/command/exit/cleanup/before-afterを比較(`scripts/check_receipt.py`)
- 取得が拒否されたら、その結果を保存して根拠の限界を報告する。同じ対象を別ツール・別ホスト・別URLで取りに行かない
- 採用前に結果をレビューする。失敗は診断し、関連する入力だけをレビュー付きで変え、失敗の証拠は残す

## コマンド例(文書。今dispatchする指示ではない)

レビュー済みhosted layoutのrunner workspaceから:

```sh
TOOLING_SHA=<immutable-reviewed-workflow-sha> python3 -B tooling/scripts/ci/osc_candidate_check.py --source frozen --out receipts
TOOLING_SHA=<immutable-reviewed-workflow-sha> python3 -B tooling/scripts/ci/osc_inventory_check.py frozen inventory-receipts
```

workflowはsparse checkoutを行う。凍結Git HEADと正確なallowlist入力を持たないZIP snapshotでは、意図的にcontrollerが動かない。純粋テストは `scripts/run_reference_tests.py` でコピー内実行する。
