# Changelog

All notable changes to this flow are recorded here, per tag.
Host repositories bring a tag in with `git subtree merge` (docs/setup.md §3); read the entries since your current tag before updating,
especially **Changed** items that require edits to your `.ai-flow/`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.12.0] - 2026-10-12

### Added

- **`make probe`** (`scripts/probe.sh`): re-checks the Claude Code behaviors that docs/setup.md §6 "Pitfalls found by measurement"
  relies on or works around, in throwaway git repositories, with six short runs on a cheap model (`PROBE_MODEL`, default `haiku`; about $0.25).
  The shell judges each item from the tool calls and their results, logs written by the fixture's scripts, files on disk and
  `permission_denials`, not from the agent's reply; a call not made exactly as asked makes the item undetermined.
  Exits with 1 when a safety assumption no longer holds and 2 when an item is undetermined. Not part of `make check` (#47, #54, #56).
  B9 checks that commands Claude Code allows on its own as read-only (`tail`, `cat`, `head`, `grep`) are still refused on a denied file
  such as `.env`; found when a trial cycle showed `… | tail -5` passing without an allow.
  On 2.1.287 every safety assumption held; some workarounds no longer seem needed (some compound command forms pass,
  refusals by deny now appear in `permission_denials`, an allow in a profile named `settings.json` takes effect)

### Changed

- **`prompts/_rules.md` no longer forbids every compound command.** `&&`, `;`, pipes, heredocs and `cd X && cmd` pass when every part is allowed
  (checked on 2.1.286 and 2.1.287); the rules now list only the forms still denied whatever the permissions say: `VAR=value cmd`,
  command substitution, control structures that expand a variable, and output redirection (`>`; new in the list). On an older Claude Code
  the agents may get a few more denials before falling back to single commands; nothing becomes less safe, since each part is still checked.
  A paid cycle in a trial repository (spec → impl → PR → code review) had no denials; the agents used `&&`, `;` and `2>&1 | tail` (#55)
- **docs/setup.md §6 "Pitfalls found by measurement" is reorganized by ID**: A (workarounds; each row says where it is relied on and
  what to change if it no longer holds) and B (assumptions the safety relies on; what breaks), with the version they were last checked on
  (2.1.287) in one place. It adds B7 (compound commands are checked part by part), B8 (input redirection is checked against the `Read` denies) and B9 (auto-allowed read-only commands are too),
  marks A5a and A6 as no longer holding, and has manual steps for what `make probe` cannot check (A7 in an interactive session,
  B6 with user-level settings). The comments in `scripts/claude-run.sh` and the profiles refer to the IDs
- The profiles keep their `*-permissions.json` names: a `deny` in `settings.json` still binds interactive sessions (A7).
  **Host repositories** do not need to change anything in this release

## [0.11.0] - 2026-10-12

### Added

- **`examples/java/.ai-flow/`**: settings for a Java repository built with Gradle or Maven — `config.mk`, `permissions.json`, `context.md`,
  `project-words.txt` — and `java-scratch.sh` for `SCRATCH_TEST_CMD`. A throwaway file under the flow's `tmp/` is outside every source set,
  so the wrapper compiles the project, asks the build for the test runtime classpath (an init script for Gradle, `dependency:build-classpath`
  for Maven; the build files stay unchanged), and runs the file in source-file mode. `MODULE` picks a subproject or module.
  Checked by hand with Spring Boot 4.1 on Gradle 9.7 (also with the configuration cache) and Maven, single and multi-module;
  `selftest.sh` covers the wrapper's plumbing with stub builds. The formatter settings are left empty and only described (not checked yet).
  setup.md §9 has an item on `SCRATCH_TEST_CMD` for compiled languages
- **Checklist items in `docs/setup.md` §9 for slower, compiled stacks** such as Java / Spring Boot: timing `TEST_CMD` against Claude Code's
  Bash timeout (2 minutes by default, 10 at most) since the judges re-run the whole suite, allowing it as a prefix so the agents can run one test class,
  toolchains set up only in `.zshrc` (SDKMAN, jenv, …), commands that never finish (dev servers, `bootRun`), and `application-local.yml` as an example
  of a secret file to deny. `docs/setup-with-agent.md` has the agent time `TEST_CMD` and report it

### Changed

- **`make check` rejects more allows** in the merged permissions: `java` bare or with nothing after `-jar` / `-cp` / `--source`
  (`java Foo.java` runs a source file; `java -jar <a fixed jar>:*` still passes), `jshell` and `jbang` in every form, `groovy` / `kotlin` / `scala`
  like the other interpreters, and `docker` / `podman` in every form (any image, any mounts). **Absolute-path forms are now checked too**:
  `Bash(/bin/cat:*)` used to pass while `Bash(cat:*)` was rejected, although §9 asks for the absolute-path forms of allowed commands.
  **Host repositories**: if `make check` now reports one of these in `.ai-flow/permissions.json`, narrow it to what you need or remove it
  (setup.md §6, "Allows that must never be granted")
- **Gradle's cache advice** in setup.md §9: `test --rerun` (7.6 or later) or `cleanTest test` instead of `--rerun-tasks`, which also reruns compilation

## [0.10.2] - 2026-10-12

### Added

- **Installation steps for a coding agent** (`docs/setup-with-agent.md`), so that asking Claude Code or a similar agent to "set up
  issue-to-pr-flow" in a host repository goes the same way every time: what to check first, which decisions to ask the human
  (tag, flow directory, `OUTPUT_LANG`, model IDs, notifications, …), the `git subtree` steps exactly as in §3, filling in `.ai-flow/`
  against the §9 checklist, and when it is done. It keeps the agent out of the flow directory and away from secrets, and leaves
  `make spec` / `make impl` to the human. English only: the agent reads it and talks to the human in their language.
  The README's Install section points agents to it. **Host repositories** do not need to change anything

## [0.10.1] - 2026-10-09

### Added

- **A user guide** for the people who use the flow day to day, in English (`docs/guide.md`) and Japanese (`docs/guide.ja.md`):
  writing Issues, reading the instruction document, the Issue comment types, what to do when a phase stops and how to resume,
  and what to look at in the PR. `docs/setup.md` stays the full reference. **Host repositories** do not need to change anything

### Fixed

- **An instruction document no longer asks the agents for a byte-for-byte copy they cannot make** ([#44](https://github.com/maepon/issue-to-pr-flow/issues/44)).
  `Write` takes the content as a JSON string, so a copy of a file with escapes (`\u003c`, which JSON encoders often write for `<`) gets the raw
  character, and `cp` is not allowed. In one host repository an AC asked for real output copied with `Write` and checked byte for byte; neither
  judge saw that it could not be met, and the implementation reached `NEEDS_HUMAN` only on the third review. `prompts/spec.md` now has a human
  (`cp` before `make impl`) or a copy command allowed in `.ai-flow/permissions.json` make such a copy, or compares contents instead.
  `plan-judge.md` and `review-judge.md` treat the AC as `NEEDS_HUMAN` when neither is given, and `review-judge.md` checks byte equality with
  `git diff --no-index` (already allowed) instead of reading the files. `docs/setup.md` records the measurement in §6 and has a copy wrapper
  that fixes both directories in the §9 checklist. **Host repositories** do not need to change anything

## [0.10.0] - 2026-10-07

### Added

- **`PLAN_MODEL`** ([#41](https://github.com/maepon/issue-to-pr-flow/issues/41)): the model for writing and revising the plan (plan / plan-revise),
  separate from `FAST_MODEL`, which implement and review-fix keep using (same values: `strong` / `fast` / a raw model ID). Unset, it is the fast
  model, so nothing changes for existing settings; it does not follow the judges' variables. In one host repository plans from the fast model
  stopped at `MAX_ROUNDS` with the same kind of send-back in a different acceptance criterion each round, while the strong model's were not sent
  back; making `FAST_MODEL` strong fixed that but also moved implementing, the most expensive step. Not to be confused with `PLAN_JUDGE_MODEL`,
  which judges the plan. `make help` and the Roles table in `docs/setup.md` list it separately. Covered by `selftest.sh` (the models plan /
  plan-revise / implement run with, the Makefile defaults). In `run-phase.sh`, `judge_model` is renamed `model_id`

## [0.9.0] - 2026-10-06

### Added

- **`PLAN_JUDGE_MODEL`** ([#30](https://github.com/maepon/issue-to-pr-flow/issues/30)): the model for plan-judge, separate from `REVIEW_JUDGE_MODEL`
  (same values: `strong` / `fast` / a raw model ID). Unset, it follows `REVIEW_JUDGE_MODEL`, also when that is given on the `make` command line,
  so nothing changes for existing settings. With one variable for both, A/B-ing review-judge moved plan-judge too and a difference could not be
  traced to either judge; now e.g. `PLAN_JUDGE_MODEL = strong` with `REVIEW_JUDGE_MODEL = fast` tries only review-judge. `make help` and the
  Roles table in `docs/setup.md` list the two separately. Covered by `selftest.sh` (the value mapping, the plan-judge step's model, the Makefile defaults)
- **Wrappers for a repository that one command from the flow directory cannot cover** ([#28](https://github.com/maepon/issue-to-pr-flow/issues/28)):
  `examples/go/.ai-flow/go-test.sh` runs `go test -count=1 ./...` in every module (or the ones given) for Go without `go.work`, and
  `gofmt-check.sh` / `gofmt-file.sh` turn `gofmt -l`'s output into the exit code. Covered by `selftest.sh` (skipped when `go` is missing).
  `docs/setup.md` §9 has a new checklist item: put such wrappers in `.ai-flow/` (tooling, so the agents cannot rewrite the command the
  judges re-run), call them by a path relative to the flow directory, allow exactly that form, and how this relates to `cd`.
  The `config.mk` template mentions them
- **The tooling mixing check also runs at the start of `impl` and `review`** ([#31](https://github.com/maepon/issue-to-pr-flow/issues/31)),
  before the instruction document is fetched, so it stops before anything is charged. Tooling commits on the local `BASE_BRANCH` that are not
  pushed yet (a `git subtree` update, an `.ai-flow/` edit), carried along by the project branch, used to stop the flow only in `create_pr`, after
  planning, judging, implementing, reviewing and committing were paid for. A wrong `BASE_BRANCH` (`origin/… not found`) is caught there too.
  Covered by `selftest.sh`, which runs `phase_impl` / `phase_review` with `run_step` stubbed

### Changed

- The mixing check (at the start and in `create_pr`) looks at the diff from where the branch forked off `origin/<BASE_BRANCH>` (three dots, what the
  PR shows) rather than at `origin/<BASE_BRANCH>`'s current tree. Tooling updates that landed on `BASE_BRANCH` after the fork no longer show up
  reversed and stop the flow, so not having pulled a tooling update does not stop `impl`. **Host repositories** do not need to change anything

### Fixed

- `prompts/_rules.md` and `prompts/spec.md` no longer tell the agents that `cd` to the repository root is denied ([#29](https://github.com/maepon/issue-to-pr-flow/issues/29)).
  With `--add-dir=<root>` (since 0.2.1) it is not: on Claude Code 2.1.285, `cd` to the root or a subdirectory went through and the current
  directory persisted, and only `cd` outside the repository was denied. The rules now ask the agents to stay in the flow directory, because
  the commands and paths in the prompts are relative to it, and to `cd` back if they move. The measurement is in the table of `docs/setup.md` §6

## [0.8.1] - 2026-10-06

### Changed

- **Install and update steps fetch the tag first and pass its commit to `git subtree`** ([#27](https://github.com/maepon/issue-to-pr-flow/issues/27)):
  `git fetch <url> refs/tags/<tag>`, then `git subtree add` / `git subtree merge` with `FETCH_HEAD^{commit}`, then
  `git diff --stat <commit> HEAD:ai-flow` to confirm the content. Given a URL, `git subtree add/pull` reads `FETCH_HEAD` back after its own
  fetch, and an IDE's automatic fetch in between made it bring in the host repository's own `HEAD` as `ai-flow/` without any error.
  Updates now use `git subtree merge` because `pull` does not take a commit. The examples no longer show `v0.1.0`.
  **Host repositories** do not need to change anything; use the new steps for the next update
- `resign-subtree-merge.sh` mentions `git subtree merge` in its messages; it works the same after `add`, `merge` and `pull`

## [0.8.0] - 2026-10-05

### Added

- **Google Chat notifications** ([#17](https://github.com/maepon/issue-to-pr-flow/issues/17)): `scripts/notify-google-chat.sh`, posting to the
  Incoming Webhook of a space in `GOOGLE_CHAT_WEBHOOK_URL`. When `NOTIFY_CMD` is not defined it is used if `GOOGLE_CHAT_WEBHOOK_URL` is set and
  `SLACK_WEBHOOK_URL` is not (Slack still comes first, so an existing `.env` behaves as before). Compared with `notify-slack.sh`, emoji are sent as
  Unicode rather than Slack's shortcodes such as `:x:`, `Content-Type` carries `charset=UTF-8`, and a body over 8000 characters is cut with a
  note pointing to the Issue (Google Chat refuses a message that is too large: 11000 Japanese characters and 32000 ASCII characters got HTTP 400,
  8000 Japanese characters went through). `check-env` stops when it is chosen without the URL. Checked against a real space; covered by
  `selftest.sh` with the `curl` stub and by `ci-check.sh`
- `GOOGLE_CHAT_WEBHOOK_URL` is in the default `NOTIFY_SECRET_VARS` and, like `SLACK_WEBHOOK_URL`, is always removed from the agents' environment
  by `claude-run.sh`. **Host repositories that set `NOTIFY_SECRET_VARS` themselves** do not need to change anything for the removal, but must list
  `GOOGLE_CHAT_WEBHOOK_URL` there for it to reach `notify-google-chat.sh`

## [0.7.1] - 2026-10-04

### Fixed

- Slack notifications: `**bold**` next to full-width characters (Japanese text such as `**太字**（…）`) showed literal asterisks
  ([#24](https://github.com/maepon/issue-to-pr-flow/issues/24)). Slack only takes `*x*` as bold when the character outside each `*`
  is a space or ASCII punctuation, so `notify-slack.sh` now puts a zero-width space (U+200B) on both sides. Only a pair on one line whose inner
  edges are not spaces is converted; other `**` still collapse to `*`. The body other `NOTIFY_CMD`s get on stdin is unchanged.
  Covered by `selftest.sh` with a `curl` stub

## [0.7.0] - 2026-10-04

### Changed

- **Notifications are pluggable, and Slack is no longer required** ([#18](https://github.com/maepon/issue-to-pr-flow/issues/18)).
  `NOTIFY_CMD` (in `.env`, or `.ai-flow/config.mk` for a shared destination) is the command run at each ending and progress point.
  It gets the body on stdin and `AI_FLOW_NOTIFY_KIND` (`done` / `waiting` / `aborted` / `progress`), `AI_FLOW_NOTIFY_TITLE`,
  `AI_FLOW_NOTIFY_PHASE`, and `AI_FLOW_NOTIFY_ISSUE_URL` in the environment; a failure still only warns.
  When `NOTIFY_CMD` is not defined, Slack is used if `SLACK_WEBHOOK_URL` is set and nothing otherwise, so **a `.env` with only
  `SLACK_WEBHOOK_URL` keeps working unchanged**. `NOTIFY_CMD =` (empty) turns notifications off. `check-env` no longer requires
  `SLACK_WEBHOOK_URL`; it says `Notifications are off` when there are none, and stops if `NOTIFY_CMD` is not executable
- The Slack message format changed: the emoji now follows the kind (`:white_check_mark:` / `:raising_hand:` / `:x:` / `:hammer:`),
  and the title line replaces the old `Claude Code notification` header
- **If you replaced `scripts/notify-slack.sh` to turn notifications off** (as `docs/setup.md` used to suggest), drop that change and set `NOTIFY_CMD =` in `.env`.
  `notify-slack.sh` now reads the `AI_FLOW_NOTIFY_*` variables and stdin instead of two arguments

### Security

- `NOTIFY_SECRET_VARS` (default `SLACK_WEBHOOK_URL`) names the environment variables holding notification secrets. The `Makefile` exports them
  for `NOTIFY_CMD`, and `claude-run.sh` removes the same names (and always `SLACK_WEBHOOK_URL`) from the agents' environment.
  One list drives both, so a forgotten name means the notification lacks its secret, never that the agents can read it.
  A secret kept in the shell profile instead of `.env` is removed too. Covered by `selftest.sh` with a `claude` stub
- `notify-slack.sh` gives `curl` a time limit (`--connect-timeout 10 --max-time 30`), so an unresponsive webhook no longer holds the phase

### Added

- `selftest.sh` checks the notification contract (arguments, environment, body on stdin, a failing or stdin-ignoring command not stopping the flow);
  `ci-check.sh` checks how `check-env` decides on notifications, from the command line and from `.env`

## [0.6.0] - 2026-10-04

### Added

- `scripts/resign-subtree-merge.sh`: signs the commits that `git subtree add` / `git subtree pull --squash` create (they are unsigned,
  so a host repository that requires signed commits could not merge the subtree PR). It recreates the commits with the same tree,
  parents, message, and author, checks the tree is unchanged, then moves `HEAD`. Covered by offline tests in `selftest.sh`.
  `git rebase --rebase-merges --gpg-sign` is not a substitute: it re-runs the merge and, after `subtree add`, put the files at the repository root

### Documentation

- `SECURITY.md`: how to report vulnerabilities privately, and that release tags are never moved or deleted
- `docs/setup.md` §3 and `README.md`: how to bring the flow into a repository that requires signed commits
- `docs/setup.md` §10 records why the phase prompts are not turned into Claude Code skills (to keep the flow deterministic)

## [0.5.0] - 2026-10-03

### Security

- **Every `.env` is now denied to the `Read` tool**, not only the flow's own: all profiles deny `Read(//**/.env)` in addition to `Read(./.env)`,
  and `make check` requires it. A relative pattern only matches under the flow directory, so the project's root `.env` used to be readable
  (verified: the root `.env` and a nested `.env` went from readable to denied, while `.env.example` stayed readable).
  `.env.*` is not blocked, since `.env.example` would be blocked too. This stops the `Read` tool only; running tests can still read anything

### Added

- The template and `docs/setup.md` explain how to protect other secret files: add `Read(//**/<path>)` to `deny` in `.ai-flow/permissions.json`

## [0.4.0] - 2026-10-03

### Added

- **Projects without automated tests are supported**: leave `TEST_CMD` and `SCRATCH_TEST_CMD` both empty. The plan then maps each acceptance
  criterion to a verification command (or a `manual` check with steps) instead of a test; implement runs the commands before and after the change;
  the judges re-run them; Devil's Advocate's Claim 2 breaks the change and checks that the verification fails. Verdicts are still decided only
  by acceptance criteria numbers. Allow the verification commands in `.ai-flow/permissions.json`
- `{{#unless NAME}}` … `{{/unless}}` blocks in prompts (kept only when the value is empty), the counterpart of `{{#if}}`

### Changed

- `make check` no longer requires `TEST_CMD`; it now requires `TEST_CMD` and `SCRATCH_TEST_CMD` to be set together or left empty together.
  No change is needed in `.ai-flow/` for projects that have tests: the prompts they get are byte-for-byte the same as in 0.3.0
- `scripts/ci-check.sh` also runs `make check` without tests, and without tests and a formatter

### Fixed

- `make check` could fail when the user signs commits (`commit.gpgsign = true`) and the signing agent did not respond, because
  `selftest.sh` and `ci-check.sh` made signed commits in their throwaway repositories. Those commits are now unsigned

## [0.3.0] - 2026-10-03

First public release.

### Changed

- **The scripts' comments and terminal / Slack messages are now in English** (they were in Japanese). Agent output is unaffected:
  it is still written in `OUTPUT_LANG`. If you match on message text (e.g. in your own tooling), update the patterns;
  `docs/setup.md` §8 lists the common messages
- `make help` describes `REVIEW_JUDGE_MODEL` as it actually works (the fast model by default, used for judging both the plan and the implementation)

### Added

- `LICENSE` (MIT) and `CONTRIBUTING.md`

### Removed

- The known limitation "the scripts' comments and terminal / Slack messages are in Japanese"

## [0.2.1] - 2026-10-03

Fixes found by running the flow on a Python project (flow at `tools/flow/`, no formatter, `OUTPUT_LANG = English`).

### Fixed

- Bash commands with paths outside the flow directory (`git diff -- ../../README.md`) were denied: `claude-run.sh` now passes
  `--add-dir=<repository root>`. Verified: the same command went from denied to allowed
- MCP connectors linked to the user's claude.ai account were loaded in headless runs: `claude-run.sh` now passes `--strict-mcp-config`
- `claude -p` waited 3 seconds for standard input and printed a warning: it now gets `< /dev/null`
- `Edit` was missing from the commit profile, so touching up the PR body was denied (`Write` was already allowed)

### Changed

- The template and `docs/setup.md` now state that the agents run commands with the flow directory as the current directory,
  so `TEST_CMD` and friends must work from there. **Check your `.ai-flow/config.mk`** if your commands take paths
  (`npm test` / `npm run …` are fine as they are)

## [0.2.0] - 2026-10-03

### Added

- Conditional blocks in prompts: lines from `{{#if NAME}}` to `{{/if}}` are removed when the value of `NAME` is empty
  (`scripts/render-prompt.sh`; nesting and blocks spanning files are rejected)

### Changed

- **Projects without a formatter are supported**: leave all four `FORMAT_*` values in `.ai-flow/config.mk` empty, and the formatting
  steps are removed from the prompts (the per-file check was already skipped). No change is needed in `.ai-flow/` for projects that have a formatter
- In `implement.md` / `review-fix.md`, the formatting step is now a sub-item of the test step, so the step numbers have no gaps
  when it is removed. In `review-judge.md`, the formatting commands moved to their own line in the list of available commands

### Removed

- The known limitation "a project without a formatter is not supported" (a test command is still required)

## [0.1.0] - 2026-10-03

First release as a standalone repository. The flow was developed inside
[maepon/jumpmark-dock](https://github.com/maepon/jumpmark-dock) and carried over with `git subtree split`,
so its history is included; Issue / PR numbers in those commit messages refer to that repository.

### Added

- Phases driven by `make`: `spec` (questions or an instruction document with acceptance criteria, then a human gate),
  `impl` (plan → judge → revise → implement → review → fix → commit → PR → code review), and the partial entry points
  `review`, `code-review`, `pr-review` (Devil's Advocate, outside the main flow), and `create-pr`
- Verdicts mapped only to acceptance criteria (`APPROVED` / `CHANGES_REQUESTED` / `NEEDS_HUMAN`), at most `MAX_ROUNDS` (default 3) rounds,
  and outputs that cannot overturn an approval: `RESIDUAL_RISK`, `CODE_REVIEW`, `DEVILS_ADVOCATE`
- Two model tiers (`STRONG_MODEL` / `FAST_MODEL`), with the judges switchable through `REVIEW_JUDGE_MODEL` (fast by default)
- Project settings in `.ai-flow/` at the host repository root: `config.mk` (`BASE_BRANCH`, `TEST_CMD`, `SCRATCH_TEST_CMD`,
  `FORMAT_CHECK_CMD`, `FORMAT_FILE_CMD`, `FORMAT_FIX_CMD`, `FORMAT_GLOBS`, `OUTPUT_LANG`), `permissions.json`,
  `context.md`, `risk-catalog.md`, `user-flows.md`, `project-words.txt`. A template is in `examples/project/.ai-flow/`
- The flow can live in a subdirectory of any name and depth (`scripts/flow-paths.sh`); the whole flow directory,
  `.ai-flow/`, and the root `.gitignore` are protected as tooling files after every step
- Prompts in English, with human-facing output written in `OUTPUT_LANG`. Labels that later phases search for
  (`verified:run` / `verified:tests` / `verified:inference`, `unchecked`, `non-blocking`) are fixed tokens and never translated
- Guard rails: permission profiles statically checked for dangerous allows and required denies, `git push` / `gh pr create` run by
  the shell after checks, the instruction gate matched with a line-start anchor, prompts rendered and checked for unfilled placeholders
  before any cost is incurred
- `make check` (static checks and regression tests) before every phase, and `scripts/ci-check.sh` to run it in this repository;
  CI on macOS and Ubuntu
- `README.md` and `docs/setup.md` in English

### Known limitations

- The scripts' comments and terminal / Slack messages are in Japanese (fixed in 0.3.0)
- A project without a formatter or a test command is not supported yet: prompts that use an empty `FORMAT_*` / `TEST_CMD` value stop at render time (formatter: fixed in 0.2.0; tests: fixed in 0.4.0)

[Unreleased]: https://github.com/maepon/issue-to-pr-flow/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.10.2...v0.11.0
[0.10.2]: https://github.com/maepon/issue-to-pr-flow/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/maepon/issue-to-pr-flow/releases/tag/v0.1.0
