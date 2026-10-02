import type { DashboardUsage } from '../types'
import { resetLine } from './meter'

const pad = (n: number) => String(n).padStart(2, '0')

const LIMIT_LABEL: Record<string, string> = { five_hour: '5-hour', seven_day: '7-day', spend_limit: 'Spend' }

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

export function compact(n: number): string {
  if (n >= 1e6) {
    return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (n >= 1e3) {
    return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  }

  return String(Math.round(n))
}

// One line, whitespace collapsed, cut to `width` with an ellipsis.
export function fit(text: string, width: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  const room = Math.max(4, width)

  return line.length > room ? `${line.slice(0, room - 1)}…` : line
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
  const room = Math.max(4, width)

  return path.length > room ? `…${path.slice(path.length - room + 1)}` : path
}

// One meter of the usage section: what it measures, how full, and what
// to say after the percentages.
export type UsageMeter = { key: string; label: string; percentUsed?: number; tail?: string }

export function usageMeters(usage: DashboardUsage): UsageMeter[] {
  const tokens = usage.contextTokens
  const context: UsageMeter = {
    key: 'context',
    label: 'Context',
    percentUsed: usage.contextPercent,
    tail: tokens === undefined ? undefined : `${compact(tokens)}/${compact(usage.window)} tokens`,
  }

  return [
    context,
    ...usage.limits.map(limit => ({
      key: limit.kind,
      label: LIMIT_LABEL[limit.kind] ?? limit.kind.replace(/_/g, ' '),
      percentUsed: limit.percentUsed,
      tail: resetLine(limit.resetsAt, usage.at),
    })),
  ]
}

// A percentage with at most one decimal: 23.5 → "23.5%".
export function exactPercent(x: number): string {
  return `${Math.max(0, x).toFixed(1).replace(/\.0$/, '')}%`
}
