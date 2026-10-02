// Keys of warnings already toasted: `<kind>:<threshold>:<window>`, so each
// threshold warns once per rate-limit window (or per context fill).
export type DevStatusWarnings = string[]

// One rate-limit window as the session last reported it.
export type DevStatusLimit = { kind: string; percentUsed: number; resetsAt?: string }

// The branch and its state, as `git status -b` reports it.
export type DevStatusGit = { branch: string; dirty: number; ahead: number; behind: number }

// One category of the context window, as /context names it.
export type DevStatusSlice = { name: string; tokens: number }

// What the usage pane draws, as of `at` (ms since the epoch).
export type DevStatusUsage = {
  at: number
  contextTokens?: number
  contextWindow: number
  contextPercent?: number
  // Tokens at which auto-compaction runs, when it is on and known.
  autoCompactAt?: number
  limits: DevStatusLimit[]
  costUsd?: number
  // The categories in use, largest first; empty until the pane asked.
  slices: DevStatusSlice[]
  // The window the breakdown measured against, in tokens.
  breakdownTotal?: number
  // What the hint row shows beside the meters: the branch, and rtk's savings.
  git?: DevStatusGit
  rtkSaved?: number
}

declare module 'claude-code' {
  interface PluginState {
    'dev-status': { warned: DevStatusWarnings; usage: DevStatusUsage | null }
  }
}
