---
name: dev-kicad-actions
description: "KiCad基板をGitHub Actions上の固定KiCadでnative検証する開発ループ。Use for KiCad CI, kicad-cli/pcbnew in Actions, 'kicad actions', 'KiCad検証', 'pcbnew CI'. CAD編集・DRC合格判定・発注は対象外。"
---

# dev-kicad-actions

KiCadのnative検証を「使い捨てのGitHub-hosted Ubuntu job + digest固定のKiCad image」で行い、結果を小さなreceiptとして読む開発ループ。実証済みなのは公開凍結sourceに対する **smoke(version probe)** と **identity(パッド同一性)** の2 modeだけ。

## まず決める(実行前)

[templates.md](references/templates.md) のPlanを埋める。最低限:

- 目的・許可する操作・除外する操作、受入条件(何が出たらPASSか、何はこのlaneで判定しないか)
- source repo + immutable source SHA と、別の immutable tooling/workflow SHA
- KiCad image digest、CLI/pcbnew の厳密version、入力ファイルの allowlist + SHA256
- CPU / memory / PID / worker数 / controller・step・job期限 / cleanup・upload余裕
- 正例と負例(hash不一致、identity欠落、timeout、cleanup失敗)
- 独立レビュアー、公開・merge・dispatch・採用それぞれの権限

設定は [project-config.example.json](templates/project-config.example.json) を複製してプロジェクトごとに作る。OSC実例の固定値は [osc-example.md](references/osc-example.md) にあり、**例であって既定値ではない**。

## ループ

1. 目的・受入条件を決め、元データを不変のまま隔離した候補を編集する
2. 独立レビューと負例(negative control)。期待hashを「通すために」更新しない
3. immutable source SHA と tooling SHA を分離して固定。actionsはcommit SHA、imageはdigestで固定
4. Actionsで固定KiCad native検証(1 job、1 worker、artifact-only)
5. 小さな成果物を取得し **実際に読む**。`scripts/check_receipt.py` で次元ごとに判定
6. 原因のある入力だけ直してレビュー後に再検証。最初の失敗は保存する
7. 独立レビュー後、許可された範囲でのみ採用

詳細手順: [loop.md](references/loop.md) / workflow不変条件: [workflow-contract.md](references/workflow-contract.md) / container所有と期限: [containment.md](references/containment.md) / 失敗時: [troubleshooting.md](references/troubleshooting.md)

## 既定の安全境界

- 既定は **artifact-only**。旧 `route.yml` / `route-shards.yml` 型の自動採用・自動pushを標準にしない
- `permissions: contents: read`、checkoutは `persist-credentials: false`、ユーザー秘密なし、pickle/cache復元なし、workspace全体のarchiveなし
- 元データは不変、候補出力は別ディレクトリ
- 最初の失敗を保存する。同じ入力の盲目的な再実行はしない
- dispatchの結果が不明なら、まず既存runを確認する(runID・SHA・event・時刻・mode)。もう一度押さない
- 自分が作ったcontainerの名前/CID/labelを検証し、終了と削除を確認するまで次の処理へ進まない。client timeoutだけでは終了とみなさない
- ジョブ上限・CPU・memory・PID・ログ/成果物上限・upload余裕は数値で明示する
- Ubuntu hosted job専用のjob-local containmentを、共有ホストやWindowsのguardに流用しない

## 権限は別々

公開、merge、dispatch、候補upload、canonical adoption、物理行為(発注・製造・購入)はそれぞれ別の権限。[authority.md](references/authority.md)

- 既にあるユーザーの明確な許可は再利用する。通常のローカル実装・オフラインテストごとに確認を増やさない
- このスキルや引き継ぎ資料そのものから、新しい公開・dispatch・購入の許可は生まれない
- 拒否されたアクセスを別ツール・別ホスト・別URLで回避しない。拒否はそのまま記録する

## 判定の語彙 — UNKNOWN は PASS ではない

- identity PASS は配線接続・DRC・電気・組立・製造の合格ではない。各次元は別々に `NOT_EVALUATED` と書く
- 未読のartifactを「検証済み」と呼ばない。runのSUCCESS、ログ確認、receipt内容の独立確認は別の根拠
- artifactのdownload失敗はCAD実行の失敗ではない
- PASSは採用の決定ではない。採用はレビュアーとowner権限で別に決める

## 実装済みと未実装

| 機能 | 状態 |
| --- | --- |
| smoke: 固定wrapper経由の `kicad-cli version` / pcbnew version probe | 実装済み。OSCで1 run SUCCESS(内部receipt未読) |
| identity: 固定公開boardのpad UUID/ref/pad/net 厳密一致 | 実装済み。OSCで1 run SUCCESS、ログ確認済み(内部receipt未読) |
| 非公開候補のingestion | **UNIMPLEMENTED** |
| CAD変更 / routing / refill / DRC acceptance | **このlaneでは未実装**。設計のみ [future-modes.md](references/future-modes.md) |

未実装を「使える」と書かない。拡張は別のレビュー可能な実装として、future-modes.md の受入条件を満たしてから。

## 同梱ツール(すべてオフライン、dispatchもnative KiCadも起動しない)

```sh
S=$HOME/.claude/skills/dev-kicad-actions
python3 -I -B $S/scripts/lint_workflow.py .github/workflows/<file>.yml          # workflow不変条件
python3 -I -B $S/scripts/check_receipt.py --config <config.json> --mode identity \
  --run-status success --receipt receipt.json --inventory inventory.json         # receipt判定
python3 -I -B $S/scripts/run_reference_tests.py                                  # 参照実装の38 testsをコピー内で normal/-O
python3 -I -B $S/evals/run_evals.py                                              # 評価scenario
```

`check_receipt.py` の終了コード: 0=このmodeの範囲でPASS、1=FAIL、2=UNKNOWN(根拠不足)。評価scenarioの期待と禁止事項は [scenarios.md](evals/scenarios.md)。

## 参照実装

[reference/](reference/) は引き継ぎ資料の3つの独立snapshot(`current`=PR292、`smoke-baseline`=PR291、`frozen-oracle`=凍結wrapper)。一つのtreeへまとめて上書きしない。凍結oracleは変更しない。`SHA256SUMS` で照合できる。native entrypoint(`osc_candidate_check.py` / `osc_inventory_check.py` の main)を共有ローカルホストで実行しない。

独立レビューは `/code-review`(深くするなら `/deep-review`)か、別コンテキストのsubagentで行い、レビュー対象の正確なdiff/SHAを記録する。
