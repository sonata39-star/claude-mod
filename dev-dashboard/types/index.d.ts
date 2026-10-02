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

export type DashboardLimit = { kind: string; percentUsed: number; resetsAt?: string }

// The session's figures as of `at` (ms since the epoch).
export type DashboardUsage = {
  at: number
  contextPercent?: number
  contextTokens?: number
  window: number
  costUsd?: number
  limits: DashboardLimit[]
}

declare module 'claude-code' {
  interface PluginState {
    'dev-dashboard': {
      files: DashboardFile[]
      commands: DashboardCommand[]
      denies: DashboardDeny[]
      checks: DashboardCheck[]
      turns: DashboardTurns
      usage: DashboardUsage | null
    }
  }
}
