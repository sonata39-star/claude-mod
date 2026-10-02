import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderPropsOf, SessionContextBreakdown, SessionUsage } from 'claude-code'

import { contextLabel, limitLabel, parseGitStatus, parseRtk, statusLine } from '../hooks/format'
import { barRuns, miniBar, resetLine, stackRuns, thaiDuration } from '../hooks/meter'

const HOUR = 3_600_000
// Fri 2 Oct 2026, 12:17 local time
const NOW = new Date(2026, 9, 2, 12, 17).getTime()
const FIVE_HOUR_RESET = new Date(NOW + 2 * HOUR + 13 * 60_000).toISOString()
const SEVEN_DAY_RESET = new Date(2026, 9, 5, 9, 0).toISOString()

const PRESENTATION = { isFullscreen: true, columns: 160 }

function usageAt(fiveHourUsed: number, contextPercent: number): SessionUsage {
  return {
    startedAt: NOW - HOUR,
    context: { tokens: contextPercent * 2_000, window: 200_000, percent: contextPercent },
    rateLimits: [
      { kind: 'five_hour', percentUsed: fiveHourUsed, resetsAt: FIVE_HOUR_RESET },
      { kind: 'seven_day', percentUsed: 9, resetsAt: SEVEN_DAY_RESET },
    ],
    cost: { usd: 1.234 },
  }
}

const BREAKDOWN = {
  categories: [
    { name: 'System prompt', tokens: 3_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 12_000, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 67_000, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 85_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
  ],
  totalTokens: 82_000,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'model-default',
  percentage: 41,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  autoCompactThreshold: 160_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
} satisfies SessionContextBreakdown

const GIT = '## main...origin/main [ahead 1]\n M hooks/register.ts\n?? tests/new.test.ts\n M README.md\n'

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const PANE = { plugin: 'dev-status', component: 'Pane', requestId: 'usage', props: PANE_PROPS } as const

// The world beneath the plugin: git, rtk, usage, panes, and what it shows.
function world(on: On, usage: { current: SessionUsage }) {
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  const opened: string[] = []
  const clock = mock.clock(on, { now: NOW })

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', ($, e) => ({
    value:
      e.breakdown === undefined
        ? usage.current
        : { ...usage.current, context: { ...usage.current.context, breakdown: BREAKDOWN } },
  }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({
    value: opened.map(id => ({ id, title: 'Usage', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('process.run', ($, e) => {
    const stdout =
      e.argv[0] === 'git' ? GIT : JSON.stringify({ summary: { total_saved: 13_301_940, avg_savings_pct: 84.66 } })

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  return { statuses, toasts, clock }
}

describe('meters', () => {
  test('fill with what is used, in neutral-width glyphs', () => {
    expect(miniBar(42)).toBe('▰▰▰▱▱▱▱▱')
    expect(miniBar(0)).toBe('▱▱▱▱▱▱▱▱')
    expect(miniBar(140)).toBe('▰▰▰▰▰▰▰▰')
    expect(barRuns(50, 10, 80)).toEqual([
      { text: '▰▰▰▰▰', color: 'green' },
      { text: '▱▱▱', isDim: true },
      { text: '╎', color: 'magenta' },
      { text: '▱', isDim: true },
    ])
    expect(barRuns(70, 4)[0]).toEqual({ text: '▰▰▰', color: 'yellow' })
    expect(barRuns(90, 4)[0]).toEqual({ text: '▰▰▰▰', color: 'red' })
  })

  test('stack categories so the cells add up', () => {
    const runs = stackRuns([3_000, 12_000, 67_000], 200_000, 40)
    expect(runs.map(run => run.text.length)).toEqual([1, 2, 13, 24])
    expect(runs.map(run => run.text).join('')).toHaveLength(40)
  })

  test('say resets in local time and Thai', () => {
    expect(resetLine(FIVE_HOUR_RESET, NOW)).toBe('รีเซ็ต 14:30 · อีก 2ชม 13น')
    expect(resetLine(SEVEN_DAY_RESET, NOW)).toBe('รีเซ็ต จ. 09:00 · อีก 2วัน 20ชม')
    expect(resetLine(undefined, NOW)).toBeUndefined()
    expect(thaiDuration(45 * 60_000)).toBe('45น')
  })
})

describe('format', () => {
  test('reads branch, changes and ahead/behind from git', () => {
    expect(parseGitStatus(GIT)).toEqual({ branch: 'main', dirty: 3, ahead: 1, behind: 0 })
    expect(parseGitStatus('## No commits yet on dev\n')).toEqual({ branch: 'dev', dirty: 0, ahead: 0, behind: 0 })
    expect(parseGitStatus('fatal: not a git repository')).toBeUndefined()
  })

  test('draws each limit as a meter of what is used, with its reset', () => {
    expect(limitLabel({ kind: 'five_hour', percentUsed: 23.5, resetsAt: FIVE_HOUR_RESET }, NOW)).toBe(
      '5h ▰▰▱▱▱▱▱▱ 24% ↻14:30',
    )
    expect(limitLabel({ kind: 'seven_day', percentUsed: 82, resetsAt: SEVEN_DAY_RESET }, NOW)).toBe(
      '⚠ 7d ▰▰▰▰▰▰▰▱ 82% ↻จ. 09:00',
    )
    expect(contextLabel(usageAt(0, 42))).toBe('ctx ▰▰▰▱▱▱▱▱ 42% 84k')
  })

  test('reads rtk savings and leaves out what it cannot read', () => {
    expect(parseRtk('{"summary":{"total_saved":1200,"avg_savings_pct":50}}')).toEqual({ saved: 1200, percent: 50 })
    expect(parseRtk('not json')).toBeUndefined()
    expect(statusLine({}, NOW)).toBeUndefined()
  })
})

describe('status line', () => {
  test('shows git, context, each limit with its reset, cost and rtk at session start', async ($, on) => {
    const usage = { current: usageAt(23.5, 42) }
    const { statuses } = world(on, usage)

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    expect(statuses.at(-1)).toBe(
      '⎇ main ±3 ↑1 │ ctx ▰▰▰▱▱▱▱▱ 42% 84k │ 5h ▰▰▱▱▱▱▱▱ 24% ↻14:30 │ 7d ▰▱▱▱▱▱▱▱ 9% ↻จ. 09:00 │ $1.23 │ rtk −13.3M',
    )
  })

  test('refreshes on its timer', async ($, on) => {
    const usage = { current: usageAt(23.5, 42) }
    const { statuses, clock } = world(on, usage)

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    usage.current = usageAt(61, 42)
    await clock.advance(30_000)

    expect(statuses.at(-1)).toContain('5h ▰▰▰▰▰▱▱▱ 61% ↻14:30')
  })

  test('warns once when a limit crosses 80% and once more at 95%', async ($, on) => {
    const usage = { current: usageAt(81, 42) }
    const { toasts, clock } = world(on, usage)

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(30_000)
    expect(toasts).toEqual(['⚠️ 5-hour limit ใช้ไปแล้ว 81% เหลือ 19% · รีเซ็ต 14:30 · อีก 2ชม 13น'])

    usage.current = usageAt(96, 85)
    await clock.advance(30_000)
    expect(toasts).toHaveLength(3)
    expect(toasts.join('\n')).toContain('ใช้ไปแล้ว 96% เหลือ 4%')
    expect(toasts.join('\n')).toContain('context ใช้ไป 85%')
  })

  test('/usage-detail spells out every limit', async ($, on) => {
    world(on, { current: usageAt(23.5, 42) })

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const ran = await $.command.run({ command: 'usage-detail', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })

    expect(ran.text).toContain('Context    84,000 / 200,000 tokens (42%) · เหลือ 58%')
    expect(ran.text).toContain('5-hour limit ใช้ไป 23.5% · เหลือ 76.5% · รีเซ็ต 14:30 · อีก 2ชม 13น')
    expect(ran.text).toContain('7-day limit ใช้ไป 9% · เหลือ 91% · รีเซ็ต จ. 09:00 · อีก 2วัน 20ชม')
    expect(ran.text).toContain('RTK        ประหยัดไปแล้ว 13.3M tokens (84.7%)')
  })
})

describe('usage pane', () => {
  test('/usage-bars draws a coloured meter per window, the breakdown and the cost on every surface', async ($, on) => {
    world(on, { current: usageAt(23.5, 42) })

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const ran = await $.command.run({ command: 'usage-bars', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })
    expect(ran.text).toBe('เปิดกราฟ usage แล้ว (Esc เพื่อปิด)')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })

      // Context: 42% of 40 cells, the auto-compact mark at 80%.
      expect(await ui.find({ type: 'Text', text: /^Context {2}ใช้ไป 42% · เหลือ 58%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: `${'▰'.repeat(17)}${'▱'.repeat(15)}╎${'▱'.repeat(7)}` })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '84,000 / 200,000 tokens · auto-compact ที่ 160k ╎' })).toBeDefined()

      // 5-hour: 23.5% → 9 green cells, reset as clock time and countdown.
      expect(await ui.find({ type: 'Text', text: /^5-hour limit {2}ใช้ไป 23\.5% · เหลือ 76\.5%$/ })).toBeDefined()
      const filled = await ui.find({ type: 'Text', text: /^▰{9}$/ })
      expect(filled?.props.color).toBe('green')
      expect(await ui.find({ type: 'Text', text: 'รีเซ็ต 14:30 · อีก 2ชม 13น' })).toBeDefined()

      // 7-day: reset a weekday away.
      expect(await ui.find({ type: 'Text', text: 'รีเซ็ต จ. 09:00 · อีก 2วัน 20ชม' })).toBeDefined()

      // The breakdown, largest first, and the footer.
      expect(await ui.find({ type: 'Text', text: 'Context แยกตามประเภท' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /▰ Messages 67k {2}▰ System tools 12k {2}▰ System prompt 3k/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Cost \$1\.23 · อัปเดต 12:17/ })).toBeDefined()

      await ui.unmount()
    }
  })

  test('the pane turns red as a limit runs out', async ($, on) => {
    world(on, { current: usageAt(92, 42) })

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    const label = await ui.find({ type: 'Text', text: /^ใช้ไป 92%$/ })
    expect(label?.props.color).toBe('red')
    await ui.unmount()
  })

  test('/usage-bars close closes it', async ($, on) => {
    world(on, { current: usageAt(23.5, 42) })
    const closed: string[] = []
    on('ui.close', ($, e) => {
      closed.push(e.id)

      return { value: undefined }
    })

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const ran = await $.command.run({ command: 'usage-bars', args: 'close', origin: { kind: 'composer' }, presentation: PRESENTATION })

    expect(ran.text).toBe('ปิดกราฟ usage แล้ว')
    expect(closed).toEqual(['usage'])
  })
})
