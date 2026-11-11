# OSC実例(固定値と実証範囲)

**この値は1プロジェクトの実例。** 他のrepoへこの値を持ち込まない。他プロジェクトでは `templates/project-config.example.json` を複製して埋める。この実例を埋めた設定は `templates/osc-hole-field.config.json`。正確な出典は `reference/PROVENANCE.json`。

## 固定値

| 項目 | 値 |
| --- | --- |
| repo | https://github.com/Takazudo/zudo-osc-hole-field |
| 凍結公開source | `fa16c6ffa6497f095e1902c223150c23fafccd6e` |
| KiCad CLI / pcbnew | `10.0.6`(wrapperのpin.envは `^10\.0\.` 、controllerは厳密に `10.0.6`) |
| image | `kicad/kicad@sha256:18693567392b80da435f9fa952ce3a3e534c66eb5a6033f5b9c80aa3b19dd3ec` |
| 凍結入力pin | `scripts/kicad/run.sh` / `scripts/kicad/pin.env` / `package.json`(SHA256は `reference/current/scripts/ci/osc_candidate_check.py` の `PINS`) |
| identity board | `boards/osc-core/osc-core.kicad_pcb`、SHA256 `fa60b4e1…1fda10` |
| identity範囲 | ref番号1100..1199 + K-P8 header 6個。期待 **501 pad / 160 ref** |

## 実行記録

| | smoke | identity |
| --- | --- | --- |
| PR | [#291](https://github.com/Takazudo/zudo-osc-hole-field/pull/291) | [#292](https://github.com/Takazudo/zudo-osc-hole-field/pull/292)(reviewed head `880f2fe75478f5dbf328f0173561e2e7d9a3f8d1`) |
| tooling SHA | `cedeea792be7393f95d20cf351786781c391e2f3` | merge `a133464c16237a9f423477612b46a71b62f071b5` |
| run | [39655809642](https://github.com/Takazudo/zudo-osc-hole-field/actions/runs/39655809642) SUCCESS | [39661826910](https://github.com/Takazudo/zudo-osc-hole-field/actions/runs/39661826910) SUCCESS |
| 時間 | UI 42秒 / job 38秒 | 1 job、UI 58秒、native step 42秒 |
| 確認済み | 成功ステータス、upload対象2ファイル | ジョブログで `OSC_MODE=identity` と両SHA、read-only権限、credential除去 |
| artifact | 2,769 bytes | id 12372993799、46,086 bytes、SHA256 `c8da5b2a…ba65e0` |
| 内部receipt | **未読**(取得制限) | **未読**(取得制限) |

identity実装は38個のoffline testがnormal / `-O` 双方で通過し、独立レビュー済み(このスキルの `scripts/run_reference_tests.py` でも再現できる)。

## 根拠の区別

- 「runがSUCCESS」+「sourceの実行条件(controllerは501 identity・厳密version・入力hash不変・container正常終了/削除をすべて満たさないと成功しない)」から言えること: **プログラムのcheckが完了した**
- 言えないこと: 個々のreceiptの独立再検証(versionの実出力、cleanup record、計測値)。未読のため
- identityは配線接続・DRC・電気・組立・製造の合格ではない
- 公開の旧 `osc-core` boardは、未公開のsplit/socket比較基板とは別物。identity成功は後者について何も言わない
- 通常のrepo CI(DRC/再生成)の成功はこのlaneとは別
