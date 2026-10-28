import { test } from 'node:test'
import assert from 'node:assert/strict'
import { globToRegExp, matchesAny } from '../lib/glob.mjs'

test('** matches any folder depth, including none', () => {
  const pattern = globToRegExp('frontend/src/**/*.test.tsx')
  assert.ok(pattern.test('frontend/src/App.test.tsx'))
  assert.ok(pattern.test('frontend/src/features/todos/TodoItem.test.tsx'))
  assert.ok(!pattern.test('frontend/src/App.tsx'))
  assert.ok(!pattern.test('backend/src/App.test.tsx'))
})

test('* stays within one path segment', () => {
  const pattern = globToRegExp('backend/src/*.ts')
  assert.ok(pattern.test('backend/src/main.ts'))
  assert.ok(!pattern.test('backend/src/api/health.ts'))
})

test('a trailing ** matches everything below the folder', () => {
  const pattern = globToRegExp('backend/src/generated/**')
  assert.ok(pattern.test('backend/src/generated/prisma/client.ts'))
  assert.ok(!pattern.test('backend/src/generatedx.ts'))
})

test('? matches one character other than a slash', () => {
  assert.ok(globToRegExp('src/?.ts').test('src/a.ts'))
  assert.ok(!globToRegExp('src/?.ts').test('src/ab.ts'))
  assert.ok(!globToRegExp('src?a.ts').test('src/a.ts'))
})

test('treats regular expression characters literally', () => {
  assert.ok(!globToRegExp('a.b').test('axb'))
  assert.ok(globToRegExp('src/(group)/[id]+.ts').test('src/(group)/[id]+.ts'))
})

test('matchesAny returns the first matching glob or null', () => {
  const globs = ['frontend/**', 'backend/tests/**']
  assert.equal(matchesAny('backend/tests/a.test.ts', globs), 'backend/tests/**')
  assert.equal(matchesAny('README.md', globs), null)
})
