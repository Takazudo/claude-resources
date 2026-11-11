# テンプレート — UNKNOWN は PASS ではない

空欄は `UNKNOWN` と書く。推測で埋めない。

## Plan

```text
目的 / 許可する操作 / 除外する操作:
受入条件(このlaneで判定する質問 / 判定しない次元):
source repo + immutable SHA / 入力ファイルのhash:
tooling/workflow SHA / image digest / CLI・pcbnew version:
公開入力 vs 非公開転送(owner、転送先、許可ファイル):
隔離出力パス / 元データのread-only保護 / 期待変更allowlist:
CPU、memory、PID、worker数、controller/step/job期限、cleanup/upload余裕:
所有process/container identityと拒否ルール:
正例 / 負例(identity欠落、hash不一致、timeout、cleanup失敗):
独立レビュアーとレビュー対象の正確なdiff:
公開 / merge / dispatch / 採用の権限(別々に):
```

## Run receipt review

```text
RunID / attempt / URL、mode、正確なsource/tooling SHA:
状態(pending/success/failure/uncertain)と最初の失敗箇所:
version、command argv、exit、計測時間、出力hash:
元データのbefore/after、所有containerの正常終了と削除の証拠:
artifact ID / digest / bytes / 期限、実際に読んだファイル:
欠けている/未読の証拠、拒否された操作(あれば正確に):
identity結果 / 接続性 / DRC / 電気 / 組立(それぞれ別に):
入力を変えた再検証の理由(変更なしの再実行はしない):
採用判断 + レビュアー + owner権限(PASSからは導かれない):
```

`scripts/check_receipt.py` の出力JSONはこの表の機械判定できる部分を埋める。残りは人とレビュアーが埋める。
