# Council

A multi-agent thinking surface for Obsidian, powered by Claude. Four agents watch your conversations and respond selectively based on what the thinking needs — not on cue, but on relevance.

## Agents

**Edge** challenges the load-bearing assumption in a line of thinking. When it pushes back, it's because the idea deserves to be stronger.

**Loom** surfaces connections across your vault — between threads, projects, and prior positions you've taken. It reads before it responds.

**Ember** extends half-formed ideas. It picks up the rough sketch and runs with it, showing where the thinking could go without overwriting what's there.

**Quill** is still by default. Invoke it directly when you have a developed position and want it shaped toward something publishable.

Agents watch passively or stay still. You control the mix. @mention any agent to pull them in directly.

## Requirements

- [Obsidian](https://obsidian.md) 1.0+
- [Claude Code CLI](https://claude.ai/code) — installed and authenticated (`claude login`)
- macOS (desktop only)

Voice input requires [parakeet-mlx](https://github.com/sanchit-gandhi/parakeet-mlx), installable from within Council's settings.

## Installation

Council is not in the Obsidian community registry. Install it via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install **BRAT** from Obsidian Community Plugins
2. BRAT settings → **Add Beta Plugin**
3. Paste: `https://github.com/timothyachumba/council`
4. Enable Council in Community Plugins

## Setup

On first open, Council will ask where to write vault entries — a daily log folder, a topics folder, and a memory file. These are created automatically. You can change them later in settings.

Vault sync runs after conversations go quiet. Council distils what emerged, routes entries into topic folders as themes develop, and keeps a memory index updated across sessions.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Model | Sonnet 4.6 | Claude model for chat and agents |
| Daily log | Stream | Where dated entries are written |
| Topics | Threads | Where entries are sorted by theme |
| Memory | System/memory.md | Running index of active topics and decisions |
| Auto-send | On | Send voice transcription automatically |

## License

MIT
