#!/bin/bash
# SCRATCH_TEST_CMD for Java (Gradle or Maven). Runs one throwaway source file with the project's classes and test dependencies.
# A file under the flow's tmp/ is outside every source set, so neither build tool can run it as a test. Instead this compiles
# the project, asks the build for the test runtime classpath, and runs the file in source-file mode (java <file>.java, Java 11+).
# The file needs a main method and no package declaration; it fails by throwing (or System.exit with a non-zero code).
#
# Usage (from the flow directory, as the agents run it):
#   ../.ai-flow/java-scratch.sh tmp/Check.java
#
# Copy it to .ai-flow/ at the repository root, not to the project's own scripts/ (see examples/go/.ai-flow/go-test.sh for why).
# With Gradle, copy scratch-classpath.gradle next to it.
# Exit code: the file's own / 2 when the arguments, the build, or the classpath fail.
set -uo pipefail

# The Gradle project path (e.g. :app) or Maven module directory (e.g. app) whose classes the file uses. Empty: the root project.
MODULE=""

file="${1:?a .java file is required}"
case "${file}" in *.java) ;; *) echo "java-scratch.sh: only a .java file can be run: ${file}" >&2; exit 2 ;; esac
[ -f "${file}" ] || { echo "java-scratch.sh: ${file} not found." >&2; exit 2; }
file="$(cd "$(dirname "${file}")" && pwd -P)/$(basename "${file}")"
here="$(cd "$(dirname "$0")" && pwd)"

root=$(git rev-parse --show-toplevel) || exit 2
cd "${root}" || exit 2
out=$(mktemp) || exit 2
trap 'rm -f "${out}"' EXIT

if [ -x ./gradlew ]; then
  # The init script adds a task that writes the test runtime classpath (testClasses runs first) to the file given
  task="${MODULE}:aiFlowScratchClasspath"
  ./gradlew -q --init-script "${here}/scratch-classpath.gradle" -PaiFlowClasspathFile="${out}" "${task}" >&2 \
    || { echo "java-scratch.sh: ./gradlew ${task} failed." >&2; exit 2; }
  cp_=$(cat "${out}")
elif [ -f pom.xml ]; then
  mvn=mvn; [ -x ./mvnw ] && mvn=./mvnw
  dir="${root}${MODULE:+/${MODULE}}"
  pl=(); [ -n "${MODULE}" ] && pl=(-pl "${MODULE}" -am)
  "${mvn}" -q -B "${pl[@]+"${pl[@]}"}" test-compile dependency:build-classpath \
    -Dmdep.outputFile="${out}" -Dmdep.includeScope=test >&2 \
    || { echo "java-scratch.sh: ${mvn} test-compile failed." >&2; exit 2; }
  cp_="${dir}/target/test-classes:${dir}/target/classes:$(cat "${out}")"
else
  echo "java-scratch.sh: neither ./gradlew nor pom.xml at the repository root." >&2
  exit 2
fi
[ -n "${cp_}" ] || { echo "java-scratch.sh: the build gave an empty classpath." >&2; exit 2; }

java -cp "${cp_}" "${file}"
