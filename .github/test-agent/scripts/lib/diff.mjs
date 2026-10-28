// Reads `git diff --unified=0` output: the changed files and the new-side lines each one adds.
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

export function parseUnifiedDiff(text) {
  const files = []
  let current = null
  let inHeader = false
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { path: null, oldPath: null, status: 'modified', addedLines: [] }
      files.push(current)
      inHeader = true
    } else if (current && inHeader && line.startsWith('--- ')) {
      if (line === '--- /dev/null') current.status = 'added'
      else current.oldPath = stripPrefix(line.slice(4), 'a/')
    } else if (current && inHeader && line.startsWith('+++ ')) {
      if (line === '+++ /dev/null') current.status = 'deleted'
      else current.path = stripPrefix(line.slice(4), 'b/')
    } else if (current && line.startsWith('@@ ')) {
      inHeader = false
      current.addedLines.push(...hunkLines(line))
    }
  }
  return files
    .filter((file) => file.path || file.oldPath)
    .map(({ path, oldPath, status, addedLines }) => ({ path: path ?? oldPath, status, addedLines }))
}

function hunkLines(header) {
  const match = HUNK.exec(header)
  if (!match) return []
  const start = Number(match[1])
  const count = match[2] === undefined ? 1 : Number(match[2])
  return Array.from({ length: count }, (_, offset) => start + offset)
}

function stripPrefix(path, prefix) {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

export function toRanges(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const ranges = []
  for (const number of sorted) {
    const last = ranges.at(-1)
    if (last && number === last[1] + 1) last[1] = number
    else ranges.push([number, number])
  }
  return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(', ')
}

export function parseRanges(text) {
  if (!text) return []
  return text.split(',').flatMap((part) => {
    const [start, end = start] = part.trim().split('-').map(Number)
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
  })
}
