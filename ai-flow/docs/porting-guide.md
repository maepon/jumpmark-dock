# AI開発フローを他リポジトリへ移植する手順

このリポジトリ（jumpmark-dock）の AI開発フロー（`make spec` → `make impl`）を別のリポジトリで使うための手順です。
**何をコピーし、何を書き換えるか**を、このリポジトリの該当箇所と対応づけて並べてあります。

移植先に持っていく導入・運用ガイドは [ai-workflow-setup.md](ai-workflow-setup.md) です。
あちらは単体で完結しているので、ファイル一式と一緒に移植先へ置いてください。
こちらの手順書は移植元に残す作業メモです。

> **案件ごとの設定はルートの `.ai-flow/` に分けてあります**（#38 の Step 1）。テスト・整形のコマンド、ベースブランチ、
> 権限の追加分、事故カタログ、案件の前提はそちらに移したので、§3（A. 言語とツール）と §4（B. パスとドメインの言葉）で
> 「`prompts/` や `.claude/` を書き換える」としている箇所の多くは、**`.ai-flow/` のファイルを書く**ことに置き換わっています。
> 対応は [ai-workflow-setup.md](ai-workflow-setup.md) の「9. 導入時チェックリスト」が最新です。
> この手順書は、別リポジトリへの切り出し（#38 の Step 4）のときに導入ガイドとして書き直します。

## この手順書の前提

- **移植元の構成**: フロー一式を `ai-flow/` にまとめて置き、`ai-flow/` をカレントディレクトリにして `make` を叩く。
  案件は Chrome 拡張機能（素の JavaScript）で、テストは `npm test`（Node の組み込みテストランナー）、整形は prettier
- **場所の指し方**: 行番号は書きません。スクリプトやプロンプトを直すたびにずれるためです。
  「`run-phase.sh` の `unformatted_files`」「`_rules.md` の「作業ディレクトリとコマンド」節」のように、
  関数名・変数名・節の見出しで指します。ファイルの中で探すときは、その名前で検索してください
- **移植元の移植元**: このフローはもともと Go のリポジトリのルートに置かれていたものを、ここへ移植したものです。
  コメントに「移植元の Go のリポジトリで起きた」とあるのはその事例です。番号の付いた Issue（#9、#10 など）は
  このリポジトリのものです

---

## 1. 持っていくファイル

`ai-flow/` を丸ごと持っていきます（`ai-flow/tmp/` と `ai-flow/.env` は除く）。
案件ごとの設定はルートの `.ai-flow/` に置きます。このリポジトリのものをひな形としてコピーし、中身を書き換えてください。

| ファイル | 移植時の扱い |
|---|---|
| `Makefile` | **そのまま**（`BASE_BRANCH` などは `.ai-flow/config.mk` に書く） |
| `.env.example` | そのまま（モデルIDを .env に書く例つき） |
| `scripts/run-phase.sh` | **そのまま**（整形チェックは `.ai-flow/config.mk` の `FORMAT_FILE_CMD` / `FORMAT_GLOBS` / `FORMAT_FIX_CMD`）＋ コメントの事情説明 |
| `scripts/claude-run.sh` | **そのまま**（言語非依存。冒頭の実測メモも一緒に運ぶ） |
| `scripts/render-prompt.sh` / `scripts/merge-permissions.sh` | **そのまま** |
| `scripts/check-scripts.sh` | **そのまま** |
| `scripts/selftest.sh` | **期待値を合わせる**（`TOOLING_PATHS` や整形の対象拡張子を変えたら、`tooling_state` / `unformatted_files` の節の期待値も直す） |
| `scripts/notify-slack.sh` | **そのまま** |
| `prompts/_rules.md` | **「作業ディレクトリとコマンド」「この案件の約束」を書き換え**（最もリポジトリ固有） |
| `prompts/spec.md` | コマンドの書き方の例とドキュメント名を差し替え |
| `prompts/plan.md` | ドキュメント名だけ |
| `prompts/plan-judge.md` | **そのまま** |
| `prompts/plan-revise.md` | **そのまま** |
| `prompts/implement.md` | テスト・整形コマンドを差し替え |
| `prompts/review-judge.md` | テストコマンド・使えるコマンドの一覧・事故カタログを差し替え |
| `prompts/review-fix.md` | テスト・整形コマンドを差し替え |
| `prompts/pr.md` | ブランチ規約と基盤ファイルの一覧を差し替え |
| `prompts/code-review.md` | 言語のパスAPI・実行方法を差し替え |
| `prompts/pr-review.md` | テストコマンド・通常の使い方を差し替え（使わないなら持っていかなくてよい） |
| `.claude/*-permissions.json` | **そのまま**（言語のコマンドの allow は `.ai-flow/permissions.json` に書く） |
| ルートの `.ai-flow/` | **ひな形としてコピーして書き換える**（`config.mk` / `permissions.json` / `context.md` / `risk-catalog.md` / `user-flows.md`） |
| `docs/ai-workflow-setup.md` | 導入・運用ガイド。移植先でセットアップする人と運用する人が読む |

### 持っていかないファイル

| ファイル | 理由 |
|---|---|
| `.claude/settings.local.json` | 個人の許可リスト。gitignore 済み。移植先で自然にたまる |
| `.claude/settings.json` | このリポジトリには無い。**作らない**（理由は `claude-run.sh` 冒頭のコメントと §7） |
| `.env` | 各自の値。`.env.example` からコピーさせる |
| `tmp/` 配下 | 実行時に作られる作業ファイル |
| `docs/porting-guide.md` | この手順書。移植元に残す |

### コピーではなく追記するもの

移植先の**ルートの** `.gitignore` に以下を足します（このリポジトリの `.gitignore` の該当部分と同じ形）。

```gitignore
# 個人設定だけを無視する（*-permissions.json はフローの共有ファイルなのでコミットする）
.claude/settings.json
.claude/settings.local.json

# フローの設定値（Slack の Webhook URL）
.env

# エージェントの作業ファイル。必須
ai-flow/tmp/

# グローバル gitignore で .claude を無視している環境向けに、フローの権限ファイルを戻す
!ai-flow/.claude/
!ai-flow/.claude/*-permissions.json
```

**`ai-flow/tmp/` は必須です。** エージェントがコメント本文や使い捨てのテストを書き出す場所で、
ここが git 管理下だと、`run-phase.sh` の作業ツリー検査（`run_step` の後の `tooling_state` と整形チェック、
`phase_code_review` / `phase_pr_review` の前後比較）が毎回発火してフローが止まります。

最後の2行は、グローバル gitignore に `.claude` を入れている人がいると、権限ファイルがコミットされずに
フローが権限なしで動く（黙って全部拒否される）のを防ぐためです。

---

## 2. 配置の選び方

フローはリポジトリのルートに置くことも、`ai-flow/` のようなサブディレクトリにまとめて置くこともできます。
**このリポジトリはサブディレクトリ配置です。** 迷ったらこちらを勧めます。

### サブディレクトリに置く理由

移植先に同じ名前のものがあると、既存のものまでフローの保護と検査の対象になります。

| 名前 | ルートに置いてぶつかると起きること |
|---|---|
| `Makefile` | 上書きすると既存のターゲットが消える。取り込んでも `help` / `check` / `.DEFAULT_GOAL` / `ISSUE` が衝突しうる。`TOOLING_PATHS` が Makefile 全体を保護するので、**エージェントが案件で Makefile を直せなくなる** |
| `scripts/` | 既存のスクリプトまで保護対象になる。さらに `check-scripts.sh` が `scripts/*.sh` の全部に `bash -n` と非 ASCII 検査を掛けるので、**既存の zsh 用スクリプトや、エラー文に日本語を含むスクリプトで `make check` が落ち、全フェーズが始まらない** |
| `prompts/` | LLM を使うアプリでよくある名前。既存のプロンプトまで保護対象になり、案件の変更として直せない |
| `docs/` | 案件のドキュメントまで保護対象になり、ドキュメントを更新する PR が作れない |
| `.env` | Node / Python の dotenv と衝突する。Makefile が `-include .env` で**make の構文として**読むので、`#` 以降がコメントとして消える、`$` が展開される、複数行の値で make ごと落ちる |

サブディレクトリに置けば、これらはすべて起きません。`ai-flow/.env` は案件の `.env` と別のファイルになります。

### サブディレクトリに置くときの注意（4点）

どれもこのリポジトリで実際に踏んだものです。

1. **git が出すパスは、どこで実行してもリポジトリのルートからの相対。**
   `git status --porcelain` / `git diff --name-only` は、`ai-flow/` で実行しても `ai-flow/scripts/run-phase.sh` や
   `docs/privacy-policy.md` の形で出します。そのため次の2つはルートからのパスで書きます。
   - `run-phase.sh` の `TOOLING_PATHS` は `ai-flow/` を前置する（§4 B-1）。前置しないと、フロー自身の
     `scripts/` などの改変は素通りし、ルートの同名ディレクトリ（案件の `docs/` など）は基盤扱いされて止まる（#10 で発覚）
   - `run-phase.sh` の `unformatted_files` は、ファイルの存在確認と整形チェックの前にリポジトリのルートを前置する。
     前置しないと、`ai-flow/` から見て案件のファイルが「存在しない」扱いになり、整形チェックが素通りする
2. **エージェントは `ai-flow/` で動き、ルートへの `cd` は拒否される。**
   受入基準やプロンプトに書くコマンドは、どこから実行しても同じ結果になる形にします。
   - 整形: `npm run format:check`（npm が上の階層の `package.json` を見つけてルートで実行する）。
     `npx prettier --check "**/*.js"` は `ai-flow/` 以下しか見ない（#9、#13 で問題になった）
   - 検索: `git grep -n "<パターン>" -- ':/'`（`':/'` が無いと `ai-flow/` 以下しか検索しない）
   - 案件のファイルは `../popup.js` のように読む

   これは `_rules.md` の「作業ディレクトリとコマンド」節と、`spec.md` の受入基準の書き方に入っています。
3. **`tmp/` は `ai-flow/tmp/`。** エージェントのプロンプトでは `tmp/` と書いてあり、カレントからの相対でここを指します。
4. **`scripts/selftest.sh` が 1 と 2 の一部を検査している。** `ai-flow/` を持つ使い捨てリポジトリを作り、
   その `ai-flow/` から `tooling_state` と `unformatted_files` を動かして期待値と比べます。
   パスの定義を変えたら、期待値も合わせてください。

別の名前のディレクトリに置くなら、`TOOLING_PATHS`、`_rules.md` と `pr.md` の基盤ファイルの一覧、
`selftest.sh` の期待値、`.gitignore` の追記、`_rules.md` / `spec.md` の `ai-flow/` への言及を置き換えます。
スクリプト同士の参照（`./scripts/…`、`prompts/…`、`.claude/…`）はカレントからの相対なので、ディレクトリ名に依存しません。

### ルートに置く場合

> **サポートしなくなりました**（#38 の Step 2）。フローはサブディレクトリに置いてください。名前と深さは自由です。
> `make check` と `run-phase.sh` は、ルートに置かれていると止まります。以下は経緯として残しています。

移植元の Go のリポジトリはこの形でした。`TOOLING_PATHS` から `ai-flow/` を外し
（例: `'^(Makefile|scripts/|prompts/|\.claude/|docs/|\.gitignore|\.env\.example)'`）、
`selftest.sh` の使い捨てリポジトリもルート配置の形に直します。
上の表の衝突が無いことを先に確かめてください。`Makefile` だけがぶつかるなら、フローのターゲットを
`ai-flow.mk` に移して既存の `Makefile` に `include ai-flow.mk` の1行を足す手があります
（`Makefile.ai` にして `make -f` で呼ぶ形は、`check-scripts.sh` が `Makefile` を名指しで検査している点と、
中断メッセージの「`make review ISSUE=n` で再開」が動かない点で穴があります）。

---

## 3. 差し替え箇所 — A. 言語とツール

このフローが案件の言語に結合しているのは「テストを走らせる」「整形済みか確かめる」「動かして確かめる」
「それを許可する」の4点だけです。

### A-1. 整形チェック（唯一のシェル側の書き換え）

`run-phase.sh` の「整形チェックの言語依存部分」のコメントの下にある3つだけを書き換えます。
それを使う `unformatted_files` と、`run_step` の中断メッセージは言語に依存しないので触りません。

| 書き換えるもの | 約束 | 現状（JS / prettier） |
|---|---|---|
| `format_target` | 整形チェックの対象なら真 | `case "$1" in *.js\|*.css\|*.html) return 0 ;; esac; return 1` |
| `format_ok` | **整形済みなら真。チェック自体が失敗したら偽** | `npx prettier --check "$1" >/dev/null 2>&1` |
| `FORMAT_FIX` | 中断メッセージで案内する整形コマンド | `npx prettier --write` |

`format_ok` は**終了コードで答えます。** ツールによって「整形済み」の伝え方が違うので、ここで揃えます。

| 言語 | `format_ok` の中身 | `FORMAT_FIX` |
|---|---|---|
| TypeScript / JS（現状） | `npx prettier --check "$1" >/dev/null 2>&1` | `npx prettier --write` |
| Go | `local out; out=$(gofmt -l "$1" 2>/dev/null) && [ -z "$out" ]` | `gofmt -w` |
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
- `format_ok` には**ルートを前置した絶対パス**が渡ります（§2 の注意1）。ツールが絶対パスを受け付けるかを確かめてください

**設計意図を壊さないこと**が要点です。

- **シェルは整形しない。** 未整形なら中断して、整形はエージェントにやらせます。シェルが差分を書き換えると、
  レビュアーが読んだ内容と実際の差分が食い違うため（`unformatted_files` の上のコメント）
- **対象は作業ツリーに出ているファイルだけ。** リポジトリ全体に掛けると、既存の未整形ファイルで毎回止まります
- 削除・リネーム元は、`unformatted_files` の中のファイルの存在確認で除外しています
- **対象ファイルの一覧は `worktree_paths` から取る。** `git status --porcelain | cut -c4-` に戻すと、
  日本語やスペースを含むファイル名が `"…"` でクォートされて存在確認に落ち、黙って検査対象から外れます（§7）

> フォーマッタが無い言語・整形を強制しない方針のリポジトリでは、`format_target` を常に偽（`return 1` だけ）にして構いません。
> その場合、代わりにリンタのチェックを `format_ok` に同じ約束で入れると同等の働きをします。

### A-2. プロンプト内のテスト・整形コマンド

| ファイル | 場所 | 現状 |
|---|---|---|
| `prompts/implement.md` | 手順の「テスト」「整形」の項目と、返答に含めるもの | `npm test` / `npx prettier --write` / `npx prettier --check` |
| `prompts/review-fix.md` | 同上 | 同上 |
| `prompts/review-judge.md` | 手順の「テストを自分で走らせる」と「AC ごとに『何で確かめたか』を明記する」節の使えるコマンドの一覧 | `npm test` / `npm run format:check` / `node --test` / `git grep` など |
| `prompts/pr-review.md` | 主張2の手順 | `npm test` |
| `prompts/_rules.md` | 「作業ディレクトリとコマンド」節 | 整形・テスト・検索のコマンドと、使えないコマンド |
| `prompts/spec.md` | 指示書の「受入基準」の書き方 | 整形は `npm run format:check`、検索は `git grep … -- ':/'` で AC を書かせる |

置き換えの例: `pnpm test` / `pytest -q` / `cargo test` / `./gradlew test` / `bundle exec rspec`。
整形の「リポジトリ全体を見るコマンド」は、`package.json` の scripts のように**実行場所に依存しない入口**を用意して、
それを受入基準に書かせるのが安全です（§2 の注意2）。

**テスト結果をキャッシュするツールなら、無効にする指定を付けてください**
（Go の `-count=1`、Gradle の `--rerun-tasks`、Turborepo の `--force`、Nx の `--skip-nx-cache`、Bazel の `--nocache_test_results`）。
Node の組み込みテストランナーや pytest、Jest はもともと前回の結果を再生しないので、何も足さなくて構いません。
判定役は「テストを自分で走らせる。報告を信用しない」（`review-judge.md` の手順）建てなので、
前回の成功が再生されると裏取りにならず、この一行が効かなくなります。

### A-3. 動かして確かめる経路

判定役とコードレビューには「コードを読むだけでなく、利用者が通る経路を実際に通す」ことを求めています。

| ファイル | 場所 |
|---|---|
| `prompts/review-judge.md` | 「事故カタログの巡回」の後の、実際に走らせる方法の段落 |
| `prompts/code-review.md` | 観点4の最後の段落 |
| `prompts/pr-review.md` | 主張3の最後の段落 |

現状は「`tmp/` に使い捨てのテストファイルを書いて `node --test <ファイル>` で該当関数を呼ぶか、`npm test` を通す」です。
**この拡張機能自体（`background.js` / `popup.js` / `options.js`）は Chrome 上でしか動かない**ので、
ロジックを切り出した `shared.js` の関数を中心に確かめさせています（`review-judge.md` の同じ段落）。

移植先の起動方法に差し替えます（`npm run cli -- …` / `python -m yourpkg …` / `cargo run -- …`）。
ライブラリで CLI が無いなら「テストを1本書いて走らせる」のままで構いません。

あわせて `code-review.md` の観点3の「パス操作（`path.join` を使わず…）」を、言語のパス結合APIに直します
（Python は `pathlib.Path` / `os.path.join`、Go は `filepath.Join`、Rust は `Path::join`）。
観点として見せたいのは「文字列結合でパスを作っていないか」なので、API名が合っていないと指摘が空振りします。

### A-4. 権限プロファイルの allow

3つのプロファイルの `permissions.allow` に、案件の言語のコマンドが並んでいます。現状は次のとおりです。

```jsonc
"Bash(npm test:*)", "Bash(npm run format:check)", "Bash(git grep:*)", "Bash(node --test:*)",
"Bash(npx prettier:*)", "Bash(node --version)", "Bash(npm --version)",
```

言語に依存しない `echo` / `mkdir` / `which` / `cd` / `gh issue view` / `gh issue comment` / `git diff|log|status` /
`git grep` / `Read` / `Edit` / `Write` はそのままです（`gh issue comment` は `phase-permissions.json` だけ、
`git restore` は `pr-review-permissions.json` だけ。理由は各ファイル冒頭の `//` 注記）。

差し替えの型は言語ごとに次のようになります。

```jsonc
// Python
"Bash(pytest:*)", "Bash(ruff:*)", "Bash(mypy:*)", "Bash(python -m pytest:*)", "Bash(python --version)",

// Go
"Bash(go test:*)", "Bash(go build:*)", "Bash(go vet:*)", "Bash(gofmt:*)", "Bash(go version)",

// Rust
"Bash(cargo test:*)", "Bash(cargo build:*)", "Bash(cargo clippy:*)", "Bash(cargo fmt:*)",
```

3つの注意があります。

1. **絶対パス形も要ることがある。** エージェントが PATH 解決の結果として絶対パスで呼ぶことがあり、
   その形は別ルール扱いになります（移植元の Go のリポジトリでは `Bash(/usr/local/go/bin/go test:*)` が必要だった）。
   最初の1周で拒否の警告に絶対パスが出たら、`which <コマンド>` で実体パスを確認して足してください。
2. **汎用の読み取りコマンドと、何でも走る形を足さない。** `grep` / `cat` / `sed` / `awk` / `head` / `tail` / `cp` /
   `find` / `xargs` を1つ通すと `Read(./.env)` の deny を素通りできます。`git -C` / `go -C` も、前置一致をずらして
   `git push` の deny を迂回できるため入れません。シェルとインタプリタも、`bash` / `sh` / `env` / `eval` や、
   `python -m:*`、`python -c` / `node -e` の一行実行、裸の `node` / `npx` の形では入れません。
   `python -m pytest:*` や `npx prettier:*`、`node --test:*` のように、**何を走らせるかまで絞った形**にします。
   `npm run:*` も同じ理由で `npm run format:check` のようにスクリプト名まで書きます。
   `check-scripts.sh` の3番（権限プロファイル）がこの混入を静的に落とします。理由は `phase-permissions.json` の
   `//grep` / `//git-c` / `//node` の注記にあります。
   例外として `git grep:*` は通しています（`//git-grep` の注記。git 管理下のファイルだけを検索するので `.env` は既定で対象外）。
3. **deny の7行は消さない。** `check-scripts.sh` の3番が全プロファイルに以下を要求します。
   1つでも欠けると `make check` が落ち、フェーズが始まりません。

   ```
   Read(./.env)  Bash(git push)  Bash(git push:*)  Bash(gh pr:*)
   Bash(rm:*)    Bash(git rebase:*)  Bash(git reset --hard:*)
   ```

> `npm test` や `node --test` を許可した時点で、エージェントは任意のコードを実行できます。
> 権限リストは**事故の防止**であって隔離ではありません（`claude-run.sh` 冒頭の「隔離ではない」の段落）。
> 実効的な防波堤は ①`.claude/` への書き込みは Claude Code 自身が塞ぐ
> ②`run-phase.sh` が各ステップ後に作業ツリーを検査する
> ③`push` と `gh pr` はそもそも渡さない — の3つです。移植先でもこの3つを外さないでください。

### A-5. 作業ディレクトリとコマンドの規約

`_rules.md` の「シェルコマンドの書き方」と「作業ディレクトリとコマンド」の2節です。

**残すべき点**は言語に関係なく効きます。

- **複合コマンドは許可済みのコマンドでも拒否される** — `cd X && cmd` / `cmd1; cmd2` / 制御構文 /
  `VAR=値 cmd` の前置 / コマンド置換 / パイプ / ヒアドキュメント
- **`cd` は許可済みで、カレントディレクトリは呼び出しをまたいで持続する**
- **テスト用の入力ファイルは `Write` で作る**（`cp` は `Read(./.env)` の deny を迂回できるので渡していない）

これを書いていないと、エージェントが `cd pkg && npm test` を延々と試して拒否され続けます。

書き換えるのは「作業ディレクトリとコマンド」節の中身です。移植先の配置（§2）と、A-2 のコマンドに合わせます。
モノレポで、パッケージごとにディレクトリへ入ってテストを打つ必要があるなら、その手順（`cd` を1回、次の呼び出しで
コマンドを1回）もここに書きます。

---

## 4. 差し替え箇所 — B. パスとドメインの言葉

### B-1. 基盤ファイルの定義

`run-phase.sh` の `TOOLING_PATHS`:

```bash
TOOLING_PATHS='^(ai-flow/(Makefile|scripts/|prompts/|\.claude/|docs/|\.env\.example)|\.gitignore)'
```

これが2箇所で効きます。

1. 各ステップの後に、エージェントが基盤ファイルを書き換えていたら中断する（`run_step` の中の `tooling_state` の比較）
2. 案件のコミットに基盤ファイルが混ざっていたら PR を作らない（`create_pr` の混入検査）

パスはリポジトリのルートからの相対で書きます（§2 の注意1）。`.gitignore` がルートのまま入っているのは、
フロー用の規則（`ai-flow/tmp/` や `!ai-flow/.claude/`）をルートの `.gitignore` に書いているためです。
CI 設定（`.github/workflows/`）を含めるかは移植先で決めてください。含めると、エージェントに CI を触らせない代わりに、
CI 変更を人が別コミットで入れる運用が必須になります。

**同じ一覧がプロンプトにも2つあります。** 変えるときは、`selftest.sh` の期待値も含めて4箇所をそろえます。

| 場所 | 役 | ずれたときに起きること |
|---|---|---|
| `run-phase.sh` の `TOOLING_PATHS` | 機械的な検査（正） | — |
| `_rules.md` の「この案件の約束」節 | 全フェーズへの「変更しない」 | 書き換えてからステップ後の検査で中断する（1周無駄になる） |
| `pr.md` の手順4（ステージする範囲） | PR 作成時の「ステージしない」 | コミットまで終えてから PR 作成で中断する（1周無駄になる） |
| `selftest.sh` の `tooling_state` の節 | 判定の回帰テスト | `make check` が落ちる（ずれに気づける） |

### B-2. 消えると困る成果物の保護

判定役とレビュアーには「疑わしいものは実際に走らせろ」と言っています。その結果、**確定済みの成果物を
消させてしまう経路**が開きます。移植元の Go のリポジトリでは、生成済みのデータや結果ファイルを
コマンドの入力・出力に渡さないよう、`review-judge.md` / `code-review.md` / `pr-review.md` の実行方法の段落（A-3）で禁じていました。

**このリポジトリには該当するものがありません。** そのため、現状は「実行して確かめる場所は `tmp/` の下だけ」
「`rm` は許可されていないので後片付けは不要（`tmp/` は git 管理外）」の2点だけが入っています。

移植先に「消えると困るもの」（gitignore 対象の生成データ、手で集めた入力など）があるなら、A-3 の3つの段落に
「〜は入力にも出力にも渡さない」を足してください。gitignore 対象は作業ツリーの検査に出ないので、
守る手段はプロンプトの禁止だけです（`phase-permissions.json` の `//write` の注記）。

### B-3. 事故カタログ

`review-judge.md` の「事故カタログの巡回」は、受入基準の外に残った危なさを `RESIDUAL_RISK` として書かせるための
巡回リストです。現状は、このリポジトリで起きた事故とその近くにある危なさから作っています
（インポート値の未エスケープ、URL のスキーム・正規化、双方向リンクの片側だけの変更、`chrome.storage.sync` の上限、
拡張機能が動かないページ、未翻訳の文言、`await` の付け忘れ、0件・空の入力）。

**移植先のドメインに合わせて入れ替えてください。** 空にすると `RESIDUAL_RISK` が「特にありません」しか出さなくなります。

汎用の種として使えるもの: 冪等性のない再実行、部分失敗を成功として返す経路、
リトライで二重に効く副作用、タイムゾーン・ロケール依存、並行実行時の書き込み衝突、
外部APIのレート制限・タイムアウト時の扱い、入力と出力が同じ場所を指す、シンボリックリンクと `..`。

### B-4. ドキュメント名とブランチ規約

| ファイル | 場所 | 現状 | 差し替え |
|---|---|---|---|
| `prompts/spec.md` | 手順2 | ルートの `CLAUDE.md` / `README.md` を読む | 移植先の規約ファイル |
| `prompts/plan.md` | 手順 | ルートの `CLAUDE.md` を読む | 同上 |
| `prompts/_rules.md` | 「この案件の約束」節 | ルートの `CLAUDE.md` / `README.md` に従う。案件のドキュメントは `README.md` / `CHANGELOG.md` / ルートの `docs/` | 同上 |
| `prompts/pr-review.md` | 主張3 | `README.md` と `CLAUDE.md` に書かれた通常の使い方（ブックマーク登録、URL パターンでの検索など） | 移植先の通常の使い方 |
| `prompts/pr.md` | 手順3 | `feature/issue-{{ISSUE}}-<英小文字とハイフンの短い要約>` | ブランチ規約 |
| `scripts/run-phase.sh` | `create_pr` の冒頭の `case` | `feature/*` で始まるかの検査 | `pr.md` の手順3と揃える |
| `Makefile` | `BASE_BRANCH ?=` | `master`（PR のベース） | 移植先の既定ブランチ。スクリプトは環境変数で、プロンプトは `{{BASE_BRANCH}}` で受けるので、ここ以外は触らない。直書きは `check-scripts.sh` の5番が落とす |
| `Makefile` | `REPO_URL :=` | `git@github.com:` → `https://github.com/` の sed | GitHub Enterprise なら書き換え |

`pr.md` のブランチ名と `create_pr` の検査は**必ずセットで直します。**
片方だけ直すと、エージェントがコミットまで終えた後に PR 作成で中断します（作業は失われませんが1周無駄になります）。

### B-5. コメントに書かれた事情

動作には影響しませんが、移植先で読んだ人（とエージェント）が存在しないディレクトリや Issue を探すことになるので、
削るか自分の事情に書き換えます。探すときは `git grep -nE '#[0-9]+|移植元'` で当たります。

| 場所 | 中身 | 扱い |
|---|---|---|
| `run-phase.sh` の `TOOLING_PATHS` の上 | #10 で発覚したパスのずれ | Issue 番号だけ削る。理由の文は残す |
| `run-phase.sh` のコストログ（`COST_LOG` への追記）の上 | 移植元で起きた、記録が消える事故 | 理由の文は残す |
| `run-phase.sh` の `handle_verdict` の上 | #9 の空回り | Issue 番号だけ削る |
| `run-phase.sh` の `unformatted_files` / `ensure_pr_url` / `require_instruction` の上 | 実測で見つかった事情 | Issue 番号だけ削る |
| `run-phase.sh` の `REVIEW_JUDGE` の `case` の上 | 判定役のモデルを分けた根拠（移植元の差し戻しの内容） | 理屈は残し、件数の話は自分の事情に |
| `check-scripts.sh` の冒頭 | 移植元で踏んだ、エラー文の中の変数展開 | 理由の文は残す |
| `check-scripts.sh` の3番（allow 禁止の説明） | `go -C` | 禁止パターン側の `go -C` は残して害はない |
| `selftest.sh` の冒頭 | #9、#10 で見つかったバグの一覧 | Issue 番号だけ削る |
| `.claude/*-permissions.json` の `//` 注記 | #9、#10、#13 の事情 | Issue 番号だけ削る |
| `prompts/_rules.md` の「この案件の約束」節 | `CLAUDE.md`、案件のドキュメント | **全面書き換え** |

`_rules.md` の「この案件の約束」で**形として残すべき3点**:

```markdown
- 基盤ファイル（`ai-flow/` 配下の `Makefile`、`scripts/`、`prompts/`、`.claude/`、`docs/`、`.env.example` と、ルートの `.gitignore`）は変更しない
- Slack 通知は自分で送らない。make が送る
- （移植先のリポジトリ規約ファイルに従う、の1行）
```

基盤ファイルの行は `TOOLING_PATHS` と揃えます（B-1）。

---

## 5. 過去の事故への参照

プロンプトにはこのリポジトリの Issue 番号が埋まっています。

| ファイル | 場所 | 内容 |
|---|---|---|
| `prompts/spec.md` | 受入基準の書き方（既存のリポジトリの状態で満たせるか） | #9 で、未整形の既存ファイルが AC-13 と AC-15 を両立不能にした |
| `prompts/review-judge.md` | 事故カタログ | #6、#8、#9、#13 の事故 |
| `prompts/review-judge.md` | `NEEDS_HUMAN` にするときの例 | #9 の AC の組み合わせ（番号は書いていない） |

**番号は移植先では意味を持ちませんが、理屈は持ちます。** 伝えたいのは
「受入基準に忠実であることは、事故を防ぐことと同じではない」「受入基準そのものが満たせないこともある」という点です。

移植の初期は番号を外して原則だけ書き、移植先で最初の事故が起きたらその Issue 番号を書き足してください。
**自分のリポジトリで起きた具体例が1件入ると、この段落は目に見えて効くようになります。**
他リポジトリの事故例を借りたままにするのは、読み手（エージェント）が検証できないぶん弱くなります。

---

## 6. 移植の手順

```sh
# 1. コピー（移植先リポジトリのルートで）
cp -R <このリポジトリ>/ai-flow .
rm -rf ai-flow/tmp ai-flow/.env ai-flow/docs/porting-guide.md

# 2. ルートの .gitignore に追記（§1 参照）。ai-flow/tmp/ は必須

# 3. §3〜§5 に沿って書き換える

# 4. 静的検査と回帰テストが通ることを確認（課金なし）
cd ai-flow
make check
```

`make check` は `check-scripts.sh` を走らせ、その最後で `selftest.sh`（`run-phase.sh` の関数の回帰テスト）も呼びます。
`gh` と `npx` はスタブに差し替えるので、ネットワークにも課金にも触れず、数秒で終わります。
`format_ok` を別の言語のツールに書き換えた場合も、`selftest.sh` の `npx` のスタブはそのまま使えます
（スタブが見るのは「ファイルが存在するか」と「中身に `UNFORMATTED` を含むか」だけで、見たいのはパスの扱いなので）。
ただし `format_ok` が `npx` 以外のコマンドを呼ぶなら、そのコマンドのスタブを `selftest.sh` に足してください。

**`.env` を分けたいとき。** サブディレクトリ配置なら `ai-flow/.env` は案件の `.env` と別ファイルなので不要です。
ルート配置で案件の `.env` とぶつかるなら、`.env.ai` などの別名にします。直すのは `Makefile` の `-include .env`、
`.gitignore`、`.env.example` の名前、`check-env` のメッセージです。さらに**全プロファイルの deny に `Read(./.env.ai)` を足し、
`check-scripts.sh` の3番の必須 deny にも足します。** 足さないと、エージェントが Webhook URL を読めます。
既存の `.env` にもアプリのシークレットが入っているはずなので、`Read(./.env)` は消さずに残します。

### 課金せずに確かめられること

`ai-flow/` で実行します。

| 確認 | コマンド | 見るもの |
|---|---|---|
| 静的検査と回帰テスト | `make check` | `selftest: … すべて通過しました。` と `check: 基盤ファイルの静的検査は問題なしです。` |
| 環境変数 | `make check-env` | Slack webhook とモデル2つ |
| ヘルプ | `make help` | フェーズの説明が移植先の実情と合っているか |
| 未知フェーズ | `./scripts/run-phase.sh bogus 99999 "http://x"` | `fail` のメッセージが出て Slack が飛ぶか |
| Slack | `./scripts/notify-slack.sh "http://x" "テスト"` | Slack に届くか |
| 人間ゲート | 指示書の無い Issue で `make impl ISSUE=n` | `指示書がありません` で止まるか（`require_instruction`） |

`run-phase.sh` を直接叩くとコストログに見出し行が追記されます。実在する Issue 番号で試すと
本番の記録に混ざるので、`99999` のような使っていない番号にしてから `tmp/cost-issue99999.txt` を消してください。

### 最初の1周は小さく

最初に回す Issue は「1ファイルの小さな修正」くらいが適当です。見るのは実装の質ではなく次の4点です。

1. `make spec` が**指示書**（`INSTRUCTION_READY`）を出すか。質問状ばかり返るなら Issue の書き方か `spec.md` の調整が必要
2. 指示書の受入基準のコマンドが、`ai-flow/` から実行しても正しく動く形になっているか（§2 の注意2）
3. `make impl` が計画の判定を**1〜2周で**抜けるか。3周で止まるなら受入基準が曖昧
4. 各フェーズの権限拒否の警告（`警告: 許可されていないツール呼び出しが N 件拒否されました`）に
   繰り返し出るコマンドが無いか。あれば allow に足す（ただし §3 A-4 の禁止リストは守る）

権限の allow は**1周回すと足すべきものが分かります。** 先に完璧を目指すより、
拒否の警告を見て足すほうが早く、余分な許可も増えません。

---

## 7. 移植先で変えてはいけない設計

移植時に「簡単にできそう」と削られがちで、削ると静かに効かなくなるものを挙げます。
根拠は [ai-workflow-setup.md](ai-workflow-setup.md) の該当節にも書いてあります。

| 設計 | 実装箇所 | 削ると何が起きるか |
|---|---|---|
| 人間ゲートは spec の後1箇所だけ | `run-phase.sh` の `require_instruction` | ゲートを増やすと自動化の意味が薄れ、減らすと仕様が固まらないまま実装が走る |
| 指示書タグは**行頭アンカー**で探す | `require_instruction` の `'^<!-- AI-TAG: INSTRUCTION -->'` | 部分一致にすると「指示書（AI-TAG: INSTRUCTION）がありません」と書いた人のコメントでゲートが通る。`check-scripts.sh` の4番が両側を検査している |
| `gh` の失敗を別の意味のエラーに化けさせない | `require_instruction` / `ensure_pr_url` | stderr を捨てると、認証切れや別ブランチでの実行が「指示書がありません」「PR が見つかりません」に見え、原因が分からない。`selftest.sh` が検査している |
| 判定は受入基準の項番だけで決める | `prompts/plan-judge.md` / `review-judge.md` の「判定の決め方」 | 印象を混ぜると3周しても収束しない |
| 収束しなかったら止めて人に投げる | `phase_impl` / `phase_review` のループの `halt`（`MAX_ROUNDS`） | 自動で先に進めるとレビューが形式だけになる |
| 直せない未達は周回を待たずに人へ | `handle_verdict` の `NEEDS_HUMAN` | 受入基準の矛盾などで、修正役に回しても解消しない周を `MAX_ROUNDS` まで空回りする。判定語のずれは `check-scripts.sh` の4b番が検査している |
| `RESIDUAL_RISK` / `CODE_REVIEW` は判定に影響しない | `review-judge.md` の「残存リスクの報告」節、`phase_code_review` の通知文 | 承認を覆せるようにすると、書き手が遠慮して書かなくなる |
| `push` と `gh pr` はエージェントに渡さない | `run-phase.sh` の `create_pr` | 権限ルールの列挙で危険な push の形を塞ぐのは漏れる |
| 各ステップ後に作業ツリーを検査する | `run_step` の `tooling_state` の比較と整形チェック、`phase_code_review` / `phase_pr_review` の前後比較 | `Write` / `Edit` はパスを絞れないので、これが唯一の担保 |
| git の出力するパスは `-z` で読む | `worktree_paths`、`create_pr` の混入検査 | 普通の `--porcelain` / `--name-only` は日本語やスペースを含むパスを `"…"` でクォートするので、`TOOLING_PATHS` の `^` に当たらない。基盤ファイルの改変も、案件のコミットへの混入も**黙って通る**（`core.quotePath=false` でもスペースはクォートされる） |
| git のパスはルートからの相対として扱う | `TOOLING_PATHS`、`unformatted_files` のルート前置 | サブディレクトリ配置で、基盤の保護が素通りし、整形チェックも素通りする（§2）。`selftest.sh` が検査している |
| 整形チェックが失敗したら止める | `format_ok` | 出力が空かだけで判定すると、フォーマッタ未インストールや構文エラーで何も出さずに落ちたときに「整形済み」になる。移植先で `format_ok` を書き換えるときに最も戻りやすい |
| コストログは**追記**する | `run-phase.sh` の `COST_LOG` への見出し行の追記 | 起動ごとに切り詰めると `make impl` → `make review` で前半の記録が消える |
| `SLACK_WEBHOOK_URL` を `env -u` で外す | `claude-run.sh` の `claude -p` の呼び出し | Makefile が export しているので、外さないと `echo` で読めてしまう |
| メッセージ中の変数は `${x}` と書く | `check-scripts.sh` の2番が静的検査 | macOS の bash 3.2 は `$x日本語` の先頭バイトを変数名に取り込み、`set -u` で落ちる。**エラー文の中で起きるので、失敗したときだけ落ちる** |
| 権限ファイルを `settings.json` という名前にしない | `claude-run.sh` 冒頭のコメント | workspace が trust されていないと `permissions.allow` が黙って無視される。さらに `deny` が人間の対話セッションまで縛る |
| モデル変数は製品名でなく能力ティアで名付ける | `Makefile` の `STRONG_MODEL` / `FAST_MODEL`、`run-phase.sh` の `STRONG` / `FAST` | どのフェーズにどちらを割り当てるかは方針であって固定ではない（`REVIEW_JUDGE_MODEL` で実際に入れ替えている）。`OPUS_MODEL` のような名前は入れ替えた瞬間に嘘になる。ステップのラベルにもモデル名を入れない — 実際に使ったIDは `claude-run.sh` がコスト行に出す |

---

## 8. 移植後に見直す余地

このリポジトリで未決着のまま運用しているもの。移植先でも同じ判断が必要になります。

- **`pr-review`（Devil's Advocate）を持っていくか。** 移植元ではコストが1ステップで1周の41%を占めたため
  メインフローから外し、`make pr-review` の単独実行だけ残してあります（`phase_pr_review`、`run-phase.sh` 末尾の `case`）。
  使わないなら `prompts/pr-review.md` と `.claude/pr-review-permissions.json` の `git restore` は不要ですが、
  `code-review` が同じプロファイルを使っているのでファイル自体は必要です。
- **判定役のモデル。** `Makefile` の `REVIEW_JUDGE_MODEL`（このリポジトリの既定は高速ティア）で、計画と実装の判定役の
  モデルを切り替えられます（`run-phase.sh` の `REVIEW_JUDGE` の `case`）。移植元では、計画の判定は文章同士の
  突き合わせで実行による裏取りができないため強ティアに固定していました。どちらが良いかは移植先で A/B してください。
- **`MAX_ROUNDS` の既定値3。** `Makefile` の `MAX_ROUNDS ?=`。受入基準が曖昧なときにここで止まります。
  `NEEDS_HUMAN`（§7）を足してからは、受入基準そのものが満たせない場合は1周目で止まるはずです。
  実際に判定役がこれを使い分けるかは、まだ運用で確かめていません。
- **`git grep` の許可。** 検証の質のために通しています（§3 A-4）。`--no-index` を付ければ git 管理外のファイルも読めますが、
  `node --test` などで任意の読み込みがすでにできるので、実行できる範囲は広がらないと判断しています。
  移植先で `npm test` 相当を許可しないなら、この判断は変わります。

---

## 9. 移植先で必要な前提

[ai-workflow-setup.md](ai-workflow-setup.md) の §2 に書いてあります。要点だけ:
`claude` / `gh`（認証済み）/ `jq` / `curl`、Slack Incoming Webhook、
モデルID（環境変数 `CLAUDE_CODE_OPUS_MODEL` / `CLAUDE_CODE_SONNET_MODEL`、または `.env` の `STRONG_MODEL` / `FAST_MODEL`）、
GitHub Issue を使う運用。案件側には、テストと整形を1コマンドで回せる入口（このリポジトリでは `package.json` の
`test` / `format:check`）があると、受入基準が書きやすくなります。
