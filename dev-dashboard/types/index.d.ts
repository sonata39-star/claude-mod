// A file the session edited: how many times, and when last.
export type DashboardFile = { path: string; edits: number; lastAt: number }

// A Bash command the session ran; `isDone` false while it runs.
export type DashboardCommand = { id: string; command: string; isDone: boolean; isFailed: boolean; at: number }

// A tool call some hook or rule refused (dev-guard's among them).
export type DashboardDeny = { tool: string; reason: string; at: number }

// A test, lint, type-check or build command and how it ended.
export type DashboardCheck = { command: string; isPassed: boolean; at: number }

// The main loop's turns: how many, and their time together.
export type DashboardTurns = { count: number; totalMs: number; lastMs: number }

// The menu's tabs, one list each.
export type DashboardTab = 'files' | 'commands' | 'checks' | 'denies'

// What team-flow publishes in its own state, read here when it is installed
// (the same shapes as team-flow's contract; this plugin never writes them).
export type DashboardTeamPhase = 'pm' | 'ba' | 'lead' | 'dev' | 'review' | 'sec'

export type DashboardTeamStep = { phase: DashboardTeamPhase; state: 'done' | 'active' | 'todo' | 'skip'; note?: string }

export type DashboardTeamSnapshot = { slug: string; steps: DashboardTeamStep[]; isDone: boolean; others: number }

declare module 'claude-code' {
  interface PluginState {
    'dev-dashboard': {
      files: DashboardFile[]
      commands: DashboardCommand[]
      denies: DashboardDeny[]
      checks: DashboardCheck[]
      turns: DashboardTurns
      tab: DashboardTab
      // The person closed the sidebar: nothing reopens it this session but /dashboard.
      isClosedByPerson: boolean
      // The sidebar closed itself on a narrow screen and reopens when it widens.
      isAutoHidden: boolean
      // The person asked for it where it does not fit; it stays until they close it.
      isAskedSmall: boolean
      // The sidebar is docked and shown, so team-flow's band can step aside.
      isDocked: boolean
    }
    'team-flow': {
      snapshot: DashboardTeamSnapshot | null
      running: DashboardTeamPhase[]
    }
  }
}
