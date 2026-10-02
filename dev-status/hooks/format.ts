import type { SessionRateLimit, SessionUsage } from 'claude-code'

import type { DevStatusGit, DevStatusUsage } from '../types'
import { levelColor, miniBar, miniBarRuns, resetAt, runsWidth } from './meter'
import type { Run } from './meter'

export type Git = DevStatusGit

export type Rtk = { saved: number; percent: number }

export type Snapshot = {
  git?: Git
  usage?: SessionUsage
  rtk?: Rtk
}

// The context breakdown's figures the usage pane draws.
export type Breakdown = { slices: { name: string; tokens: number }[]; total: number; autoCompactAt?: number }

const SEP = ' │ '

const LIMIT_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d opus',
  seven_day_sonnet: '7d sonnet',
  spend_limit: 'spend',
}

const LIMIT_NAME: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: '7-day limit',
  seven_day_opus: '7-day limit (Opus)',
  seven_day_sonnet: '7-day limit (Sonnet)',
  spend_limit: 'Spend limit',
}

const oneDecimal = (x: number) => (x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ''))

// 84123 → "84.1k", 200000 → "200k", 1_250_000 → "1.3M"
export function compact(n: number): string {
  if (n >= 1e6) {
    return `${oneDecimal(n / 1e6)}M`
  }
  if (n >= 1e3) {
    return `${oneDecimal(n / 1e3)}k`
  }

  return String(Math.round(n))
}

// 84123 → "84,123", without leaning on Intl.
export function grouped(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// A percentage as the engine gives it, one decimal at most: 23.5 → "23.5%".
export function exactPercent(x: number): string {
  return `${Math.max(0, x).toFixed(1).replace(/\.0$/, '')}%`
}

// A percentage with one decimal only where it matters (under 10).
export function percent(x: number): string {
  const clamped = Math.max(0, x)

  return clamped < 10 ? `${clamped.toFixed(1).replace(/\.0$/, '')}%` : `${Math.round(clamped)}%`
}

export function limitShort(kind: string): string {
  return LIMIT_LABEL[kind] ?? kind.replace(/_/g, ' ')
}

export function limitName(kind: string): string {
  return LIMIT_NAME[kind] ?? kind.replace(/_/g, ' ')
}

// "5h ━━────── 23% ↻14:30": the meter fills with what is used.
export function limitLabel(limit: SessionRateLimit, now: number): string {
  const flag = limit.percentUsed >= 80 ? '⚠ ' : ''
  const at = resetAt(limit.resetsAt, now)
  const reset = at === undefined ? '' : ` ↻${at}`

  return `${flag}${limitShort(limit.kind)} ${miniBar(limit.percentUsed)} ${percent(limit.percentUsed)}${reset}`
}

// The first line of `git status --porcelain=v1 -b` and one line per changed path.
export function parseGitStatus(stdout: string): Git | undefined {
  const lines = stdout.split('\n').filter(line => line.length > 0)
  const head = lines[0]

  if (head === undefined || !head.startsWith('## ')) {
    return undefined
  }

  const summary = head
    .slice(3)
    .replace(/^No commits yet on /, '')
    .replace(/^Initial commit on /, '')
  const branch = summary.split('...')[0]?.split(' ')[0] ?? summary
  const ahead = Number(/ahead (\d+)/.exec(summary)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(summary)?.[1] ?? 0)

  return {
    branch: branch === 'HEAD' ? 'detached' : branch,
    dirty: lines.length - 1,
    ahead,
    behind,
  }
}

export function gitLabel(git: Git): string {
  const dirty = git.dirty > 0 ? ` ±${git.dirty}` : ''
  const ahead = git.ahead > 0 ? ` ↑${git.ahead}` : ''
  const behind = git.behind > 0 ? ` ↓${git.behind}` : ''

  return `⎇ ${git.branch}${dirty}${ahead}${behind}`
}

// "ctx ━━━───── 42% 84k": the tokens in the window now, as used.
export function contextLabel(usage: SessionUsage): string {
  const { tokens, window } = usage.context
  const used = usage.context.percent ?? (tokens === undefined ? undefined : Math.round((tokens / window) * 100))

  if (tokens === undefined || used === undefined) {
    return `ctx ${miniBar(0)} –/${compact(window)}`
  }

  const flag = used >= 80 ? '⚠ ' : ''

  return `${flag}ctx ${miniBar(used)} ${used}% ${compact(tokens)}`
}

// The plain status line; with `isMetersShown` false (the coloured hint row
// draws them) only what the hint row does not: git and rtk.
export function statusLine(snapshot: Snapshot, now: number, isMetersShown = true): string | undefined {
  const parts: string[] = []

  if (snapshot.git) {
    parts.push(gitLabel(snapshot.git))
  }
  if (snapshot.usage && isMetersShown) {
    parts.push(contextLabel(snapshot.usage))
    parts.push(...snapshot.usage.rateLimits.map(limit => limitLabel(limit, now)))
    if (snapshot.usage.cost) {
      parts.push(`$${snapshot.usage.cost.usd.toFixed(2)}`)
    }
  }
  if (snapshot.rtk && snapshot.rtk.saved > 0) {
    parts.push(`rtk −${compact(snapshot.rtk.saved)}`)
  }

  return parts.length > 0 ? parts.join(SEP) : undefined
}

// How much the hint row says: cells per meter, the limits' reset times, the
// cost, the branch, rtk's savings. Tried in this order until one fits.
export type HintVariant = {
  cells: number
  isResetShown: boolean
  isCostShown: boolean
  isGitShown: boolean
  isRtkShown: boolean
}

const ALL = { isResetShown: true, isCostShown: true, isGitShown: true, isRtkShown: true }

export const HINT_VARIANTS: readonly HintVariant[] = [
  { ...ALL, cells: 8 },
  { ...ALL, cells: 8, isRtkShown: false },
  { ...ALL, cells: 8, isRtkShown: false, isGitShown: false },
  { ...ALL, cells: 8, isRtkShown: false, isGitShown: false, isCostShown: false },
  { ...ALL, cells: 5, isRtkShown: false, isGitShown: false, isCostShown: false },
  { cells: 5, isResetShown: false, isCostShown: false, isGitShown: false, isRtkShown: false },
  { cells: 3, isResetShown: false, isCostShown: false, isGitShown: false, isRtkShown: false },
  { cells: 0, isResetShown: false, isCostShown: false, isGitShown: false, isRtkShown: false },
]

const HINT_SEP: Run = { text: ' │ ', isDim: true }

function meterRuns(label: string, percentUsed: number, shown: string, cells: number): Run[] {
  const color = levelColor(percentUsed)

  return cells > 0
    ? [{ text: `${label} `, isDim: true }, ...miniBarRuns(percentUsed, cells), { text: ` ${shown}`, color }]
    : [{ text: `${label} `, isDim: true }, { text: shown, color }]
}

// The hint row's meters, coloured by level:
// "⎇ main ±3 │ ctx ━━━───── 42% │ 5h ━━────── 24% ↻14:30 │ 7d ━─────── 9% ↻จ. 09:00 │ $1.23 │ rtk −13.3M"
export function hintRuns(snap: DevStatusUsage, variant: HintVariant): Run[] {
  const groups: Run[][] = []

  if (variant.isGitShown && snap.git) {
    groups.push([{ text: gitLabel(snap.git), color: 'cyan' }])
  }

  if (snap.contextPercent !== undefined) {
    groups.push(meterRuns('ctx', snap.contextPercent, `${snap.contextPercent}%`, variant.cells))
  }
  for (const limit of snap.limits) {
    const runs = meterRuns(limitShort(limit.kind), limit.percentUsed, percent(limit.percentUsed), variant.cells)
    const at = variant.isResetShown ? resetAt(limit.resetsAt, snap.at) : undefined
    groups.push(at === undefined ? runs : [...runs, { text: ` ↻${at}`, isDim: true }])
  }
  if (variant.isCostShown && snap.costUsd !== undefined && groups.length > 0) {
    groups.push([{ text: `$${snap.costUsd.toFixed(2)}`, isDim: true }])
  }
  if (variant.isRtkShown && snap.rtkSaved !== undefined && snap.rtkSaved > 0) {
    groups.push([{ text: `rtk −${compact(snap.rtkSaved)}`, isDim: true }])
  }

  return groups.flatMap((group, i) => (i === 0 ? group : [HINT_SEP, ...group]))
}

// The richest meters that fit in `room` cells on a row of their own (under
// the engine's hint line), or undefined when there is nothing to show.
export function planHint(snap: DevStatusUsage, room: number): Run[] | undefined {
  const variants = HINT_VARIANTS.map(variant => hintRuns(snap, variant))

  if (variants.at(-1)?.length === 0) {
    return undefined
  }

  return variants.find(runs => runsWidth(runs) <= room)
}

// The figures the usage pane draws, kept in $.state so the pane redraws when
// they change.
export function usageState(usage: SessionUsage, at: number, breakdown?: Breakdown): DevStatusUsage {
  return {
    at,
    contextTokens: usage.context.tokens,
    contextWindow: usage.context.window,
    contextPercent: usage.context.percent,
    autoCompactAt: breakdown?.autoCompactAt,
    limits: usage.rateLimits.map(limit => ({ ...limit })),
    costUsd: usage.cost?.usd,
    slices: breakdown?.slices ?? [],
    breakdownTotal: breakdown?.total,
  }
}

// `rtk gain -f json` → its summary's total saved tokens and average saving.
export function parseRtk(stdout: string): Rtk | undefined {
  try {
    const parsed: unknown = JSON.parse(stdout)
    const summary = (parsed as { summary?: { total_saved?: unknown; avg_savings_pct?: unknown } }).summary
    const saved = summary?.total_saved
    const pct = summary?.avg_savings_pct

    return typeof saved === 'number' ? { saved, percent: typeof pct === 'number' ? pct : 0 } : undefined
  } catch {
    return undefined
  }
}
