# anime-break

A Claude Code mod that plays anime in a pane beside the chat while the model works: the episode plays during each turn and pauses when the turn ends, so the pause tells you the answer is ready.

[ani-cli](https://github.com/pystardust/ani-cli) finds the episode and its stream; mpv decodes it and draws each frame as terminal cells (`--vo=tct`), which the mod paints into the pane. The sound plays as usual, in step with the picture.

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

This repository is private: it installs only for people who can read it on GitHub and whose machine already holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.

## Commands

| Command | What it does |
| --- | --- |
| `/anime <query>` | Plays episode 1 of the first match in the pane |
| `/anime -S 2 -e 5 <query>` | The second match, episode 5 (ani-cli's options) |
| `/anime search <query>` | Lists the matches |
| `/anime episodes -S 2 <query>` | Lists the episodes of the second match |
| `/anime pause`, `/anime play` | Pauses or plays now |
| `/anime off`, `/anime on` | Stops or starts following the turns |
| `/anime mode blocks` | Coloured half blocks, two pixels a cell (the default) |
| `/anime mode ascii` | ASCII characters by brightness |
| `/anime mode color` | ASCII characters in each cell's colour |
| `/anime status` | Phase, last lines of ani-cli, and mpv's buffer and download speed |
| `/anime stop` | Closes the player |

`/config` holds the picture's size (64 x 18 cells), frame rate (12), the stream's quality (`worst`) and the default drawing mode.

## When it stutters

`/anime status` says why. `waiting for the network` with a low download speed is the source's server: mpv keeps a large buffer (`--cache-pause-wait=5`), so it pauses for a few seconds and then plays smoothly, but a server slower than the stream's bitrate cannot keep up. `/anime pause` lets the buffer fill. When the source does not answer within ani-cli's 10 seconds, the mod tries again, three times.

## Developing

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
