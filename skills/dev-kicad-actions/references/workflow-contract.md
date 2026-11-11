# workflow不変条件

`scripts/lint_workflow.py` が機械的に確認する項目。参照: `reference/current/.github/workflows/osc-candidate-check.yml` と、そのcontractテスト `test_osc_candidate_check.py::test_workflow_contract` / `test_osc_inventory_workflow.py`。

OSCのworkflowはJSONで書かれている(JSONはYAMLのsubset)。追加packageなしで構造をテストできるため。

## trigger・権限

- `on` は `workflow_dispatch` のみ。modeは `type: choice` の固定選択肢、既定は最も弱いmode(smoke)
- `permissions` はちょうど `{contents: read}`
- `secrets.`、`contents: write`、`git push`、`workflow_run`、`actions/cache`、`pickle`、`max-parallel` を含まない
- `concurrency.group` はimmutableな凍結identity(40桁SHA)を含み、`cancel-in-progress: false`

## job

- jobは1つ、GitHub-hosted(self-hosted不可)、`timeout-minutes` あり(OSC: 20)
- すべてのstepに `timeout-minutes`、その合計 ≤ job timeout(OSC: 19 ≤ 20)
- 最初のstepで小さな失敗receipt(`SETUP_INCOMPLETE`)を作る。以降が途中で落ちても何か読める
- `uses:` はすべて40桁commit SHAで固定。Node20→24のdeprecation警告が出てもpinを黙って変えない(更新は隔離レビュー)

## checkout

- toolingは `ref: ${{ github.workflow_sha }}`、sourceは凍結40桁SHA。どちらも `persist-credentials: false`
- sparse checkout(cone mode off)で必要ファイルだけ。boardはそれを読むmodeのときだけ追加

## 実行

- 純粋テストを normal と `-O` の両方で実行し、`tests.json` に有界で記録
- modeは `env` 経由で渡し、quoted `case` で固定コマンドへ分岐。`run:` の中で `${{ inputs.* }}` を展開しない(shell injection防止)。未知modeは `exit 2`

## 成果物

- `upload-safe/` を新規作成(`exist_ok=False`)し、明示allowlistのファイルだけコピー。symlink・非ファイル・想定外の名前・想定外のdirectoryは `ARTIFACT_POLICY_FAILURE`
- 総量上限(OSC: 100MiB)を読みながら確認
- upload-artifactは明示パスのみ、`retention-days` ≤ 7、`if-no-files-found: error`。workspace全体やglobは不可
