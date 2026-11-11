# 将来のmode(設計のみ・未実装)

ここに書くものは **どれも実装されていない**。使えると書かない。実装は別の、レビュー可能なPRとして行い、下の受入条件を満たし独立レビューを通るまで既存のsmoke/identityの結果で代用しない。smoke/identityの成功はこれらのmodeを資格付けない。

## A. 非公開候補のingestion(UNIMPLEMENTED)

受入条件:

1. ownerが承認した正確な転送manifest(ファイル名・SHA256・バイト数・転送先・保持期限)
2. 候補のparent SHA、hash、パスのallowlist。manifest外のファイルは拒否
3. secret / 個人情報 / 非公開データの除外確認(manifest段階で)
4. 元データはread-only、候補は隔離した書込み可能パス
5. 公開repoに非公開候補をcommitしない。転送経路はowner承認のものだけ
6. 負例: manifest外ファイル、hash不一致、symlink、サイズ超過がすべて失敗すること

## B. CAD変更 / routing / refill / DRC acceptance mode(NOT IMPLEMENTED)

設計方針:

- **操作allowlist**: 例えば `refill` だけ、`drc` だけ、のように実行してよいpcbnew/kicad-cli操作を列挙。任意スクリプトは不可
- **baseline比較**: 同じ固定image・同じ入力でbaselineを先に取り、候補との差分だけを評価
- **出力**: 新しいboardは隔離パスにだけ書く。元boardのbefore/after hashが一致すること
- **DRC**: `kicad-cli pcb drc` の結果JSONをallowlist成果物にし、違反数・種別をbaselineと比較。DRC 0件は「DRCの範囲で」PASSであって電気・製造合格ではない
- **接続性**: net名一致ではなく、copper上の連結成分(saved fill状態を含む)を評価する専用実装が必要。identity modeの結果から推論しない
- **native失敗制御**: 既存のcontainer所有・deadline・cleanup予約・出力上限をそのまま適用
- **採用**: 自動採用・自動pushなし。旧 `route.yml` / `route-shards.yml` の自動push型は標準にしない。採用は独立レビュー + owner権限
- **負例**: 意図的に違反を入れた候補でDRCが失敗すること、操作allowlist外の呼出しが拒否されること、出力が元boardを上書きしないこと

拡張時に報告すること: 実装したmode、そのテスト(normal / `-O`)、負例の結果、独立レビューの対象SHA、まだ判定しない次元。
