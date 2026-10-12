# Project settings for a Java repository (Gradle or Maven; checked with a Spring Boot project). See examples/project/.ai-flow/config.mk
# for what each value means. Copy this directory's files over the template's: cp ai-flow/examples/java/.ai-flow/* .ai-flow/
#
# The paths assume the flow directory is one level below the root (ai-flow/). One level deeper: ../../gradlew -p ../.. and so on.
# Put the JDK setup in .zshenv rather than .zshrc (SDKMAN, jenv, ...): the flow runs the commands from a non-interactive shell (docs/setup.md §9).

BASE_BRANCH = main

# Gradle. -p .. points it at the root build; without it Gradle stops ("is not part of the build defined by settings file").
# --rerun runs the tests even when Gradle considers them up to date (Gradle 7.6 or later; otherwise use cleanTest test).
# Without it, a second run replays the earlier result, and the judges re-run the tests to verify claims.
TEST_CMD = ../gradlew -p .. test --rerun
# Maven. Surefire does not replay results, so nothing needs disabling. -B keeps the output plain.
# TEST_CMD = ../mvnw -B -f ../pom.xml test

# Runs one throwaway source file with the project's classes and test dependencies (java-scratch.sh; both build tools).
# For a multi-module build, set MODULE at the top of java-scratch.sh.
SCRATCH_TEST_CMD = ../.ai-flow/java-scratch.sh

# Formatting. Empty: no formatter. If the project has one, the whole-repository check is usually one build task
# (Gradle spotlessCheck / checkFormat, Maven spotless:check / spring-javaformat:validate), but the per-file check
# (FORMAT_FILE_CMD, must exit 0 when the file is formatted and never format) needs a wrapper for most of them.
# google-java-format answers with its exit code: java -jar ../.ai-flow/google-java-format.jar --dry-run --set-exit-if-changed
# (these formatter settings have not been checked with the flow yet)
FORMAT_CHECK_CMD =
FORMAT_FILE_CMD =
FORMAT_FIX_CMD =
FORMAT_GLOBS =

OUTPUT_LANG = English
