#!/usr/bin/env bash
# Runs Vitest or the TypeScript check for one package on behalf of the unit-test agent.
# With TEST_AGENT_SANDBOX=docker (set in CI) the command runs in a throwaway container
# without network access or the agent's environment, so code under test cannot read the
# API key, and .git, .github and .claude are mounted read-only.
set -euo pipefail

readonly MAX_OUTPUT_LINES=200
readonly TIMEOUT_SECONDS=300

usage() {
  echo 'usage: run-tests.sh <backend|frontend> test [test files...]' >&2
  echo '       run-tests.sh <backend|frontend> coverage [source files...]' >&2
  echo '       run-tests.sh <backend|frontend> typecheck' >&2
  exit 2
}

reject() {
  echo "run-tests.sh: $1" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
package=$1
action=$2
shift 2
[[ $package == backend || $package == frontend ]] || usage
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

# Paths may be relative to the repository root or to the package directory.
paths=()
for path in "$@"; do
  [[ $path =~ ^[A-Za-z0-9_./-]+$ && $path != *..* ]] || reject "invalid path: $path"
  path=${path#./}
  path=${path#"$package/"}
  case "$action:$package:$path" in
    test:backend:tests/*.test.ts) ;;
    test:frontend:src/*.test.ts | test:frontend:src/*.test.tsx) ;;
    coverage:backend:src/*.ts) ;;
    coverage:frontend:src/*.ts | coverage:frontend:src/*.tsx) ;;
    *) reject "not a $action path for $package: $path" ;;
  esac
  [[ -f $root/$package/$path ]] || reject "file not found: $package/$path"
  paths+=("$path")
done

# ${paths[@]+...} keeps empty arrays valid under `set -u` in bash 3.2 (macOS).
case $action in
  test) command=(npx --no-install vitest run ${paths[@]+"${paths[@]}"}) ;;
  coverage)
    command=(npx --no-install vitest run --coverage --coverage.reporter=text)
    for path in ${paths[@]+"${paths[@]}"}; do command+=("--coverage.include=$path"); done
    ;;
  typecheck)
    [[ ${#paths[@]} -eq 0 ]] || reject 'typecheck takes no paths'
    command=(npx --no-install tsc --noEmit)
    ;;
  *) usage ;;
esac

if [[ ${TEST_AGENT_SANDBOX:-} == docker ]]; then
  : "${TEST_AGENT_IMAGE:?TEST_AGENT_IMAGE is required in docker mode}"
  runner=(docker run --rm --network none --user "$(id -u):$(id -g)"
    --memory 3g --pids-limit 1024
    --env HOME=/tmp --env CI=true --env NO_COLOR=1
    --volume "$root:/repo"
    --volume "$root/.git:/repo/.git:ro"
    --volume "$root/.github:/repo/.github:ro"
    --volume "$root/.claude:/repo/.claude:ro"
    --workdir "/repo/$package" "$TEST_AGENT_IMAGE" timeout "$TIMEOUT_SECONDS")
else
  cd "$root/$package"
  runner=(env CI=true NO_COLOR=1)
fi

set +e
"${runner[@]}" "${command[@]}" 2>&1 | tail -n "$MAX_OUTPUT_LINES"
status=${PIPESTATUS[0]}
set -e
echo "run-tests.sh: exit code $status"
exit "$status"
