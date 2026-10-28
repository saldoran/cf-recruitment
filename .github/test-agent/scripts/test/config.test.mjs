import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadConfig, validateConfig } from '../lib/config.mjs'

const CONFIG_PATH = fileURLToPath(new URL('../../config.json', import.meta.url))

test('the repository configuration is valid', () => {
  const config = loadConfig(CONFIG_PATH)
  assert.deepEqual(Object.keys(config.packages), ['backend', 'frontend'])
  assert.match(config.model, /haiku/)
})

test('reports missing globs, a non-Haiku model and missing limits', () => {
  const errors = validateConfig({
    model: 'claude-sonnet-5-5',
    packages: { backend: { sourceGlobs: ['backend/src/**/*.ts'], testGlobs: [] } },
  })
  assert.deepEqual(errors, [
    'model must be a Haiku model',
    'packages.backend.ignoreGlobs must be an array of globs',
    'packages.backend.testGlobs must be a non-empty array of globs',
    'packages.backend.writableGlobs must be a non-empty array of globs',
    'limits.pr and limits.sweep must set maxTargets, maxBudgetUsd and maxTurns',
    'limits.maxPatchFiles and limits.maxTestFileBytes must be positive numbers',
  ])
})

test('rejects package names that are not plain folder names', () => {
  const errors = validateConfig({ model: 'claude-haiku-5-5', packages: { '../x': {} } })
  assert.ok(errors.includes('package name ../x must be a plain folder name'))
})

test('loadConfig throws with every validation error', () => {
  assert.throws(() => loadConfig(fileURLToPath(new URL('./fixtures/bad-config.json', import.meta.url))), /model must be a Haiku model/)
})
