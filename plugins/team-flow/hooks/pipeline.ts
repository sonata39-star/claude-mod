import type { TeamPhase, TeamSnapshot, TeamStep } from '../types'

export type TeamFile = { name: string; mtimeMs: number; text: string }

type Kind = 'req' | 'plan' | 'dev-report' | 'review' | 'sec' | 'dlc'

type Doc = { mtimeMs: number; text: string }

const FILE = /^(req|plan|dev-report|review|sec|dlc)-(.+)\.md$/

export const TEAM_TYPES: readonly TeamPhase[] = ['pm', 'ba', 'lead', 'dev', 'sec']

/** `.team/<kind>-<slug>.md` → its kind and slug, or null for any other file. */
export function parseName(name: string): { kind: Kind; slug: string } | null {
  const m = FILE.exec(name)

  return m ? { kind: m[1] as Kind, slug: m[2] as string } : null
}

/** The slug whose files changed last, and how many other slugs there are. */
export function newestSlug(
  entries: readonly { name: string; mtimeMs: number }[],
): { slug: string; others: number } | null {
  const latest = new Map<string, number>()

  for (const entry of entries) {
    const parsed = parseName(entry.name)

    if (parsed) {
      latest.set(parsed.slug, Math.max(latest.get(parsed.slug) ?? 0, entry.mtimeMs))
    }
  }

  const ranked = [...latest.entries()].sort((a, b) => b[1] - a[1])
  const first = ranked[0]

  return first ? { slug: first[0], others: ranked.length - 1 } : null
}

/** `[x]` / `[ ]` items under the plan's "Task Breakdown" heading (else the whole plan). */
export function countTasks(plan: string): { done: number; total: number } {
  const lines = plan.split('\n')
  const start = lines.findIndex(line => /^#{1,6}\s*Task Breakdown/i.test(line))
  let section = lines

  if (start >= 0) {
    const rest = lines.slice(start + 1)
    const end = rest.findIndex(line => /^#{1,6}\s/.test(line))
    section = end >= 0 ? rest.slice(0, end) : rest
  }

  let done = 0
  let total = 0

  for (const line of section) {
    const m = /^\s*(?:\d+[.)]|[-*+])\s*\[([ xX✓])\]/.exec(line)

    if (m) {
      total += 1
      done += m[1] === ' ' ? 0 : 1
    }
  }

  return { done, total }
}

/** The word after `**Verdict**:`, or null while it is still the template's `A / B`. */
export function verdict(text: string, words: readonly string[]): string | null {
  const line = /\*\*\s*Verdict\s*\*\*\s*:?\s*([^\n]*)/i.exec(text)?.[1] ?? ''
  const found = words.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(line))

  if (found.length === 0) {
    return null
  }

  // APPROVE_WITH_NOTES also contains APPROVE: keep the longest; two distinct verdicts is the unfilled template
  const longest = [...found].sort((a, b) => b.length - a.length)[0] as string
  const isTemplate = found.some(word => !longest.includes(word))

  return isTemplate ? null : longest.toUpperCase()
}

/** The pipeline of one slug from its files. */
export function buildSnapshot(slug: string, files: readonly TeamFile[], others: number): TeamSnapshot {
  const docs = new Map<Kind, Doc>()

  for (const file of files) {
    const parsed = parseName(file.name)

    if (parsed && parsed.slug === slug) {
      docs.set(parsed.kind, { mtimeMs: file.mtimeMs, text: file.text })
    }
  }

  const req = docs.get('req')
  const plan = docs.get('plan')
  const dev = docs.get('dev-report')
  const review = docs.get('review')
  const sec = docs.get('sec')
  const dlc = docs.get('dlc')

  const reviewVerdict = review ? verdict(review.text, ['PASS', 'FAIL']) : null
  const secVerdict = sec ? verdict(sec.text, ['APPROVE_WITH_NOTES', 'APPROVE', 'BLOCK']) : null
  const tasks = plan ? countTasks(plan.text) : { done: 0, total: 0 }

  let active: TeamPhase | null
  let devNote: string | undefined

  if (!plan) {
    active = req ? 'lead' : 'ba'
  } else if (!dev) {
    active = 'dev'
  } else if (review && reviewVerdict === 'FAIL' && review.mtimeMs >= dev.mtimeMs) {
    active = 'dev'
    devNote = 'แก้ตาม review'
  } else if (sec && secVerdict === 'BLOCK' && sec.mtimeMs >= dev.mtimeMs) {
    active = 'dev'
    devNote = 'แก้ตาม sec'
  } else if (!review || review.mtimeMs < dev.mtimeMs || reviewVerdict === null) {
    active = 'review'
  } else if (!sec || sec.mtimeMs < review.mtimeMs || secVerdict === null) {
    active = 'sec'
  } else {
    active = null
  }

  const order: TeamPhase[] = dlc ? ['pm', 'ba', 'lead', 'dev', 'review', 'sec'] : ['ba', 'lead', 'dev', 'review', 'sec']
  const activeIndex = active === null ? order.length : order.indexOf(active)
  const present: Record<TeamPhase, boolean> = {
    pm: Boolean(dlc),
    ba: Boolean(req),
    lead: Boolean(plan),
    dev: Boolean(dev),
    review: Boolean(review),
    sec: Boolean(sec),
  }

  const steps: TeamStep[] = order.map((phase, index) => {
    const state = index < activeIndex ? (present[phase] ? 'done' : 'skip') : index === activeIndex ? 'active' : 'todo'
    const step: TeamStep = { phase, state }

    if (phase === 'dev' && tasks.total > 0 && state !== 'done') {
      step.note = devNote ? `${tasks.done}/${tasks.total} ${devNote}` : `${tasks.done}/${tasks.total}`
    } else if (phase === 'dev' && devNote) {
      step.note = devNote
    } else if (phase === 'sec' && state === 'done' && secVerdict === 'APPROVE_WITH_NOTES') {
      step.note = 'มี notes'
    }

    return step
  })

  return { slug, steps, isDone: active === null, others }
}

/** Which phase a running agent of `type` stands for (lead plans first, then reviews). */
export function phaseOfAgent(type: string, snapshot: TeamSnapshot | null): TeamPhase | null {
  const name = type.split(':').pop()?.toLowerCase() ?? ''

  if (!(TEAM_TYPES as readonly string[]).includes(name)) {
    return null
  }

  if (name !== 'lead') {
    return name as TeamPhase
  }

  const isPlanned = snapshot?.steps.some(step => step.phase === 'lead' && step.state === 'done') ?? false
  const hasDevWork = snapshot?.steps.some(step => step.phase === 'dev' && step.state === 'done') ?? false

  return isPlanned && hasDevWork ? 'review' : 'lead'
}

export const LABEL: Record<TeamPhase, string> = {
  pm: '🗂 PM',
  ba: '📋 BA',
  lead: '🧭 Lead',
  dev: '🔨 Dev',
  review: '🔍 Review',
  sec: '🔒 Sec',
}

/** The pipeline as one line of plain text (for /team-flow's answer). */
export function describe(snapshot: TeamSnapshot): string {
  const parts = snapshot.steps.map(step => {
    const mark = step.state === 'done' ? ' ✓' : step.state === 'skip' ? ' –' : step.state === 'active' ? ' ◀' : ''

    return `${LABEL[step.phase]}${step.note ? ` ${step.note}` : ''}${mark}`
  })
  const tail = snapshot.isDone ? '  ✅ เสร็จครบ' : ''

  return `${snapshot.slug}: ${parts.join(' → ')}${tail}`
}
