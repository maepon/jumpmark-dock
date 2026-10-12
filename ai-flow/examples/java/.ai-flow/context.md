<!--
Project context for a Java repository (see examples/project/.ai-flow/context.md). Inserted at the end of every prompt.
Keep it short: it is paid for on every step. With Maven, replace "--tests <class>" with "-Dtest=<class>" and build/ with target/.
-->
- Follow the root `README.md` (and `CLAUDE.md` if you have one). Always read them when checking the specification
- Read project files by their path relative to the root, e.g. `{{ROOT_REL}}src/main/java/...`
- Documentation that a change may update: `README.md` / `CHANGELOG.md` / the root `docs/`. After implementing, update the relevant ones
- To run one test class while working: `{{TEST_CMD}} --tests <fully qualified class name or pattern>`. Run the whole suite before you finish
- A throwaway check for `{{SCRATCH_TEST_CMD}}` is one `tmp/*.java` file with a `main` method and no `package` line. It runs with the project's classes
  and test dependencies (AssertJ works) and fails by throwing. It cannot start the application context: check behavior that needs Spring beans
  with a test in the project's test sources instead
- Never start the application (`bootRun`, `spring-boot:run`): it does not finish. Check HTTP behavior with tests (MockMvc, WebTestClient)
- `build/` holds build outputs. It is not part of the change; do not read from it to decide what the code does
