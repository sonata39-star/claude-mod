export type NekoMood = 'idle' | 'working' | 'happy' | 'worried' | 'sleepy' | 'thinking'

export type NekoAction = 'type' | 'test' | 'commit' | 'push' | 'install' | 'read' | 'web' | 'agent'

export type NekoPet = 'cat' | 'dog' | 'wolf' | 'bird' | 'owl' | 'fish' | 'whale' | 'shark' | 'elephant' | 'horse' | 'cow'

export type NekoLine = { text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    neko: {
      line: NekoLine | null
      mood: NekoMood
      isHidden: boolean
      action: NekoAction | null
      isBlinking: boolean
      tail: number
      sparkle: number
      pet: NekoPet
    }
  }
}
