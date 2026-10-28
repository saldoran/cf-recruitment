import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkChanges, parseRawDiff } from '../lib/guard.mjs'

const writableGlobs = ['backend/tests/**/*.ts']
const limits = { maxPatchFiles: 2, maxTestFileBytes: 200 }
const GOOD_TEST = "it('works', () => expect(1).toBe(1))"

function check(changes, files = {}) {
  const contents = new Map(Object.entries(files))
  return checkChanges({ changes, contents, writableGlobs, limits })
}

test('parseRawDiff reads modes, status and path from git diff --raw', () => {
  const raw = [
    ':000000 100644 0000000 1111111 A\tbackend/tests/health.test.ts',
    ':100644 100755 2222222 3333333 M\tbackend/tests/router.test.ts',
    ':100644 000000 4444444 0000000 D\tbackend/src/main.ts',
    '',
  ].join('\n')
  assert.deepEqual(parseRawDiff(raw), [
    { path: 'backend/tests/health.test.ts', status: 'A', mode: '100644' },
    { path: 'backend/tests/router.test.ts', status: 'M', mode: '100755' },
    { path: 'backend/src/main.ts', status: 'D', mode: '000000' },
  ])
})

test('accepts new and modified test files', () => {
  const changes = [
    { path: 'backend/tests/health.test.ts', status: 'A', mode: '100644' },
    { path: 'backend/tests/fixture.ts', status: 'M', mode: '100644' },
  ]
  assert.deepEqual(check(changes, { 'backend/tests/health.test.ts': GOOD_TEST, 'backend/tests/fixture.ts': 'export {}' }), [])
})

test('rejects files outside the writable globs', () => {
  const changes = [{ path: 'backend/src/main.ts', status: 'M', mode: '100644' }]
  assert.deepEqual(check(changes, { 'backend/src/main.ts': 'x' }), ['backend/src/main.ts: the agent may only change test files'])
})

test('rejects deletions, symlinks and executable files', () => {
  const changes = [
    { path: 'backend/tests/a.test.ts', status: 'D', mode: '000000' },
    { path: 'backend/tests/b.test.ts', status: 'A', mode: '120000' },
  ]
  assert.deepEqual(check(changes, { 'backend/tests/b.test.ts': GOOD_TEST }), [
    'backend/tests/a.test.ts: deleting or renaming files is not allowed',
    'backend/tests/b.test.ts: only regular, non-executable files are allowed (mode 120000)',
  ])
})

test('rejects focused, skipped and placeholder tests', () => {
  const files = {
    'backend/tests/a.test.ts': "it.only('x', () => {})",
    'backend/tests/b.test.ts': "describe.skip('x', () => {})",
  }
  const changes = Object.keys(files).map((path) => ({ path, status: 'A', mode: '100644' }))
  assert.deepEqual(check(changes, files), [
    'backend/tests/a.test.ts: contains a focused, skipped or placeholder test',
    'backend/tests/b.test.ts: contains a focused, skipped or placeholder test',
  ])
})

test('rejects tests that start processes or turn off type checking', () => {
  const files = {
    'backend/tests/a.test.ts': "import { exec } from 'node:child_process'",
    'backend/tests/b.test.ts': '// @ts-nocheck',
  }
  const changes = Object.keys(files).map((path) => ({ path, status: 'A', mode: '100644' }))
  assert.deepEqual(check(changes, files), [
    'backend/tests/a.test.ts: must not start processes',
    'backend/tests/b.test.ts: must not turn off type checking',
  ])
})

test('rejects files that contain something shaped like an API key', () => {
  const files = { 'backend/tests/a.test.ts': "const key = 'sk-ant-api03-AbCdEf123456_xyz'" }
  const changes = [{ path: 'backend/tests/a.test.ts', status: 'A', mode: '100644' }]
  assert.deepEqual(check(changes, files), ['backend/tests/a.test.ts: contains what looks like an API key'])
})

test('rejects oversized files and too many files', () => {
  const files = {
    'backend/tests/a.test.ts': 'x'.repeat(201),
    'backend/tests/b.test.ts': GOOD_TEST,
    'backend/tests/c.test.ts': GOOD_TEST,
  }
  const changes = Object.keys(files).map((path) => ({ path, status: 'A', mode: '100644' }))
  assert.deepEqual(check(changes, files), [
    'the patch changes 3 files, the limit is 2',
    'backend/tests/a.test.ts: file is larger than 200 bytes',
  ])
})
