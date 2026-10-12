# issue-to-pr-flow — User Guide

[日本語](guide.ja.md)

This guide is for the people who **use** the flow day to day: writing Issues, reading what the agents post, deciding what to do
when it stops, and reviewing the PR it opens. You do not need to know how the scripts work.
Installing the flow and the design behind it are covered in [setup.md](setup.md); to have a coding agent install it, see [setup-with-agent.md](setup-with-agent.md).

---

## 1. The idea in one minute

You write a GitHub Issue. The flow turns it into a Pull Request by running Claude Code with no one at the keyboard.

```
You write an Issue
   │
   ▼
make spec ISSUE=n    The AI reads the Issue and the code, then posts either
                     questions, or an instruction document with acceptance criteria (AC-1, AC-2, …)
   │
   ▼
You read it          ← the only checkpoint before the PR
   │
   ▼
make impl ISSUE=n    plan → check the plan → implement → check the result → fix → commit → PR → code review
   │
   ▼
You review the PR and decide whether to merge
```

Three things to keep in mind:

- **You check once, before the work starts.** After you accept the instruction document, nothing waits for you until the PR exists
- **"Done" means "every acceptance criterion is met".** The AI judges its own work only against `AC-1`, `AC-2`, …, not against taste.
  Whatever the criteria leave out is not checked. That is why the instruction document matters most
- **When it cannot finish, it stops and tells you** instead of guessing. Stopping is normal and loses nothing

Everything the AI does is posted as a comment on the Issue, so the Issue is the place to read the whole story.

---

## 2. Your part, step by step

### Step 1: Write the Issue

Write **what you want** and **why**. You do not need to write how; the AI plans that.

| Good | Not so good |
|---|---|
| "Exporting a report overwrites an existing file without asking. We lost data twice. It should refuse when the file exists." | "Fix the export." |
| One purpose per Issue | "Fix the export, and also rename the settings page" (two purposes → two Issues) |

Measure the size of an Issue by **how many purposes** it has, not by how many files it touches.
If you are not sure about details, write what you know; the AI will ask.

### Step 2: Run `make spec`

```sh
cd ai-flow          # the flow's directory in your repository
make spec ISSUE=12
```

It takes a few minutes. When it finishes, one of two comments appears on the Issue (and a notification, if set up).

**Questions** (`QUESTION`) — something important is still open. Each question comes with a recommended answer and the reason.
Reply in an Issue comment — "Go with the recommendations" is a fine answer — then run `make spec ISSUE=12` again.

**An instruction document** (`INSTRUCTION`) — the AI's understanding of the job. Go to step 3.

### Step 3: Read the instruction document (the checkpoint)

This is the most important five minutes in the whole flow. Everything afterwards is judged against this document.

What it contains:

| Section | What to check |
|---|---|
| Background and purpose | Did it understand **why**? |
| Acceptance criteria (`AC-1`, `AC-2`, …) | **Would you be happy if exactly these were true, and nothing else?** Anything missing here will not be checked |
| Files to change / not to change | Is anything touched that should not be? |
| Out of scope | Is something you need written off as out of scope? |
| Documentation to update | Are the right documents listed? |

Good acceptance criteria can be checked mechanically: "When the file exists, exit with code 1 and say so on standard error" — not "make it safer".

**If you want changes**, write them in an Issue comment and run `make spec ISSUE=12` again.
It posts the **full** instruction document again with your feedback included; only the latest one counts.
Do not edit the old instruction document, and do not expect a comment of yours to become part of the specification by itself —
it only does once a new instruction document includes it.

### Step 4: Run `make impl`

```sh
make impl ISSUE=12
```

This runs for a while (often tens of minutes) and posts each step to the Issue. You do not need to watch it.
It ends in one of two ways:

- **A PR is opened** — go to step 5
- **It stops** — see section 4

### Step 5: Review the PR and decide

The AI never merges. The PR body is written for you, and includes:

| Section | Why it is there |
|---|---|
| Changes / Why | What changed and the problem it solves |
| How each acceptance criterion is met | Which test or check proves each `AC-n` |
| Points raised in review but not addressed | Suggestions (`non-blocking`) the AI chose not to act on. Look at them |
| Residual risks | Criteria passed only **by reasoning** (`verified:inference`) and risk items no one checked (`unchecked`). **Look here first before merging** |

A `CODE_REVIEW` comment is also posted on the PR: a second look at the code for bugs the criteria did not cover
(edge cases, swallowed errors, security). It does not block anything; you decide whether its findings matter.

If you want a harsher review, run `make pr-review ISSUE=12`. It argues **against** the PR — is the purpose really achieved,
do the tests actually catch breakage (it breaks a line on purpose to see), did something that used to work stop working.
It costs more than the other steps, so it is not run by default.

Things the reviews find that the criteria did not cover are best turned into **new Issues**, not more rounds on this one.

---

## 3. What appears on the Issue

Each comment starts with a hidden tag (`<!-- AI-TAG: … -->`) naming its type. In order of appearance:

| Tag | From | What it is | Do you need to act? |
|---|---|---|---|
| `QUESTION` | spec | Questions, each with a recommendation | **Yes** — answer, then re-run `make spec` |
| `INSTRUCTION` | spec | The instruction document with acceptance criteria | **Yes** — read it; comment and re-run `make spec`, or go on to `make impl` |
| `PLAN` | impl | How the AI plans to do it, and how it will test each criterion | No |
| `PLAN_REVIEW` | impl | Whether the plan covers every criterion | No |
| `IMPLEMENTATION_DONE` | impl | Report of what was implemented | No |
| `CRITIC_REVIEW` | impl | Whether the result meets every criterion | No |
| `FIX` | impl | What was fixed after a send-back | No |
| `RESIDUAL_RISK` | impl | Risks left outside the criteria | Read before merging |
| `CODE_REVIEW` | (on the PR) | Code review outside the criteria | Read before merging |
| `DEVILS_ADVOCATE` | (on the PR, only with `make pr-review`) | Arguments against the PR | Read if you ran it |

Plans and implementations may be sent back and revised up to three times each; you will see that as repeated
`PLAN_REVIEW` / `CRITIC_REVIEW` comments. That is the flow working, not a problem.

---

## 4. When it stops

The flow stops in two ways. Neither loses work: the code in the working tree and every Issue comment remain.

### "Waiting for a human" — you need to decide something

This is not an error (the command even exits with 0). The usual cases:

| What you see | What it means | What to do |
|---|---|---|
| Questions on the Issue | The specification is not settled | Answer and re-run `make spec` |
| An instruction document | Ready for your check | Read it (step 3) |
| "… was not approved after 3 rounds" | The AI kept failing the same criteria. **Almost always the criteria are vague** | Fix the instruction document (comment, re-run `make spec`), then `make impl` again |
| `NEEDS_HUMAN` | The criteria contradict each other, or assume something false, so no amount of rework can pass | Read the options in the latest review comment, fix the instruction document via `make spec`, then resume (below) |

### "Aborted" — something unexpected happened

The message says what happened and **which command resumes**. Do what it says. A few common ones:

| Message | What to do |
|---|---|
| `Issue #n has no instruction document` | Run `make spec` first |
| `… modified tooling files` | Someone (the AI or you) edited the flow's own files. Restore them with git and re-run. **Do not edit `ai-flow/` or `.ai-flow/` while a phase is running** |
| `… left files that fail the formatting check` | Run the formatter it names, then `make review` |
| `No difference from origin/…` | The AI did not commit. Run `make review` |

The full list is in [setup.md §8](setup.md#8-reading-why-it-stopped).

### Resuming

| Where it stopped | Run |
|---|---|
| Before the instruction document was settled | `make spec ISSUE=n` |
| While planning | `make impl ISSUE=n` |
| After implementing (you may have fixed things by hand) | `make review ISSUE=n` |
| Review passed, only pushing / opening the PR failed | `make create-pr ISSUE=n` |
| The PR exists, but the code review was not posted | `make code-review ISSUE=n` |

If you fix code by hand after a stop, leave it uncommitted in the working tree and run `make review`; the AI picks it up from there.

---

## 5. Tips

- **Start small.** A one-file fix is a good first Issue. Watch whether `make spec` gets to an instruction document and whether
  the plan is approved in one or two rounds
- **Vague criteria are the main cause of stops.** If a criterion can only be judged by "looks better", rewrite it as something a command can check
- **One purpose per Issue.** Two purposes in one Issue make criteria that pull against each other
- **Answer questions briefly.** "Go with the recommendations, except #2: …" is enough
- **Notifications help.** The flow runs for a long time; set up Slack, Google Chat, or any command of your own ([setup.md §2](setup.md#notifications))
  and you will be told when it finishes or needs you
- **Cost** — what each Issue cost is in `ai-flow/tmp/cost-issue<N>.txt`, and the total is included in notifications
- **Output language** — comments, commits, and PRs are written in the language set as `OUTPUT_LANG` in `.ai-flow/config.mk`

---

## 6. FAQ

**Can I skip `make spec` and write the instruction document myself?**
Let `make spec` write it. Before posting, spec checks the code and runs every command in the acceptance criteria to make sure
they can be judged at all. If you already know exactly what you want, write it in the Issue; spec will turn it into an
instruction document without questions.

**The PR has a problem the review did not catch. Why?**
The checks only verify the acceptance criteria. If the problem is not covered by any criterion, nothing was going to catch it —
that is the price of reviews that finish instead of going around in circles. Fix it in the PR by hand, or write a new Issue,
and consider adding the pattern to `.ai-flow/risk-catalog.md` so `RESIDUAL_RISK` looks for it next time.

**Can I push to the PR branch myself?**
Yes. Once the PR exists, it is an ordinary PR.

**Can I run two Issues at the same time?**
Not in the same working copy: each run works in the current working tree and branch. Use a separate clone or `git worktree`.

**Something was denied — "Warning: 3 disallowed tool call(s) were denied." Is that a failure?**
No. The AI often works around it. If the same command keeps being denied across runs, ask whoever maintains the flow's settings
to allow it in `.ai-flow/permissions.json`.

**Where is the full reference?**
[setup.md](setup.md): installation, settings, permissions, every abort message, and the design decisions.
