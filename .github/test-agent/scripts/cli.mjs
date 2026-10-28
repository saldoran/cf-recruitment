#!/usr/bin/env node
// Entry point for the unit-test-agent workflow steps: `node cli.mjs <command> [--option value]`.
// Commands run from the repository root and write step outputs to $GITHUB_OUTPUT when it is set.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { loadConfig } from './lib/config.mjs'
import { parseUnifiedDiff } from './lib/diff.mjs'
import { matchesAny } from './lib/glob.mjs'
import { checkChanges, parseRawDiff } from './lib/guard.mjs'
import { parseLcov } from './lib/lcov.mjs'
import { agentPackages, buildPrManifest, buildSweepManifest, measureTargets, verifyPackages } from './lib/manifest.mjs'
import { overallStatus, renderReport } from './lib/report.mjs'
import { nonHaikuModels, summarizeTranscript } from './lib/transcript.mjs'

const CONFIG_PATH = new URL('../config.json', import.meta.url)
const COMMIT_HASH = /^[0-9a-f]{7,40}$/
const OPTIONS = Object.fromEntries(
  ['artifacts', 'base', 'commit', 'coverage-dir', 'exit-code', 'head', 'input', 'manifest', 'mode', 'out', 'package', 'package-dir', 'packages', 'patch', 'run-url', 'tests-exit', 'typecheck'].map(
    (name) => [name, { type: 'string' }],
  ),
)

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const readJsonIfExists = (path) => (path && existsSync(path) ? readJson(path) : null)

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function setOutput(name, value) {
  const line = `${name}=${typeof value === 'string' ? value : JSON.stringify(value)}`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
  console.log(line)
}

function requireOption(options, name) {
  if (!options[name]) throw new Error(`--${name} is required`)
  return options[name]
}

function commitHash(options, name) {
  const value = requireOption(options, name)
  if (!COMMIT_HASH.test(value)) throw new Error(`--${name} must be a commit hash`)
  return value
}

function packageNames(list, config) {
  const names = list.split(',').map((name) => name.trim()).filter(Boolean)
  const unknown = names.filter((name) => !config.packages[name])
  if (names.length === 0 || unknown.length > 0) throw new Error(`unknown packages: ${unknown.join(', ') || list}`)
  return names
}

function trackedTestFiles(config) {
  const globs = Object.values(config.packages).flatMap((settings) => settings.testGlobs)
  return git(['ls-files', '-z'])
    .split('\0')
    .filter((path) => path && matchesAny(path, globs))
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }))
}

function loadCoverage(names, coverageDir) {
  const entries = names
    .map((name) => [name, coverageDir ? join(coverageDir, name, 'lcov.info') : null])
    .filter(([, path]) => path && existsSync(path))
    .map(([name, path]) => [name, parseLcov(readFileSync(path, 'utf8'), name)])
  return Object.fromEntries(entries)
}

function withBaseline(manifest, coverage, coverageDir) {
  const packages = Object.fromEntries(
    Object.entries(manifest.packages).map(([name, entry]) => {
      const summary = coverageDir ? readJsonIfExists(join(coverageDir, name, 'coverage-summary.json')) : null
      const baseline = { lines: summary?.total?.lines?.pct ?? null, targetLines: measureTargets(entry.targets, coverage[name], manifest.mode) }
      return [name, { ...entry, baseline }]
    }),
  )
  return { ...manifest, packages }
}

function packages(options, config) {
  const range = `${commitHash(options, 'base')}...${commitHash(options, 'head')}`
  const changed = git(['diff', '--name-only', '--no-renames', range]).split('\n').filter(Boolean)
  const names = Object.keys(config.packages).filter((name) => {
    const { sourceGlobs, writableGlobs } = config.packages[name]
    return changed.some((path) => matchesAny(path, [...sourceGlobs, ...writableGlobs]))
  })
  setOutput('packages', names)
}

function plan(options, config) {
  const mode = requireOption(options, 'mode')
  const out = requireOption(options, 'out')
  const testFiles = trackedTestFiles(config)
  let manifest
  if (mode === 'pr') {
    const range = `${commitHash(options, 'base')}...${commitHash(options, 'head')}`
    const changes = parseUnifiedDiff(git(['diff', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff', range]))
    const coverage = loadCoverage(Object.keys(config.packages), options['coverage-dir'])
    const draft = buildPrManifest({ changes, config, coverage, testFiles, maxTargets: config.limits.pr.maxTargets })
    manifest = withBaseline(draft, coverage, options['coverage-dir'])
  } else if (mode === 'sweep') {
    const names = packageNames(requireOption(options, 'packages'), config)
    const coverage = loadCoverage(names, options['coverage-dir'])
    const draft = buildSweepManifest({ packages: names, config, coverage, testFiles, maxTargets: config.limits.sweep.maxTargets })
    manifest = withBaseline(draft, coverage, options['coverage-dir'])
  } else {
    throw new Error('--mode must be pr or sweep')
  }
  writeJson(join(out, 'manifest.json'), manifest)
  for (const [name, { targets, skipped }] of Object.entries(manifest.packages)) {
    writeJson(join(out, `manifest-${name}.json`), { mode: manifest.mode, package: name, targets, skipped })
  }
  setOutput('agent-packages', agentPackages(manifest))
  setOutput('verify-packages', verifyPackages(manifest))
}

function guard(options, config) {
  const names = packageNames(requireOption(options, 'packages'), config)
  const writableGlobs = names.flatMap((name) => config.packages[name].writableGlobs)
  git(['add', '--all'])
  const changes = parseRawDiff(git(['diff', '--cached', '--raw', '--no-renames', '--no-ext-diff', 'HEAD']))
  // Only regular files are read; anything else is rejected by its mode.
  const contents = new Map(changes.filter((change) => change.mode === '100644').map((change) => [change.path, readFileSync(change.path, 'utf8')]))
  const violations = checkChanges({ changes, contents, writableGlobs, limits: config.limits })
  const ok = violations.length === 0
  if (ok && options.patch) {
    mkdirSync(dirname(options.patch), { recursive: true })
    writeFileSync(options.patch, git(['diff', '--cached', '--binary', '--no-ext-diff', 'HEAD']))
  }
  writeJson(requireOption(options, 'out'), { ok, violations, files: changes.map((change) => change.path) })
  if (!ok) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}

function transcript(options) {
  const input = requireOption(options, 'input')
  const summary = summarizeTranscript(existsSync(input) ? readFileSync(input, 'utf8').split('\n') : [])
  writeJson(requireOption(options, 'out'), { ...summary, exitCode: Number(options['exit-code'] ?? 0) })
  const foreign = nonHaikuModels(summary.models)
  if (foreign.length > 0) {
    console.error(`Non-Haiku models were used: ${foreign.join(', ')}`)
    process.exitCode = 1
  }
}

function verifySummary(options) {
  const name = requireOption(options, 'package')
  const dir = requireOption(options, 'package-dir')
  const manifest = readJson(requireOption(options, 'manifest'))
  const results = readJsonIfExists(join(dir, 'vitest-results.json'))
  const summary = readJsonIfExists(join(dir, 'coverage', 'coverage-summary.json'))
  const lcovPath = join(dir, 'coverage', 'lcov.info')
  const hits = existsSync(lcovPath) ? parseLcov(readFileSync(lcovPath, 'utf8'), name) : null
  const tests = results ? { passed: results.numPassedTests, failed: results.numFailedTests, total: results.numTotalTests } : null
  const typecheck = options.typecheck === 'passed' ? 'passed' : 'failed'
  const passed = typecheck === 'passed' && options['tests-exit'] === '0' && (tests?.failed ?? 0) === 0
  writeJson(requireOption(options, 'out'), {
    status: passed ? 'passed' : 'failed',
    typecheck,
    tests,
    coverage: summary ? { lines: summary.total.lines.pct } : null,
    targetLines: manifest.packages[name] && hits ? measureTargets(manifest.packages[name].targets, hits, manifest.mode) : null,
  })
}

function collectResults(manifest, artifacts) {
  return Object.fromEntries(
    Object.keys(manifest.packages).map((name) => {
      const agent = readJsonIfExists(join(artifacts, `agent-${name}`, 'agent.json'))
      const guardResult = readJsonIfExists(join(artifacts, `agent-${name}`, 'guard.json'))
      const verify = readJsonIfExists(join(artifacts, `verify-${name}`, 'verify.json'))
      const withGuard = agent && {
        ...agent,
        guard: guardResult ?? { ok: false, violations: ['the guard result is missing'] },
        patchFiles: guardResult?.ok ? guardResult.files : [],
      }
      return [name, { ...(withGuard && { agent: withGuard }), ...(verify && { verify }) }]
    }),
  )
}

function status(options) {
  const manifest = readJson(requireOption(options, 'manifest'))
  setOutput('status', overallStatus(collectResults(manifest, requireOption(options, 'artifacts')), null))
}

function report(options) {
  const manifest = readJson(requireOption(options, 'manifest'))
  const results = collectResults(manifest, requireOption(options, 'artifacts'))
  const commit = readJsonIfExists(options.commit)
  writeFileSync(requireOption(options, 'out'), renderReport({ manifest, results, commit, runUrl: requireOption(options, 'run-url') }))
  setOutput('status', overallStatus(results, commit))
}

const COMMANDS = { packages, plan, guard, transcript, 'verify-summary': verifySummary, status, report }

function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (!COMMANDS[command]) throw new Error(`usage: cli.mjs <${Object.keys(COMMANDS).join('|')}> [options]`)
  const { values } = parseArgs({ args: rest, options: OPTIONS, strict: true })
  COMMANDS[command](values, loadConfig(CONFIG_PATH))
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
