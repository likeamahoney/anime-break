import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { Info } from '../types'

const PANE = 'anime'
const SCREEN = 'screen'
const LOWER_HALF = 0x2584
// From dark to bright, for a terminal with a dark background.
const RAMP = ' .:-=+*#%@'
const MODES = ['blocks', 'ascii', 'color'] as const
type Mode = (typeof MODES)[number]
const BLANK = 0x20
const DEFAULT_COLOR = 0x01000000

const info = atom(
  { plugin: 'anime-break', key: 'info' } as const,
  { title: '', phase: 'idle', log: [] },
  { shape: 'info-1' },
)
const isFollowing = atom({ plugin: 'anime-break', key: 'isFollowing' } as const, true)

// mpv takes JSON commands on a Unix socket; this sends one line.
const SEND = [
  'import socket, sys',
  's = socket.socket(socket.AF_UNIX)',
  's.settimeout(1)',
  's.connect(sys.argv[1])',
  's.sendall(sys.argv[2].encode() + b"\\n")',
].join('\n')

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
// What mpv's tct output is made of: a cursor move to the start of each row,
// then per cell a background (the upper pixel), a foreground (the lower one)
// and a lower half block; anything else is skipped.
const TCT =
  /\x1b\[(\d+);(\d+)f|\x1b\[48;2;(\d+);(\d+);(\d+)m|\x1b\[38;2;(\d+);(\d+);(\d+)m|(▄)|\x1b\[[0-9;?]*[A-Za-z]/g

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array) => {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[n >> 18]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest > 0) {
    const n = (bytes[i]! << 16) | (rest === 2 ? bytes[i + 1]! << 8 : 0)
    out += B64[n >> 18]! + B64[(n >> 12) & 63]! + (rest === 2 ? B64[(n >> 6) & 63]! : '=') + '='
  }
  return out
}

const rgb = (r?: string, g?: string, b?: string) =>
  (Number(r) << 16) | (Number(g) << 8) | Number(b)

const blankFrame = (size: number) => {
  const words = new Uint32Array(size * 3)
  for (let i = 0; i < size; i += 1) words.set([BLANK, DEFAULT_COLOR, DEFAULT_COLOR], i * 3)
  return words
}

// Work a hook starts and leaves running: a failure goes to the debug log.
const detach = ($: EngineInterface, work: Promise<unknown>) => {
  work.catch(error => {
    try {
      $.ui.log(String(error), { to: 'debug' })
    } catch {
      // The environment is gone (a reload, the session's end).
    }
  })
}

const HELP = [
  '/anime <query>          play episode 1 of the first match in a pane',
  '/anime -S 2 -e 5 <q>    the second match, episode 5 (ani-cli options)',
  '/anime search <q>       list the matches',
  '/anime episodes -S 2 <q> list the episodes of the second match',
  '/anime pause | play     pause or play now',
  '/anime off | on         stop or start following the turns',
  '/anime mode blocks      draw with coloured half blocks (the default)',
  '/anime mode ascii       draw with ASCII characters',
  '/anime mode color       draw with ASCII characters in colour',
  '/anime status           what the player is doing, and its last lines',
  '/anime window | pane    draw above the prompt, as tall as the picture, or in the side pane',
  '/anime stop             close the player',
].join('\n')

// The picture and the player live in the module: a reload starts them over.
const PLACES = ['window', 'pane'] as const
type Place = (typeof PLACES)[number]
// window: a band above the prompt, as tall as the picture; pane: the side dock.
const cfg = { columns: 64, rows: 18, fps: 12, quality: 'worst', mode: 'blocks' as Mode, place: 'window' as Place }
const live = {
  frame: blankFrame(cfg.columns * cfg.rows),
  // Each cell's two pixels as mpv sent them, upper then lower, so a change of
  // mode redraws the frame on screen even while the player is paused.
  pixels: new Uint32Array(cfg.columns * cfg.rows * 2),
  drawn: new Uint8Array(cfg.columns * cfg.rows),
  shown: '',
  isBlitting: false,
  waiting: null as string | null,
  player: null as AsyncGenerator<unknown, unknown> | null,
  socket: '',
  // The site the picture is drawn in: the pane's id, or the band's instance.
  site: PANE,
  // The size this episode is drawn at: cfg's, or less where the band is short.
  size: { columns: cfg.columns, rows: cfg.rows },
  // What the band above the prompt last offered, in rows and columns.
  room: { rows: 0, columns: 0 },
  // What the side pane last offered.
  paneRoom: { rows: 0, columns: 0 },
}

const glyph = (upper: number, lower: number): [number, number, number] => {
  if (cfg.mode === 'blocks') return [LOWER_HALF, lower, upper]
  const r = (((upper >> 16) & 255) + ((lower >> 16) & 255)) >> 1
  const g = (((upper >> 8) & 255) + ((lower >> 8) & 255)) >> 1
  const b = ((upper & 255) + (lower & 255)) >> 1
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const char = RAMP.charCodeAt(Math.min(RAMP.length - 1, Math.floor(light * RAMP.length)))
  return [char, cfg.mode === 'color' ? (r << 16) | (g << 8) | b : DEFAULT_COLOR, DEFAULT_COLOR]
}

const drawCell = (index: number, upper: number, lower: number) => {
  live.pixels[index * 2] = upper
  live.pixels[index * 2 + 1] = lower
  live.drawn[index] = 1
  live.frame.set(glyph(upper, lower), index * 3)
}

const redraw = ($: EngineInterface) => {
  for (let i = 0; i < live.size.columns * live.size.rows; i += 1) {
    if (live.drawn[i] === 1) drawCell(i, live.pixels[i * 2]!, live.pixels[i * 2 + 1]!)
  }
  paint($, base64(new Uint8Array(live.frame.buffer)))
}

const setInfo = ($: EngineInterface, change: Partial<Info>) =>
  update($, info, current => ({ ...current, ...change }))

// Asks mpv for properties and prints its answer to each, one JSON line apiece.
const ASK = [
  'import json, socket, sys',
  's = socket.socket(socket.AF_UNIX)',
  's.settimeout(1)',
  's.connect(sys.argv[1])',
  'f = s.makefile("rwb")',
  'for i, name in enumerate(sys.argv[2:]):',
  '    f.write(json.dumps({"command": ["get_property", name], "request_id": i}).encode() + b"\n")',
  '    f.flush()',
  '    while True:',
  '        line = json.loads(f.readline())',
  '        if line.get("request_id") == i:',
  '            print(json.dumps(line.get("data")))',
  '            break',
].join('\n')

// The socket's path never changes, so a reload, which empties the module,
// still finds the mpv the previous load started.
const socketOf = async ($: EngineInterface) =>
  `${(await $.env.get('HOME')) ?? '/tmp'}/.cache/anime-break/mpv.sock`

const ask = async ($: EngineInterface, names: string[]) => {
  const asked = await $.process.run(['python3', '-I', '-c', ASK, await socketOf($), ...names], {
    timeoutMs: 3_000,
  })
  if (asked.exitCode !== 0) return null
  const values = asked.stdout.trim().split('\n').map(line => JSON.parse(line) as unknown)
  return Object.fromEntries(names.map((name, i) => [name, values[i]]))
}

// What the player says of its network and its drawing, for /anime status.
const health = async ($: EngineInterface) => {
  const got = await ask($, ['demuxer-cache-duration', 'paused-for-cache', 'frame-drop-count', 'video-params/h', 'cache-speed'])
  if (got === null) return []
  const seconds = Number(got['demuxer-cache-duration'] ?? 0)
  return [
    `  buffered ${seconds.toFixed(1)} s, downloading ${Math.round(Number(got['cache-speed'] ?? 0) / 1024)} KB/s${got['paused-for-cache'] === true ? ', waiting for the network now' : ''}`,
    `  source ${String(got['video-params/h'] ?? '?')}p, ${String(got['frame-drop-count'] ?? 0)} frames dropped by mpv`,
  ]
}

const send = async ($: EngineInterface, command: unknown[]) => {
  // A socket is no file to $.fs: the connection itself says whether mpv is there.
  const sent = await $.process.run(
    ['python3', '-I', '-c', SEND, await socketOf($), JSON.stringify({ command })],
    { timeoutMs: 3_000 },
  )
  return sent.exitCode === 0
}

const setPaused = async ($: EngineInterface, isPaused: boolean) => {
  const { phase } = await read($, info)
  if (phase !== 'playing' && phase !== 'paused') return false
  if (!(await send($, ['set_property', 'pause', isPaused]))) return false
  await setInfo($, { phase: isPaused ? 'paused' : 'playing' })
  $.ui.status(`anime: ${isPaused ? 'paused' : 'playing'}`)
  return true
}

// Frames can come faster than the terminal takes them: the newest waits,
// older ones are dropped.
const paint = ($: EngineInterface, cells: string) => {
  live.shown = cells
  if (live.isBlitting) {
    live.waiting = cells
    return
  }
  live.isBlitting = true
  detach(
    $,
    (async () => {
      let next: string | null = cells
      while (next !== null) {
        live.waiting = null
        await $.ui.blit({ requestId: live.site, key: SCREEN, cells: next })
        next = live.waiting
      }
    })().finally(() => {
      live.isBlitting = false
    }),
  )
}

// Stands in for fzf: prints the menu ani-cli hands it to stderr and picks
// nothing, so ani-cli shows its list and exits.
const LIST_MENU = '#!/bin/sh\nprintf "\\n@@menu %s\\n" "$1" >&2\ncat >&2\n'

// Consecutive whole episodes as one range: 1-220, 220.5, 221-500.
const ranges = (episodes: string[]) => {
  const out: string[] = []
  let first = ''
  let last = NaN
  const close = () => {
    if (first !== '') out.push(String(last) === first ? first : `${first}-${last}`)
  }
  for (const ep of episodes) {
    const n = Number(ep)
    if (Number.isInteger(n) && n === last + 1) {
      last = n
      continue
    }
    close()
    first = Number.isInteger(n) ? ep : ''
    last = Number.isInteger(n) ? n : NaN
    if (!Number.isInteger(n)) out.push(ep)
  }
  close()
  return out.join(', ')
}

const ATTEMPTS = 3

// ani-cli's options that take a value: neither is part of the title.
const VALUED = new Set(['-S', '--select-nth', '-e', '--episode', '-r', '--range', '-q', '--quality'])

const titleOf = (words: string[]) =>
  words.filter((w, i) => !w.startsWith('-') && !VALUED.has(words[i - 1] ?? '')).join(' ')

const listOnce = ($: EngineInterface, menu: string, words: string[]) =>
  $.process.run(['ani-cli', ...words], {
    // debug prints the links where a player would start, for a single match
    env: { ANI_CLI_MENU: menu, ANI_CLI_LOG: '0', ANI_CLI_PLAYER: 'debug' },
    timeoutMs: 90_000,
  })

const list = async ($: EngineInterface, args: string) => {
  const words = args.split(/\s+/).filter(Boolean)
  const query = titleOf(words)
  if (query === '') return 'anime: what to look for? /anime search <query>'
  const home = (await $.env.get('HOME')) ?? '/tmp'
  const menu = `${home}/.cache/anime-break/list-menu`
  await $.fs.write(menu, LIST_MENU)
  await $.process.run(['chmod', '+x', menu])
  // ani-cli gives its source 10 seconds a request; a slow answer is tried again.
  let ran = await listOnce($, menu, words)
  for (let attempt = 1; attempt < ATTEMPTS && ran.stderr.includes('Connection error'); attempt += 1) {
    ran = await listOnce($, menu, words)
  }
  const lines = ran.stderr.replace(ANSI, '').split(/\r|\n/).map(line => line.trim())
  let prompt = ''
  let items: string[] = []
  for (const line of lines) {
    if (line.startsWith('@@menu ')) {
      prompt = line.slice(7)
      items = []
    } else if (prompt !== '' && line !== '') {
      items.push(line)
    }
  }
  if (prompt.startsWith('Select anime')) {
    const matches = items.filter(line => /^\d+\s/.test(line))
    return [
      `anime: ${matches.length} matches for "${query}"`,
      ...matches.map(line => line.replace(/^(\d+)\s+/, (_, n: string) => `${n.padStart(3)}  `)),
      `/anime -S <n> ${query} plays the nth; /anime episodes -S <n> ${query} lists its episodes`,
    ].join('\n')
  }
  // One match with one episode: ani-cli picked both itself, and its debug
  // player printed the links where it would have played them.
  if (prompt === '' && ran.stdout.includes('Selected link:')) {
    return [`anime: one match for "${query}", with one episode`, `/anime ${words.join(' ')} plays it`].join('\n')
  }
  const only = /^Playing episode (\S+) of (.+?)\.*$/.exec(prompt)
  if (only !== null) {
    return [
      `anime: one match, "${only[2]}", episode ${only[1]}`,
      `/anime ${words.join(' ')} plays it`,
    ].join('\n')
  }
  if (prompt.startsWith('Select episode')) {
    const episodes = items.filter(line => /^[\d.]+$/.test(line))
    return [
      `anime: ${episodes.length} episodes: ${ranges(episodes)}`,
      `/anime ${words.join(' ')} -e <n> plays one`,
    ].join('\n')
  }
  const said = lines.filter(Boolean).slice(-3).join('\n')
  return `anime: ani-cli listed nothing${said === '' ? '.' : `:\n${said}`}`
}

const stop = async ($: EngineInterface) => {
  await send($, ['quit'])
  const running = live.player
  live.player = null
  await running?.return(undefined)
}

const resetFrame = () => {
  const cells = live.size.columns * live.size.rows
  live.frame = blankFrame(cells)
  live.pixels = new Uint32Array(cells * 2)
  live.drawn = new Uint8Array(cells)
}

// The picture fills what its site offers, less a row for the caption, at
// 16:9 (a cell is two pixels tall). Above the prompt, where the band is at
// most half the screen, cfg's size is the most; the side pane grows past it.
const PANE_MOST_COLUMNS = 160

const fit = () => {
  const isPane = cfg.place === 'pane'
  const room = isPane ? live.paneRoom : live.room
  if (room.rows === 0) return { columns: cfg.columns, rows: cfg.rows }
  const mostColumns = Math.min(room.columns, isPane ? PANE_MOST_COLUMNS : cfg.columns)
  let rows = Math.max(4, isPane ? room.rows - 2 : Math.min(cfg.rows, room.rows - 2))
  let columns = Math.round((rows * 2 * 16) / 9)
  if (columns > mostColumns) {
    columns = mostColumns
    rows = Math.max(4, Math.round((columns * 9) / 32))
  }
  return { columns: Math.max(8, columns), rows }
}

// mpv takes a new tct size only with a new video output: switching it off
// and on again redraws the next frame at the new size, the episode playing on.
const resize = async ($: EngineInterface) => {
  const size = fit()
  if (size.columns === live.size.columns && size.rows === live.size.rows) return
  live.size = size
  resetFrame()
  paint($, base64(new Uint8Array(live.frame.buffer)))
  await send($, ['set_property', 'options/vo-tct-width', size.columns])
  await send($, ['set_property', 'options/vo-tct-height', size.rows])
  await send($, ['set_property', 'vo', 'null'])
  await send($, ['set_property', 'vo', 'tct'])
  // The Raster's size changed: a write of the info draws it anew.
  await setInfo($, {})
}

// A pane just opened has not been measured yet: wait for its first drawing.
const waitForPane = async ($: EngineInterface) => {
  for (let i = 0; i < 20 && live.paneRoom.rows === 0; i += 1) await $.clock.sleep(100)
}

const playStream = async ($: EngineInterface, args: string) => {
  await stop($)
  const home = (await $.env.get('HOME')) ?? '/tmp'
  live.socket = `${home}/.cache/anime-break/mpv.sock`
  const words = args.split(/\s+/).filter(Boolean)
  if (!words.includes('-S') && !words.includes('--select-nth')) words.unshift('-S', '1')
  if (!words.some(w => ['-e', '--episode', '-r', '--range'].includes(w))) words.unshift('-e', '1')

  live.size = fit()
  resetFrame()
  paint($, base64(new Uint8Array(live.frame.buffer)))
  await setInfo($, { title: titleOf(args.split(/\s+/).filter(Boolean)), phase: 'loading', log: [] })
  $.ui.status('anime: loading')

  const flags = [
    '--vo=tct',
    '--vo-tct-algo=half-blocks',
    '--vo-tct-256=no',
    `--vo-tct-width=${live.size.columns}`,
    `--vo-tct-height=${live.size.rows}`,
    `--vf=fps=${cfg.fps}`,
    '--really-quiet',
    '--no-input-terminal',
    // A slow source stalls once for a few seconds of buffer, not on every frame.
    '--cache=yes',
    '--demuxer-readahead-secs=120',
    '--demuxer-max-bytes=200MiB',
    '--cache-pause-wait=5',
    `--input-ipc-server=${live.socket}`,
  ]
  const stream = $.process.spawn({
    argv: ['ani-cli', ...words],
    env: {
      ANI_CLI_PLAYER: 'mpv',
      ANI_CLI_PLAYER_FLAGS: flags.join(' '),
      ANI_CLI_NO_DETACH: '1',
      ANI_CLI_EXIT_AFTER_PLAY: '1',
      ANI_CLI_LOG: '0',
      ANI_CLI_QUALITY: cfg.quality,
    },
  })
  live.player = stream

  let rest = ''
  let row = 0
  let col = 0
  let fg = DEFAULT_COLOR
  let bg = DEFAULT_COLOR
  let isDirty = false
  let isStarted = false
  let log: string[] = []

  for await (const piece of stream) {
    if (live.player !== stream) break
    if (piece.stream === 'stderr') {
      const lines = piece.text.replace(ANSI, '').split(/\r|\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length > 0) {
        log = [...log, ...lines].slice(-6)
        await setInfo($, { log })
      }
      continue
    }
    // A cut escape sequence waits for the next piece.
    let text = rest + piece.text
    const cut = text.lastIndexOf('\x1b')
    if (cut >= 0 && !/^\x1b\[[0-9;?]*[A-Za-z]/.test(text.slice(cut))) {
      rest = text.slice(cut)
      text = text.slice(0, cut)
    } else {
      rest = ''
    }
    for (const m of text.matchAll(TCT)) {
      if (m[1] !== undefined) {
        const nextRow = Number(m[1])
        // Back at the top: the frame before is whole.
        if (nextRow < row && isDirty) {
          paint($, base64(new Uint8Array(live.frame.buffer)))
          isDirty = false
          if (!isStarted) {
            isStarted = true
            await setInfo($, { phase: 'playing' })
            $.ui.status('anime: playing')
          }
        }
        row = nextRow
        col = Number(m[2])
      } else if (m[3] !== undefined) {
        bg = rgb(m[3], m[4], m[5])
      } else if (m[6] !== undefined) {
        fg = rgb(m[6], m[7], m[8])
      } else if (m[9] !== undefined) {
        if (row < live.size.rows && col < live.size.columns) {
          // mpv's background is the upper pixel, its foreground the lower.
          drawCell(row * live.size.columns + col, bg, fg)
          isDirty = true
        }
        col += 1
      }
    }
  }

  if (live.player === stream) {
    live.player = null
    const ended = await stream.result.catch((error: unknown) => String(error))
    const how =
      typeof ended === 'string'
        ? ended
        : ended.signal !== null
          ? `ani-cli ended by ${ended.signal}`
          : `ani-cli exited with code ${ended.code}`
    if (isStarted) {
      await setInfo($, { phase: 'ended' })
      $.ui.status(undefined)
    } else {
      // Nothing was drawn: say why, in the pane and the status line.
      await setInfo($, { phase: 'failed', log: [...log, how].slice(-6) })
      $.ui.status(`anime: failed (${how})`)
    }
  }
}

// The player's failures are the person's to read, not the debug log's.
const play = async ($: EngineInterface, args: string) => {
  try {
    // ani-cli gives its source 10 seconds a request; a slow answer is tried again.
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      await playStream($, args)
      const now = await read($, info)
      if (now.phase !== 'failed' || !now.log.some(line => line.includes('Connection error'))) break
      if (attempt < ATTEMPTS) $.ui.status(`anime: the source is slow, try ${attempt + 1} of ${ATTEMPTS}`)
    }
  } catch (error) {
    const { log } = await read($, info)
    await setInfo($, { phase: 'failed', log: [...log, String(error)].slice(-6) })
    $.ui.status('anime: failed')
  }
}

const describe = (now: Info) =>
  [
    `anime: ${now.phase}${now.title === '' ? '' : ` · ${now.title}`} · drawn as ${cfg.mode}`,
    ...now.log.map(line => `  ${line}`),
  ].join('\n')

const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: 'Anime', rows: cfg.rows + 4, columns: cfg.columns + 2 })

// The picture, its caption and, while it loads or after it failed, what
// ani-cli said: the same in the band and in the pane.
const drawing = ($: EngineInterface, e: RenderInput<'AbovePrompt' | 'Pane'>, now: Info) => {
  const { Box, Text } = $.ui.resolve(e)
  const caption = (
    <Text>
      <Text bold>{now.title === '' ? 'anime' : now.title}</Text>
      <Text dimColor> · {now.phase} · {cfg.mode} · /anime pause|play|mode|stop</Text>
    </Text>
  )
  const log = (now.phase === 'loading' || now.phase === 'failed' ? now.log : []).map(line => (
    <Text dimColor>{line}</Text>
  ))
  if (e.surface !== 'terminal') {
    return (
      <Box flexDirection="column">
        {caption}
        <Text dimColor>The picture is drawn in the terminal only.</Text>
      </Box>
    )
  }
  const { Raster } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Raster key={SCREEN} columns={live.size.columns} rows={live.size.rows} cells={live.shown} />
      {caption}
      {log}
    </Box>
  )
}

export const register: Register = (on, options) => {
  cfg.columns = Number(options.columns ?? 64)
  cfg.rows = Number(options.rows ?? 18)
  cfg.fps = Number(options.fps ?? 12)
  cfg.quality = String(options.quality ?? 'worst')
  cfg.mode = MODES.find(m => m === options.mode) ?? 'blocks'
  cfg.place = PLACES.find(m => m === options.place) ?? 'window'
  live.site = PANE
  live.size = { columns: cfg.columns, rows: cfg.rows }
  resetFrame()
  live.shown = base64(new Uint8Array(live.frame.buffer))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'anime',
      description: 'Watch anime in a pane while the model works: plays during turns, pauses between them',
      argumentHint: '<query>|search <query>|status|window|pane|episodes -S <n> <query>|pause|play|mode <blocks|ascii|color>|off|on|stop|help',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'anime' }, async ($, e) => {
    const arg = e.args.trim()
    const [verb, value] = arg.split(/\s+/)
    if (verb === 'search' || verb === 'list' || verb === 'episodes') {
      return { text: await list($, arg.slice(verb.length)) }
    }
    if (verb === 'mode') {
      const mode = MODES.find(m => m === value)
      if (mode === undefined) return { text: `anime: the modes are ${MODES.join(', ')}; now ${cfg.mode}.` }
      cfg.mode = mode
      redraw($)
      // The caption names the mode: a write of the info redraws it.
      await setInfo($, {})
      return { text: `anime: drawn as ${mode}.` }
    }
    switch (arg) {
      case '':
      case 'help':
        return { text: HELP }
      case 'pause':
      case 'play':
        return (await setPaused($, arg === 'pause'))
          ? { text: `anime: ${arg === 'pause' ? 'paused' : 'playing'}.` }
          : (await read($, info)).phase === 'loading'
            ? { text: 'anime: still loading; it plays as soon as the first frame comes.' }
            : { text: 'anime: nothing is playing; /anime <query> starts an episode.' }
      case 'off':
      case 'on':
        await update($, isFollowing, () => arg === 'on')
        return { text: arg === 'on' ? 'anime: follows the turns.' : 'anime: left alone.' }
      case 'window':
      case 'pane':
        cfg.place = arg
        if (arg === 'pane') {
          await openPane($)
          await waitForPane($)
        } else {
          await $.ui.close({ id: PANE })
          live.paneRoom = { rows: 0, columns: 0 }
        }
        // Both sites read the info: a write draws the picture where it now goes.
        await setInfo($, {})
        await resize($)
        return { text: `anime: drawn ${arg === 'pane' ? 'in the side pane' : 'above the prompt'}.` }
      case 'status':
        return { text: [describe(await read($, info)), ...(await health($))].join('\n') }
      case 'stop':
        await stop($)
        await setInfo($, { phase: 'idle' })
        $.ui.status(undefined)
        return { text: 'anime: player closed.' }
    }
    if (cfg.place === 'pane') {
      await openPane($)
      await waitForPane($)
    }
    // The player runs for the session's life, past this hook.
    detach($, play($, arg))
    return { text: `anime: looking for "${arg}"…` }
  })

  // The main loop's turns only: a subagent's end is not the model's.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isFollowing))) detach($, setPaused($, false))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isFollowing))) detach($, setPaused($, true))
    return next(e)
  })

  // Above the prompt, as tall as the picture, over whatever else draws there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, info)
    live.room = { rows: e.props.maxRows, columns: e.props.bodyColumns }
    const isShown = now.phase !== 'idle' && now.phase !== 'ended'
    if (cfg.place !== 'window' || !isShown || e.props.hasSurvey) return next(e)
    live.site = e.requestId
    const below = await next(e)
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {drawing($, e, now)}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    live.site = PANE
    live.paneRoom = { rows: e.props.scroll.bodyRows, columns: e.props.bodyColumns }
    return drawing($, e, await read($, info))
  })
}
