import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLcov } from '../lib/lcov.mjs'

const LCOV = `TN:
SF:src/a.ts
FN:1,f
FNDA:1,f
DA:1,1
DA:2,0
DA:2,3
BRDA:2,0,0,1
end_of_record
TN:
SF:src/b.ts
DA:5,0
end_of_record
`

test('collects line hits per file and keeps the highest count for a line', () => {
  const files = parseLcov(LCOV)
  assert.deepEqual([...files.keys()], ['src/a.ts', 'src/b.ts'])
  assert.deepEqual([...files.get('src/a.ts')], [[1, 1], [2, 3]])
  assert.deepEqual([...files.get('src/b.ts')], [[5, 0]])
})

test('prefixes file paths with the package folder', () => {
  const files = parseLcov(LCOV, 'backend')
  assert.deepEqual([...files.keys()], ['backend/src/a.ts', 'backend/src/b.ts'])
})

test('returns an empty map for empty input', () => {
  assert.equal(parseLcov('').size, 0)
})
