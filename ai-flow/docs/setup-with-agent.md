# issue-to-pr-flow — Installing with a coding agent

**This file is written for a coding agent** (Claude Code or similar) that a human has asked to install this flow into their repository,
e.g. "I want to use https://github.com/maepon/issue-to-pr-flow; set it up". Follow it from top to bottom.
Humans who install by hand: see the README's Install section and [setup.md](setup.md) §3 and §9.

The full reference is [setup.md](setup.md). This file says what to do and in what order, what to ask the human,
and when you are done; it points to setup.md for the details instead of repeating them.

---

## Ground rules

- **Talk to the human in their language.** This file is in English; your questions and reports are not.
- **Do not decide what belongs to the human.** The items in step 2 are theirs. Ask them together, once, with a suggested default for each.
  What you can find out from the repository (test and format commands, the default branch) you find out yourself and show as a suggestion.
- **Never edit files under the flow directory** (e.g. `ai-flow/`) in the host repository. It is a copy of a release tag, and the flow
  treats it as tooling. Everything project-specific goes in `.ai-flow/` at the repository root (or the flow directory's `.env`).
  If something under the flow directory looks wrong, stop and tell the human; changes go upstream.
- **Never run `git subtree add/pull <url> <tag>`.** Use the steps in step 3 exactly. Given a URL, `git subtree` reads `FETCH_HEAD` back
  later, and a background fetch (an IDE's autofetch) in between makes it bring in the host repository itself, with no error (setup.md §3).
- **Do not handle secrets.** Do not ask for webhook URLs or tokens in the conversation, and do not print `.env`.
  Tell the human which line to fill in and let them write it.
- **Do not run `make spec` or `make impl`.** They call the paid API and post to Issues. The human runs the first cycle (step 8).
- **Ask before anything outward-facing:** pushing, opening a PR, changing the human's shell profile.

## 1. Check where you are

Run these from the directory the human is working in.

| Check | Command | If it fails |
|---|---|---|
| Inside a git repository, at its root | `git rev-parse --show-toplevel` | Ask which repository to install into |
| A GitHub repository that uses Issues | `gh repo view --json nameWithOwner,hasIssuesEnabled,defaultBranchRef` | Stop: the flow needs GitHub Issues |
| `gh` is authenticated | `gh auth status` | Ask the human to run `gh auth login` |
| Required commands | `claude --version`, `jq --version`, `make --version`, `bash --version` | Tell the human what is missing |
| Clean working tree | `git status --porcelain` prints nothing | Ask the human to commit or stash first (`git subtree add` refuses otherwise) |
| Not installed already | no `.ai-flow/` at the root, no directory containing this flow's `scripts/run-phase.sh` | If it is installed, this is an update: see "Updating" at the end |

Also find out, to suggest defaults in step 2:

- **The latest release tag:**
  `git ls-remote --tags --refs https://github.com/maepon/issue-to-pr-flow.git 'v*' | sed 's,.*refs/tags/,,' | sort -V | tail -1`.
  It is also the first `## [x.y.z]` heading of `CHANGELOG.md` in that repository. Never use a branch (`main`): only tags are releases.
- **Whether the default branch requires signed commits:**
  `gh api "repos/<owner>/<repo>/rules/branches/<default branch>" --jq '.[].type'` lists `required_signatures` when a ruleset requires them.
  Classic branch protection is not covered by that call; if you cannot tell, ask.
- **The model ID environment variables:** `printenv CLAUDE_CODE_OPUS_MODEL CLAUDE_CODE_SONNET_MODEL`. Your shell is non-interactive,
  so a value that only exists in `.zshrc` shows as unset here, and the flow will see it the same way (setup.md §2, Models).
- **The project's test and format commands:** read the build files (`package.json`, `Makefile`, `go.mod`, `pyproject.toml`, CI workflows, …).

## 2. Ask the human

Ask these in one message, each with your suggested default.

1. **Release tag** — the latest one found above.
2. **Flow directory** — `ai-flow/` unless they want another name or depth. Not the repository root (unsupported; setup.md §2).
3. **Branch for this work** — e.g. `chore/install-ai-flow`. Do not commit on the default branch.
4. **`BASE_BRANCH`** — the branch PRs are based on; suggest the default branch.
5. **`OUTPUT_LANG`** — the language of Issue comments, commits, and PRs the flow writes; suggest the language the human is talking to you in.
6. **Model IDs** — the strong and fast model IDs, if the environment variables above are unset. Ask whether to put them in
   the flow directory's `.env` (`STRONG_MODEL = …` / `FAST_MODEL = …`; you can do it) or in their shell profile as
   `CLAUDE_CODE_OPUS_MODEL` / `CLAUDE_CODE_SONNET_MODEL` (`.zshenv`, not `.zshrc`; they do it, or you do it only with their permission).
7. **Notifications** — none, Slack, Google Chat, or a command of their own (setup.md §2, Notifications). For Slack or Google Chat,
   they paste the webhook URL into `.env` themselves.
8. **Signed commits** — only if you could not tell in step 1.
9. **The test and format commands** — show what you found and how you would write them in `config.mk` (step 4), and ask them to confirm.
   If the project has no tests or no formatter, say so: the flow supports both (leave the values empty).

## 3. Bring the flow in

On the branch from step 2 (`git switch -c <branch>`), with `tag` and the flow directory from step 2:

```sh
tag=vX.Y.Z
git fetch https://github.com/maepon/issue-to-pr-flow.git "refs/tags/$tag"
c=$(git rev-parse 'FETCH_HEAD^{commit}')     # read right after your own fetch
git subtree add --prefix=ai-flow "$c" --squash
git diff --stat "$c" HEAD:ai-flow            # must print nothing
```

- Run each line as written, in one shell call so `c` survives. Do not substitute the URL and tag into `git subtree add`.
- **If `git diff --stat` prints anything, stop.** The flow directory does not hold the tag's content. Undo with
  `git reset --hard HEAD~1` only after showing the human the output and getting their agreement.
- **If the default branch requires signed commits**, run `ai-flow/scripts/resign-subtree-merge.sh` now (setup.md §3).
  Do not use `git rebase --gpg-sign` instead.

## 4. Project settings (`.ai-flow/`)

```sh
cp -R ai-flow/examples/project/.ai-flow .ai-flow
```

Then edit the files in `.ai-flow/` (never the copies under `ai-flow/examples/`). Each file explains itself in its comments;
the checklist in setup.md §9 ("Must do") is the authority. The points agents most often get wrong:

- **`config.mk` — commands run from the flow directory**, not the root. `npm test` finds the root `package.json` by itself;
  other paths are relative to the flow directory (`python3 -m unittest discover -s ../tests`). **Run each command from the flow directory
  yourself** to confirm it works before you write it down.
- **`TEST_CMD` must not replay cached results** (Go `-count=1`, Gradle `test --rerun`, …; setup.md §9).
- **Time `TEST_CMD`** when you run it, and report it. Over 2 minutes needs Claude Code's Bash timeout raised, and over 10 minutes
  cannot be verified by the judges at all (setup.md §9). If the commands only work in the human's interactive shell
  (a JDK or Node version set up in `.zshrc`), say so: the flow will not find them either.
- **Never put a command that keeps running** (a dev server, `bootRun`, `spring-boot:run`, …) in `config.mk` or `permissions.json`.
- **`FORMAT_FILE_CMD` checks, never formats**, and exits 0 when the file is formatted. For tools that answer through their output
  (`gofmt -l`), use a wrapper. No formatter: leave all four `FORMAT_*` empty.
- **Java (Gradle or Maven)**: start from `examples/java/.ai-flow/` (`cp ai-flow/examples/java/.ai-flow/* .ai-flow/` after copying the template),
  then adjust the build tool, `MODULE` in `java-scratch.sh` for a multi-module build, and the formatter.
- **More than one module or package** with no single command from the flow directory: copy the wrappers into `.ai-flow/`
  (`examples/go/.ai-flow/` for Go) and call them by a path relative to the flow directory (setup.md §9).
- **`permissions.json`** — allow exactly the commands in `config.mk` and the version checks you need, plus their absolute-path forms
  from `which`. Do not allow general-purpose commands (`cat`, `grep`, `cp`, bare interpreters including `java`, `jshell`, `docker`, `git -C`, …): `make check` rejects many of them,
  and setup.md §6 ("Allows that must never be granted") explains why. Add secret files other than `.env` to `deny` as `Read(//**/<path>)`.
- **`context.md`** — the documents the agents should read and keep up to date in this repository, and pitfalls of its commands. Keep it short:
  it is paid for on every step.
- **`user-flows.md`** — how the project is normally used, from the README.
- **`project-words.txt`** — this project's tool, language, and product names (setup.md §9).
- **`risk-catalog.md`** — leave the generic items; it is filled in as incidents happen.

## 5. Personal settings (flow directory's `.env`)

```sh
cp ai-flow/.env.example ai-flow/.env
```

`.env` is not tracked by git. Write the model IDs here if the human chose that in step 2.
For notifications, tell the human which variable to fill in (`SLACK_WEBHOOK_URL`, `GOOGLE_CHAT_WEBHOOK_URL`, or `NOTIFY_CMD`)
and wait for them to say it is done.

## 6. Check

From the flow directory:

```sh
make check        # project settings, static checks, regression tests; no cost
make check-env    # environment variables; no cost
```

`check: static checks of the tooling files passed.` means the foundation is in place. When something fails, fix `.ai-flow/` or `.env`,
never the flow directory. If the failure points into the flow directory itself, stop and report it.

If the human set up notifications, offer to send a test one (setup.md §3, "Things you can check without cost").

## 7. Commit, and hand over

- `git subtree add` already made its commits. Commit `.ai-flow/` separately (`.env` is ignored and must not be committed).
- Ask before pushing and opening a PR. **The PR must be merged with a merge commit**, not squashed or rebased: later updates find the
  previous version through the subtree commits. Say so in the PR description.

## 8. Report

Tell the human, in their language:

- the tag installed, the flow directory, and the branch
- what you put in `config.mk` and `permissions.json`, and why
- anything from the setup.md §9 "Must do" list you could not settle, and what they need to do about it
- the next step, which is theirs: a first cycle on a **small one-file Issue** (`make spec ISSUE=n`, read the instruction document,
  then `make impl ISSUE=n`), and adding allows from the permission denial warnings it prints (setup.md §9, "The first cycle").
  For day-to-day use, point them to [guide.md](guide.md) ([日本語](guide.ja.md)).

---

## Updating

If the flow is already installed, the request is an update. Read the `CHANGELOG.md` entries between the installed tag
(the `git-subtree-split:` line of the latest `Squashed '<flow dir>/' …` commit in `git log` is the tag's commit;
match it against the `^{}` lines of `git ls-remote --tags https://github.com/maepon/issue-to-pr-flow.git`, or ask the human) and the new one, especially **Changed** items that require edits
to `.ai-flow/`, and tell the human what they mean for this repository before you start. Then, on a new branch:

```sh
tag=vX.Y.Z
git fetch https://github.com/maepon/issue-to-pr-flow.git "refs/tags/$tag"
c=$(git rev-parse 'FETCH_HEAD^{commit}')
git subtree merge --prefix=ai-flow "$c" --squash -m "Update ai-flow to $tag"
git diff --stat "$c" HEAD:ai-flow            # must print nothing
```

Re-sign if required, apply the `.ai-flow/` changes the CHANGELOG calls for, and continue from step 6.
