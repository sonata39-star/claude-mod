import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement, RenderPropsOf, RenderViewport } from 'claude-code'

import { cellWidth, fit, fitPath, isCheck } from '../hooks/format'
import { layoutDock, layoutInline, PREVIEW_ROWS, teamLine, teamRows } from '../hooks/sidebar'
import type { Row, SidebarData } from '../hooks/sidebar'

const NOW = new Date(2026, 9, 2, 12, 17).getTime()

function data(files: number, commands: number): SidebarData {
  return {
    files: Array.from({ length: files }, (_, i) => ({ path: `/repo/src/feature/file${i}.ts`, edits: i + 1, lastAt: NOW })),
    commands: Array.from({ length: commands }, (_, i) => ({ id: `c${i}`, command: `npm run step${i}`, isDone: true, isFailed: i === 0, at: NOW })),
    checks: [{ command: 'npm test', isPassed: false, at: NOW }],
    denies: [{ tool: 'Bash', reason: 'dev-guard: rm -rf /', at: NOW }],
    turns: { count: 3, totalMs: 512_000, lastMs: 42_000 },
    tab: 'files',
    cwd: '/repo',
  }
}

const TEAM: NonNullable<SidebarData['team']> = {
  snapshot: {
    slug: 'login',
    others: 0,
    isDone: false,
    steps: [
      { phase: 'ba', state: 'done' },
      { phase: 'lead', state: 'done' },
      { phase: 'dev', state: 'active', note: '2/3 แก้ตาม review' },
      { phase: 'review', state: 'todo' },
      { phase: 'sec', state: 'todo' },
    ],
  },
  running: ['dev'],
}

const text = (row: Row) =>
  row.kind === 'line' ? row.cells.map(cell => cell.text).join('') : row.kind === 'tabs' ? row.tabs.map(t => `[ ${t.label} ]`).join(' ') : row.kind

function paneProps(bodyColumns: number, bodyRows: number, placement: 'dock' | 'inline'): RenderPropsOf['Pane'] {
  return { title: 'Dashboard', isFocused: false, bodyColumns, placement, scroll: { offset: 0, bodyRows }, view: {} }
}

function pane(bodyColumns: number, bodyRows: number, placement: 'dock' | 'inline' = 'dock') {
  return {
    plugin: 'dev-dashboard',
    component: 'Pane',
    requestId: 'dev-dashboard',
    props: paneProps(bodyColumns, bodyRows, placement),
  } as const
}

function screen(columns: number, isFullscreen: boolean) {
  const viewport: RenderViewport = { columns, rows: 50, isFullscreen }

  return {
    plugin: 'dev-dashboard',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: columns, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    viewport,
  } as const
}

// The engine beneath the plugin: tools answer, panes open and close.
function world(on: On) {
  const clock = mock.clock(on, { now: NOW })
  const open = new Map<string, { columns?: number; rows?: number; closeOnEscape?: true }>()
  const toasts: string[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => {
    open.set(e.id, { columns: e.columns, rows: e.rows, closeOnEscape: e.closeOnEscape })

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => {
    open.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...open.keys()].map(id => ({ id, title: 'Dashboard', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>band</Text>
  })
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash' && e.command.startsWith('rm -rf /')) {
      return { deny: 'dev-guard: blocked rm -rf /' }
    }
    if (e.tool === 'Bash' && e.command === 'npm test') {
      return { isError: true as const, result: 'exit 1', text: 'exit 1' }
    }

    return { result: undefined as never, text: 'ok' }
  })

  return { clock, open, toasts }
}

const PRESENTATION_WIDE = { isFullscreen: true, columns: 160 }
const PRESENTATION_SMALL = { isFullscreen: false, columns: 90 }

describe('format', () => {
  test('fits text and paths by terminal cells, the file name kept', () => {
    expect(cellWidth('ไฟล์')).toBe(3)
    expect(cellWidth('⛔ x')).toBe(4)
    expect(fit('git   status\n--short', 40)).toBe('git status --short')
    expect(fit('a'.repeat(30), 10)).toBe(`${'a'.repeat(9)}…`)
    expect(fitPath('/very/long/path/to/file.ts', 10)).toBe('…o/file.ts')
    expect(isCheck('npx tsc -p .')).toBe(true)
    expect(isCheck('git status')).toBe(false)
  })
})

describe('layout', () => {
  for (const height of [40, 24, 12]) {
    test(`the dock fills ${height} rows without passing them`, () => {
      const layout = layoutDock(data(30, 5), 40, height)

      expect(layout.rows.length + 1).toBeLessThanOrEqual(height)
      // The chosen list took what was left: the dock is full to the footer.
      expect(layout.rows.length + 1).toBe(height)
      expect(layout.rows.map(text).some(one => /^ {2}\+\d+ รายการ$/.test(one))).toBe(true)
    })
  }

  test('a tall dock shows the other lists below the chosen one; a short one does not', () => {
    const tall = layoutDock(data(3, 5), 40, PREVIEW_ROWS + 8).rows.map(text)
    expect(tall).toContain('คำสั่ง (5)')
    expect(tall).toContain('บล็อก (1)')

    const short = layoutDock(data(3, 5), 40, 24).rows.map(text)
    expect(short).not.toContain('คำสั่ง (5)')
  })

  test('the menu packs its tabs into the column', () => {
    const tabs = layoutDock(data(3, 5), 40, 30).rows.filter(row => row.kind === 'tabs')

    expect(tabs.map(text)).toEqual(['[ 1 ไฟล์ 3 ] [ 2 คำสั่ง 5 ]', '[ 3 test 1 ] [ 4 บล็อก 1 ]'])
  })

  test('the pipeline sits above the menu, one phase a row, and folds to one line when short', () => {
    const tall = layoutDock({ ...data(3, 5), team: TEAM }, 40, 30)
    const rows = tall.rows.map(text)

    expect(rows.slice(0, 9)).toEqual([
      '🗂 Session  3 turns · 8m32s',
      'blank',
      '👥 login',
      '📋 BA     ✓ ',
      '🧭 Lead   ✓ ',
      '🔨 Dev    2/3 แก้ตาม review ◀ ⏳ กำลังทำงาน…',
      '🔍 Review ',
      '🔒 Sec    ',
      'blank',
    ])
    expect(rows[9]).toBe('[ 1 ไฟล์ 3 ] [ 2 คำสั่ง 5 ]')
    expect(tall.rows.length + 1).toBeLessThanOrEqual(30)
    expect(layoutDock({ ...data(40, 5), team: TEAM }, 40, 30).rows.length + 1).toBe(30)

    const short = layoutDock({ ...data(3, 5), team: TEAM }, 40, 14)
    expect(short.rows.map(text)[1]).toBe('👥 login · 🔨 Dev 2/3 แก้ตาม review ◀ ⏳Dev')
    expect(short.rows.length + 1).toBeLessThanOrEqual(14)
    expect(layoutDock({ ...data(40, 5), team: TEAM }, 40, 14).rows.length + 1).toBe(14)

    // Sent back by review: the note is red; done phases are green.
    const dev = teamRows({ ...data(0, 0), team: TEAM })[3]
    expect(dev?.kind === 'line' && dev.cells.find(cell => cell.text.startsWith('2/3'))?.color).toBe('red')
    const ba = teamRows({ ...data(0, 0), team: TEAM })[1]
    expect(ba?.kind === 'line' && ba.cells.find(cell => cell.text === '✓ ')?.color).toBe('green')

    // No .team/ (or no team-flow): no section at all.
    expect(teamRows({ ...data(0, 0), team: { snapshot: null, running: [] } })).toEqual([])
    expect(teamLine(data(0, 0))).toEqual([])
  })

  test('inline stays a few rows', () => {
    const layout = layoutInline(data(30, 5), 120, 8)

    expect(layout.rows.length + 1).toBeLessThanOrEqual(8)
    expect(layout.footer).toContain('esc ปิด')
  })
})

describe('sidebar', () => {
  for (const height of [40, 24]) {
    test(`pins the footer to row ${height} on every surface`, async ($, on) => {
      world(on)
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
      for (let i = 0; i < 30; i += 1) {
        await $.tool.call({ tool: 'Edit', file_path: `/repo/src/f${i}.ts`, old_string: 'a', new_string: 'b' })
      }

      for (const surface of ['terminal', 'desktop'] as const) {
        const ui = await $.ui.mount({ ...pane(40, height), surface })
        const root = (await ui.drawn()) as RenderElement & { props: { height?: number }; children: RenderElement[] }
        const rows = root.children.slice(0, -2)
        const [spacer, footer] = root.children.slice(-2) as { props: Record<string, unknown> }[]

        expect(root.props.height).toBe(height)
        expect(spacer?.props.flexGrow).toBe(1)
        expect(footer?.props.key).toBe('footer')
        expect(rows.length + 1).toBe(height)
        expect(await ui.find({ type: 'Text', text: /^🗂 Session {2}ยังไม่มี turn$/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /^ {2}\+\d+ รายการ$/ })).toBeDefined()

        await ui.unmount()
      }
    })
  }

  test('the menu switches lists by press and hotkey, the chosen tab marked', async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
    await $.turn.complete({ answer: '', durationMs: 42_000, isAborted: false, turnId: 't', reason: 'answer' })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...pane(40, 30), surface })

      expect(await ui.find({ type: 'Text', text: '🗂 Session  1 turns · 42s' })).toBeDefined()
      expect((await ui.find({ type: 'Button', key: 'tab-files' }))?.props.variant).toBe('primary')
      expect(await ui.find({ type: 'Text', text: /×1 src\/a\.ts/ })).toBeDefined()

      await ui.press({ key: 'tab-commands' })
      expect((await ui.find({ type: 'Button', key: 'tab-commands' }))?.props.variant).toBe('primary')
      expect((await ui.find({ type: 'Button', key: 'tab-files' }))?.props.variant).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^✗ rm -rf \/$/ })).toBeDefined()

      await ui.press({ key: 'tab-denies' })
      expect(await ui.find({ type: 'Text', text: /⛔ Bash: dev-guard: blocked/ })).toBeDefined()

      await ui.press({ key: 'tab-files' })
      await ui.unmount()
    }
  })

  test('the clear button empties the lists', async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })

    const ui = await $.ui.mount({ ...pane(40, 24), surface: 'terminal' })
    expect((await ui.find({ type: 'Button', key: 'tab-files' }))?.props.label).toBe('1 ไฟล์ 1')

    await ui.press({ key: 'clear' })
    expect((await ui.find({ type: 'Button', key: 'tab-files' }))?.props.label).toBe('1 ไฟล์ 0')
    expect(await ui.find({ type: 'Text', text: '  ยังไม่มี' })).toBeDefined()
    await ui.unmount()
  })

  test('inline (asked on a small screen) stays within its rows', async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...pane(120, 8, 'inline'), surface: 'terminal' })
    const root = (await ui.drawn()) as RenderElement & { children: RenderElement[] }

    expect(root.children.length - 1).toBeLessThanOrEqual(8)
    expect(await ui.find({ type: 'Text', text: /esc ปิด/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('size awareness', () => {
  test('opens docked where it fits, hides on a narrow screen and comes back when it widens', async ($, on) => {
    const { clock, open, toasts } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const wide = await $.ui.mount({ ...screen(160, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.get('dev-dashboard')).toEqual({ columns: 45, rows: undefined, closeOnEscape: undefined })
    await wide.unmount()

    const narrow = await $.ui.mount({ ...screen(100, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.has('dev-dashboard')).toBe(false)
    expect(toasts).toEqual(['ซ่อน dashboard เพราะจอแคบ ขยายจอหรือพิมพ์ /dashboard'])
    await narrow.unmount()

    const again = await $.ui.mount({ ...screen(150, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.get('dev-dashboard')?.columns).toBe(42)
    await again.unmount()
  })

  test('the main-screen layout never docks it', async ($, on) => {
    const { clock, open } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...screen(200, false), surface: 'terminal' })
    await clock.advance(300)
    expect(open.size).toBe(0)
    await ui.unmount()
  })

  // The kit cannot raise a person's close (ui.close, origin person); /dashboard
  // close sets the same flag the ui.close hook sets for it.
  test('a close sticks, across a reload, until /dashboard', async ($, on) => {
    const { clock, open } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const first = await $.ui.mount({ ...screen(160, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.has('dev-dashboard')).toBe(true)
    await first.unmount()

    await $.command.run({ command: 'dashboard', args: 'close', origin: { kind: 'composer' }, presentation: PRESENTATION_WIDE })
    expect(open.has('dev-dashboard')).toBe(false)
    // A reload starts the module over; the session's flag stays.
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const narrow = await $.ui.mount({ ...screen(100, true), surface: 'terminal' })
    await clock.advance(300)
    await narrow.unmount()
    const wide = await $.ui.mount({ ...screen(170, true), surface: 'terminal' })
    await clock.advance(30_000)
    expect(open.has('dev-dashboard')).toBe(false)
    await wide.unmount()

    const ran = await $.command.run({ command: 'dashboard', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION_WIDE })
    expect(ran.text).toBe('เปิด dashboard ด้านขวาแล้ว')
    expect(open.get('dev-dashboard')?.columns).toBe(45)
  })

  test('/dashboard on a small screen opens it compact, and the narrow screen leaves it be', async ($, on) => {
    const { clock, open } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const ran = await $.command.run({ command: 'dashboard', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION_SMALL })
    expect(ran.text).toContain('เปิดแบบย่อ')
    expect(open.get('dev-dashboard')).toEqual({ columns: undefined, rows: 8, closeOnEscape: true })

    const ui = await $.ui.mount({ ...screen(90, false), surface: 'terminal' })
    await clock.advance(30_000)
    expect(open.has('dev-dashboard')).toBe(true)
    await ui.unmount()

    const closed = await $.command.run({ command: 'dashboard', args: 'close', origin: { kind: 'composer' }, presentation: PRESENTATION_SMALL })
    expect(closed.text).toContain('ปิด dashboard แล้ว')
    expect(open.size).toBe(0)
  })

  test('autoOpen off waits for /dashboard', { options: { autoOpen: false } }, async ($, on) => {
    const { clock, open } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...screen(160, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.size).toBe(0)
    await ui.unmount()
  })

  test('sidebarColumns and minColumns from the settings', { options: { sidebarColumns: 38, minColumns: 140 } }, async ($, on) => {
    const { clock, open } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const below = await $.ui.mount({ ...screen(130, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.size).toBe(0)
    await below.unmount()

    const above = await $.ui.mount({ ...screen(150, true), surface: 'terminal' })
    await clock.advance(300)
    expect(open.get('dev-dashboard')?.columns).toBe(38)
    await above.unmount()
  })
})

describe('team pipeline', () => {
  test("draws team-flow's pipeline at the top of the sidebar on every surface", {
    plugins: [
      {
        name: 'team-flow',
        register(on) {
          on('session.start', async ($, e, next) => {
            await $.state.set({ plugin: 'team-flow', key: 'snapshot' }, {
              slug: 'login',
              others: 1,
              isDone: false,
              steps: [
                { phase: 'ba', state: 'done' },
                { phase: 'lead', state: 'done' },
                { phase: 'dev', state: 'active', note: '1/2' },
                { phase: 'review', state: 'todo' },
                { phase: 'sec', state: 'todo' },
              ],
            })

            return next(e)
          })
        },
      },
    ],
  }, async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...pane(40, 30), surface })

      expect(await ui.find({ type: 'Text', text: '👥 login (+1)' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^🔨 Dev {4}1\/2 ◀ $/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^🔨 Dev {4}$/ }))?.props.color).toBe('cyan')
      expect((await ui.find({ type: 'Text', text: /^✓ $/ }))?.props.color).toBe('green')
      await ui.unmount()

      const short = await $.ui.mount({ ...pane(40, 12), surface })
      expect(await short.find({ type: 'Text', text: '👥 login (+1) · 🔨 Dev 1/2 ◀' })).toBeDefined()
      await short.unmount()
    }
  })

  // Another plugin reads dev-dashboard.isDocked, as team-flow's band does.
  test('publishes isDocked while docked and shown, so the team-flow band steps aside', {
    plugins: [
      {
        name: 'dock-probe',
        register(on) {
          on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
            const { value } = await $.state.get({ plugin: 'dev-dashboard', key: 'isDocked' })
            const { Box, Text } = $.ui.resolve(e)
            const below = await next(e)

            return (
              <Box flexDirection="column">
                <Text>{`docked:${value === true}`}</Text>
                {below}
              </Box>
            )
          })
        },
      },
    ],
  }, async ($, on) => {
    const { clock } = world(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const wide = await $.ui.mount({ ...screen(160, true), surface: 'terminal' })
    await clock.advance(300)
    expect(await wide.find({ type: 'Text', text: 'docked:false' })).toBeDefined()

    const docked = await $.ui.mount({ ...pane(45, 40), surface: 'terminal' })
    await clock.advance(300)
    expect(await wide.find({ type: 'Text', text: 'docked:true' })).toBeDefined()
    await docked.unmount()
    await wide.unmount()

    const narrow = await $.ui.mount({ ...screen(100, true), surface: 'terminal' })
    await clock.advance(300)
    expect(await narrow.find({ type: 'Text', text: 'docked:false' })).toBeDefined()
    await narrow.unmount()
  })
})
