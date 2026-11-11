# 失敗時の扱い

| 症状 | すること | しないこと |
| --- | --- | --- |
| version / source / hash 不一致 | 最初のreceiptを保存。producer、改行コード、source identityを正確に調べる | pinを緩める、期待identityを自動で置き換える |
| pad欠落・net不一致 | 期待と実際のidentityを正確に報告 | subset一致で良しとする。identityやendpoint距離から接続性を結論する |
| timeout / cleanup失敗 | コマンドとownership recordを保持。所有containerの終了を確認してから次へ | host全体prune、他jobのcontainer停止。不確実なcreateを成功扱い |
| dispatch応答が不明 | runID・SHA・event・時刻・modeの証拠で既存runを確認 | 盲目的にもう一度Run |
| artifactに届かない | run結果・ログ・未読receiptを区別して報告 | 未読artifactを「検証済み」と呼ぶ。download失敗をCAD実行失敗と呼ぶ |
| 取得が拒否された | 拒否の操作・対象・エラー種別を記録 | 別ツール・別ホスト・別URLで同じ対象を取りに行く |
| actionsのdeprecation警告 | 記録のみ。更新は隔離レビュー | pinを黙って変更 |
| 通常repo CIのDRC/再生成が成功 | このlaneとは別の結果として記録 | 候補の受入れとみなす |

## OSCでの実例(履歴)

- smoke artifactのWindows `Invoke-WebRequest` が forbidden-socket / access-permissions(WinError 10013系)で exit 1、ファイルなし。後続の `Get-FileHash` もファイル不在で失敗。再試行・代替取得はしていないし、この資料もそれを許可しない
- WSL経由で保護された `heavy-guard.sh` を読む試みがexecution-policyレビューで拒否された。そのパスをhosted Actionsへ移植しない。Windows実行全般が禁止だとも推論しない。hosted job-local containmentは保護guard状態を読む代替手段ではない
