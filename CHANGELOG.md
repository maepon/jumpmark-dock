# Changelog

All notable changes to this flow are recorded here, per tag.
Host repositories bring a tag in with `git subtree pull`; read the entries since your current tag before pulling,
especially **Changed** items that require edits to your `.ai-flow/`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
- A project without a formatter or a test command is not supported yet: prompts that use an empty `FORMAT_*` / `TEST_CMD` value stop at render time

[Unreleased]: https://github.com/maepon/issue-to-pr-flow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maepon/issue-to-pr-flow/releases/tag/v0.1.0
