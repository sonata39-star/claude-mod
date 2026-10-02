// The same meters as dev-status draws (a plugin imports only its own files).
// Progress meters drawn as text. Every glyph here is East Asian Width
// "neutral", one cell on every terminal whatever its ambiguous-width setting.
export const FILL = '▰'
export const EMPTY = '▱'
export const MARK = '╎'

// The stacked bar's colours, one per category in order.
export const PALETTE = ['cyan', 'magenta', 'blue', 'yellow', 'green', 'red', 'white']

const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const HOUR = 3_600_000

// A stretch of one glyph in one colour; `isDim` for the empty part.
export type Run = { text: string; color?: string; isDim?: boolean }

const pad = (n: number) => String(n).padStart(2, '0')

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

// Green under 60% used, yellow to 85%, red past it.
export function levelColor(percentUsed: number): string {
  if (percentUsed > 85) {
    return 'red'
  }

  return percentUsed >= 60 ? 'yellow' : 'green'
}

// The status line's 8-cell meter: "▰▰▰▱▱▱▱▱" at 42% used.
export function miniBar(percentUsed: number, cells = 8): string {
  const filled = clamp(Math.round((percentUsed / 100) * cells), 0, cells)

  return FILL.repeat(filled) + EMPTY.repeat(cells - filled)
}

// A full-width meter as coloured runs, with an optional mark (the
// auto-compact threshold) at `markPercent` of the width.
export function barRuns(percentUsed: number, width: number, markPercent?: number): Run[] {
  const cells = Math.max(1, Math.floor(width))
  const filled = clamp(Math.round((percentUsed / 100) * cells), 0, cells)
  const mark = markPercent === undefined ? -1 : clamp(Math.floor((markPercent / 100) * cells), 0, cells - 1)
  const color = levelColor(percentUsed)
  const runs: Run[] = []

  const push = (text: string, style: Omit<Run, 'text'>) => {
    const last = runs[runs.length - 1]
    if (last && last.color === style.color && last.isDim === style.isDim) {
      last.text += text
    } else {
      runs.push({ text, ...style })
    }
  }

  for (let i = 0; i < cells; i += 1) {
    if (i === mark) {
      push(MARK, { color: 'magenta' })
    } else if (i < filled) {
      push(FILL, { color })
    } else {
      push(EMPTY, { isDim: true })
    }
  }

  return runs
}

// One bar of `width` cells split by `parts` (tokens each) out of `total`,
// largest-remainder rounded so the cells add up; the rest is empty.
export function stackRuns(parts: readonly number[], total: number, width: number): Run[] {
  const cells = Math.max(1, Math.floor(width))
  const exact = parts.map(part => (total > 0 ? (Math.max(0, part) / total) * cells : 0))
  const counts = exact.map(Math.floor)
  const used = Math.min(cells, Math.round(exact.reduce((sum, x) => sum + x, 0)))
  let spare = used - counts.reduce((sum, n) => sum + n, 0)
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest)

  for (const { i } of order) {
    if (spare <= 0) {
      break
    }
    counts[i] = (counts[i] ?? 0) + 1
    spare -= 1
  }

  const runs: Run[] = counts
    .map((count, i) => ({ text: FILL.repeat(count), color: PALETTE[i % PALETTE.length] }))
    .filter(run => run.text.length > 0)
  const free = cells - counts.reduce((sum, n) => sum + n, 0)
  if (free > 0) {
    runs.push({ text: EMPTY.repeat(free), isDim: true })
  }

  return runs
}

export function clockTime(at: number): string {
  const date = new Date(at)

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// "2ชม 13น", "2วัน 20ชม", "45น"
export function thaiDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60

  if (days > 0) {
    return hours > 0 ? `${days}วัน ${hours}ชม` : `${days}วัน`
  }
  if (hours > 0) {
    return rest > 0 ? `${hours}ชม ${rest}น` : `${hours}ชม`
  }

  return `${rest}น`
}

// When a window resets, in local time: "14:30" within a day, else "จ. 09:00".
export function resetAt(resetsAt: string | undefined, now: number): string | undefined {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)

  if (Number.isNaN(at)) {
    return undefined
  }

  return at - now < 24 * HOUR ? clockTime(at) : `${THAI_DAYS[new Date(at).getDay()]} ${clockTime(at)}`
}

// "รีเซ็ต 14:30 · อีก 2ชม 13น", or undefined when the window says nothing.
export function resetLine(resetsAt: string | undefined, now: number): string | undefined {
  const at = resetAt(resetsAt, now)

  return at === undefined || resetsAt === undefined
    ? undefined
    : `รีเซ็ต ${at} · อีก ${thaiDuration(Date.parse(resetsAt) - now)}`
}
