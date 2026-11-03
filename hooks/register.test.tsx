import { expect, mock, test } from 'claude-code/testing'

// Two frames of `mpv --vo=tct --vo-tct-width=8 --vo-tct-height=3` over a test pattern.
const TCT = "\u001b[?25l\u001b[?1049h\u001b[2J\u001b[0;0f\u001b[48;2;18;0;0m\u001b[38;2;19;35;31m\u2584\u001b[48;2;168;78;87m\u001b[38;2;45;234;249m\u2584\u001b[48;2;210;22;255m\u001b[38;2;210;15;255m\u2584\u001b[48;2;45;10;239m\u001b[38;2;46;11;237m\u2584\u001b[48;2;210;245;17m\u001b[38;2;209;244;18m\u2584\u001b[48;2;45;233;0m\u001b[38;2;46;241;0m\u2584\u001b[48;2;94;169;159m\u001b[38;2;210;15;0m\u2584\u001b[48;2;238;255;255m\u001b[38;2;230;212;215m\u2584\u001b[0m\u001b[1;0f\u001b[48;2;75;94;90m\u001b[38;2;69;93;91m\u2584\u001b[48;2;65;255;255m\u001b[38;2;60;255;255m\u2584\u001b[48;2;204;13;250m\u001b[38;2;208;8;255m\u2584\u001b[48;2;45;16;236m\u001b[38;2;46;12;239m\u2584\u001b[48;2;205;243;21m\u001b[38;2;208;244;17m\u2584\u001b[48;2;55;241;2m\u001b[38;2;57;244;0m\u2584\u001b[48;2;125;26;16m\u001b[38;2;129;31;1m\u2584\u001b[48;2;162;156;161m\u001b[38;2;159;165;160m\u2584\u001b[0m\u001b[2;0f\u001b[48;2;161;71;27m\u001b[38;2;88;15;0m\u2584\u001b[48;2;139;255;134m\u001b[38;2;205;101;42m\u2584\u001b[48;2;125;148;110m\u001b[38;2;168;91;180m\u2584\u001b[48;2;17;153;169m\u001b[38;2;29;86;202m\u2584\u001b[48;2;91;224;152m\u001b[38;2;147;234;89m\u2584\u001b[48;2;23;128;142m\u001b[38;2;32;174;71m\u2584\u001b[48;2;190;0;123m\u001b[38;2;86;143;210m\u2584\u001b[48;2;235;82;176m\u001b[38;2;242;188;238m\u2584\u001b[0m\n\u001b[0;0f\u001b[48;2;18;0;0m\u001b[38;2;19;35;31m\u2584\u001b[48;2;168;78;87m\u001b[38;2;45;234;249m\u2584\u001b[48;2;210;22;255m\u001b[38;2;210;15;255m\u2584\u001b[48;2;45;10;239m\u001b[38;2;46;11;237m\u2584\u001b[48;2;210;245;17m\u001b[38;2;209;244;18m\u2584\u001b[48;2;45;233;0m\u001b[38;2;46;241;0m\u2584\u001b[48;2;94;169;159m\u001b[38;2;210;15;0m\u2584\u001b[48;2;238;255;255m\u001b[38;2;230;212;215m\u2584\u001b[0m\u001b[1;0f\u001b[48;2;75;94;90m\u001b[38;2;69;92;91m\u2584\u001b[48;2;64;255;255m\u001b[38;2;60;255;255m\u2584\u001b[48;2;204;12;250m\u001b[38;2;208;9;255m\u2584\u001b[48;2;45;16;236m\u001b[38;2;46;12;239m\u2584\u001b[48;2;205;243;21m\u001b[38;2;208;245;17m\u2584\u001b[48;2;55;241;2m\u001b[38;2;57;244;0m\u2584\u001b[48;2;125;27;16m\u001b[38;2;128;31;1m\u2584\u001b[48;2;162;156;161m\u001b[38;2;159;165;161m\u2584\u001b[0m\u001b[2;0f\u001b[48;2;161;86;27m\u001b[38;2;89;23;0m\u2584\u001b[48;2;129;255;133m\u001b[38;2;201;104;42m\u2584\u001b[48;2;113;147;113m\u001b[38;2;162;91;182m\u2584\u001b[48;2;18;154;184m\u001b[38;2;29;87;209m\u2584\u001b[48;2;90;212;155m\u001b[38;2;147;227;91m\u2584\u001b[48;2;30;118;142m\u001b[38;2;35;169;70m\u2584\u001b[48;2;200;0;122m\u001b[38;2;93;144;211m\u2584\u001b[48;2;234;82;163m\u001b[38;2;242;188;232m\u2584\u001b[0m\n\u001b[0;0f\u001b[48;2;18;0;0m\u001b[38;2;19;35;31m\u2584\u001b[48;2;168;78;87m\u001b[38;2;45;234;249m\u2584\u001b[48;2;210;22;255m\u001b[38;2;210;15;255m\u2584\u001b[48;2;45;10;239m\u001b[38;2;46;11;237m\u2584\u001b[48;2;210;245;17m\u001b[38;2;209;244;18m\u2584\u001b[48;2;45;233;0m\u001b[38;2;46;241;0m\u2584\u001b[48;2;94;169;159m\u001b[38;2;210;15;0m\u2584\u001b[48;2;238;255;255m\u001b[38;2;230;212;215m\u2584\u001b[0m\u001b[1;0f\u001b[48;2;75;94;90m\u001b[38;2;69;92;91m\u2584\u001b[48;2;64;255;255m\u001b[38;2;60;255;255m\u2584\u001b[48;2;204;12;250m\u001b[38;2;208;9;255m\u2584\u001b[48;2;45;16;236m\u001b[38;2;46;12;239m\u2584\u001b[48;2;205;243;21m\u001b[38;2;208;245;17m\u2584\u001b[48;2;55;241;2m\u001b[38;2;57;244;0m\u2584\u001b[48;2;125;27;16m\u001b[38;2;128;31;1m\u2584\u001b[48;2;162;156;161m\u001b[38;2;159;165;161m\u2584\u001b[0m\u001b[2;0f\u001b[48;2;161;86;27m\u001b[38;2;89;23;0m\u2584\u001b[48;2;129;255;133m\u001b[38;2;201;104;42m\u2584\u001b[48;2;113;147;113m\u001b[38;2;162;91;182m\u2584\u001b[48;2;18;154;184m\u001b[38;2;29;87;209m\u2584\u001b[48;2;90;212;155m\u001b[38;2;147;227;91m\u2584\u001b[48;2;30;118;142m\u001b[38;2;35;169;70m\u2584\u001b[48;2;200;0;122m\u001b[38;2;93;144;211m\u2584\u001b[48;2;234;82;163m\u001b[38;2;242;188;232m\u2584\u001b[0m\n\u001b[?25h\u001b[?1049l"

const decode = (b64: string) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Uint32Array(bytes.buffer)
}

test('mpv frames reach the pane as Raster cells', { options: { columns: 8, rows: 3 } }, async ($, on) => {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/me' })
  const blits: string[] = []
  const sent: string[] = []
  let argv: readonly string[] = []
  let flags = ''
  on('command.register', () => ({ value: { command: 'anime' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.blit', (_, e) => {
    if ('cells' in e) blits.push(e.cells)
    return { value: {} }
  })
  on('fs.exists', () => ({ value: true }))
  on('process.run', (_, e) => {
    sent.push(e.argv.at(-1) ?? '')
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('process.spawn', async function* (_, e) {
    argv = e.argv
    flags = e.env?.ANI_CLI_PLAYER_FLAGS ?? ''
    // Cut mid-escape, as a pipe may.
    yield { stream: 'stdout' as const, text: TCT.slice(0, 1001) }
    yield { stream: 'stdout' as const, text: TCT.slice(1001) }
    // The first row of a next frame closes the second.
    yield { stream: 'stdout' as const, text: '\x1b[0;0f' }
    return { value: { code: 0, signal: null } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'anime', args: 'one piece', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  await clock.settle()

  expect(argv).toEqual(['ani-cli', '-e', '1', '-S', '1', 'one', 'piece'])
  expect(flags).toContain('--vo-tct-width=8')
  expect(flags).toContain('--input-ipc-server=/home/me/.cache/anime-break/mpv.sock')
  expect(blits.length).toBeGreaterThan(1)
  const cells = decode(blits.at(-1)!)
  expect(cells.length).toBe(8 * 3 * 3)
  expect(cells[0]).toBe(0x2584)
  expect(cells[1]).toBe(0x13231f)
  expect(cells[2]).toBe(0x120000)

  // The same frame in ASCII: one character per cell, by the two pixels' light.
  await $.command.run({ command: 'anime', args: 'mode ascii', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ascii = decode(blits.at(-1)!)
  const chars = Array.from({ length: 24 }, (_, i) => String.fromCharCode(ascii[i * 3]!)).join('')
  expect(chars).toMatch(/^[ .:\-=+*#%@]{24}$/)
  expect(ascii[1]).toBe(0x01000000)

  // And back: the half blocks come back from the kept pixels.
  await $.command.run({ command: 'anime', args: 'mode blocks', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect(decode(blits.at(-1)!)[2]).toBe(0x120000)
})
