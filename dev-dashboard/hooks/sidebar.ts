import type {
  DashboardCheck,
  DashboardCommand,
  DashboardDeny,
  DashboardFile,
  DashboardTab,
  DashboardTeamPhase,
  DashboardTeamSnapshot,
  DashboardTeamStep,
  DashboardTurns,
} from '../types'
import { cellWidth, clockTime, duration, fit, fitPath, relative } from './format'

// One styled stretch of a row.
export type Cell = { text: string; color?: string; isDim?: boolean; isBold?: boolean }

export type TabButton = { id: DashboardTab; label: string; hotkey: string; isSelected: boolean }

// One terminal row of the pane, exactly: a line of cells, a row of tab
// buttons, a rule, or an empty row. The footer is drawn apart, pinned last.
export type Row =
  | { kind: 'line'; cells: Cell[] }
  | { kind: 'tabs'; tabs: TabButton[] }
  | { kind: 'rule' }
  | { kind: 'blank' }

export type Layout = { rows: Row[]; footer: string }

export type SidebarData = {
  files: readonly DashboardFile[]
  commands: readonly DashboardCommand[]
  checks: readonly DashboardCheck[]
  denies: readonly DashboardDeny[]
  turns: DashboardTurns
  tab: DashboardTab
  cwd: string
  // team-flow's pipeline, when it is installed and the project has `.team/`.
  team?: { snapshot: DashboardTeamSnapshot | null; running: readonly DashboardTeamPhase[] }
}

export const TABS: readonly DashboardTab[] = ['files', 'commands', 'checks', 'denies']

const TAB_NAME: Record<DashboardTab, string> = { files: 'ไฟล์', commands: 'คำสั่ง', checks: 'test', denies: 'บล็อก' }

// team-flow's phases, as its band names them.
const PHASE: Record<DashboardTeamPhase, { icon: string; name: string }> = {
  pm: { icon: '🗂', name: 'PM' },
  ba: { icon: '📋', name: 'BA' },
  lead: { icon: '🧭', name: 'Lead' },
  dev: { icon: '🔨', name: 'Dev' },
  review: { icon: '🔍', name: 'Review' },
  sec: { icon: '🔒', name: 'Sec' },
}

// Below this many rows for its list, the dock shows the pipeline as one line.
const TEAM_LIST_FLOOR = 5

// At this many rows the dock has room for the other lists below the chosen one.
export const PREVIEW_ROWS = 32
const PREVIEW_ITEMS = 2
const CHOSEN_FLOOR = 6

const line = (...cells: Cell[]): Row => ({ kind: 'line', cells })

function count(data: SidebarData, tab: DashboardTab): number {
  return data[tab].length
}

function header(data: SidebarData): Row {
  const { count: turns, totalMs } = data.turns
  const stats = turns === 0 ? 'ยังไม่มี turn' : `${turns} turns · ${duration(totalMs)}`

  return line({ text: '🗂 Session', isBold: true }, { text: `  ${stats}`, isDim: true })
}

function hasTeam(data: SidebarData): data is SidebarData & { team: NonNullable<SidebarData['team']> } {
  return data.team !== undefined && (data.team.snapshot !== null || data.team.running.length > 0)
}

// A note team-flow writes when review or sec sent the work back.
const isSentBack = (step: DashboardTeamStep) => step.note?.includes('แก้ตาม') === true

function teamTitle(team: NonNullable<SidebarData['team']>): Cell[] {
  const { snapshot } = team
  const title = snapshot ? `👥 ${snapshot.slug}${snapshot.others > 0 ? ` (+${snapshot.others})` : ''}` : '👥 team'

  return [{ text: title, isBold: true }, ...(snapshot?.isDone ? [{ text: '  ✅ เสร็จครบ', color: 'green' }] : [])]
}

function stepCells(step: DashboardTeamStep, isRunning: boolean): Cell[] {
  const { icon, name } = PHASE[step.phase]
  const label = `${icon} ${name.padEnd(7)}`
  const note: Cell[] = step.note ? [{ text: `${step.note} `, ...(isSentBack(step) ? { color: 'red' } : { isDim: true }) }] : []
  const working: Cell[] = isRunning ? [{ text: '⏳ กำลังทำงาน…', color: 'yellow' }] : []

  switch (step.state) {
    case 'done':
      return [{ text: label, isDim: true }, { text: '✓ ', color: 'green' }, ...note, ...working]
    case 'active':
      return [{ text: label, color: 'cyan', isBold: true }, ...note, { text: '◀ ', color: 'cyan' }, ...working]
    case 'skip':
      return [{ text: label, isDim: true }, { text: '–', isDim: true }, ...working]
    case 'todo':
      return isRunning ? [{ text: label, color: 'yellow' }, ...working] : [{ text: label, isDim: true }]
  }
}

// The pipeline one phase a row, under its title.
export function teamRows(data: SidebarData): Row[] {
  if (!hasTeam(data)) {
    return []
  }

  const { snapshot, running } = data.team
  const steps = snapshot?.steps ?? running.map(phase => ({ phase, state: 'todo' as const }))

  return [line(...teamTitle(data.team)), ...steps.map(step => line(...stepCells(step, running.includes(step.phase))))]
}

// The pipeline in one line: the title and where the work stands.
export function teamLine(data: SidebarData): Row[] {
  if (!hasTeam(data)) {
    return []
  }

  const { snapshot, running } = data.team
  const active = snapshot?.steps.find(step => step.state === 'active')
  const cells: Cell[] = [...teamTitle(data.team)]

  if (active) {
    const { icon, name } = PHASE[active.phase]
    cells.push(
      { text: ' · ', isDim: true },
      { text: `${icon} ${name}`, color: 'cyan', isBold: true },
      ...(active.note ? [{ text: ` ${active.note}`, ...(isSentBack(active) ? { color: 'red' } : { isDim: true }) }] : []),
      { text: ' ◀', color: 'cyan' },
    )
  }
  if (running.length > 0) {
    cells.push({ text: ` ⏳${running.map(phase => PHASE[phase].name).join(',')}`, color: 'yellow' })
  }

  return [line(...cells)]
}

// The tab buttons in as few rows as `width` allows, evenly (4, 2+2 or one
// a row): a Button draws as `[ label ]`, one cell apart.
export function tabRows(data: SidebarData, width: number): Row[] {
  const tabs: TabButton[] = TABS.map((id, i) => {
    const hotkey = String(i + 1)

    return { id, label: `${hotkey} ${TAB_NAME[id]} ${count(data, id)}`, hotkey, isSelected: id === data.tab }
  })
  const rowWidth = (row: TabButton[]) => row.reduce((sum, one) => sum + cellWidth(one.label) + 4, row.length - 1)

  for (const perRow of [4, 2, 1]) {
    const rows: TabButton[][] = []
    for (let i = 0; i < tabs.length; i += perRow) {
      rows.push(tabs.slice(i, i + perRow))
    }
    if (perRow === 1 || rows.every(row => rowWidth(row) <= width)) {
      return rows.map(row => ({ kind: 'tabs', tabs: row }))
    }
  }

  return []
}

// One row per item of a list, newest first, fitted to `width`.
export function itemRows(data: SidebarData, tab: DashboardTab, width: number): Row[] {
  const room = width - 2

  switch (tab) {
    case 'files':
      return data.files.map(file => {
        const edits = `×${file.edits} `

        return line({ text: edits, color: 'cyan' }, { text: fitPath(relative(file.path, data.cwd), room - cellWidth(edits)) })
      })
    case 'commands':
      return [...data.commands].reverse().map(row => {
        const mark: Cell = !row.isDone
          ? { text: '… ', color: 'yellow' }
          : row.isFailed
            ? { text: '✗ ', color: 'red' }
            : { text: '✓ ', color: 'green' }

        return line(mark, { text: fit(row.command, room), isDim: row.isDone && !row.isFailed })
      })
    case 'checks':
      return [...data.checks].reverse().map(check => {
        const at = ` ${clockTime(check.at)}`

        return line(
          check.isPassed ? { text: '✓ ', color: 'green' } : { text: '✗ ', color: 'red' },
          { text: fit(check.command, room - cellWidth(at)) },
          { text: at, isDim: true },
        )
      })
    case 'denies':
      return [...data.denies].reverse().map(deny =>
        line({ text: '⛔ ', color: 'red' }, { text: fit(`${deny.tool}: ${deny.reason}`, room - 1), isDim: true }),
      )
  }
}

// At most `max` rows of a list; past that the last row says how many more.
function capped(rows: Row[], max: number): Row[] {
  if (max <= 0) {
    return []
  }
  if (rows.length <= max) {
    return rows
  }

  return [...rows.slice(0, max - 1), line({ text: `  +${rows.length - max + 1} รายการ`, isDim: true })]
}

function emptyRow(): Row {
  return line({ text: '  ยังไม่มี', isDim: true })
}

// The other lists, a title and their newest items each, in `room` rows.
function previews(data: SidebarData, width: number, room: number): Row[] {
  const rows: Row[] = []

  for (const tab of TABS.filter(one => one !== data.tab)) {
    const items = itemRows(data, tab, width)
    const section = [
      line({ text: `${TAB_NAME[tab]} (${items.length})`, isBold: true, isDim: true }),
      ...capped(items, Math.min(PREVIEW_ITEMS, items.length)),
    ]
    if (rows.length + 1 + section.length > room) {
      break
    }
    rows.push({ kind: 'blank' }, ...section)
  }

  return rows
}

// The docked sidebar, floor to ceiling: header, menu, the chosen list in
// every row it can take (the other lists' newest items too once the dock is
// PREVIEW_ROWS tall), the footer on the last row. Never more than `height`.
export function layoutDock(data: SidebarData, width: number, height: number): Layout {
  const tabs = tabRows(data, width)
  const footer = width >= 34 ? '· 1-4 แท็บ · ctrl+x x ปิด' : '· ctrl+x x ปิด'
  const team = teamRows(data)
  const spaced = (rows: Row[]): Row[] => (rows.length > 0 ? [...rows, { kind: 'blank' }] : [])
  const tops: Row[][] = [
    [header(data), { kind: 'blank' }, ...spaced(team), ...tabs, { kind: 'rule' }],
    // A shorter dock gives the pipeline one line, then the spacing.
    [header(data), ...spaced(teamLine(data)), ...tabs, { kind: 'rule' }],
    [header(data), ...teamLine(data), ...tabs],
  ]
  const floors = [team.length > 0 ? TEAM_LIST_FLOOR : 3, 3, 0]
  const top = tops.find((rows, i) => height - rows.length - 1 >= (floors[i] ?? 0)) ?? tops[tops.length - 1]!

  const room = Math.max(0, height - top.length - 1)
  const chosen = itemRows(data, data.tab, width)
  const list = chosen.length === 0 ? [emptyRow()] : chosen

  if (height < PREVIEW_ROWS) {
    return { rows: [...top, ...capped(list, room)], footer }
  }

  const wanted = previews(data, width, room)
  const chosenRoom = Math.max(Math.min(list.length, CHOSEN_FLOOR), room - wanted.length)
  const shown = capped(list, Math.min(room, chosenRoom))

  return { rows: [...top, ...shown, ...previews(data, width, room - shown.length)], footer }
}

// Seated above the prompt (asked for on a small screen): a few rows only.
export function layoutInline(data: SidebarData, width: number, height: number): Layout {
  const top = [header(data), ...tabRows(data, width)]
  const room = Math.max(0, height - top.length - 1)
  const chosen = itemRows(data, data.tab, width)

  return {
    rows: [...top, ...capped(chosen.length === 0 ? [emptyRow()] : chosen, room)],
    footer: '· 1-4 แท็บ · esc ปิด',
  }
}
