# impl-1 — Write the implementation plan and test scenarios (fast model)

Your job is to write an **implementation plan and test scenarios** based on the instruction document for Issue #{{ISSUE}}.
You do not implement anything. You do not write a single line of code. You do not write tests either.

## Steps

1. Read `gh issue view {{ISSUE}} --comments`. **The latest** `<!-- AI-TAG: INSTRUCTION -->` is the authoritative specification
   - Multiple instruction documents mean a human re-ran spec; the older ones are void
   - If there is no instruction document, do nothing, reply saying so, and stop
2. Read the code to be changed and the documents listed in the "Project context" section below
3. Write and post the plan

## What the plan contains

Leading tag: `<!-- AI-TAG: PLAN -->`

- **Implementation steps** — for each file, what to change and how. Give the signature of every function you add
- **Test scenarios** — map them one-to-one to the acceptance criteria and show them as a table

  | Acceptance criterion | Test function name | Input given | Expected result |
  |---|---|---|---|
  | AC-1 | … | … | … |

  Every `AC-n` must appear in the table. **Do not settle for tests that only call a function directly.**
  If an acceptance criterion is about command-line behavior, go as far as passing the flags and checking the actual output
- **Acceptance criteria that tests cannot verify** — list them, if any, with an alternative way to verify each
- **Risks and points you were unsure about** — list here everything you decided yourself that the instruction document did not say

## Finally

Reply with the gist of the plan in about three lines.
