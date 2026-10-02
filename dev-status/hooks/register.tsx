import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { DevStatusUsage } from '../types'
import {
  compact,
  exactPercent,
  gitLabel,
  grouped,
  limitName,
  parseGitStatus,
  parseRtk,
  percent,
  planHint,
  statusLine,
  usageState,
} from './format'
import type { Breakdown, Git, Rtk, Snapshot } from './format'
import { barRuns, clockTime, FILL, levelColor, PALETTE, resetLine, stackRuns } from './meter'
import type { Run } from './meter'

const warned = atom({ plugin: 'dev-status', key: 'warned' } as const, [])
const usageNow = atom({ plugin: 'dev-status', key: 'usage' } as const, null)

const PANE = 'usage'
const TITLE = 'Usage'
const REFRESH_MS = 30_000
const RTK_EVERY_MS = 5 * 60_000
const BREAKDOWN_EVERY_MS = 20_000
const LIMIT_THRESHOLDS = [95, 80]
const CONTEXT_THRESHOLD = 80
const WATCHED_TOOLS = new Set(['Bash', 'Edit', 'Write', 'NotebookEdit'])
// Cells the hint row leaves free at its end, and its width where the
// surface has not measured.
const HINT_RESERVE = 4
const HINT_COLUMNS = 120

// Where the meters go, from the `meterPlace` option; set at each load.
let meterPlace: 'hint' | 'status' = 'hint'

// This load's own memory: a reload starts these over, which costs one extra
// `rtk gain` run and one breakdown at most.
let rtk: Rtk | undefined
let rtkCheckedAt = -Infinity
let breakdown: Breakdown | undefined
let breakdownAt = -Infinity
let running: Promise<void> | undefined
let isAgain = false

async function readGit($: EngineInterface): Promise<Git | undefined> {
  try {
    const ran = await $.process.run(['git', 'status', '--porcelain=v1', '-b'], { timeoutMs: 5_000 })

    return ran.exitCode === 0 ? parseGitStatus(ran.stdout) : undefined
  } catch {
    return undefined
  }
}

async function readUsage($: EngineInterface): Promise<SessionUsage | undefined> {
  try {
    return await $.session.usage()
  } catch {
    return undefined
  }
}

async function readRtk($: EngineInterface, now: number): Promise<Rtk | undefined> {
  if (now - rtkCheckedAt < RTK_EVERY_MS) {
    return rtk
  }
  rtkCheckedAt = now
  try {
    const ran = await $.process.run(['rtk', 'gain', '-f', 'json'], { timeoutMs: 5_000 })
    rtk = ran.exitCode === 0 ? parseRtk(ran.stdout) : undefined
  } catch {
    rtk = undefined
  }

  return rtk
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  try {
    const panes = await $.ui.panes()

    return panes.some(pane => pane.id === PANE)
  } catch {
    return false
  }
}

// The context window by category, as /context counts it: estimated locally
// ('summary' sends no request), and only while the usage pane is open.
async function readBreakdown($: EngineInterface, now: number, isForced: boolean): Promise<Breakdown | undefined> {
  if (!isForced && now - breakdownAt < BREAKDOWN_EVERY_MS) {
    return breakdown
  }
  if (!(await isPaneOpen($))) {
    return breakdown
  }
  breakdownAt = now
  try {
    const deep = await $.session.usage({ breakdown: 'summary' })
    const found = deep.context.breakdown
    if (found) {
      breakdown = {
        slices: found.categories
          .filter(category => category.kind === 'used' && category.tokens > 0)
          .sort((a, b) => b.tokens - a.tokens)
          .map(category => ({ name: category.name, tokens: category.tokens })),
        total: found.rawMaxTokens,
        autoCompactAt: found.isAutoCompactEnabled ? found.autoCompactThreshold : undefined,
      }
    }
  } catch {
    // The breakdown is a nicety; the meters stand without it.
  }

  return breakdown
}

// Whether every surface the session draws on draws the hint row (terminal
// and desktop do; vscode and mobile do not), so the meters may leave the
// plain status line for it.
async function isHintDrawn($: EngineInterface): Promise<boolean> {
  if (meterPlace !== 'hint') {
    return false
  }
  try {
    const surfaces = await $.session.surfaces()

    return surfaces.length > 0 && surfaces.every(surface => surface === 'terminal' || surface === 'desktop')
  } catch {
    return false
  }
}

async function snapshot($: EngineInterface): Promise<{ snap: Snapshot; now: number }> {
  const now = await $.clock.now()
  const [git, usage, rtkNow] = await Promise.all([readGit($), readUsage($), readRtk($, now)])

  return { snap: { git, usage, rtk: rtkNow }, now }
}

// Toasts each threshold once: per rate-limit window (keyed by its reset), and
// for the context window once per fill (re-armed when it drops back under).
async function warn($: EngineInterface, usage: SessionUsage | undefined, now: number) {
  if (!usage) {
    return
  }

  const done = await read($, warned)
  const fresh: { key: string; text: string }[] = []

  for (const limit of usage.rateLimits) {
    const threshold = LIMIT_THRESHOLDS.find(t => limit.percentUsed >= t)
    const key = `${limit.kind}:${threshold}:${limit.resetsAt ?? ''}`
    if (threshold === undefined || done.includes(key)) {
      continue
    }
    const reset = resetLine(limit.resetsAt, now)
    fresh.push({
      key,
      text: `⚠️ ${limitName(limit.kind)} ใช้ไปแล้ว ${percent(limit.percentUsed)} เหลือ ${percent(100 - limit.percentUsed)}${reset === undefined ? '' : ` · ${reset}`}`,
    })
  }

  const used = usage.context.percent
  if (used !== undefined && used >= CONTEXT_THRESHOLD) {
    const key = `context:${CONTEXT_THRESHOLD}`
    if (!done.includes(key)) {
      fresh.push({
        key,
        text: `⚠️ context ใช้ไป ${used}% แล้ว ใกล้ auto-compact ลอง /compact หรือเริ่ม session ใหม่`,
      })
    }
  } else if (done.some(key => key.startsWith('context:'))) {
    await update($, warned, list => list.filter(key => !key.startsWith('context:')))
  }

  if (fresh.length === 0) {
    return
  }

  await update($, warned, list => [...list, ...fresh.map(one => one.key)].slice(-50))
  for (const one of fresh) {
    $.ui.toast(one.text, { timeoutMs: 10_000 })
  }
}

async function refreshOnce($: EngineInterface, isForced: boolean) {
  const { snap, now } = await snapshot($)
  $.ui.status(statusLine(snap, now, !(await isHintDrawn($))))
  if (snap.usage) {
    const usage = snap.usage
    const deep = await readBreakdown($, now, isForced)
    await update($, usageNow, () => usageState(usage, now, deep))
  }
  await warn($, snap.usage, now)
}

// One refresh at a time; a request while one runs queues one more pass.
function refresh($: EngineInterface, isForced = false): Promise<void> {
  if (running) {
    isAgain = true

    return running
  }
  running = (async () => {
    let force = isForced
    do {
      isAgain = false
      await refreshOnce($, force)
      force = false
    } while (isAgain)
  })().finally(() => {
    running = undefined
  })

  return running
}

async function detail($: EngineInterface): Promise<string> {
  const { snap, now } = await snapshot($)
  const lines = ['📊 Token & limits']
  const usage = snap.usage

  if (usage) {
    const { tokens, window } = usage.context
    const used = usage.context.percent
    lines.push(
      tokens === undefined || used === undefined
        ? `Context    ยังไม่มีข้อมูล (ขึ้นหลัง response แรก) · window ${compact(window)} tokens`
        : `Context    ${grouped(tokens)} / ${grouped(window)} tokens (${used}%) · เหลือ ${100 - used}%`,
    )

    if (usage.rateLimits.length === 0) {
      lines.push('Limits     ยังไม่มีข้อมูล (ขึ้นหลัง response แรก หรือไม่ได้ใช้ subscription)')
    }
    for (const limit of usage.rateLimits) {
      const reset = resetLine(limit.resetsAt, now)
      lines.push(
        `${limitName(limit.kind).padEnd(10)} ใช้ไป ${exactPercent(limit.percentUsed)} · เหลือ ${exactPercent(100 - limit.percentUsed)}${reset === undefined ? '' : ` · ${reset}`}`,
      )
    }
    if (usage.cost) {
      lines.push(`Cost       $${usage.cost.usd.toFixed(2)} (session นี้)`)
    }
    lines.push(`Session    เริ่ม ${clockTime(usage.startedAt)}`)
  } else {
    lines.push('อ่าน usage ไม่ได้ในตอนนี้')
  }

  if (snap.git) {
    lines.push(`Git        ${gitLabel(snap.git)}`)
  }
  if (snap.rtk) {
    lines.push(`RTK        ประหยัดไปแล้ว ${compact(snap.rtk.saved)} tokens (${snap.rtk.percent.toFixed(1)}%)`)
  }
  lines.push('ดูเป็นกราฟ: /usage-bars')

  return lines.join('\n')
}

// One meter of the pane: what it measures, how full, and what to say beside it.
type Meter = { key: string; label: string; percentUsed?: number; detail?: string; markPercent?: number }

function metersOf(snap: DevStatusUsage): Meter[] {
  const tokens = snap.contextTokens
  const autoCompact =
    snap.autoCompactAt === undefined ? '' : ` · auto-compact ที่ ${compact(snap.autoCompactAt)} ╎`
  const context: Meter = {
    key: 'context',
    label: 'Context',
    percentUsed: snap.contextPercent,
    detail:
      tokens === undefined
        ? `ยังไม่มีข้อมูล (ขึ้นหลัง response แรก) · window ${compact(snap.contextWindow)}`
        : `${grouped(tokens)} / ${grouped(snap.contextWindow)} tokens${autoCompact}`,
    markPercent: snap.autoCompactAt === undefined ? undefined : (snap.autoCompactAt / snap.contextWindow) * 100,
  }
  const limits = snap.limits.map(limit => ({
    key: limit.kind,
    label: limitName(limit.kind),
    percentUsed: limit.percentUsed,
    detail: resetLine(limit.resetsAt, snap.at),
  }))

  return [context, ...limits]
}

export const register: Register = (on, options) => {
  meterPlace = options.meterPlace === 'status' ? 'status' : 'hint'

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await $.command.register({
      name: 'usage-detail',
      description: 'ดู token, context และ rate limit แต่ละตัว พร้อมเวลารีเซ็ต (ข้อความ)',
    })
    await $.command.register({
      name: 'usage-bars',
      description: 'เปิด pane กราฟ progress ของ context, 5h, 7d limit และค่าใช้จ่าย',
      argumentHint: '[close]',
    })
    await refresh($)
    if (e.isInteractive) {
      $.clock.every(REFRESH_MS, () => {
        void refresh($)
      })
    }

    return started
  })

  on('command.run', { command: 'usage-detail' }, async $ => ({ text: await detail($) }))

  on('command.run', { command: 'usage-bars' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })

      return { text: 'ปิดกราฟ usage แล้ว' }
    }

    const opened = await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, rows: 16 })
    await refresh($, true)

    return { text: opened.isPlaced ? 'เปิดกราฟ usage แล้ว (Esc เพื่อปิด)' : `กราฟ usage รอที่อยู่: ${opened.reason}` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    void refresh($, true)

    return done
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WATCHED_TOOLS.has(String(e.tool))) {
      void refresh($)
    }

    return ran
  })

  // A surface coming or going may change where the meters can show.
  on('session.attach', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('session.detach', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  // The meters in colour on the hint row under the prompt, after the
  // engine's own hint. While the person types or a turn runs, the engine's
  // line says something they need (how to send, how to interrupt), so it
  // always stays and the meters shrink or step aside; when idle its line is
  // the `? for shortcuts` reminder, which gives way on a narrow terminal.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const snap = meterPlace === 'hint' ? await read($, usageNow) : null
    if (snap === null) {
      return next(e)
    }

    const columns = e.viewport?.columns ?? HINT_COLUMNS
    const tail = e.props.tail === undefined ? 0 : [...e.props.tail].length + 1
    const engineWidth = e.props.hint.trim() === '' ? 0 : [...e.props.hint].length + tail
    const plan = planHint(snap, columns - HINT_RESERVE, engineWidth, e.props.isDraft || e.props.isWorking)
    if (!plan) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const meters = (
      <Text wrap="truncate-end">
        {plan.runs.map(run =>
          run.color ? (
            <Text color={run.color}>{run.text}</Text>
          ) : run.isDim ? (
            <Text dimColor>{run.text}</Text>
          ) : (
            <Text>{run.text}</Text>
          ),
        )}
      </Text>
    )

    if (!plan.isEngineShown) {
      return <Box flexDirection="row">{meters}</Box>
    }

    const engine = await next(e)

    return (
      <Box flexDirection="row">
        {engine}
        <Text dimColor> │ </Text>
        {meters}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, usageNow)
    const width = Math.max(10, e.props.bodyColumns)

    const bar = (runs: Run[]) => (
      <Text wrap="truncate-end">
        {runs.map(run => (run.color ? <Text color={run.color}>{run.text}</Text> : <Text dimColor>{run.text}</Text>))}
      </Text>
    )

    if (snap === null) {
      return <Text dimColor>ยังไม่มีข้อมูล usage จะขึ้นหลัง response แรก</Text>
    }

    const meters = metersOf(snap)
    const sliceTotal = snap.breakdownTotal ?? snap.contextWindow

    return (
      <Box flexDirection="column">
        {meters.map(meter => (
          <Box key={meter.key} flexDirection="column" marginBottom={1}>
            <Text>
              <Text bold>{meter.label}</Text>
              {meter.percentUsed === undefined ? (
                <Text dimColor> –</Text>
              ) : (
                <Text>
                  {'  '}
                  <Text color={levelColor(meter.percentUsed)} bold>
                    ใช้ไป {exactPercent(meter.percentUsed)}
                  </Text>
                  <Text dimColor> · เหลือ {exactPercent(Math.max(0, 100 - meter.percentUsed))}</Text>
                </Text>
              )}
            </Text>
            {bar(barRuns(meter.percentUsed ?? 0, width, meter.markPercent))}
            {meter.detail !== undefined && <Text dimColor>{meter.detail}</Text>}
          </Box>
        ))}

        {snap.slices.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Context แยกตามประเภท</Text>
            {bar(stackRuns(snap.slices.map(slice => slice.tokens), sliceTotal, width))}
            <Text>
              {snap.slices.map((slice, i) => (
                <Text>
                  <Text color={PALETTE[i % PALETTE.length]}>{FILL}</Text>
                  <Text dimColor>
                    {' '}
                    {slice.name} {compact(slice.tokens)}
                    {'  '}
                  </Text>
                </Text>
              ))}
            </Text>
          </Box>
        )}

        <Text dimColor>
          {snap.costUsd === undefined ? '' : `Cost $${snap.costUsd.toFixed(2)} · `}
          {`อัปเดต ${clockTime(snap.at)} · รีเฟรชทุก ${REFRESH_MS / 1000} วิ`}
        </Text>
      </Box>
    )
  })
}
