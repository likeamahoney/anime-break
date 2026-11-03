// What the pane says under the picture.
export type Info = {
  title: string
  phase: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'failed'
  // The last lines ani-cli and mpv wrote to stderr, ANSI codes removed.
  log: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'anime-break': {
      info: Shaped<Info>
      isFollowing: boolean
    }
  }
}
