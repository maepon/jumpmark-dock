# AI開発フローを他リポジトリへ移植する手順

このリポジトリの AI開発フロー（`make spec` → `make impl`）を別のリポジトリで使うための手順です。
**何をコピーし、何を書き換えるか**を、このリポジトリの該当行と対応づけて並べてあります。

移植先に持っていく導入・運用ガイドは [ai-workflow-setup.md](ai-workflow-setup.md) です。
あちらは単体で完結しているので、ファイル一式と一緒に移植先の `docs/` に置いてください。
こちらの手順書は移植元に残す作業メモです。

---

## 1. 持っていくファイル（20ファイル / 1,539行）

| ファイル | 行 | 移植時の扱い |
|---|---|---|
| `Makefile` | 97 | **ほぼそのまま**（help の文面だけ確認） |
| `.env.example` | 13 | そのまま（モデルIDを .env に書く例つき） |
| `scripts/run-phase.sh` | 432 | **1箇所書き換え**（整形チェック）＋ コメントの事情説明 |
| `scripts/claude-run.sh` | 110 | **そのまま**（言語非依存。冒頭の実測メモも一緒に運ぶ） |
| `scripts/check-scripts.sh` | 87 | **そのまま** |
| `scripts/notify-slack.sh` | 37 | **そのまま** |
| `prompts/_rules.md` | 54 | **後半を全面書き換え**（最もリポジトリ固有） |
| `prompts/spec.md` | 63 | 事故例とドキュメント名を差し替え |
| `prompts/plan.md` | 32 | ドキュメント名だけ |
| `prompts/plan-judge.md` | 44 | **そのまま** |
| `prompts/plan-revise.md` | 24 | **そのまま** |
| `prompts/implement.md` | 41 | テスト・整形コマンドを差し替え |
| `prompts/review-judge.md` | 103 | テストコマンド＋事故カタログを差し替え |
| `prompts/review-fix.md` | 34 | テスト・整形コマンドを差し替え |
| `prompts/pr.md` | 49 | ブランチ規約を差し替え |
| `prompts/code-review.md` | 81 | 言語のパスAPI・実行方法・守る成果物を差し替え |
| `prompts/pr-review.md` | 109 | テストコマンド・事故例・通常運用を差し替え（使わないなら持っていかなくてよい） |
| `.claude/phase-permissions.json` | 46 | **Go の allow を差し替え** |
| `.claude/commit-permissions.json` | 39 | **Go の allow を差し替え** |
| `.claude/pr-review-permissions.json` | 44 | **Go の allow を差し替え** |

これに加えて、**導入・運用ガイド [ai-workflow-setup.md](ai-workflow-setup.md)（596行）を移植先の `docs/` に置きます。**
移植先で最初にセットアップする人と、その後フローを運用する人が読むものです。この手順書は移植元に残します。

### 持っていかないファイル

| ファイル | 理由 |
|---|---|
| `.claude/settings.local.json` | 個人の許可リスト。gitignore 済み。移植先で自然にたまる |
| `.claude/settings.json` | このリポジトリには無い。**作らない**（理由は §4） |
| `.env` | 各自の値。`.env.example` からコピーさせる |
| `README.md` | このリポジトリの説明。フローの部分は [ai-workflow-setup.md](ai-workflow-setup.md) が代わる |
| `tmp/` 配下 | 実行時に作られる作業ファイル |

### コピーではなく追記するもの

移植先の `.gitignore` に以下を足します。**`tmp/` は必須**です。エージェントがコメント本文を書き出す場所で、
ここが git 管理下だと `run-phase.sh` の作業ツリー前後比較（`:353` / `:393`）が毎回発火してフローが止まります。

```
.env
.claude/settings.json
.claude/settings.local.json
tmp/
```

---

## 2. 差し替え箇所 — A. 言語・ツールチェーン依存

このフローが Go に結合しているのは「テストを走らせる」「整形済みか確かめる」「CLI を実行して確かめる」の3点だけです。

### A-1. 整形チェック（唯一のシェル側の書き換え）

[scripts/run-phase.sh:114-124](../scripts/run-phase.sh#L114-L124) の3つだけを書き換えます。
それを使う `unformatted_files()`（[:126-140](../scripts/run-phase.sh#L126-L140)）と中断メッセージ（[:158](../scripts/run-phase.sh#L158)）は言語に依存しないので、触りません。

| 書き換えるもの | 約束 | 現状（Go） |
|---|---|---|
| `format_target()` | 整形チェックの対象なら真 | `case "$1" in *.go) return 0 ;; esac; return 1` |
| `format_ok()` | **整形済みなら真。チェック自体が失敗したら偽** | `out=$(gofmt -l "$1" 2>/dev/null) && [ -z "$out" ]` |
| `FORMAT_FIX` | 中断メッセージで案内する整形コマンド | `gofmt -w` |

`format_ok()` は**終了コードで答えます。** ツールによって「整形済み」の伝え方が違うので、ここで揃えます。

| 言語 | `format_ok()` の中身 | `FORMAT_FIX` |
|---|---|---|
| Go（現状） | `local out; out=$(gofmt -l "$1" 2>/dev/null) && [ -z "$out" ]` | `gofmt -w` |
| TypeScript / JS | `npx prettier --check "$1" >/dev/null 2>&1` | `npx prettier --write` |
| Python | `ruff format --check "$1" >/dev/null 2>&1` | `ruff format` |
| Rust | `rustfmt --check --edition 2021 "$1" >/dev/null 2>&1` | `cargo fmt` |
| Kotlin | `ktlint "$1" >/dev/null 2>&1` | `ktlint -F` |
| Java | `local out; out=$(google-java-format -n "$1" 2>/dev/null) && [ -z "$out" ]` | `google-java-format -i` |

- **出力が空かで判定するツール**（`gofmt -l`、`google-java-format -n`）は、終了コードと出力の両方を見ます。
  出力だけを見ると、コマンドが無い・構文エラーで何も出さずに落ちたときに「整形済み」になります
- **終了コードで判定するツール**（`prettier --check` など）は出力を捨てます。成功時にも何か出すので、出力で判定すると常に止まります
- `rustfmt` を単体で呼ぶときは `--edition` を crate と揃えます。既定の edition が古く、新しい構文を構文エラーとして落とします
- **チェック自体の失敗を真に倒さないこと。** 未インストールの環境で黙って全部通り、しかも通ったように見えます。
  偽に倒しておけば、中断メッセージに「未整形か、チェック自体が失敗」と出て気づけます

**設計意図を壊さないこと**が要点です。

- **シェルは整形しない。** 未整形なら中断して、整形はエージェントにやらせます。シェルが差分を書き換えると、
  レビュアーが読んだ内容と実際の差分が食い違うため（[scripts/run-phase.sh:126-127](../scripts/run-phase.sh#L126-L127) のコメント）
- **対象は作業ツリーに出ているファイルだけ。** リポジトリ全体に掛けると、既存の未整形ファイルで毎回止まります
- 削除・リネーム元は `[ -f "$f" ]` で除外（[:133](../scripts/run-phase.sh#L133)）
- **対象ファイルの一覧は `worktree_paths()` から取る。** `git status --porcelain | cut -c4-` に戻すと、
  日本語やスペースを含むファイル名が `"…"` でクォートされて `[ -f ]` に落ち、黙って検査対象から外れます（§6）

> フォーマッタが無い言語・整形を強制しない方針のリポジトリでは、`format_target()` を常に偽（`return 1` だけ）にして構いません。
> その場合、代わりにリンタのチェックを `format_ok()` に同じ約束で入れると同等の働きをします。

### A-2. プロンプト内のテスト実行コマンド

| ファイル | 行 | 現状 |
|---|---|---|
| `prompts/implement.md` | 17-18, 36 | `go test ./...` / `gofmt -w` / `gofmt -l` |
| `prompts/review-fix.md` | 11-12, 29 | `go test ./... -count=1` / `gofmt -w` |
| `prompts/review-judge.md` | 15, 47 | `go test ./... -count=1`、使えるツールの列挙 |
| `prompts/pr-review.md` | 53 | `go test ./... -count=1` |

置き換えの例: `npm test` / `pnpm test` / `pytest -q` / `cargo test` / `./gradlew test` / `bundle exec rspec`。

**テスト結果をキャッシュするツールなら、無効にする指定を付けてください。** Go の `-count=1` に当たるものです
（Gradle の `--rerun-tasks`、Turborepo の `--force`、Nx の `--skip-nx-cache`、Bazel の `--nocache_test_results`）。
pytest や Jest はもともと前回の結果を再生しないので、何も足さなくて構いません
（`pytest -p no:cacheprovider` は `--lf` 用の記録を止めるだけ、Jest の `--ci` はスナップショットの扱いを変えるだけで、どちらも関係ありません）。
判定役は「テストを自分で走らせる。報告を信用しない」（[prompts/review-judge.md:15](../prompts/review-judge.md#L15)）建てなので、
前回の成功が再生されると裏取りにならず、この一行が効かなくなります。

### A-3. 成果物を実行して確かめる経路

判定役とコードレビューには「コードを読むだけでなく、利用者が通る経路を実際に通す」ことを求めています。

| ファイル | 行 | 現状 |
|---|---|---|
| `prompts/review-judge.md` | 89 | `go run ./cmd/ -input … -output …` |
| `prompts/code-review.md` | 48 | 同上 |
| `prompts/pr-review.md` | 70 | 同上 |

移植先の起動方法に差し替えます（`npm run cli -- …` / `python -m yourpkg …` / `cargo run -- …`）。
ライブラリで CLI が無いなら「テストを1本書いて走らせる」に読み替えてください。

あわせて [prompts/code-review.md:38](../prompts/code-review.md#L38) の `filepath.Join` を言語のパス結合APIに直します
（Node は `path.join`、Python は `pathlib.Path` / `os.path.join`、Rust は `Path::join`）。
観点として見せたいのは「文字列結合でパスを作っていないか」なので、API名が合っていないと指摘が空振りします。

### A-4. 権限プロファイルの allow

3つのプロファイルに Go のコマンドが並んでいます。

| ファイル | 行（Go のエントリ） |
|---|---|
| `.claude/phase-permissions.json` | 15-24, 26-27 |
| `.claude/pr-review-permissions.json` | 13-22, 24-25 |
| `.claude/commit-permissions.json` | 19-22 |

言語に依存しない `echo` / `mkdir` / `which` / `cd` / `gh issue view` / `git diff|log|status` /
`Read` / `Edit` / `Write` はそのままです。

差し替えの型は言語ごとに次のようになります。

```jsonc
// TypeScript / Node
"Bash(npm test:*)", "Bash(npm run lint:*)", "Bash(npm run build:*)", "Bash(npx tsc:*)", "Bash(npx prettier:*)",
"Bash(npx vitest:*)", "Bash(node --version)",

// Python
"Bash(pytest:*)", "Bash(ruff:*)", "Bash(mypy:*)", "Bash(python -m pytest:*)", "Bash(python --version)",

// Rust
"Bash(cargo test:*)", "Bash(cargo build:*)", "Bash(cargo clippy:*)", "Bash(cargo fmt:*)",
```

3つの注意があります。

1. **絶対パス形も入れる。** `Bash(/usr/local/go/bin/go test:*)` が並んでいるのは、エージェントが
   PATH 解決の結果として絶対パスで呼ぶことがあり、その形は別ルール扱いになるためです。
   移植先では `which <コマンド>` で実体パスを確認し、両形を入れてください
   （`/opt/homebrew/bin/node`、`/usr/bin/python3`、`~/.cargo/bin/cargo` など）。
2. **汎用の読み取りコマンドを足さない。** `grep` / `cat` / `sed` / `awk` / `head` / `tail` / `cp` / `find` / `xargs` を
   1つ通すと `Read(./.env)` の deny を素通りできます。`git -C` / `go -C` も、前置一致をずらして
   `git push` の deny を迂回できるため入れません。理由は
   [.claude/phase-permissions.json:5-6](../.claude/phase-permissions.json#L5-L6) に書いてあります。
   **シェルとインタプリタも、1コマンドで何でも走る形では入れません。** `bash` / `sh` / `env` / `eval` や、
   `python -m:*`（`python -m http.server` も通る）、`python -c` / `node -e` の一行実行、裸の `node` / `npx` です。
   `python -m pytest:*` や `npx prettier:*` のように、**何を走らせるかまで絞った形**にします。
   `npm run:*` も同じ理由で `npm run lint:*` のようにスクリプト名まで書きます。
   `scripts/check-scripts.sh:53-63` がこの混入を静的に落とします。
3. **deny の7行は消さない。** `check-scripts.sh:43-51` が全プロファイルに以下を要求します。
   1つでも欠けると `make check` が落ち、フェーズが始まりません。

   ```
   Read(./.env)  Bash(git push)  Bash(git push:*)  Bash(gh pr:*)
   Bash(rm:*)    Bash(git rebase:*)  Bash(git reset --hard:*)
   ```

> `npm test` や `cargo test` を許可した時点で、エージェントは任意のコードを実行できます。
> 権限リストは**事故の防止**であって隔離ではありません（[scripts/claude-run.sh:27-33](../scripts/claude-run.sh#L27-L33)）。
> 実効的な防波堤は ①`.claude/` への書き込みは Claude Code 自身が塞ぐ
> ②`run-phase.sh` が各ステップ後に作業ツリーを検査する
> ③`push` と `gh pr` はそもそも渡さない — の3つです。移植先でもこの3つを外さないでください。

### A-5. モノレポ構成の案内

[prompts/_rules.md:16-27](../prompts/_rules.md#L16-L27) は「各ステップが独立した Go モジュールで、
`go.work` が無いのでそのディレクトリの中から打つ」という、このリポジトリ固有の事情です。
移植先の構成に合わせて書き直します。

**残すべき2点**は言語に関係なく効きます。

- **複合コマンドは許可済みのコマンドでも拒否される** — `cd X && cmd` / `cmd1; cmd2` / 制御構文 /
  `VAR=値 cmd` の前置 / コマンド置換 / パイプ / ヒアドキュメント
- **`cd` は許可済みで、カレントディレクトリは呼び出しをまたいで持続する** ので2回に分けて打つ

これを書いていないと、エージェントが `cd pkg && npm test` を延々と試して拒否され続けます。

---

## 3. 差し替え箇所 — B. パスとドメイン語彙

### B-1. 基盤ファイルの定義

[scripts/run-phase.sh:56](../scripts/run-phase.sh#L56):

```bash
TOOLING_PATHS='^(Makefile|scripts/|prompts/|\.claude/|docs/|\.gitignore|\.env\.example|renovate\.json)'
```

これが2箇所で効きます。①各ステップ後にエージェントがここを書き換えていたら中断（`tooling_state()` / `:151-154`）
②案件のコミットに混ざっていたら PR を作らない（`create_pr()` / `:199-206`）。

**フローをサブディレクトリ（例: `ai-flow/`）に置く場合は、各パスにそのディレクトリを前置します。**
`git status --porcelain` / `git diff --name-only` のパスは、どこで実行してもリポジトリのルートからの相対になるためです。
前置しないと、フロー自身の `scripts/` などの改変は素通りし、ルートの同名ディレクトリ（案件の `docs/` など）は
基盤扱いされて止まります（jumpmark-dock では
`'^(ai-flow/(Makefile|scripts/|prompts/|\.claude/|docs/|\.env\.example)|\.gitignore)'`）。

移植先では `renovate.json` を実在するものに入れ替え、CI 設定（`.github/workflows/`）を含めるかを決めてください。
含めると、エージェントに CI を触らせない代わりに、CI 変更を人が別コミットで入れる運用が必須になります。

**同じ一覧がプロンプトにも2つあります。** 変えるときは3箇所をそろえます。

| 場所 | 役 | ずれたときに起きること |
|---|---|---|
| `scripts/run-phase.sh:56` `TOOLING_PATHS` | 機械的な検査（正） | — |
| [prompts/_rules.md:49](../prompts/_rules.md#L49) | 全フェーズへの「変更しない」 | 書き換えてからステップ後の検査で中断する |
| [prompts/pr.md:21](../prompts/pr.md#L21) | PR 作成時の「ステージしない」 | コミットまで終えてから PR 作成で中断する |

プロンプト側が欠けても検査で止まるので事故にはなりませんが、1周無駄になります。

`docs/` が入っているのは、このフロー自体の手順書（移植手順と導入ガイド）を置いている場所だからです。
**移植先で `docs/` を案件のドキュメントに使っているなら、導入ガイドの置き場所を別に決めて
ここから `docs/` を外してください。** そのままだと、ドキュメントを更新した PR が作れません。

### B-2. 消えると困る成果物の保護

判定役とレビュアーには「疑わしいものは実際に走らせろ」と言っています。その結果、**確定済みの成果物を
消させてしまう経路**が開きます。3ファイルに同じ趣旨の禁止が入っています。

| ファイル | 行 | 現状 |
|---|---|---|
| `prompts/code-review.md` | 48-51 | `tmp/` の下で走らせる。`data/` と各ステップの `result/` は `-input` にも `-output` にも渡さない |
| `prompts/review-judge.md` | 89-90 | 同上 |
| `prompts/pr-review.md` | 70-71 | 同上 |

移植先の「消えると困るもの」に置き換えます。**該当するものが無いなら削らず、
「実行して確かめる場所はリポジトリルートの `tmp/` の下だけ」だけを残してください。**
`rm` は deny されているので後片付けは不要、という案内も一緒に残します（`tmp/` は git 管理外）。

### B-3. 事故カタログ

[prompts/review-judge.md:78-90](../prompts/review-judge.md#L78-L90) は、受入基準の外に残った危なさを
`RESIDUAL_RISK` として書かせるための巡回リストです。現状は「入力と出力が同一ディレクトリ」
「入力0件」「再実行」「同名衝突」「シンボリックリンク」「0件出力・終了コード0・`error.log` なしで成功に見える経路」。

**このリストはこのリポジトリで実際に起きた事故から作られています。**
移植先のドメインに合わせて入れ替えてください。空にすると `RESIDUAL_RISK` が
「特にありません」しか出さなくなります（8周で3回発火した層です）。

汎用の種として使えるもの: 冪等性のない再実行、部分失敗を成功として返す経路、
リトライで二重に効く副作用、タイムゾーン・ロケール依存、並行実行時の書き込み衝突、
外部APIのレート制限・タイムアウト時の扱い。

### B-4. ドキュメント名とブランチ規約

| ファイル | 行 | 現状 | 差し替え |
|---|---|---|---|
| `prompts/spec.md` | 9, 56 | ルートと該当ステップの `CLAUDE.md` / `README.md` | 移植先の規約ファイル |
| `prompts/plan.md` | 11 | 該当ステップの `CLAUDE.md` | 同上 |
| `prompts/implement.md` | 20 | `CLAUDE.md` / `README.md` を更新 | 同上 |
| `prompts/pr-review.md` | 65 | `README.md` と各 `CLAUDE.md`、6教科ループ、`result/` への通常運用 | 移植先の通常運用 |
| `prompts/pr.md` | 16 | `feature/issue-{{ISSUE}}-<英小文字とハイフンの短い要約>` | ブランチ規約 |
| `scripts/run-phase.sh` | 186-190 | `feature/*` で始まるかの検査 | `prompts/pr.md:16` と揃える |
| `Makefile` | 7 | `BASE_BRANCH ?= main`（PR のベース） | 既定ブランチが `master` などなら直す。スクリプトは環境変数で、プロンプトは `{{BASE_BRANCH}}` で受けるので、ここ以外は触らない。直書きは `check-scripts.sh` が落とす |
| `Makefile` | 17 | `git@github.com:` → `https://github.com/` の sed | GitHub Enterprise なら書き換え |

`prompts/pr.md:16` のブランチ名と `run-phase.sh:186-190` の検査は**必ずセットで直します。**
片方だけ直すと、エージェントがコミットまで終えた後に PR 作成で中断します（作業は失われませんが1周無駄になります）。

### B-5. このリポジトリの事情を語っているコメント

削るか自分の事情に書き換えるもの。動作には影響しませんが、残すと移植先で読んだ人（とエージェント）が
存在しないディレクトリや Issue を探すことになります。

| 場所 | 中身 | 扱い |
|---|---|---|
| [scripts/run-phase.sh:55](../scripts/run-phase.sh#L55)（`TOOLING_PATHS` の上） | `<ステップ>/doc/` は `docs/` に当たらない | 移植先で `docs/` と紛らわしい置き場所があれば書き換え、無ければ削る |
| [scripts/run-phase.sh:60](../scripts/run-phase.sh#L60)（コストログ） | `#6 と #19 で起きた` | Issue 番号だけ削る。理由の文は残す |
| [scripts/run-phase.sh:108](../scripts/run-phase.sh#L108)（`tooling_state` の上） | `data/` は Confluence から再取得できる | 移植先の gitignore 対象に書き換え |
| [scripts/run-phase.sh:235-237](../scripts/run-phase.sh#L235-L237)（`REVIEW_JUDGE_MODEL` の上） | 教科ごとに周回するタスクで A/B する、#19 の差し戻し、`gofmt` | 削るか自分の A/B の事情に |
| [scripts/run-phase.sh:239-241](../scripts/run-phase.sh#L239-L241) | plan-judge を分けていない根拠（差し戻し2件の内容） | 理屈は残し、件数の話は削る |
| [scripts/check-scripts.sh:5](../scripts/check-scripts.sh#L5)（冒頭） | `#19 で踏んだ` | Issue 番号だけ削る |
| [scripts/check-scripts.sh:55](../scripts/check-scripts.sh#L55)（allow 禁止の説明） | `go -C` | 移植先の言語に `-C` 形があれば差し替え。禁止パターン側の `go -C` は残して害はない |
| [scripts/claude-run.sh:27](../scripts/claude-run.sh#L27)（「隔離ではない」の段落） | `go test / go run を許可している以上` | 移植先のテスト・実行コマンドに |
| [.claude/phase-permissions.json:4](../.claude/phase-permissions.json#L4)（`//write`） | `data/` の保護 | 移植先の「消えると困るもの」に（§B-2 と揃える） |
| [prompts/_rules.md:13](../prompts/_rules.md#L13) | `go -C <path>` | 移植先の言語に。`git -C` の行は残す |
| [prompts/_rules.md:46-54](../prompts/_rules.md#L46-L54) 「この案件の約束」 | `CLAUDE.md`、`<ステップ>/doc/`、`data/`、再エクスポート | **全面書き換え** |

`_rules.md` の「この案件の約束」で**形として残すべき3点**:

```markdown
- 基盤ファイル（`Makefile`、`scripts/`、`prompts/`、`.claude/`、`docs/`、`.gitignore`、`.env.example`、`renovate.json`）は変更しない
- Slack 通知は自分で送らない。make が送る
- （移植先のリポジトリ規約ファイルに従う、の1行）
```

基盤ファイルの行は `TOOLING_PATHS` と `prompts/pr.md` と揃えます（§B-1 参照）。移植先で `docs/` を案件のドキュメントに
使っているなら、3箇所すべてから外して導入ガイドの置き場所を別に決めてください。

---

## 4. 差し替え箇所 — C. 過去の事故への参照

`prompts` には Issue 番号がそのまま埋まっています。

| ファイル | 行 | 内容 |
|---|---|---|
| `prompts/spec.md` | 52-53 | #10 の AC-14 は「`-clean` はステップ1と同等のガードを持つ」で、実装はそのとおりで、そのことが事故だった → #14 |
| `prompts/pr-review.md` | 17-18 | 同じ事故（→ #14 → #17） |
| `prompts/pr-review.md` | 45 | 参照先そのものが正しいかを確かめる。#14 はここで起きた |

**番号は移植先では意味を持ちませんが、理屈は持ちます。** 伝えたいのは
「受入基準に忠実であることは、事故を防ぐことと同じではない」という一文です。

移植の初期は番号を外して原則だけ書き、移植先で最初の事故が起きたらその Issue 番号を書き足してください。
**自分のリポジトリで起きた具体例が1件入ると、この段落は目に見えて効くようになります。**
他リポジトリの事故例を借りたままにするのは、読み手（エージェント）が検証できないぶん弱くなります。

---

## 5. 移植の手順

```sh
# 1. コピー（移植先リポジトリのルートで）
cp -R <このリポジトリ>/scripts <このリポジトリ>/prompts .
mkdir -p .claude && cp <このリポジトリ>/.claude/*-permissions.json .claude/
cp <このリポジトリ>/Makefile <このリポジトリ>/.env.example .
mkdir -p docs && cp <このリポジトリ>/docs/ai-workflow-setup.md docs/

# 2. .gitignore に追記（§1 参照）。tmp/ は必須

# 3. §2〜§4 に沿って書き換える

# 4. 静的検査が通ることを確認（課金なし）
./scripts/check-scripts.sh
```

### 移植先の既存ファイルとぶつかるとき

コピーする前に、移植先に同じ名前があるかを確かめます。**ぶつかったまま入れると、既存のものまでフローの
保護と検査の対象になります。** 起きることは名前ごとに違います。

| 名前 | ぶつかると起きること | 対処 |
|---|---|---|
| `Makefile` | 上書きすると既存のターゲットが消える。取り込んでも `help` / `check` / `.DEFAULT_GOAL` / `ISSUE` が既存と衝突しうる。`TOOLING_PATHS` の `^Makefile` は既存の Makefile 全体を保護するので、**エージェントが案件で Makefile を直せなくなる** | 下の「`Makefile` を分けるとき」 |
| `scripts/` | 既存のスクリプトまで `TOOLING_PATHS` の保護対象になり、エージェントが触れない。さらに `check-scripts.sh` が `scripts/*.sh` の全部に `bash -n` と非 ASCII 検査を掛けるので、**既存の zsh 用スクリプトや、エラー文に日本語を含むスクリプトで `make check` が落ち、全フェーズが始まらない** | 下の「1つのディレクトリにまとめる」 |
| `prompts/` | LLM を使うアプリでよくある名前。既存のプロンプトまで保護対象になり、案件の変更として直せない | 同上 |
| `.env` | Node / Python の dotenv と衝突する。Makefile が `-include .env` で**make の構文として**読むので、`#` 以降がコメントとして消える、`$` が展開される、複数行の値で make ごと落ちる | 下の「`.env` を分けるとき」 |

**`Makefile` を分けるとき。** `Makefile.ai` にして `make -f Makefile.ai spec` で呼ぶ形は、2つ穴があります。
`check-scripts.sh:27` が `Makefile` を名指しで検査しているので非 ASCII 検査が外れること、
中断メッセージとヘルプの「`make review ISSUE=n` で再開」がそのままでは動かないことです。
代わりに、フローのターゲットを `ai-flow.mk` に移し、既存の `Makefile` に `include ai-flow.mk` の1行を足します。
`make spec` のまま呼べるのでメッセージは合ったままです。あわせて次を直します。

- `check-scripts.sh:27` の検査対象の `Makefile` を `ai-flow.mk` に替える
- `TOOLING_PATHS`（と `_rules.md` / `pr.md` の一覧）の `Makefile` を `ai-flow\.mk` に替える。既存の Makefile は案件側に戻る
- `help` / `check` / `.DEFAULT_GOAL` が既存とぶつかるなら、フロー側を `ai-help` / `ai-check` などに改名する

**1つのディレクトリにまとめる。** `scripts/` か `prompts/` がぶつかるなら、フローの一式を `ai-flow/scripts/` と
`ai-flow/prompts/` に置きます。パスは次の箇所にだけ埋まっているので、`scripts/` → `ai-flow/scripts/`、
`prompts/` → `ai-flow/prompts/` と置き換えれば済みます。

| ファイル | 埋まっているパス |
|---|---|
| `Makefile` | `./scripts/check-scripts.sh` と `./scripts/run-phase.sh`（6箇所） |
| `scripts/run-phase.sh` | `./scripts/notify-slack.sh`、`./scripts/claude-run.sh`、`prompts/*.md`（10箇所）、`TOOLING_PATHS` |
| `scripts/claude-run.sh` | `RULES="prompts/_rules.md"` |
| `scripts/check-scripts.sh` | `scripts/*.sh`（:16 / :27 / :80）、`prompts/spec.md` と `scripts/run-phase.sh`（:71-74）、`prompts/*.md`（:80） |
| `prompts/_rules.md` / `prompts/pr.md` | 基盤ファイルの一覧 |

置き換えたあと `./ai-flow/scripts/check-scripts.sh` が通ることを確かめます。どのスクリプトも
**リポジトリのルートをカレントディレクトリとして動く**前提（`tmp/` も `.claude/` もルート相対）なので、
呼ぶのは必ずルートからです。`.claude/` は Claude Code が決めた場所なので動かせません。

**`.env` を分けるとき。** フローの設定を `.env.ai` などの別名にします。直すのは
`Makefile` の `-include .env`、`.gitignore`、`.env.example` の名前、`check-env` のメッセージです。
さらに**全プロファイルの deny に `Read(./.env.ai)` を足し、`check-scripts.sh:43-51` の必須 deny にも足します。**
足さないと、エージェントが Webhook URL を読めます。既存の `.env` にもアプリのシークレットが入っているはずなので、
`Read(./.env)` は消さずに残します。

### 課金せずに確かめられること

| 確認 | コマンド | 見るもの |
|---|---|---|
| 静的検査 | `./scripts/check-scripts.sh` | `check: 基盤ファイルの静的検査は問題なしです。` |
| 環境変数 | `make check-env` | Slack webhook とモデル2つ |
| ヘルプ | `make help` | フェーズの説明が移植先の実情と合っているか |
| 未知フェーズ | `./scripts/run-phase.sh bogus 1 "http://x"` | `fail` のメッセージが出て Slack が飛ぶか |
| Slack | `./scripts/notify-slack.sh "http://x" "テスト"` | Slack に届くか |
| 人間ゲート | 指示書の無い Issue で `make impl ISSUE=n` | `指示書がありません` で止まるか（`require_instruction`） |

`run-phase.sh` を直接叩くとコストログに見出し行が追記されます。実在する Issue 番号で試すと
本番の記録に混ざるので、`ISSUE=99999` のような使っていない番号にしてから `tmp/cost-issue99999.txt` を消してください。

### 最初の1周は小さく

最初に回す Issue は「1ファイルの小さな修正」くらいが適当です。見るのは実装の質ではなく次の3点です。

1. `make spec` が**指示書**（`INSTRUCTION_READY`）を出すか。質問状ばかり返るなら Issue の書き方か `spec.md` の調整が必要
2. `make impl` が計画の判定を**1〜2周で**抜けるか。3周で止まるなら受入基準が曖昧
3. 各フェーズの権限拒否の警告（`警告: 許可されていないツール呼び出しが N 件拒否されました`）に
   繰り返し出るコマンドが無いか。あれば allow に足す（ただし §2 A-4 の禁止リストは守る）

権限の allow は**1周回すと足すべきものが分かります。** 先に完璧を目指すより、
拒否の警告を見て足すほうが早く、余分な許可も増えません。

---

## 6. 移植先で変えてはいけない設計

移植時に「簡単にできそう」と削られがちで、削ると静かに効かなくなるものを挙げます。
根拠は [ai-workflow-setup.md](ai-workflow-setup.md) の該当節にも書いてあります。

| 設計 | 実装箇所 | 削ると何が起きるか |
|---|---|---|
| 人間ゲートは spec の後1箇所だけ | `run-phase.sh:174-177` `require_instruction` | ゲートを増やすと自動化の意味が薄れ、減らすと仕様が固まらないまま実装が走る |
| 指示書タグは**行頭アンカー**で探す | `run-phase.sh:175` の `'^<!-- AI-TAG: INSTRUCTION -->'` | 部分一致にすると「指示書（AI-TAG: INSTRUCTION）がありません」と書いた人のコメントでゲートが通る。`check-scripts.sh:71-74` が両側を検査している |
| 判定は受入基準の項番だけで決める | `prompts/plan-judge.md` / `review-judge.md` | 印象を混ぜると3周しても収束しない |
| 収束しなかったら止めて人に投げる | `run-phase.sh` の `halt`（`MAX_ROUNDS`） | 自動で先に進めるとレビューが形式だけになる |
| `RESIDUAL_RISK` / `CODE_REVIEW` は判定に影響しない | `run-phase.sh:334-336` のコメント | 承認を覆せるようにすると、書き手が遠慮して書かなくなる |
| `push` と `gh pr` はエージェントに渡さない | `run-phase.sh:179-229` `create_pr` | 権限ルールの列挙で危険な push の形を塞ぐのは漏れる |
| 各ステップ後に作業ツリーを検査する | `run-phase.sh:151-154` / `:353-362` / `:393-402` | `Write` / `Edit` はパスを絞れないので、これが唯一の担保 |
| git の出力するパスは `-z` で読む | `run-phase.sh:90-103` `worktree_paths` / `:202` | 普通の `--porcelain` / `--name-only` は日本語やスペースを含むパスを `"…"` でクォートするので、`TOOLING_PATHS` の `^` に当たらない。基盤ファイルの改変も、案件のコミットへの混入も**黙って通る**（`core.quotePath=false` でもスペースはクォートされる） |
| 整形チェックが失敗したら止める | `run-phase.sh:123` `format_ok` | 出力が空かだけで判定すると、フォーマッタ未インストールや構文エラーで何も出さずに落ちたときに「整形済み」になる。移植先で `format_ok` を書き換えるときに最も戻りやすい |
| コストログは**追記**する | `run-phase.sh:59-62` | 起動ごとに切り詰めると `make impl` → `make review` で前半の記録が消える |
| `SLACK_WEBHOOK_URL` を `env -u` で外す | `claude-run.sh:72` | Makefile が export しているので、外さないと `echo` で読めてしまう |
| メッセージ中の変数は `${x}` と書く | `check-scripts.sh:25-31` が静的検査 | macOS の bash 3.2 は `$x日本語` の先頭バイトを変数名に取り込み、`set -u` で落ちる。**エラー文の中で起きるので、失敗したときだけ落ちる** |
| 権限ファイルを `settings.json` という名前にしない | `claude-run.sh:9-15` | workspace が trust されていないと `permissions.allow` が黙って無視される。さらに `deny` が人間の対話セッションまで縛る |
| モデル変数は製品名でなく能力ティアで名付ける | `Makefile:9-14` / `run-phase.sh:33-34` | どのフェーズにどちらを割り当てるかは方針であって固定ではない（`REVIEW_JUDGE_MODEL` で実際に入れ替えて試している）。`OPUS_MODEL` のような名前は入れ替えた瞬間に嘘になる。ステップのラベルにもモデル名を入れない — 実際に使ったIDは `claude-run.sh:93` が次の行に出す |

---

## 7. 移植後に見直す余地

このリポジトリで未決着のまま運用しているもの。移植先でも同じ判断が必要になります。

- **`pr-review`（Devil's Advocate）を持っていくか。** コストが1ステップで1周の41%を占めたため
  メインフローから外し、`make pr-review` の単独実行だけ残してあります（`run-phase.sh:380-418`）。
  使わないなら `prompts/pr-review.md` と `.claude/pr-review-permissions.json` の `git restore` は不要ですが、
  `code-review` が同じプロファイルを使っているのでファイル自体は必要です。
- **判定役のモデル。** `REVIEW_JUDGE_MODEL=fast`（`Makefile:25`、`run-phase.sh:234-249`）で実装レビューの判定だけ
  高速ティア（このリポジトリでは Sonnet）に落とせます。計画の判定は文章同士の突き合わせで実行による
  裏取りができないため強ティア（Opus）固定にしてあります。
- **`MAX_ROUNDS` の既定値3。** `Makefile:4`。受入基準が曖昧なときにここで止まります。

---

## 8. 移植先で必要な前提

[ai-workflow-setup.md](ai-workflow-setup.md) の §2 に書いてあります。要点だけ:
`claude` / `gh`（認証済み）/ `jq` / `curl`、Slack Incoming Webhook、
モデルID（環境変数 `CLAUDE_CODE_OPUS_MODEL` / `CLAUDE_CODE_SONNET_MODEL`、または `.env` の `STRONG_MODEL` / `FAST_MODEL`）、GitHub Issue を使う運用。
