import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REPORT_MARKER, overallStatus, renderReport, sanitize } from '../lib/report.mjs'

const manifest = {
  mode: 'pr',
  packages: {
    backend: {
      targets: [{ file: 'backend/src/api/health.ts' }],
      skipped: [{ file: 'backend/src/features/todos/types.ts', reason: 'excluded from unit-test coverage (backend/src/**/types.ts)' }],
      deferred: ['backend/src/b.ts'],
      changedTests: [],
      baseline: { lines: 33.02, targetLines: { executable: 3, covered: 1 } },
    },
  },
}

const passing = {
  agent: {
    status: 'success',
    turns: 7,
    costUsd: 0.0123,
    models: ['claude-haiku-5-5'],
    skills: ['analyze-changes', 'write-backend-tests', 'run-tests'],
    guard: { ok: true, violations: [] },
    patchFiles: ['backend/tests/health.test.ts'],
    report: {
      decisions: [
        { file: 'backend/src/api/health.ts', action: 'create', reason: 'GET /health had no test', testFiles: ['backend/tests/health.test.ts'] },
      ],
      suspectedBugs: ['health.ts swallows @octocat errors'],
      summary: 'Added one test file.',
    },
  },
  verify: {
    status: 'passed',
    typecheck: 'passed',
    tests: { passed: 52, failed: 0, total: 52 },
    coverage: { lines: 40.5 },
    targetLines: { executable: 3, covered: 3 },
  },
}

test('sanitize flattens text, escapes markup and defuses mentions and links', () => {
  assert.equal(
    sanitize('Ping @octocat\nsee [docs](https://x.io) <img> a|b', 200),
    'Ping @​octocat see \\[docs\\](https:​//x.io) &lt;img&gt; a\\|b',
  )
  assert.equal(sanitize('x'.repeat(10), 5), 'xxxx…')
  assert.equal(sanitize('key sk-ant-api03-AbC_1-2 here', 200), 'key \\[redacted\\] here')
  assert.equal(sanitize(undefined, 5), '')
})

test('overallStatus ranks rejected changes and failed tests above success', () => {
  assert.equal(overallStatus({ backend: passing }, { committed: true }), 'committed')
  assert.equal(overallStatus({ backend: passing }, {}), 'ready')
  assert.equal(overallStatus({ backend: { ...passing, verify: { ...passing.verify, status: 'failed' } } }, {}), 'tests-failed')
  assert.equal(overallStatus({ backend: { ...passing, agent: { ...passing.agent, guard: { ok: false, violations: ['x'] } } } }, {}), 'rejected')
  assert.equal(overallStatus({ backend: { ...passing, agent: { ...passing.agent, patchFiles: [] } } }, {}), 'no-changes')
  assert.equal(overallStatus({ backend: { verify: passing.verify } }, {}), 'no-changes')
  assert.equal(overallStatus({ backend: { ...passing, agent: { ...passing.agent, status: 'error_max_budget_usd' } } }, {}), 'agent-failed')
})

test('renders a PR comment with results, decisions and run details', () => {
  const body = renderReport({
    manifest,
    results: { backend: passing },
    commit: { committed: true, sha: 'abc1234def', url: 'https://github.com/o/r/commit/abc1234def' },
    runUrl: 'https://github.com/o/r/actions/runs/1',
  })
  assert.ok(body.startsWith(REPORT_MARKER))
  assert.match(body, /Committed 1 test file in \[`abc1234`\]\(https:\/\/github\.com\/o\/r\/commit\/abc1234def\)/)
  assert.match(body, /\| backend \| ✅ 52 passed \| ✅ \| 33\.0% → 40\.5% \| 1\/3 → 3\/3 \|/)
  assert.match(body, /\| `backend\/src\/api\/health\.ts` \| create → `backend\/tests\/health\.test\.ts` \| GET \/health had no test \|/)
  assert.match(body, /\| `backend\/src\/features\/todos\/types\.ts` \| skip \(rule\) \| excluded from unit-test coverage/)
  assert.match(body, /Suspected bugs[\s\S]*@​octocat/)
  assert.match(body, /Not analysed in this run[\s\S]*`backend\/src\/b\.ts`/)
  assert.match(body, /\| backend \| claude-haiku-5-5 \| analyze-changes, write-backend-tests, run-tests \| 7 \| \$0\.012 \|/)
  assert.match(body, /\[Workflow run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\)/)
})

test('explains why nothing was committed when tests fail or the guard rejects the patch', () => {
  const failed = renderReport({
    manifest,
    results: { backend: { ...passing, verify: { ...passing.verify, status: 'failed', tests: { passed: 50, failed: 2, total: 52 } } } },
    commit: { committed: false },
    runUrl: 'u',
  })
  assert.match(failed, /Tests failed\. The agent's tests were not committed/)
  assert.match(failed, /❌ 2 of 52 failed/)

  const rejected = renderReport({
    manifest,
    results: { backend: { ...passing, agent: { ...passing.agent, guard: { ok: false, violations: ['backend/src/main.ts: the agent may only change test files'] } } } },
    commit: { committed: false },
    runUrl: 'u',
  })
  assert.match(rejected, /rejected/i)
  assert.match(rejected, /backend\/src\/main\.ts: the agent may only change test files/)
})

test('labels the coverage column for sweep runs', () => {
  const body = renderReport({ manifest: { ...manifest, mode: 'sweep' }, results: { backend: passing }, commit: { committed: false }, runUrl: 'u' })
  assert.match(body, /Target lines covered/)
})
