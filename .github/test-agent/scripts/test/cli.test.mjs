import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url))
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function createRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'test-agent-cli-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).trim()
  const write = (entries) => {
    for (const [path, content] of Object.entries(entries)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
  }
  const commit = (entries) => {
    write(entries)
    git('add', '--all')
    git('commit', '-q', '-m', 'change')
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  const first = commit(files)
  return { root, git, write, commit, first }
}

function run(root, args) {
  const output = join(mkdtempSync(join(tmpdir(), 'test-agent-out-')), 'github-output')
  writeFileSync(output, '')
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, GITHUB_OUTPUT: output },
  })
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
  return { status: result.status, stderr: result.stderr, outputs }
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

test('packages and plan describe the changed source files of a pull request', () => {
  const repo = createRepo({
    'README.md': 'readme\n',
    'backend/src/api/health.ts': 'export const a = 1\n',
    'backend/tests/health.test.ts': "import { a } from '../src/api/health.ts'\n",
  })
  const head = repo.commit({
    'README.md': 'changed\n',
    'backend/src/api/health.ts': 'export const a = 1\nexport const b = 2\nexport const c = 3\n',
  })
  const coverageDir = join(repo.root, '.coverage')
  repo.write({
    '.coverage/backend/lcov.info': 'SF:src/api/health.ts\nDA:1,1\nDA:2,0\nDA:3,1\nend_of_record\n',
    '.coverage/backend/coverage-summary.json': JSON.stringify({ total: { lines: { pct: 66.67 } } }),
  })

  const packages = run(repo.root, ['packages', '--base', repo.first, '--head', head])
  assert.equal(packages.status, 0, packages.stderr)
  assert.equal(packages.outputs.packages, '["backend"]')

  const out = join(repo.root, '.out')
  const plan = run(repo.root, ['plan', '--mode', 'pr', '--base', repo.first, '--head', head, '--coverage-dir', coverageDir, '--out', out])
  assert.equal(plan.status, 0, plan.stderr)
  assert.equal(plan.outputs['agent-packages'], '["backend"]')
  assert.equal(plan.outputs['verify-packages'], '["backend"]')
  const manifest = readJson(join(out, 'manifest.json'))
  assert.deepEqual(manifest.packages.backend.targets, [
    {
      file: 'backend/src/api/health.ts',
      change: 'modified',
      changedLines: '2-3',
      uncoveredLines: '2',
      coverage: { executable: 2, covered: 1 },
      relatedTests: ['backend/tests/health.test.ts'],
    },
  ])
  assert.deepEqual(manifest.packages.backend.baseline, { lines: 66.67, targetLines: { executable: 2, covered: 1 } })
  const agentManifest = readJson(join(out, 'manifest-backend.json'))
  assert.equal(agentManifest.package, 'backend')
  assert.equal(agentManifest.targets.length, 1)
})

test('plan in sweep mode targets the least covered source files of the chosen packages', () => {
  const repo = createRepo({ 'backend/src/a.ts': 'a\n', 'backend/src/b.ts': 'b\n' })
  repo.write({
    '.coverage/backend/lcov.info': 'SF:src/a.ts\nDA:1,1\nend_of_record\nSF:src/b.ts\nDA:1,0\nDA:2,0\nend_of_record\n',
  })
  const out = join(repo.root, '.out')
  const plan = run(repo.root, ['plan', '--mode', 'sweep', '--packages', 'backend', '--coverage-dir', join(repo.root, '.coverage'), '--out', out])
  assert.equal(plan.status, 0, plan.stderr)
  const manifest = readJson(join(out, 'manifest.json'))
  assert.equal(manifest.mode, 'sweep')
  assert.deepEqual(manifest.packages.backend.targets.map((target) => target.file), ['backend/src/b.ts'])
  assert.deepEqual(manifest.packages.backend.baseline, { lines: null, targetLines: { executable: 2, covered: 0 } })

  const unknown = run(repo.root, ['plan', '--mode', 'sweep', '--packages', 'database', '--out', out])
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /unknown packages: database/)
})

test('plan rejects revisions that are not commit hashes', () => {
  const repo = createRepo({ 'README.md': 'readme\n' })
  const result = run(repo.root, ['plan', '--mode', 'pr', '--base', 'main;rm', '--head', repo.first, '--out', join(repo.root, '.out')])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--base must be a commit hash/)
})

test('guard accepts test-only changes and writes the patch', () => {
  const repo = createRepo({ 'backend/src/a.ts': 'export const a = 1\n' })
  repo.write({ 'backend/tests/a.test.ts': "it('adds', () => expect(1 + 1).toBe(2))\n" })
  const out = join(repo.root, '.out')
  const result = run(repo.root, ['guard', '--packages', 'backend', '--out', join(out, 'guard.json'), '--patch', join(out, 'agent.patch')])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readJson(join(out, 'guard.json')), { ok: true, violations: [], files: ['backend/tests/a.test.ts'] })
  assert.match(readFileSync(join(out, 'agent.patch'), 'utf8'), /backend\/tests\/a\.test\.ts/)
})

test('guard rejects changes outside test files and writes no patch', () => {
  const repo = createRepo({ 'backend/src/a.ts': 'export const a = 1\n' })
  repo.write({ 'backend/src/a.ts': 'export const a = 2\n' })
  const out = join(repo.root, '.out')
  const result = run(repo.root, ['guard', '--packages', 'backend', '--out', join(out, 'guard.json'), '--patch', join(out, 'agent.patch')])
  assert.equal(result.status, 1)
  assert.deepEqual(readJson(join(out, 'guard.json')).violations, ['backend/src/a.ts: the agent may only change test files'])
  assert.throws(() => readFileSync(join(out, 'agent.patch')))
})

test('transcript fails the step when a non-Haiku model was billed', () => {
  const repo = createRepo({ 'README.md': 'readme\n' })
  const transcript = join(repo.root, 'transcript.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'result', subtype: 'success', modelUsage: { 'claude-sonnet-5-5': {} } })}\n`)
  const result = run(repo.root, ['transcript', '--input', transcript, '--out', join(repo.root, 'agent.json')])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Non-Haiku models were used: claude-sonnet-5-5/)
  assert.deepEqual(readJson(join(repo.root, 'agent.json')).models, ['claude-sonnet-5-5'])
})

test('transcript fails the step when the agent did not finish', () => {
  const repo = createRepo({ 'README.md': 'readme\n' })
  const transcript = join(repo.root, 'transcript.jsonl')
  writeFileSync(transcript, '')
  const result = run(repo.root, ['transcript', '--input', transcript, '--exit-code', '1', '--out', join(repo.root, 'agent.json')])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /The agent did not finish: missing \(exit code 1\)/)
  assert.equal(readJson(join(repo.root, 'agent.json')).status, 'missing')
})

test('verify-summary, status and report combine the job artifacts', () => {
  const repo = createRepo({ 'README.md': 'readme\n' })
  const artifacts = join(repo.root, 'artifacts')
  const manifest = {
    mode: 'pr',
    packages: {
      backend: {
        targets: [{ file: 'backend/src/a.ts', changedLines: '1-2' }],
        skipped: [],
        deferred: [],
        changedTests: [],
        baseline: { lines: 50, targetLines: { executable: 2, covered: 0 } },
      },
    },
  }
  repo.write({
    'artifacts/manifest.json': JSON.stringify(manifest),
    'artifacts/agent-backend/agent.json': JSON.stringify({
      status: 'success',
      turns: 3,
      costUsd: 0.01,
      models: ['claude-haiku-5-5'],
      skills: ['analyze-changes'],
      deniedTools: [],
      report: { decisions: [{ file: 'backend/src/a.ts', action: 'create', reason: 'new code', testFiles: ['backend/tests/a.test.ts'] }], summary: 'ok' },
    }),
    'artifacts/agent-backend/guard.json': JSON.stringify({ ok: true, violations: [], files: ['backend/tests/a.test.ts'] }),
    'backend/vitest-results.json': JSON.stringify({ numPassedTests: 4, numFailedTests: 0, numTotalTests: 4, success: true }),
    'backend/coverage/coverage-summary.json': JSON.stringify({ total: { lines: { pct: 75 } } }),
    'backend/coverage/lcov.info': 'SF:src/a.ts\nDA:1,1\nDA:2,1\nend_of_record\n',
  })
  const verifyOut = join(artifacts, 'verify-backend', 'verify.json')
  const summary = run(repo.root, [
    'verify-summary', '--package', 'backend', '--manifest', join(artifacts, 'manifest.json'),
    '--package-dir', join(repo.root, 'backend'), '--typecheck', 'passed', '--tests-exit', '0', '--out', verifyOut,
  ])
  assert.equal(summary.status, 0, summary.stderr)
  assert.deepEqual(readJson(verifyOut), {
    status: 'passed',
    typecheck: 'passed',
    tests: { passed: 4, failed: 0, total: 4 },
    coverage: { lines: 75 },
    targetLines: { executable: 2, covered: 2 },
  })

  const status = run(repo.root, ['status', '--manifest', join(artifacts, 'manifest.json'), '--artifacts', artifacts])
  assert.equal(status.outputs.status, 'ready')

  const commitPath = join(repo.root, 'commit.json')
  writeFileSync(commitPath, JSON.stringify({ committed: true, sha: 'abcdef123456', url: 'https://example.com/c' }))
  const comment = join(repo.root, 'comment.md')
  const report = run(repo.root, [
    'report', '--manifest', join(artifacts, 'manifest.json'), '--artifacts', artifacts,
    '--commit', commitPath, '--run-url', 'https://example.com/run', '--out', comment,
  ])
  assert.equal(report.status, 0, report.stderr)
  assert.equal(report.outputs.status, 'committed')
  const body = readFileSync(comment, 'utf8')
  assert.match(body, /Committed 1 test file/)
  assert.match(body, /\| backend \| ✅ 4 passed \| ✅ \| 50\.0% → 75\.0% \| 0\/2 → 2\/2 \|/)
})
