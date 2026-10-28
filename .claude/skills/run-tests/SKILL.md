---
name: run-tests
description: Run Vitest tests, coverage and the TypeScript check for one package through the sandboxed runner, read failures and fix the tests. Use after writing or editing test files, and before the final report.
---

# Run and fix tests

The only command available is the runner script. Call it exactly like this, with paths relative to the repository root:

```bash
.github/test-agent/bin/run-tests.sh backend test backend/tests/health.test.ts
.github/test-agent/bin/run-tests.sh frontend test frontend/src/lib/http.test.ts
.github/test-agent/bin/run-tests.sh frontend test                 # whole package suite
.github/test-agent/bin/run-tests.sh backend typecheck             # tsc --noEmit, tests included
.github/test-agent/bin/run-tests.sh backend coverage backend/src/factory.ts
```

It prints the last 200 lines of output and the exit code. In CI it runs in a container with no network.

## Loop

1. Run only the test files you touched.
2. For each failure, read the assertion message and decide:
   - the test is wrong (wrong expectation, missing mock, wrong selector, async timing): fix the test;
   - the source is wrong (the code contradicts its own name, types or the behaviour other tests describe): remove that case and record it in `suspectedBugs`. Never change source files.
3. At most three attempts per file. A file that still fails is removed from your work: delete its new cases, and report the target as `skip` with the failure in the reason.
4. When the touched files pass, run the whole package suite once: your change must not break other tests.
5. Run `typecheck` once. Fix type errors in your tests, using the casts described in the test-writing skill.
6. In `sweep` mode, run `coverage` for the target files to confirm the uncovered lines are now covered.

## Reading failures

- `Cannot find module`: check the relative path and, in the backend, the `.ts` extension.
- `Unable to find an element`: check the accessible name in the source or the design-system double.
- `act(...)` warnings or flaky waits: await the user event, or wrap the assertion in `waitFor`.
- Timeouts: an unresolved promise or a real timer; mock it or use fake timers.
