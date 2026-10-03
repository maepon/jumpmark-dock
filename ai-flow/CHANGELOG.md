# Changelog

All notable changes to this flow are recorded here, per tag.
Host repositories bring a tag in with `git subtree pull`; read the entries since your current tag before pulling,
especially **Changed** items that require edits to your `.ai-flow/`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

- The scripts' comments and terminal / Slack messages are in Japanese
- A project without a formatter or a test command is not supported yet: prompts that use an empty `FORMAT_*` / `TEST_CMD` value stop at render time (formatter: fixed in 0.2.0)

[Unreleased]: https://github.com/maepon/issue-to-pr-flow/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/maepon/issue-to-pr-flow/releases/tag/v0.1.0
