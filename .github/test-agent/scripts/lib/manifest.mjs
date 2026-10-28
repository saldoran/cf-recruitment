// Builds the manifest the agent works from: which source files to test and which lines no test runs yet.
import { posix } from 'node:path'
import { parseRanges, toRanges } from './diff.mjs'
import { matchesAny } from './glob.mjs'

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/
const MODULE_SPECIFIER = /(?:from\s+|import\s+|import\s*\(\s*|vi\.mock\(\s*|require\(\s*)['"]([^'"]+)['"]/g

export function lineCoverage(lines, hits) {
  if (!hits) return null
  const executable = lines.filter((line) => hits.has(line))
  const uncovered = executable.filter((line) => !(hits.get(line) > 0))
  return { executable: executable.length, covered: executable.length - uncovered.length, uncovered }
}

function moduleId(path) {
  const bare = path.replace(SOURCE_EXTENSION, '')
  return bare.endsWith('/index') ? bare.slice(0, -'/index'.length) : bare
}

// A test is related when it imports or mocks the source module through a relative specifier.
export function relatedTests(sourcePath, testFiles) {
  const target = moduleId(sourcePath)
  return testFiles
    .filter(({ path, content }) =>
      [...content.matchAll(MODULE_SPECIFIER)].some(
        ([, specifier]) => specifier.startsWith('.') && moduleId(posix.join(posix.dirname(path), specifier)) === target,
      ),
    )
    .map(({ path }) => path)
}

function packageOf(path, config) {
  return (
    Object.keys(config.packages).find((name) => {
      const { sourceGlobs, writableGlobs } = config.packages[name]
      return matchesAny(path, [...writableGlobs, ...sourceGlobs])
    }) ?? null
  )
}

function prTarget(change, hits, testFiles) {
  const measured = lineCoverage(change.addedLines, hits?.get(change.path))
  return {
    file: change.path,
    change: change.status,
    changedLines: toRanges(change.addedLines),
    uncoveredLines: measured ? toRanges(measured.uncovered) : null,
    coverage: measured ? { executable: measured.executable, covered: measured.covered } : null,
    relatedTests: relatedTests(change.path, testFiles),
  }
}

function sweepTarget(file, hits, testFiles) {
  const measured = lineCoverage([...hits.keys()], hits)
  return {
    file,
    change: 'existing',
    uncoveredLines: toRanges(measured.uncovered),
    coverage: { executable: measured.executable, covered: measured.covered },
    relatedTests: relatedTests(file, testFiles),
  }
}

// Unknown coverage counts every changed line as uncovered.
const uncoveredCount = (target) =>
  target.coverage ? target.coverage.executable - target.coverage.covered : parseRanges(target.changedLines).length

function finalize(packages, maxTargets) {
  return Object.fromEntries(
    Object.entries(packages).map(([name, { candidates, skipped, changedTests }]) => {
      const ranked = [...candidates].sort((a, b) => uncoveredCount(b) - uncoveredCount(a) || a.file.localeCompare(b.file))
      const targets = ranked.slice(0, maxTargets)
      const deferred = ranked.slice(maxTargets).map((target) => target.file)
      return [name, { targets, skipped, deferred, changedTests }]
    }),
  )
}

export function buildPrManifest({ changes, config, coverage, testFiles, maxTargets }) {
  const packages = {}
  for (const change of changes) {
    const name = packageOf(change.path, config)
    if (!name) continue
    const settings = config.packages[name]
    const bucket = (packages[name] ??= { candidates: [], skipped: [], changedTests: [] })
    const ignoredBy = matchesAny(change.path, settings.ignoreGlobs)
    if (matchesAny(change.path, settings.writableGlobs)) bucket.changedTests.push(change.path)
    else if (change.status === 'deleted') bucket.skipped.push({ file: change.path, reason: 'file deleted' })
    else if (ignoredBy) bucket.skipped.push({ file: change.path, reason: `excluded from unit-test coverage (${ignoredBy})` })
    else bucket.candidates.push(prTarget(change, coverage[name], testFiles))
  }
  return { mode: 'pr', packages: finalize(packages, maxTargets) }
}

export function buildSweepManifest({ packages: names, config, coverage, testFiles, maxTargets }) {
  const packages = {}
  for (const name of names) {
    const { sourceGlobs, ignoreGlobs } = config.packages[name]
    const candidates = [...(coverage[name] ?? new Map())]
      .filter(([file]) => matchesAny(file, sourceGlobs) && !matchesAny(file, ignoreGlobs))
      .map(([file, hits]) => sweepTarget(file, hits, testFiles))
      .filter((target) => target.coverage.covered < target.coverage.executable)
    packages[name] = { candidates, skipped: [], changedTests: [] }
  }
  return { mode: 'sweep', packages: finalize(packages, maxTargets) }
}

// Coverage of the lines the run is about: the changed lines in pr mode, whole target files in sweep mode.
export function measureTargets(targets, hits, mode) {
  if (!hits) return null
  return targets.reduce(
    (total, target) => {
      const fileHits = hits.get(target.file)
      const lines = mode === 'pr' ? parseRanges(target.changedLines) : [...(fileHits?.keys() ?? [])]
      const measured = lineCoverage(lines, fileHits)
      if (!measured) return total
      return { executable: total.executable + measured.executable, covered: total.covered + measured.covered }
    },
    { executable: 0, covered: 0 },
  )
}

export function agentPackages(manifest) {
  return Object.keys(manifest.packages).filter((name) => manifest.packages[name].targets.length > 0)
}

export function verifyPackages(manifest) {
  return Object.keys(manifest.packages).filter((name) => {
    const { targets, skipped, deferred, changedTests } = manifest.packages[name]
    return targets.length + skipped.length + deferred.length + changedTests.length > 0
  })
}
