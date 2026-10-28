import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRanges, parseUnifiedDiff, toRanges } from '../lib/diff.mjs'

const DIFF = `diff --git a/backend/src/api/health.ts b/backend/src/api/health.ts
index 1111111..2222222 100644
--- a/backend/src/api/health.ts
+++ b/backend/src/api/health.ts
@@ -5,0 +6,2 @@ export function createHealthRouter(database: Database) {
+  const a = 1
+  const b = 2
@@ -9 +11 @@ export function createHealthRouter(database: Database) {
-  return router;
+  return router
@@ -20,3 +22,0 @@
-x
-y
-z
diff --git a/frontend/src/lib/new.ts b/frontend/src/lib/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/frontend/src/lib/new.ts
@@ -0,0 +1,3 @@
+export const a = 1
+export const b = 2
+export const c = 3
diff --git a/backend/src/old.ts b/backend/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/backend/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
`

test('parses the added line numbers of every file in a zero-context diff', () => {
  assert.deepEqual(parseUnifiedDiff(DIFF), [
    { path: 'backend/src/api/health.ts', status: 'modified', addedLines: [6, 7, 11] },
    { path: 'frontend/src/lib/new.ts', status: 'added', addedLines: [1, 2, 3] },
    { path: 'backend/src/old.ts', status: 'deleted', addedLines: [] },
  ])
})

test('ignores diff body lines that look like file headers', () => {
  const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1,2 @@
-old
+++ not a header
+new
`
  assert.deepEqual(parseUnifiedDiff(diff), [{ path: 'a.ts', status: 'modified', addedLines: [1, 2] }])
})

test('formats sorted line numbers as ranges', () => {
  assert.equal(toRanges([7, 1, 2, 3, 9, 10]), '1-3, 7, 9-10')
  assert.equal(toRanges([]), '')
})

test('parses ranges back into line numbers', () => {
  assert.deepEqual(parseRanges('1-3, 7, 9-10'), [1, 2, 3, 7, 9, 10])
  assert.deepEqual(parseRanges(''), [])
  assert.deepEqual(parseRanges(null), [])
})
