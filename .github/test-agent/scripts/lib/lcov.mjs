// Reads line hits from an lcov report into Map<file path, Map<line, hits>>.
// Vitest writes paths relative to the package, so `packageDir` turns them into repository paths.
export function parseLcov(text, packageDir = '') {
  const files = new Map()
  let lines = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('SF:')) {
      lines = new Map()
      files.set(packageDir ? `${packageDir}/${line.slice(3)}` : line.slice(3), lines)
    } else if (line.startsWith('DA:') && lines) {
      const [number, hits] = line.slice(3).split(',').map(Number)
      lines.set(number, Math.max(lines.get(number) ?? 0, hits))
    } else if (line === 'end_of_record') {
      lines = null
    }
  }
  return files
}
