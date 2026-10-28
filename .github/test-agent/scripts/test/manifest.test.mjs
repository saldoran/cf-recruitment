import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agentPackages,
  buildPrManifest,
  buildSweepManifest,
  lineCoverage,
  measureTargets,
  relatedTests,
  verifyPackages,
} from '../lib/manifest.mjs'

const config = {
  packages: {
    backend: {
      sourceGlobs: ['backend/src/**/*.ts'],
      ignoreGlobs: ['backend/src/**/types.ts'],
      testGlobs: ['backend/tests/**/*.test.ts'],
      writableGlobs: ['backend/tests/**/*.ts'],
    },
    frontend: {
      sourceGlobs: ['frontend/src/**/*.ts', 'frontend/src/**/*.tsx'],
      ignoreGlobs: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.test.tsx'],
      testGlobs: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.test.tsx'],
      writableGlobs: ['frontend/src/**/*.test.ts', 'frontend/src/**/*.test.tsx'],
    },
  },
}

const hits = (entries) => new Map(entries)

test('lineCoverage counts executable lines and lists the uncovered ones', () => {
  assert.deepEqual(lineCoverage([1, 2, 3, 4], hits([[1, 2], [2, 0], [4, 0]])), {
    executable: 3,
    covered: 1,
    uncovered: [2, 4],
  })
  assert.equal(lineCoverage([1], undefined), null)
})

test('relatedTests resolves relative imports and module mocks to the source file', () => {
  const testFiles = [
    { path: 'backend/tests/router.test.ts', content: "import { createTodosRouter } from '../src/features/todos/router.ts';" },
    { path: 'backend/tests/other.test.ts', content: "import { x } from '../src/features/todos/routerx.ts';" },
    {
      path: 'frontend/src/features/todos/TodosPage.test.tsx',
      content: "vi.mock('./hooks/useTodosQuery', () => ({}))\nimport { TodosPage } from './TodosPage'",
    },
    { path: 'frontend/src/App.test.tsx', content: "vi.mock('./features/todos', () => ({}))" },
  ]
  assert.deepEqual(relatedTests('backend/src/features/todos/router.ts', testFiles), ['backend/tests/router.test.ts'])
  assert.deepEqual(relatedTests('frontend/src/features/todos/hooks/useTodosQuery.ts', testFiles), [
    'frontend/src/features/todos/TodosPage.test.tsx',
  ])
  assert.deepEqual(relatedTests('frontend/src/features/todos/index.ts', testFiles), ['frontend/src/App.test.tsx'])
})

test('buildPrManifest turns changed source files into targets with changed-line coverage', () => {
  const changes = [
    { path: 'backend/src/api/health.ts', status: 'modified', addedLines: [6, 7, 11] },
    { path: 'backend/src/features/todos/types.ts', status: 'modified', addedLines: [3] },
    { path: 'backend/tests/health.test.ts', status: 'added', addedLines: [1] },
    { path: 'backend/src/old.ts', status: 'deleted', addedLines: [] },
    { path: 'frontend/src/lib/http.ts', status: 'modified', addedLines: [2] },
    { path: 'README.md', status: 'modified', addedLines: [1] },
  ]
  const coverage = { backend: hits([['backend/src/api/health.ts', hits([[6, 1], [7, 0], [11, 0]])]]) }
  const manifest = buildPrManifest({ changes, config, coverage, testFiles: [], maxTargets: 5 })

  assert.equal(manifest.mode, 'pr')
  assert.deepEqual(Object.keys(manifest.packages), ['backend', 'frontend'])
  assert.deepEqual(manifest.packages.backend, {
    targets: [
      {
        file: 'backend/src/api/health.ts',
        change: 'modified',
        changedLines: '6-7, 11',
        uncoveredLines: '7, 11',
        coverage: { executable: 3, covered: 1 },
        relatedTests: [],
      },
    ],
    skipped: [
      { file: 'backend/src/features/todos/types.ts', reason: 'excluded from unit-test coverage (backend/src/**/types.ts)' },
      { file: 'backend/src/old.ts', reason: 'file deleted' },
    ],
    deferred: [],
    changedTests: ['backend/tests/health.test.ts'],
  })
  // Without a coverage report the agent treats every changed line as untested.
  assert.equal(manifest.packages.frontend.targets[0].coverage, null)
  assert.equal(manifest.packages.frontend.targets[0].uncoveredLines, null)
})

test('buildPrManifest keeps the targets with the most uncovered lines and defers the rest', () => {
  const changes = [
    { path: 'backend/src/a.ts', status: 'modified', addedLines: [1] },
    { path: 'backend/src/b.ts', status: 'modified', addedLines: [1, 2] },
  ]
  const coverage = {
    backend: hits([
      ['backend/src/a.ts', hits([[1, 0]])],
      ['backend/src/b.ts', hits([[1, 0], [2, 0]])],
    ]),
  }
  const manifest = buildPrManifest({ changes, config, coverage, testFiles: [], maxTargets: 1 })
  assert.deepEqual(manifest.packages.backend.targets.map((target) => target.file), ['backend/src/b.ts'])
  assert.deepEqual(manifest.packages.backend.deferred, ['backend/src/a.ts'])
})

test('buildSweepManifest picks source files with uncovered lines, most uncovered first', () => {
  const coverage = {
    backend: hits([
      ['backend/src/a.ts', hits([[1, 1], [2, 0]])],
      ['backend/src/b.ts', hits([[1, 0], [2, 0], [3, 0]])],
      ['backend/src/c.ts', hits([[1, 1]])],
      ['backend/src/features/todos/types.ts', hits([[1, 0]])],
    ]),
  }
  const testFiles = [{ path: 'backend/tests/b.test.ts', content: "import { b } from '../src/b.ts'" }]
  const manifest = buildSweepManifest({ packages: ['backend'], config, coverage, testFiles, maxTargets: 1 })
  assert.deepEqual(manifest, {
    mode: 'sweep',
    packages: {
      backend: {
        targets: [
          {
            file: 'backend/src/b.ts',
            change: 'existing',
            uncoveredLines: '1-3',
            coverage: { executable: 3, covered: 0 },
            relatedTests: ['backend/tests/b.test.ts'],
          },
        ],
        skipped: [],
        deferred: ['backend/src/a.ts'],
        changedTests: [],
      },
    },
  })
})

test('measureTargets sums changed-line coverage in pr mode and whole-file coverage in sweep mode', () => {
  const coverage = hits([
    ['backend/src/a.ts', hits([[1, 1], [2, 0], [3, 0]])],
    ['backend/src/b.ts', hits([[1, 1]])],
  ])
  const targets = [
    { file: 'backend/src/a.ts', changedLines: '2-4' },
    { file: 'backend/src/b.ts', changedLines: '1' },
    { file: 'backend/src/new.ts', changedLines: '1-2' },
  ]
  assert.deepEqual(measureTargets(targets, coverage, 'pr'), { executable: 3, covered: 1 })
  assert.deepEqual(measureTargets(targets, coverage, 'sweep'), { executable: 4, covered: 2 })
  assert.equal(measureTargets(targets, undefined, 'pr'), null)
})

test('agentPackages and verifyPackages select packages from the manifest', () => {
  const manifest = {
    packages: {
      backend: { targets: [], skipped: [], deferred: [], changedTests: ['backend/tests/a.test.ts'] },
      frontend: { targets: [{ file: 'frontend/src/a.ts' }], skipped: [], deferred: [], changedTests: [] },
    },
  }
  assert.deepEqual(agentPackages(manifest), ['frontend'])
  assert.deepEqual(verifyPackages(manifest), ['backend', 'frontend'])
})
