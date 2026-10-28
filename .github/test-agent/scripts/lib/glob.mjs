// Minimal glob matcher for repository paths: `**` spans folders, `*` and `?` stay inside one.
const REGEXP_SPECIAL = /[.+^${}()|[\]\\]/

export function globToRegExp(glob) {
  let source = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*' && glob[index + 1] === '*') {
      const folders = glob[index + 2] === '/'
      source += folders ? '(?:.*/)?' : '.*'
      index += folders ? 2 : 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += REGEXP_SPECIAL.test(char) ? `\\${char}` : char
    }
  }
  return new RegExp(`^${source}$`)
}

export function matchesAny(path, globs) {
  return globs.find((glob) => globToRegExp(glob).test(path)) ?? null
}
