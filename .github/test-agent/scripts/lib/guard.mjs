// Checks the agent's working-tree changes before anything is committed: test files only, no tricks.
import { matchesAny } from './glob.mjs'

const REGULAR_FILE_MODE = '100644'
const FORBIDDEN_CONTENT = [
  [
    /\b(?:describe|it|test|suite)\.(?:only|skip|todo|skipIf|runIf)\b|\b(?:fit|fdescribe|xit|xdescribe|xtest)\s*\(/,
    'contains a focused, skipped or placeholder test',
  ],
  [/\bchild_process\b|\bworker_threads\b/, 'must not start processes'],
  [/@ts-nocheck/, 'must not turn off type checking'],
  [/\bsk-ant-[\w-]{6,}/, 'contains what looks like an API key'],
]

// `git diff --raw` lines look like ":100644 100644 <sha> <sha> M\tpath".
export function parseRawDiff(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith(':'))
    .map((line) => {
      const [meta, path] = line.split('\t')
      const [, mode, , , status] = meta.slice(1).split(' ')
      return { path, status: status[0], mode }
    })
}

export function checkChanges({ changes, contents, writableGlobs, limits }) {
  const violations = []
  if (changes.length > limits.maxPatchFiles) {
    violations.push(`the patch changes ${changes.length} files, the limit is ${limits.maxPatchFiles}`)
  }
  for (const change of changes) {
    violations.push(...checkChange(change, contents.get(change.path) ?? '', writableGlobs, limits))
  }
  return violations
}

function checkChange({ path, status, mode }, content, writableGlobs, limits) {
  if (!matchesAny(path, writableGlobs)) return [`${path}: the agent may only change test files`]
  if (status !== 'A' && status !== 'M') return [`${path}: deleting or renaming files is not allowed`]
  if (mode !== REGULAR_FILE_MODE) return [`${path}: only regular, non-executable files are allowed (mode ${mode})`]
  if (Buffer.byteLength(content) > limits.maxTestFileBytes) {
    return [`${path}: file is larger than ${limits.maxTestFileBytes} bytes`]
  }
  return FORBIDDEN_CONTENT.filter(([pattern]) => pattern.test(content)).map(([, message]) => `${path}: ${message}`)
}
