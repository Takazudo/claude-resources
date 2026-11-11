# job-local container所有・期限

参照: `reference/current/scripts/ci/osc_candidate_check.py`(`adapter` / `cleanup_owned` / `normal_exit` / `bounded_seconds`)。これは **使い捨てUbuntu hosted job専用** の設計で、共有ホストのlifecycle解決策でもWindows guardの代替でもない。

## adapter(PATH shim)

- 固定wrapperはPATHから `docker` を探す。controllerは一時dirに `docker` shimを置き、wrapperの `docker run` を受ける
- 受けるのは固定wrapperの `run` 形だけ。固定imageがちょうど1回、`--rm` あり、`--name` / `--cidfile` / `--label` / `--privileged` / `--network=host` はなしであること。それ以外は拒否
- 変換: ランダムowner(32 hex)→ 名前 `<prefix>-<owner>` + label `<key>=<owner>` で `docker create`(`--cpus` / `--memory` / `--pids-limit` を付与、`--rm` は外す)
- create前にowner recordを書き、CID(64 hex)を得たら一時ファイル経由のatomic replaceで記録。その後 `docker start --attach <CID>`
- adapter内のcreate/start clientは外側wrapperのprocess groupを継承する(`isolated=False`)。外側timeoutがwrapper groupごとkillできるように

## cleanup

- CIDが記録済みなら `id=<CID>` で検索、未記録なら厳密名で検索
- 未記録CIDで不在 → **create結果不明として失敗**(daemon側でcreateが保留中かもしれない。不在はPASSではない)
- 複数一致 → 失敗。inspectで名前・label・CIDがすべて一致しなければ削除せず失敗
- 一致したら完全CIDで `rm --force`、同じCIDで不在を再確認
- 正常終了の条件: そのコマンドで期待した数(OSC wrapperでは2)のcontainerがすべて `REMOVED_CONFIRMED`、削除前状態が `Running: false` かつ `ExitCode: 0`。CID既知で `ABSENT` は正常終了の根拠にならない
- host全体のpruneや他jobのcontainer停止はしない

## 期限(1つの非延長deadline)

- controller開始時に単調時計で1つのdeadline(OSC: 480秒、9分stepの内側)
- 各コマンドの上限 = min(指定秒, 残り − 7秒の待機/join余裕)。残りがなければTimeoutError
- 新しいwrapperコマンドは残り200秒未満なら開始しない(コマンド100秒 + cleanup予約100秒)
- OSCの内訳: pull 120秒、wrapper 100秒、cleanup各subprocess 5秒(2 containerで最大40秒 + 有限の余り)
- finalizationも同じdeadlineを使い、枯渇したら追加作業を許可せず失敗
- 協調的なsubprocess予算であり、Python schedulingやfilesystemの厳密上限ではない

## 残る限界(必ず報告に残す)

- controllerやrunnerが突然失われた場合の最終境界はhosted runnerのteardown。独立したleaseや共有ホスト排他は実装されていない
- mockのテストは実Dockerの終了・daemon race・突然の喪失を証明しない
- ログ上限はコマンドごとの出力(OSC: 1MiB)。超過は `OUTPUT_LIMIT` で失敗
