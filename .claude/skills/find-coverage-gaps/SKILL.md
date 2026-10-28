---
name: find-coverage-gaps
description: Plan unit tests for under-tested source files during a coverage sweep. Use at the start of a sweep-mode run, right after reading the manifest.
---

# Find coverage gaps

In `sweep` mode every target is an existing source file with lines no test executes (`uncoveredLines`). The goal is to cover the behaviour behind those lines with meaningful assertions, not to execute lines for the number.

## For each target

1. Read the file and map each uncovered range to what it does: a function, a branch, an error path, an event handler.
2. Read `relatedTests`. Extend an existing test file of the module instead of creating a second one.
3. Decide `create`, `update` or `skip`. Skip, with the reason, when the code is pure wiring that a unit test can only mirror line by line, for example a process entry point that calls one function.

## Order of work

1. Logic with branches and error paths: validators, request helpers, data transformations.
2. Hooks and components with user-visible behaviour.
3. Wiring such as routers, providers and factories: test what a caller observes (status codes, rendered children), not how it is assembled.

When the budget or turns run low, finish the file in progress, report the rest as `skip` with reason "not reached in this run", and stop.
