// Renders the pull-request comment and the job summary. Text written by the agent is untrusted:
// it is flattened, escaped, and stripped of mentions and links before it reaches GitHub.
export const REPORT_MARKER = '<!-- unit-test-agent -->'

const SAFE_PATH = /^[\w./@-]+$/
const ACTIONS = new Set(['create', 'update', 'skip'])

export function sanitize(text, maxLength) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/sk-ant-[\w-]+/g, '[redacted]')
    .trim()
  const short = flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat
  return short
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\|[\]*])/g, '\\$1')
    .replace(/@(?=\w)/g, '@​')
    .replace(/:\/\//g, ':​//')
}

const code = (path) => (SAFE_PATH.test(path) ? `\`${path}\`` : sanitize(path, 200))
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const percent = (value) => (typeof value === 'number' ? `${value.toFixed(1)}%` : '—')
const ratio = (lines) => (lines ? `${lines.covered}/${lines.executable}` : '—')
const checkCell = (state) => ({ passed: '✅', failed: '❌' })[state] ?? '—'
const patchFiles = (results) => Object.values(results).flatMap((result) => result.agent?.patchFiles ?? [])

export function overallStatus(results, commit) {
  const entries = Object.values(results)
  if (entries.some((result) => result.agent?.guard?.ok === false)) return 'rejected'
  if (entries.some((result) => result.verify?.status === 'failed')) return 'tests-failed'
  if (entries.some((result) => result.agent && result.agent.status !== 'success')) return 'agent-failed'
  if (entries.some((result) => result.agent?.patchFiles?.length && result.verify?.status !== 'passed')) return 'unverified'
  if (commit?.committed) return 'committed'
  return patchFiles(results).length > 0 ? 'ready' : 'no-changes'
}

function headline(status, results, commit) {
  const count = plural(patchFiles(results).length, 'test file')
  switch (status) {
    case 'committed':
      return commit.compareUrl
        ? `✅ Pushed ${count} to \`${commit.branch}\`. [Open a pull request](${commit.compareUrl}) to merge them.`
        : `✅ Committed ${count} in [\`${commit.sha.slice(0, 7)}\`](${commit.url}).`
    case 'ready':
      return `⚠️ The tests passed but were not committed${commit?.reason ? `: ${sanitize(commit.reason, 200)}` : '.'}`
    case 'tests-failed':
      return patchFiles(results).length
        ? "❌ Tests failed. The agent's tests were not committed."
        : '❌ Tests failed on this pull request.'
    case 'rejected':
      return "❌ The guard rejected the agent's changes, so nothing was committed."
    case 'agent-failed':
      return '❌ The agent did not finish, so nothing was committed.'
    case 'unverified':
      return '⚠️ The tests were not verified, so nothing was committed.'
    default:
      return 'ℹ️ No new tests were needed.'
  }
}

function guardFindings(results) {
  const lines = Object.entries(results).flatMap(([name, result]) =>
    (result.agent?.guard?.violations ?? []).map((violation) => `- ${name}: ${sanitize(violation, 300)}`),
  )
  return lines.length ? ['Guard findings:', ...lines].join('\n') : ''
}

function testsCell(verify) {
  const tests = verify?.tests
  if (!tests) return verify?.status === 'failed' ? '❌' : '—'
  return tests.failed > 0 ? `❌ ${tests.failed} of ${tests.total} failed` : `✅ ${tests.passed} passed`
}

function resultsTable(manifest, results) {
  const target = manifest.mode === 'sweep' ? 'Target lines covered' : 'Changed lines covered'
  const rows = Object.keys(manifest.packages).map((name) => {
    const baseline = manifest.packages[name].baseline ?? {}
    const verify = results[name]?.verify
    const coverage = `${percent(baseline.lines)} → ${percent(verify?.coverage?.lines)}`
    return `| ${name} | ${testsCell(verify)} | ${checkCell(verify?.typecheck)} | ${coverage} | ${ratio(baseline.targetLines)} → ${ratio(verify?.targetLines)} |`
  })
  return [`| Package | Tests | Typecheck | Line coverage | ${target} |`, '| --- | --- | --- | --- | --- |', ...rows].join('\n')
}

function decisionCell({ action, testFiles = [] }) {
  const verb = ACTIONS.has(action) ? action : 'unknown'
  return verb !== 'skip' && testFiles.length ? `${verb} → ${testFiles.map(code).join(', ')}` : verb
}

function decisionsSection(name, entry, result) {
  const report = result?.agent?.report
  // Files skipped by rule get their own row; the agent's opinion on them adds nothing.
  const ruleSkipped = new Set(entry.skipped.map((skip) => skip.file))
  const decisions = (report?.decisions ?? []).filter((decision) => !ruleSkipped.has(decision.file))
  const decided = new Set(decisions.map((decision) => decision.file))
  const rows = [
    ...decisions.map((decision) => `| ${code(decision.file)} | ${decisionCell(decision)} | ${sanitize(decision.reason, 300)} |`),
    ...(result?.agent ? entry.targets.filter((target) => !decided.has(target.file)) : []).map(
      (target) => `| ${code(target.file)} | — | no decision reported |`,
    ),
    ...entry.skipped.map((skip) => `| ${code(skip.file)} | skip (rule) | ${sanitize(skip.reason, 300)} |`),
  ]
  const lines = rows.length ? [`#### ${name}`, '', '| File | Decision | Reason |', '| --- | --- | --- |', ...rows] : []
  const bugs = report?.suspectedBugs ?? []
  if (bugs.length) lines.push('', `**Suspected bugs (${name})**`, ...bugs.map((bug) => `- ${sanitize(bug, 300)}`))
  if (entry.deferred.length) {
    lines.push('', `Not analysed in this run because of the target limit: ${entry.deferred.map(code).join(', ')}`)
  }
  if (report?.summary) lines.push('', `> ${sanitize(report.summary, 600)}`)
  return lines.join('\n')
}

function detailsSection(results, runUrl) {
  const agents = Object.entries(results).filter(([, result]) => result.agent)
  const rows = agents.map(([name, { agent }]) => {
    const models = agent.models.map((model) => sanitize(model, 60)).join(', ') || '—'
    const skills = agent.skills.map((skill) => sanitize(skill, 60)).join(', ') || '—'
    return `| ${name} | ${models} | ${skills} | ${agent.turns} | $${agent.costUsd.toFixed(3)} |`
  })
  const notes = agents.flatMap(([name, { agent }]) => [
    ...(agent.status === 'success' ? [] : [`- ${name}: the agent stopped with \`${sanitize(agent.status, 60)}\``]),
    ...(agent.deniedTools?.length ? [`- ${name}: denied tool calls: ${agent.deniedTools.map((call) => sanitize(call, 120)).join('; ')}`] : []),
  ])
  const table = rows.length
    ? ['| Package | Model | Skills used | Turns | Cost |', '| --- | --- | --- | --- | --- |', ...rows].join('\n')
    : 'The agent did not run.'
  return ['<details><summary>Run details</summary>', '', table, ...(notes.length ? ['', ...notes] : []), '', `[Workflow run](${runUrl})`, '', '</details>'].join('\n')
}

export function renderReport({ manifest, results, commit, runUrl }) {
  const status = overallStatus(results, commit)
  const sections = [
    REPORT_MARKER,
    '### Unit test agent',
    headline(status, results, commit),
    guardFindings(results),
    resultsTable(manifest, results),
    ...Object.entries(manifest.packages).map(([name, entry]) => decisionsSection(name, entry, results[name])),
    detailsSection(results, runUrl),
  ]
  return `${sections.filter(Boolean).join('\n\n')}\n`
}
