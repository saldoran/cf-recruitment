---
name: analyze-changes
description: Decide which source files changed in a pull request need new or updated unit tests, and why. Use at the start of a pr-mode run, right after reading the manifest.
---

# Analyze pull-request changes

For every target in the manifest, decide `create`, `update` or `skip` and write a one-sentence reason that names the function, component or branch.

## Read before deciding

1. Read the whole source file and look at `changedLines`.
2. Read the tests in `relatedTests`. When the list is empty, Grep the package's tests for the file's basename, since a test may reach the file through another module.
3. Start from `uncoveredLines`: changed lines that no current test executes.

## Decision rules

| Situation | Decision |
| --- | --- |
| New export, branch, error path or route that no test reaches | `update` the test file that already covers the module; `create` one only when none exists |
| Existing behaviour changed on purpose: new parameter, default, error message, response shape | `update` the tests that assert the old behaviour and add cases for the new branches |
| Only types, comments, formatting, or renames that keep the behaviour | `skip` |
| All changed lines are covered and the existing assertions still describe the new behaviour | `skip`, reason "covered by `<test file>`" |
| Code that only makes sense with a real database, network or process lifecycle | `skip` with that reason, unless a short test with mocks checks real behaviour |

An `uncoveredLines` entry that is only executed but never asserted still needs an assertion. A test that just calls the code adds no value.

## Before moving on

Keep a short list of target, decision and reason. It becomes the `decisions` array of the final report, so every target must appear in it, including skipped ones.
