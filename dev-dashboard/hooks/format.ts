
const pad = (n: number) => String(n).padStart(2, '0')

// Commands whose exit says whether the code is healthy.
const CHECK = /\b(test|tests|jest|vitest|pytest|mocha|playwright|tsc|typecheck|type-check|eslint|lint|ruff|mypy|flake8|clippy|build|validate)\b/

export function isCheck(command: string): boolean {
  return CHECK.test(command)
}

export function clockTime(at: number): string {
  const date = new Date(at)

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 512_000 → "8m32s", 42_000 → "42s"
export function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60

  if (hours > 0) {
    return `${hours}h${pad(minutes)}m`
  }
  if (minutes > 0) {
    return `${minutes}m${pad(rest)}s`
  }

  return `${rest}s`
}

// Cells a string takes on a terminal: Thai vowel and tone marks take none,
// emoji take two, the rest one.
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isThaiMark = code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e)
    const isZeroWidth = isThaiMark || code === 0xfe0f || code === 0x200d
    const isWide = code >= 0x1f000 || code === 0x26d4 || code === 0x2705 || code === 0x274c
    width += isZeroWidth ? 0 : isWide ? 2 : 1
  }

  return width
}

// One line, whitespace collapsed, cut to `width` cells with an ellipsis.
export function fit(text: string, width: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  const room = Math.max(2, width)

  if (cellWidth(line) <= room) {
    return line
  }

  let cut = ''
  for (const char of line) {
    if (cellWidth(cut + char) > room - 1) {
      break
    }
    cut += char
  }

  return `${cut}…`
}

// A path under the session's directory is shown relative to it.
export function relative(path: string, cwd: string): string {
  if (cwd !== '' && path.startsWith(`${cwd}/`)) {
    return path.slice(cwd.length + 1)
  }

  return path
}

// A long path keeps its end, where the file's name is.
export function fitPath(path: string, width: number): string {
  const room = Math.max(2, width)

  if (cellWidth(path) <= room) {
    return path
  }

  let kept = ''
  for (const char of [...path].reverse()) {
    if (cellWidth(char + kept) > room - 1) {
      break
    }
    kept = char + kept
  }

  return `…${kept}`
}
