# anime-break

A Claude Code mod that plays anime in the terminal, above the prompt or in a side pane, while the model works: the episode plays during each turn and pauses when the turn ends, so the pause tells you the answer is ready.

[ani-cli](https://github.com/pystardust/ani-cli) finds the episode and its stream; mpv decodes it and draws each frame as terminal cells (`--vo=tct`), which the mod paints into Claude Code's own window. The sound plays as usual, in step with the picture.

## Requirements

- Linux, Claude Code in a terminal with truecolor (the picture is drawn in the terminal only)
- `ani-cli`, `mpv`, `python3` (the mod talks to mpv over its IPC socket), and ani-cli's own dependencies (`curl`, `fzf`, ...)

```sh
sudo apt install mpv curl aria2 fzf
git clone https://github.com/pystardust/ani-cli && sudo cp ani-cli/ani-cli /usr/local/bin/
```

ani-cli streams from third-party sites; what it finds and how fast it comes are theirs.

## Install

At the prompt of a terminal session:

```
/plugin install anime-break --marketplace likeamahoney/anime-break
```

Answer `y` to add the marketplace, then pick a scope (user scope first).

From a shell:

```sh
claude plugin install anime-break --marketplace likeamahoney/anime-break
```

## Commands

| Command | What it does |
| --- | --- |
| `/anime <query>` | Plays episode 1 of the first match |
| `/anime -S 2 -e 5 <query>` | The second match, episode 5 (ani-cli's options) |
| `/anime search <query>` | Lists the matches |
| `/anime episodes -S 2 <query>` | Lists the episodes of the second match |
| `/anime pause`, `/anime play` | Pauses or plays now |
| `/anime off`, `/anime on` | Stops or starts following the turns |
| `/anime mode blocks` | Coloured half blocks, two pixels a cell (the default) |
| `/anime mode ascii` | ASCII characters by brightness |
| `/anime mode color` | ASCII characters in each cell's colour |
| `/anime window` | Draws above the prompt, as tall as the picture (the default) |
| `/anime pane` | Draws in the side pane, the picture grown to fill it |
| `/anime status` | Phase, last lines of ani-cli, and mpv's buffer and download speed |
| `/anime stop` | Closes the player |

`/config` holds the picture's size above the prompt (at most 64 x 18 cells), frame rate (12), the stream's quality (`worst`), the default drawing mode and where it is drawn.

## Where the picture goes

Above the prompt the band is at most half the screen, so the picture shrinks to fit it whole, with its caption, at 16:9; whatever else draws in the band (another mod's) stays below it. The side pane is as tall as the screen and up to 45% of its width: `/anime pane` grows the picture to fill that width, up to 160 columns. Switching between the two resizes the picture while the episode plays on: mpv takes the new size when its video output is switched off and on, and the sound does not stop. A larger picture is more data a second; lower the frame rate in `/config` if it stutters.

## When it stutters

`/anime status` says why. `waiting for the network` with a low download speed is the source's server: mpv keeps a large buffer (`--cache-pause-wait=5`), so it pauses for a few seconds and then plays smoothly, but a server slower than the stream's bitrate cannot keep up. `/anime pause` lets the buffer fill. When the source does not answer within ani-cli's 10 seconds, the mod tries again, three times.

## Developing

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
