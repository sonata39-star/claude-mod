import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderViewport } from 'claude-code'

import type { DashboardCommand, DashboardFile } from '../types'
import { isCheck } from './format'
import { layoutDock, layoutInline } from './sidebar'
import type { Cell } from './sidebar'

const PANE = 'dev-dashboard'
const TITLE = 'Dashboard'

const MAX_FILES = 50
const MAX_COMMANDS = 20
const MAX_DENIES = 10
const MAX_CHECKS = 8

// Inline (asked for on a small screen): this many rows above the prompt.
const INLINE_ROWS = 8
// The dock's share of the screen when `sidebarColumns` is 0, and its bounds.
const DOCK_SHARE = 0.28
const DOCK_MIN = 34
const DOCK_MAX = 48
// A width change settles this long before the sidebar hides or comes back.
const SETTLE_MS = 250
const RECHECK_MS = 30_000

const files = atom({ plugin: 'dev-dashboard', key: 'files' } as const, [])
const commands = atom({ plugin: 'dev-dashboard', key: 'commands' } as const, [])
const denies = atom({ plugin: 'dev-dashboard', key: 'denies' } as const, [])
const checks = atom({ plugin: 'dev-dashboard', key: 'checks' } as const, [])
const turns = atom({ plugin: 'dev-dashboard', key: 'turns' } as const, { count: 0, totalMs: 0, lastMs: 0 })
const tab = atom({ plugin: 'dev-dashboard', key: 'tab' } as const, 'files')
const isClosedByPerson = atom({ plugin: 'dev-dashboard', key: 'isClosedByPerson' } as const, false)
const isAutoHidden = atom({ plugin: 'dev-dashboard', key: 'isAutoHidden' } as const, false)
const isAskedSmall = atom({ plugin: 'dev-dashboard', key: 'isAskedSmall' } as const, false)
const isDocked = atom({ plugin: 'dev-dashboard', key: 'isDocked' } as const, false)
// team-flow's, read only: absent while it is not installed.
const teamSnapshot = atom({ plugin: 'team-flow', key: 'snapshot' } as const, null)
const teamRunning = atom({ plugin: 'team-flow', key: 'running' } as const, [])

// This load's settings and what the render sites last measured; a reload
// sets them again (`register`, then the next render).
let isAutoOpen = true
let minColumns = 120
let sidebarColumns = 0
let cwd = ''
let view: { columns: number; isFullscreen: boolean } | undefined
let placement: 'dock' | 'inline' | undefined
let isSettling = false

function dockColumns(columns: number): number {
  return sidebarColumns > 0 ? sidebarColumns : Math.max(DOCK_MIN, Math.min(DOCK_MAX, Math.round(columns * DOCK_SHARE)))
}

// A sidebar fits where the layout docks panes and the screen is wide enough.
function isRoomy(columns: number, isFullscreen: boolean): boolean {
  return isFullscreen && columns >= minColumns
}

async function clearAll($: EngineInterface) {
  await update($, files, () => [])
  await update($, commands, () => [])
  await update($, denies, () => [])
  await update($, checks, () => [])
  await update($, turns, () => ({ count: 0, totalMs: 0, lastMs: 0 }))
}

async function paneNow($: EngineInterface) {
  try {
    const panes = await $.ui.panes()

    return panes.find(pane => pane.id === PANE)
  } catch {
    return undefined
  }
}

// Hides the sidebar when the screen got too small for it, brings it back
// when it widens (only if it hid itself), and opens it the first time where
// `autoOpen` says so; never against the person's own close.
async function reconcile($: EngineInterface) {
  if (!view) {
    return
  }

  const { columns, isFullscreen } = view
  const isFitting = isRoomy(columns, isFullscreen)
  const pane = await paneNow($)
  const isDockedNow = pane !== undefined && pane.isPlaced && pane.isShown && placement === 'dock' && isFitting

  if ((await read($, isDocked)) !== isDockedNow) {
    await update($, isDocked, () => isDockedNow)
  }

  if (pane) {
    const isAsked = await read($, isAskedSmall)
    if (isFitting && isAsked) {
      await update($, isAskedSmall, () => false)
    }
    if (!isFitting && !isAsked) {
      await update($, isAutoHidden, () => true)
      await update($, isDocked, () => false)
      await $.ui.close({ id: PANE })
      if (pane.isPlaced) {
        $.ui.toast('ซ่อน dashboard เพราะจอแคบ ขยายจอหรือพิมพ์ /dashboard', { timeoutMs: 6_000 })
      }
    }

    return
  }

  if (!isFitting || (await read($, isClosedByPerson))) {
    return
  }

  const wasHidden = await read($, isAutoHidden)
  if (wasHidden || isAutoOpen) {
    await update($, isAutoHidden, () => false)
    await $.ui.open({ id: PANE, title: TITLE, columns: dockColumns(columns) })
    settle($)
  }
}

// Reconciles once things settle, outside the render that noticed a change.
function settle($: EngineInterface) {
  if (!isSettling) {
    isSettling = true
    $.clock.after(SETTLE_MS, () => {
      isSettling = false
      void reconcile($)
    })
  }
}

// Keeps what a render site measured, and where the pane was seated.
function noteView($: EngineInterface, viewport: RenderViewport | undefined, seated?: 'dock' | 'inline') {
  let isChanged = false

  if (seated !== undefined && seated !== placement) {
    placement = seated
    isChanged = true
  }
  if (viewport && viewport.isFullscreen !== undefined) {
    const next = { columns: viewport.columns, isFullscreen: viewport.isFullscreen }
    if (!view || view.columns !== next.columns || view.isFullscreen !== next.isFullscreen) {
      view = next
      isChanged = true
    }
  }
  if (isChanged) {
    settle($)
  }
}

function editedPath(e: { tool: string; file_path?: unknown; notebook_path?: unknown }): string | undefined {
  if ((e.tool === 'Edit' || e.tool === 'Write') && typeof e.file_path === 'string') {
    return e.file_path
  }
  if (e.tool === 'NotebookEdit' && typeof e.notebook_path === 'string') {
    return e.notebook_path
  }

  return undefined
}

function touch(list: DashboardFile[], path: string, at: number): DashboardFile[] {
  const seen = list.find(one => one.path === path)
  const rest = list.filter(one => one.path !== path)

  return [{ path, edits: (seen?.edits ?? 0) + 1, lastAt: at }, ...rest].slice(0, MAX_FILES)
}

function finish(list: DashboardCommand[], id: string, isFailed: boolean): DashboardCommand[] {
  return list.map(one => (one.id === id ? { ...one, isDone: true, isFailed } : one))
}

function cellProps(cell: Cell) {
  return {
    ...(cell.color === undefined ? {} : { color: cell.color }),
    ...(cell.isDim ? { dimColor: true } : {}),
    ...(cell.isBold ? { bold: true } : {}),
  }
}

export const register: Register = (on, options) => {
  isAutoOpen = options.autoOpen !== false
  minColumns = typeof options.minColumns === 'number' && options.minColumns > 0 ? options.minColumns : 120
  sidebarColumns = typeof options.sidebarColumns === 'number' && options.sidebarColumns > 0 ? options.sidebarColumns : 0

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = e.cwd

    await $.command.register({
      name: 'dashboard',
      description: 'เปิดเมนู dashboard ด้านขวา: ไฟล์ที่แก้, คำสั่ง, ผล test, สิ่งที่ถูกบล็อก',
      argumentHint: '[close]',
    })
    if (e.isInteractive) {
      // The first render measures the screen and opens the sidebar where it
      // fits; this catches a change no render reported.
      $.clock.every(RECHECK_MS, () => {
        void reconcile($)
      })
    }

    return started
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await clearAll($)
    }

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await update($, isClosedByPerson, () => true)
      await update($, isAutoHidden, () => false)
      await $.ui.close({ id: PANE })

      return { text: 'ปิด dashboard แล้ว (เปิดใหม่ด้วย /dashboard)' }
    }

    const { columns, isFullscreen } = e.presentation
    view = { columns, isFullscreen }
    await update($, isClosedByPerson, () => false)
    await update($, isAutoHidden, () => false)

    if (isRoomy(columns, isFullscreen)) {
      await update($, isAskedSmall, () => false)
      await $.ui.open({ id: PANE, title: TITLE, columns: dockColumns(columns) })
      settle($)

      return { text: 'เปิด dashboard ด้านขวาแล้ว' }
    }

    // They asked on a small screen: a few rows above the prompt, Esc closes.
    await update($, isAskedSmall, () => true)
    await update($, isDocked, () => false)
    await $.ui.open({ id: PANE, title: TITLE, rows: INLINE_ROWS, closeOnEscape: true })

    return { text: 'จอแคบเกินแถบด้านขวา เปิดแบบย่อเหนือช่องพิมพ์แทน (Esc ปิด)' }
  })

  // The person's own close sticks for the session, reloads included.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      await update($, isDocked, () => false)
    }
    if (e.id === PANE && e.origin.kind === 'person') {
      await update($, isClosedByPerson, () => true)
      await update($, isAutoHidden, () => false)
      await update($, isAskedSmall, () => false)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const at = await $.clock.now()
    const command = e.tool === 'Bash' ? e.command : undefined

    if (command !== undefined) {
      const row: DashboardCommand = { id: e.tool_use_id, command, isDone: false, isFailed: false, at }
      await update($, commands, list => [...list, row].slice(-MAX_COMMANDS))
    }

    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } catch (error) {
      if (command !== undefined) {
        await update($, commands, list => finish(list, e.tool_use_id, true))
      }
      throw error
    }

    const isDenied = ran.deny !== undefined
    const isFailed = isDenied || ran.isError === true

    if (ran.deny !== undefined) {
      const reason = ran.deny
      await update($, denies, list => [...list, { tool: String(e.tool), reason, at }].slice(-MAX_DENIES))
    }
    if (command !== undefined) {
      await update($, commands, list => finish(list, e.tool_use_id, isFailed))
      if (!isDenied && isCheck(command)) {
        await update($, checks, list => [...list, { command, isPassed: !isFailed, at }].slice(-MAX_CHECKS))
      }
    }

    const path = editedPath(e)
    if (path !== undefined && !isFailed) {
      await update($, files, list => touch(list, path, at))
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      await update($, turns, now => ({ count: now.count + 1, totalMs: now.totalMs + e.durationMs, lastMs: e.durationMs }))
    }

    return done
  })

  // Sites drawn whether or not the sidebar is open, read only for the
  // screen's size: each re-runs when the width changes.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    noteView($, e.viewport)

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    noteView($, e.viewport)

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, ($, e, next) => {
    noteView($, e.viewport)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    noteView($, e.viewport, e.props.placement)

    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(16, e.props.bodyColumns)
    const height = Math.max(4, e.props.scroll.bodyRows)
    const data = {
      files: await read($, files),
      commands: await read($, commands),
      checks: await read($, checks),
      denies: await read($, denies),
      turns: await read($, turns),
      tab: await read($, tab),
      cwd,
      team: { snapshot: await read($, teamSnapshot), running: await read($, teamRunning) },
    }
    const layout = e.props.placement === 'dock' ? layoutDock(data, width, height) : layoutInline(data, width, height)

    return (
      <Box flexDirection="column" height={height}>
        {layout.rows.map(row => {
          switch (row.kind) {
            case 'line':
              return (
                <Text wrap="truncate-end">
                  {row.cells.map(cell => (
                    <Text {...cellProps(cell)}>{cell.text}</Text>
                  ))}
                </Text>
              )
            case 'tabs':
              return (
                <Box flexDirection="row" gap={1}>
                  {row.tabs.map(one => (
                    <Button
                      key={`tab-${one.id}`}
                      label={one.label}
                      hotkey={one.hotkey}
                      {...(one.isSelected ? { variant: 'primary' as const } : {})}
                      onPress={() => update($, tab, () => one.id)}
                    />
                  ))}
                </Box>
              )
            case 'rule':
              return <Text dimColor>{'─'.repeat(width)}</Text>
            case 'blank':
              return <Text> </Text>
          }
        })}
        <Box flexGrow={1} />
        <Box key="footer" flexDirection="row">
          <Button key="clear" label="ล้าง" hotkey="c" plain onPress={() => clearAll($)} />
          <Text dimColor wrap="truncate-end">
            {' '}
            {layout.footer}
          </Text>
        </Box>
      </Box>
    )
  })
}
