# Claude Vault — Beta Sharing Design

**Date:** 2026-04-01  
**Goal:** Make Claude Vault installable and usable by a friend without code changes. They use Obsidian but have a different vault structure. They want agents, configurable context, and a write-back destination.

---

## Overview

The plugin currently has three hard problems for sharing:

1. Vault path and Claude CLI path are hardcoded to Timothy's machine
2. There is no settings UI — nothing is configurable from inside Obsidian
3. Agent system prompts are hardcoded at compile time

This design adds a full Obsidian settings panel, makes vault paths configurable, introduces agent CRUD, and replaces static avatar images with programmatically-selected CSS gradient presets.

---

## Settings Data Model

### New fields in `ClaudeVaultSettings` (`types.ts`)

```ts
claudeCliPath: string | null       // resolved CLI path; null = not found/not set
vaultReadDirs: string[]            // folders passed as --add-dir to Claude (relative to vault root)
vaultWriteDir: string | null       // where VaultSyncService writes; created if missing (relative to vault root)
```

### Updated `AgentConfig`

```ts
export interface AgentConfig {
  id: string
  name: string
  description: string           // subtitle shown in agent panel carousel
  state: AgentState             // "watching" | "still" — owned by AgentPanel, not settings UI
  systemPrompt: string          // full prompt, editable; seeded from agentPrompts.ts on first load
  gradientPreset: number        // index into GRADIENT_PRESETS array (0–19)
}
```

`prompt` (extension-only field) is removed. `systemPrompt` is the single source of truth at runtime.

### Removed fields

- `showThinkingTimeline` — orphaned, feature no longer exists
- `effortLevel` — present in settings but never used in code

### Default values

```ts
claudeCliPath: null,
vaultReadDirs: [],           // empty = whole vault (fallback behaviour in ClaudeService)
vaultWriteDir: "Stream",     // sensible default matching current behaviour
```

---

## Settings Tab (`src/SettingsTab.ts`)

Standard Obsidian `PluginSettingTab`. Three sections.

### Claude Setup

- **CLI path** — text input pre-filled with resolved path (or empty). Beside it: "Auto-detect" button.
- **Status line** — small text below the input: `✓ Found at /usr/local/bin/claude` or `✗ Not found — enter path manually`.
- **Model** — dropdown (sonnet / opus / haiku). Moved here from wherever it currently lives.

Auto-detect runs automatically on first plugin load when `claudeCliPath` is null. The "Auto-detect" button re-runs it on demand. Detection order: `which claude` → `~/.local/bin/claude` → `/usr/local/bin/claude` → `/opt/homebrew/bin/claude`. First hit wins and is persisted to settings.

### Vault Access

- **Read folders** — a list where each row is a path input (relative to vault root) + remove button. "Add folder" appends a new empty row. Empty list = whole vault passed as a single `--add-dir`.
- **Write destination** — single text input (relative to vault root). Helper text: "Folder will be created if it doesn't exist." Default: `Stream`.

Paths are relative to the Obsidian vault root — easier for users to reason about and vault-portable. The vault root is resolved once in `main.ts` via `this.app.vault.adapter.basePath` and passed to services that need it (ClaudeService, VaultSyncService).

### Agents

- List rows: gradient swatch thumbnail · name · Edit button · Delete button
- "Add agent" button at the bottom opens the agent modal with blank fields
- No watching/still state here — that's owned by the AgentPanel during active use

---

## Agent Editor Modal (`src/AgentEditorModal.ts`)

Opens from Edit or Add agent. Standard Obsidian `Modal`.

### Fields

1. **Gradient** — visual grid of 20 preset swatches (small squares, ~32×32px each, 5 per row). Selected preset highlighted with a ring. Preview of the full gradient shown at top of modal.
2. **Name** — text input
3. **Description** — text input (short; appears as subtitle in carousel)
4. **System prompt** — large textarea (min 8 rows). Pre-populated from `agentPrompts.ts` defaults for existing agents; blank template for new ones.

Save writes back to `settings.agents` and calls `saveSettings()`. Cancel discards. Delete lives on the list row, not inside the modal — prevents accidental deletion mid-edit.

The primary color for name badges and @mention chips is derived from the first color in the selected gradient preset, so no separate color field is needed.

---

## Gradient Presets (`src/gradientPresets.ts`)

20 curated static gradients. Each preset is an array of 4 hex colors. Rendered as overlapping CSS `radial-gradient` layers — no external dependency, no WebGL.

```ts
export interface GradientPreset {
  id: number
  colors: [string, string, string, string]
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  // 20 hand-picked palettes defined at implementation time
  // covering: warm, cool, neutral, high-contrast, muted, vivid ranges
]

// Renders a gradient preset as a CSS background string
export function gradientToCss(preset: GradientPreset): string {
  const [c1, c2, c3, c4] = preset.colors
  return [
    `radial-gradient(ellipse at 0% 0%, ${c1}cc 0%, transparent 60%)`,
    `radial-gradient(ellipse at 100% 0%, ${c2}cc 0%, transparent 60%)`,
    `radial-gradient(ellipse at 100% 100%, ${c3}cc 0%, transparent 60%)`,
    `radial-gradient(ellipse at 0% 100%, ${c4}cc 0%, transparent 60%)`,
  ].join(', ')
}

// Returns the first color as the agent's primary color (for badges, mention chips)
export function primaryColor(preset: GradientPreset): string {
  return preset.colors[0]
}
```

The 20 palettes are defined at implementation time with visual review. They span: warm earth, cool slate, deep ocean, soft rose, vivid cobalt, terracotta, sage, amber, violet, and neutral ranges — ensuring enough variety that no two default agents look similar.

---

## CLI Auto-Detection (`src/cliDetector.ts`)

```ts
export async function detectClaudeCli(): Promise<string | null>
```

Checks in order:
1. `which claude` via child_process exec
2. `~/.local/bin/claude` — exists check
3. `/usr/local/bin/claude` — exists check
4. `/opt/homebrew/bin/claude` — exists check

Returns the first resolved path, or `null` if nothing found. Called from `main.ts` on plugin load when `settings.claudeCliPath` is null. Result is persisted to settings immediately.

---

## Service Updates

### `ClaudeService.ts`

Remove the hardcoded `VAULT_PATH` and `CLAUDE_BIN` constants. Accept plugin settings (or the relevant fields) at construction time. `--add-dir` is passed once per entry in `vaultReadDirs`. If `vaultReadDirs` is empty, fall back to the Obsidian vault root as a single `--add-dir`.

### `AgentRouter.ts`

Replace hardcoded CLI path constant with the value from settings.

### `AgentOrchestrator.ts`

When assembling the prompt for an agent, use `agent.systemPrompt` directly. Remove the `agentPrompts.ts` lookup at runtime. `agentPrompts.ts` is only used to seed `settings.agents` on first load — never consulted at runtime again.

### `VaultSyncService.ts`

Replace hardcoded `VAULT_PATH` with `vaultWriteDir` from settings (resolved against the Obsidian vault root). Before writing, check if the folder exists — create it recursively if not. If `vaultWriteDir` is null or empty, sync is a no-op with a console warning.

### `main.ts`

- Register `SettingsTab` in `onload()`
- After loading settings, if `claudeCliPath` is null: run `detectClaudeCli()`, persist result if found, show a notice if not found directing the user to settings

### `agentPrompts.ts`

Role changes from runtime source to seed data. On first plugin load (when `settings.agents` is empty or at default), the four agent configs are created with `systemPrompt` populated from this file. After that it is never read at runtime.

---

## Deleted Files

| File | Reason |
|------|--------|
| `src/ThinkingTimeline.ts` | Confirmed orphaned after message UI redesign. 15k of dead code. |

---

## What This Does Not Cover

- Installing / distributing the plugin (BRAT or manual copy — out of scope)
- Voice transcription setup (parakeet-mlx) — already configurable via `parakeetPath` setting
- Production-ready error UI — notices and console logs are sufficient for beta
- Mobile support — plugin is desktop-only, no change

---

## File Summary

| File | Action |
|------|--------|
| `src/types.ts` | Update settings interface and AgentConfig |
| `src/main.ts` | Register SettingsTab, run CLI detection on load |
| `src/SettingsTab.ts` | **New** — Obsidian settings tab |
| `src/AgentEditorModal.ts` | **New** — agent CRUD modal |
| `src/gradientPresets.ts` | **New** — 20 gradient presets + CSS helper |
| `src/cliDetector.ts` | **New** — CLI auto-detection |
| `src/ClaudeService.ts` | Remove hardcoded paths, read from settings |
| `src/AgentRouter.ts` | Remove hardcoded CLI path |
| `src/AgentOrchestrator.ts` | Use agent.systemPrompt, remove agentPrompts.ts runtime lookup |
| `src/VaultSyncService.ts` | Use vaultWriteDir from settings, create dir if missing |
| `src/ThinkingTimeline.ts` | **Delete** |
