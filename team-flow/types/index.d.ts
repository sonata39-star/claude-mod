export type TeamPhase = 'pm' | 'ba' | 'lead' | 'dev' | 'review' | 'sec'

export type TeamStepState = 'done' | 'active' | 'todo' | 'skip'

export type TeamStep = { phase: TeamPhase; state: TeamStepState; note?: string }

export type TeamSnapshot = {
  slug: string
  steps: TeamStep[]
  isDone: boolean
  others: number
}

declare module 'claude-code' {
  interface PluginState {
    'team-flow': {
      snapshot: TeamSnapshot | null
      running: TeamPhase[]
      isHidden: boolean
    }
    // dev-dashboard's, read only: true while its right-hand sidebar is docked
    // and shown, which then draws this pipeline; absent while not installed.
    'dev-dashboard': {
      isDocked: boolean
    }
  }
}
