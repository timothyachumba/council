# Council

Obsidian plugin — native chat interface for Claude with a multi-agent thinking system. Four agents (Edge, Loom, Ember, Quill) watch conversations and selectively respond based on relevance.

## Build

```bash
npm run dev    # watch mode
npm run build  # production
```

Output goes to `main.js` in project root. Obsidian hot-reloads on change.

## Critical patterns

### Claude CLI stdout doesn't flush to Node pipes
`ClaudeService.ts` uses a **file+tail workaround**: args written to a null-separated file, `xargs -0` passes them to Claude, output goes to a temp file, `tail -f` streams it to Node. This is essential — direct `spawn()` with pipe stdio hangs indefinitely. Both `ClaudeService` and `AgentRouter` use this pattern.

### Thread model
- `appendTopLevelMessage()` closes any active thread
- `appendUserMessage()` posts into the current thread (if one exists)
- `ensureThread()` creates a connector container on first agent response
- Threads have a curved connector (CSS border-left + border-bottom + border-radius) and 24px left indent
- User replies in a thread stay nested; new top-level thoughts break out

### Agent pipeline flow
1. User sends → `handleSend()` checks reply context
2. If agents watching or @mention → `handleAgentPipeline()`
3. Orchestrator parses @mentions → routes watching agents via Haiku (single winner, threshold 0.5)
4. Thinking label appears immediately (synthetic event before stream starts)
5. Text buffered during streaming → full card rendered on agent done
6. Status labels update based on tool_use events (searching → reading → analyzing → writing)

### Event architecture
Everything is EventEmitter-based. `ClaudeService` emits `StreamEvent`s, `AgentOrchestrator` wraps them as `AgentEvent`s (adding agentId/name/color), `ChatView` switches on event type to update `MessageList`.

### Chat history persistence
`StoredEvent` array (200-event FIFO) in plugin settings via `saveData()`. Three event types: `user_top`, `user_reply`, `agent`. Replayed on view open via `MessageList.replay()`.

## Key files

| File | Role |
|------|------|
| `src/ClaudeService.ts` | Spawns Claude CLI (file+tail), parses stream-json, handles abort |
| `src/AgentRouter.ts` | Haiku routing — scores watching agents, picks single winner |
| `src/AgentOrchestrator.ts` | Runs pipeline: @mentions → routing → sequential agent execution |
| `src/InputBar.ts` | Input UI state machine (idle/recording/processing), voice, @mention picker, reply chip |
| `src/MessageList.ts` | Renders messages, threads, agent cards, thinking labels, permissions, questions |
| `src/ChatView.ts` | Main view — builds layout, wires pipeline, persists history |
| `src/VoiceService.ts` | MediaRecorder + AnalyserNode + parakeet-mlx transcription |
| `src/AgentPanel.ts` | Avatar carousel with spring animations, Still/Watching toggle |
| `src/agentPrompts.ts` | System prompts per agent (identity, register, format, boundaries) |
| `src/agentStatus.ts` | 50 phase-aware status strings for thinking labels |
| `src/agentColors.ts` | Agent color constants |
| `src/types.ts` | StoredEvent, settings interface, defaults |

## Agent identity

| Agent | Color | Role | State |
|-------|-------|------|-------|
| Edge | `#4858D4` cobalt | Challenges assumptions, stress-tests claims | watching |
| Loom | `#DC6845` terracotta | Surfaces cross-context connections from vault | watching |
| Ember | `#7B32C8` purple | Extends half-formed ideas, shows directions | watching |
| Quill | `#5FA96E` sage | Shapes thinking toward publication | still |

## Conventions

- **CSS**: All classes prefixed `cv-`. Uses Baseline theme tokens (`--input-shadow`, `--interactive-normal`, `--button-radius`, etc.). Two base button classes: `.cv-btn` (text) and `.cv-icon-btn` (icon).
- **Animation**: `motion` library (motion.dev) for spring animations. Springs: `{ stiffness: 400, damping: 35 }` (smooth) and `{ stiffness: 500, damping: 40 }` (fast). Waveform uses RAF.
- **No React**: Vanilla DOM with Obsidian's `createDiv`/`createEl` helpers. State managed via class properties.
- **Vault path**: Resolved via `realpathSync` (~/Vault is a symlink to iCloud). Used as `cwd` and `--add-dir` for Claude.
- **Logs**: Pipeline logs prefixed `[cv-orchestrator]`, `[cv-router]`, `[cv-agent:{id}]`, `[cv-claude]`, `[cv-voice]`, `[cv-history]`. Check Obsidian dev console (Cmd+Option+I).

## Known issues

- **Right-click delete**: Wired but Obsidian intercepts the event. Tabled.
- **ThinkingTimeline.ts**: Orphaned — no longer used after message UI redesign. Can be deleted.
- **Waveform drift**: Fixed spawn position but may drift on very long recordings (>5 min).
- **Router/Claude pipe flushing**: Upstream Claude CLI issue. File+tail workaround is stable but adds complexity.
