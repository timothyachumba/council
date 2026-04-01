# Beta Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude Vault shareable with a friend by externalising all hardcoded paths, adding an Obsidian settings panel, enabling full agent CRUD with editable prompts, and replacing static avatar images with CSS gradient presets.

**Architecture:** New utility modules (`gradientPresets.ts`, `cliDetector.ts`) provide foundation types. Service constructors (`ClaudeService`, `AgentRouter`, `AgentOrchestrator`, `VaultSyncService`) are updated to accept config from settings rather than reading hardcoded constants. Two new UI files (`SettingsTab.ts`, `AgentEditorModal.ts`) expose everything to the user via Obsidian's native settings panel.

**Tech Stack:** TypeScript, Obsidian Plugin API (`PluginSettingTab`, `Modal`, `Setting`, `FileSystemAdapter`), Node.js `child_process` + `fs`, CSS radial-gradient

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/gradientPresets.ts` | Create | 20 curated gradient presets + CSS/color helpers |
| `src/cliDetector.ts` | Create | Auto-detect Claude CLI binary path |
| `src/SettingsTab.ts` | Create | Obsidian settings panel (Claude Setup, Vault Access, Agents) |
| `src/AgentEditorModal.ts` | Create | Agent create/edit modal |
| `src/types.ts` | Modify | Updated `AgentConfig`, `ClaudeVaultSettings`, `DEFAULT_AGENTS` |
| `src/main.ts` | Modify | Seed system prompts, register SettingsTab, run CLI detection |
| `src/ClaudeService.ts` | Modify | Accept cliPath + vaultPaths in constructor |
| `src/AgentRouter.ts` | Modify | Accept cliPath in constructor |
| `src/AgentOrchestrator.ts` | Modify | Use `agent.systemPrompt`, pass paths to ClaudeService |
| `src/AgentPanel.ts` | Modify | Gradient avatars via gradientPresets, remove assetResolver |
| `src/InputBar.ts` | Modify | Use `primaryColor` from gradient preset for mention chips |
| `src/VaultSyncService.ts` | Modify | Accept cliPath, vaultRoot, vaultWriteDir; create dir if missing |
| `src/ChatView.ts` | Modify | Wire updated constructors; create ClaudeService in onOpen |
| `src/ThinkingTimeline.ts` | Delete | Orphaned — no longer used |
| `src/agentColors.ts` | Delete | Replaced by gradientPresets |

---

## Task 1: Create `src/gradientPresets.ts`

**Files:**
- Create: `src/gradientPresets.ts`

- [ ] **Step 1: Create the file with 20 presets and helper functions**

```typescript
// src/gradientPresets.ts

export interface GradientPreset {
	id: number;
	colors: [string, string, string, string];
}

// 20 curated palettes — indices 0–3 match the default agent identities
export const GRADIENT_PRESETS: GradientPreset[] = [
	{ id: 0,  colors: ["#4858D4", "#6B8DD4", "#2A3A9E", "#8B9AE8"] }, // cobalt   (Edge)
	{ id: 1,  colors: ["#DC6845", "#E89B6B", "#B84A2A", "#F0C080"] }, // terracotta (Loom)
	{ id: 2,  colors: ["#7B32C8", "#A855C8", "#5A1AAA", "#C478E8"] }, // purple   (Ember)
	{ id: 3,  colors: ["#5FA96E", "#7EC48C", "#3A8A50", "#A8D4A0"] }, // sage     (Quill)
	{ id: 4,  colors: ["#1A3A6B", "#2E5A9E", "#0E2248", "#4A7AB8"] }, // deep ocean
	{ id: 5,  colors: ["#8B5E3C", "#C4895A", "#6A3E22", "#D4A878"] }, // warm earth
	{ id: 6,  colors: ["#C84878", "#E87898", "#A82A58", "#F0A0B8"] }, // rose
	{ id: 7,  colors: ["#4A6680", "#6A8AA0", "#2E4A60", "#8AAAC0"] }, // arctic slate
	{ id: 8,  colors: ["#2A6B3C", "#4A8A5A", "#1A4A2A", "#6AAA7A"] }, // forest
	{ id: 9,  colors: ["#D4A020", "#E8C860", "#B07800", "#F0D880"] }, // golden
	{ id: 10, colors: ["#E8704A", "#F09A70", "#C84828", "#F8B890"] }, // coral
	{ id: 11, colors: ["#2A1A5E", "#4A3A8E", "#180E3E", "#6A5AAE"] }, // midnight
	{ id: 12, colors: ["#2A9A8A", "#4ABAA8", "#1A7A6A", "#6ACAC0"] }, // mint
	{ id: 13, colors: ["#9A78C8", "#B898E8", "#7A58A8", "#D0B0F8"] }, // lavender
	{ id: 14, colors: ["#D45A2A", "#E87A50", "#B03A10", "#F0A870"] }, // sunset
	{ id: 15, colors: ["#5A7A9A", "#7A9AB8", "#3A5A7A", "#9ABAC8"] }, // steel
	{ id: 16, colors: ["#9A1A2A", "#C04050", "#780A18", "#D07080"] }, // crimson
	{ id: 17, colors: ["#C8A060", "#E0C088", "#A87840", "#F0D8A0"] }, // cream
	{ id: 18, colors: ["#2A7A9A", "#4A9AB8", "#1A5A7A", "#6ABACA"] }, // teal
	{ id: 19, colors: ["#3A3A4A", "#5A5A6A", "#1A1A2A", "#7A7A8A"] }, // ink
];

/**
 * Renders a gradient preset as a CSS `background` string.
 * Four overlapping radial gradients at corners produce a soft mesh effect.
 */
export function gradientToCss(preset: GradientPreset): string {
	const [c1, c2, c3, c4] = preset.colors;
	return [
		`radial-gradient(ellipse at 0% 0%, ${c1}cc 0%, transparent 60%)`,
		`radial-gradient(ellipse at 100% 0%, ${c2}cc 0%, transparent 60%)`,
		`radial-gradient(ellipse at 100% 100%, ${c3}cc 0%, transparent 60%)`,
		`radial-gradient(ellipse at 0% 100%, ${c4}cc 0%, transparent 60%)`,
	].join(", ");
}

/**
 * Returns the first color of a preset — used as the agent's primary accent
 * (name badges, @mention chips, message card avatars).
 */
export function primaryColor(preset: GradientPreset): string {
	return preset.colors[0];
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | tail -20
```

Expected: clean build (gradientPresets.ts is standalone, no integration yet).

- [ ] **Step 3: Commit**

```bash
git add src/gradientPresets.ts
git commit -m "feat: add 20 curated gradient presets with CSS and color helpers"
```

---

## Task 2: Create `src/cliDetector.ts`

**Files:**
- Create: `src/cliDetector.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/cliDetector.ts

import { exec } from "child_process";
import { existsSync } from "fs";
import * as os from "os";
import * as path from "path";

const CANDIDATE_PATHS = [
	path.join(os.homedir(), ".local", "bin", "claude"),
	"/usr/local/bin/claude",
	"/opt/homebrew/bin/claude",
];

/**
 * Tries to find the Claude CLI binary.
 * Checks `which claude` first, then a list of common install locations.
 * Returns the first resolved path, or null if nothing found.
 */
export async function detectClaudeCli(): Promise<string | null> {
	// 1. Try `which claude`
	const fromWhich = await tryWhich();
	if (fromWhich) return fromWhich;

	// 2. Check known paths
	for (const p of CANDIDATE_PATHS) {
		if (existsSync(p)) return p;
	}

	return null;
}

function tryWhich(): Promise<string | null> {
	return new Promise((resolve) => {
		exec("which claude", (err, stdout) => {
			if (err || !stdout.trim()) {
				resolve(null);
			} else {
				resolve(stdout.trim());
			}
		});
	});
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/cliDetector.ts
git commit -m "feat: add Claude CLI auto-detection utility"
```

---

## Task 3: Update `src/types.ts`

**Files:**
- Modify: `src/types.ts`

Key changes:
- `AgentConfig`: replace `prompt: string` + `color: string` with `systemPrompt: string` + `gradientPreset: number`
- `ClaudeVaultSettings`: add `claudeCliPath`, `vaultReadDirs`, `vaultWriteDir`; remove `effortLevel`, `showThinkingTimeline`
- `DEFAULT_AGENTS`: update to use new fields (systemPrompts empty here — seeded in `main.ts`)
- `DEFAULT_SETTINGS`: add defaults for new fields

- [ ] **Step 1: Replace the plugin settings section (lines 172–217) with the updated version**

Replace everything from `// ─── Plugin settings ───` to end of file with:

```typescript
// ─── Plugin settings ───────────────────────────────────────────────────────

export type ClaudeModel = "claude-sonnet-4-6" | "claude-opus-4-6" | "claude-haiku-4-5-20251001";

export type AgentState = "watching" | "still";

export interface AgentConfig {
	id: string;
	name: string;
	description: string;
	state: AgentState;
	systemPrompt: string;   // full system prompt — seeded from agentPrompts.ts on first load
	gradientPreset: number; // index into GRADIENT_PRESETS (0–19)
}

export interface ClaudeVaultSettings {
	activeSessionId: string | null;
	model: ClaudeModel;
	claudeCliPath: string | null;       // resolved CLI binary path
	vaultReadDirs: string[];            // folders passed as --add-dir (relative to vault root)
	vaultWriteDir: string;              // sync write destination (relative to vault root)
	agents: AgentConfig[];
	agentSessions: Record<string, string | null>;
	parakeetPath: string | null;
	voiceAutoSend: boolean;
	chatHistory: StoredEvent[];
	lastSavedIndex: number;
}

// Default agents — systemPrompt is empty here and seeded in main.ts loadSettings()
export const DEFAULT_AGENTS: AgentConfig[] = [
	{ id: "edge",  name: "Edge",  description: "Challenges your assumptions",      state: "watching", systemPrompt: "", gradientPreset: 0 },
	{ id: "loom",  name: "Loom",  description: "Surfaces cross-context resonance", state: "watching", systemPrompt: "", gradientPreset: 1 },
	{ id: "ember", name: "Ember", description: "Extends half-formed ideas",        state: "watching", systemPrompt: "", gradientPreset: 2 },
	{ id: "quill", name: "Quill", description: "Shapes thoughts toward writing",   state: "still",    systemPrompt: "", gradientPreset: 3 },
];

export const DEFAULT_SETTINGS: ClaudeVaultSettings = {
	activeSessionId: null,
	model: "claude-sonnet-4-6",
	claudeCliPath: null,
	vaultReadDirs: [],
	vaultWriteDir: "Stream",
	agents: DEFAULT_AGENTS,
	agentSessions: {},
	parakeetPath: null,
	voiceAutoSend: true,
	chatHistory: [],
	lastSavedIndex: 0,
};
```

- [ ] **Step 2: Build — expect TypeScript errors in files that use the old fields**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

Expected: errors in `AgentOrchestrator.ts` (uses `agent.color`, `agent.prompt`), `AgentPanel.ts` (uses `agent.color`), `InputBar.ts` (uses `agent.color`), `ChatView.ts` (uses old settings fields). These will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: update AgentConfig and ClaudeVaultSettings for beta sharing"
```

---

## Task 4: Delete dead files

**Files:**
- Delete: `src/ThinkingTimeline.ts`
- Delete: `src/agentColors.ts`

- [ ] **Step 1: Delete both files**

```bash
rm /Users/timothyachumba/Apps/claude-vault/src/ThinkingTimeline.ts
rm /Users/timothyachumba/Apps/claude-vault/src/agentColors.ts
```

- [ ] **Step 2: Remove imports from any files that still reference them**

Check for remaining imports:

```bash
cd /Users/timothyachumba/Apps/claude-vault && grep -r "ThinkingTimeline\|agentColors\|AGENT_COLORS" src/ --include="*.ts" -l
```

For any file listed, remove the import line. Typically:
- `src/InputBar.ts`: remove `import { AGENT_COLORS } from "./agentColors";`
- `src/MessageList.ts`: remove `import { AGENT_COLORS } from "./agentColors";`

After removing the imports, usages of `AGENT_COLORS` in those files will error — those are fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete orphaned ThinkingTimeline.ts and agentColors.ts"
```

---

## Task 5: Update `src/ClaudeService.ts`

**Files:**
- Modify: `src/ClaudeService.ts`

Remove the two module-level constants. Accept `cliPath`, `vaultRoot`, and `vaultReadDirs` in the constructor.

- [ ] **Step 1: Replace the constants and class definition**

Delete lines 9–10 (the two `const` declarations):
```typescript
const CLAUDE_BIN = "/Users/timothyachumba/.local/bin/claude";
const VAULT_PATH = realpathSync("/Users/timothyachumba/Vault");
```

Update the class to accept config:

```typescript
export class ClaudeService extends EventEmitter {
	private parser = new StreamParser();
	private activeProcess: ChildProcess | null = null;

	constructor(
		private cliPath: string,
		private vaultRoot: string,
		private vaultReadDirs: string[], // absolute paths; if empty, vaultRoot is used
	) {
		super();
	}
```

- [ ] **Step 2: Update the `send()` method to use instance fields**

In `send()`, replace every reference to `CLAUDE_BIN` with `this.cliPath` and build the `--add-dir` args dynamically:

Replace the args array construction (currently lines 35–50) with:

```typescript
		const addDirs = this.vaultReadDirs.length > 0 ? this.vaultReadDirs : [this.vaultRoot];

		const args = [
			"--print",
			"--output-format", "stream-json",
			"--verbose",
			"--include-partial-messages",
			"--bare",   // skip hooks, skills, MCP, CLAUDE.md discovery — faster, more deterministic
			"--model", model,
		];

		for (const dir of addDirs) {
			args.push("--add-dir", dir);
		}

		if (sessionId) {
			args.push("--resume", sessionId);
		}

		if (systemPrompt) {
			args.push("--append-system-prompt", systemPrompt);
		}

		args.push(message);
```

Replace the script generation block — change the CLAUDE_BIN reference and the cwd:

```typescript
		const scriptFile = path.join(tmpDir, "run.sh");
		writeFileSync(scriptFile, [
			`#!/bin/bash`,
			`xargs -0 "${this.cliPath}" < "${argsFile}" > "${outFile}" 2>&1 &`,
			`CLAUDE_PID=$!`,
			`tail -f "${outFile}" &`,
			`TAIL_PID=$!`,
			`wait $CLAUDE_PID`,
			`kill $TAIL_PID 2>/dev/null`,
		].join("\n"));

		const proc = spawn("bash", [scriptFile], {
			cwd: this.vaultRoot,
			env,
		});
```

Also update the log line:
```typescript
		console.log("[cv-claude] Spawning via file+tail, cwd:", this.vaultRoot);
```

Also remove `realpathSync` from the import at line 3 (no longer needed in this file):
```typescript
import { mkdtempSync, unlinkSync, rmdirSync } from "fs";
```

- [ ] **Step 3: Build — errors expected in main.ts and AgentOrchestrator.ts (constructor args changed)**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add src/ClaudeService.ts
git commit -m "feat: remove hardcoded paths from ClaudeService, accept config in constructor"
```

---

## Task 6: Update `src/AgentRouter.ts`

**Files:**
- Modify: `src/AgentRouter.ts`

- [ ] **Step 1: Remove the hardcoded CLAUDE_BIN constant and accept it in constructor**

Delete line 7:
```typescript
const CLAUDE_BIN = "/Users/timothyachumba/.local/bin/claude";
```

Update the class:

```typescript
export class AgentRouter {
	constructor(private cliPath: string) {}

	async route(message: string, watchingAgents: AgentConfig[]): Promise<RouteResult[]> {
```

Also add `"--bare"` to the args array inside `route()` — the routing call never needs hooks, skills, MCP, or project config:

```typescript
		const args = [
			"--print",
			"--output-format", "stream-json",
			"--verbose",
			"--bare",   // routing call — skip all project config discovery, faster decision
			"--model", "claude-haiku-4-5-20251001",
			"--append-system-prompt", systemPrompt,
			userPrompt,
		];
```

Update the script generation inside `route()` — replace `"${CLAUDE_BIN}"` with `"${this.cliPath}"`:

```typescript
		writeFileSync(scriptFile, [
			`#!/bin/bash`,
			`xargs -0 "${this.cliPath}" < "${argsFile}" > "${outFile}" 2>&1 &`,
			`CLAUDE_PID=$!`,
			`tail -f "${outFile}" &`,
			`TAIL_PID=$!`,
			`wait $CLAUDE_PID`,
			`kill $TAIL_PID 2>/dev/null`,
		].join("\n"));
```

- [ ] **Step 2: Build — errors expected in AgentOrchestrator.ts**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 3: Commit**

```bash
git add src/AgentRouter.ts
git commit -m "feat: remove hardcoded CLI path from AgentRouter, accept in constructor"
```

---

## Task 7: Update `src/AgentOrchestrator.ts`

**Files:**
- Modify: `src/AgentOrchestrator.ts`

Changes: remove `AGENT_PROMPTS` import, use `agent.systemPrompt` directly, thread `cliPath`/`vaultRoot`/`vaultReadDirs` through to `ClaudeService` and `AgentRouter`, update `agentColor` emission to use `primaryColor`.

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { ClaudeService } from "./ClaudeService";
import { AgentRouter } from "./AgentRouter";
import { AGENT_PROMPTS } from "./agentPrompts";
import type { AgentConfig, ClaudeModel, StreamEvent } from "./types";
```

With:
```typescript
import { ClaudeService } from "./ClaudeService";
import { AgentRouter } from "./AgentRouter";
import { GRADIENT_PRESETS, primaryColor } from "./gradientPresets";
import type { AgentConfig, ClaudeModel, StreamEvent } from "./types";
```

- [ ] **Step 2: Update the constructor**

Replace:
```typescript
export class AgentOrchestrator extends EventEmitter {
	private router = new AgentRouter();
	private agentServices = new Map<string, ClaudeService>();
	private _isActive = false;
	private agentSessions: Record<string, string | null>;
	private onSessionUpdate: (agentId: string, sessionId: string) => void;

	constructor(
		agentSessions: Record<string, string | null>,
		onSessionUpdate: (agentId: string, sessionId: string) => void,
	) {
		super();
		this.agentSessions = agentSessions;
		this.onSessionUpdate = onSessionUpdate;
	}
```

With:
```typescript
export class AgentOrchestrator extends EventEmitter {
	private router: AgentRouter;
	private agentServices = new Map<string, ClaudeService>();
	private _isActive = false;
	private agentSessions: Record<string, string | null>;
	private onSessionUpdate: (agentId: string, sessionId: string) => void;

	constructor(
		agentSessions: Record<string, string | null>,
		onSessionUpdate: (agentId: string, sessionId: string) => void,
		private cliPath: string,
		private vaultRoot: string,
		private vaultReadDirs: string[],
	) {
		super();
		this.agentSessions = agentSessions;
		this.onSessionUpdate = onSessionUpdate;
		this.router = new AgentRouter(cliPath);
	}
```

- [ ] **Step 3: Update `runAgent()` — use systemPrompt and gradient color**

Replace the `runAgent` private method body. The key changes are:
1. `new ClaudeService()` → `new ClaudeService(this.cliPath, this.vaultRoot, this.vaultReadDirs)`
2. `AGENT_PROMPTS[agent.id] ?? ...` → `agent.systemPrompt`
3. `agent.color` → `primaryColor(GRADIENT_PRESETS[agent.gradientPreset])`

Replace the full `runAgent` method:

```typescript
	private runAgent(agent: AgentConfig, message: string, model: ClaudeModel): Promise<void> {
		return new Promise((resolve) => {
			let service = this.agentServices.get(agent.id);
			if (!service) {
				service = new ClaudeService(this.cliPath, this.vaultRoot, this.vaultReadDirs);
				this.agentServices.set(agent.id, service);
			}

			const systemPrompt = agent.systemPrompt
				|| `You are ${agent.name}. ${agent.description}. Keep responses concise, opinionated, and true to your role.`;

			const agentColor = primaryColor(GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0]);
			const sessionId = this.agentSessions[agent.id] ?? null;
			console.log(`[cv-agent:${agent.id}] Starting — session: ${sessionId ?? "new"}, model: ${model}`);
			console.log(`[cv-agent:${agent.id}] System prompt:`, systemPrompt.slice(0, 120) + "...");

			// Emit thinking event immediately so UI shows the thinking label
			this.emit("agent-event", {
				agentId: agent.id,
				agentName: agent.name,
				agentColor,
				event: { type: "thinking", content: "", partial: false } as StreamEvent,
			});

			const onEvent = (event: StreamEvent) => {
				if (event.type === "session_id") {
					console.log(`[cv-agent:${agent.id}] Got session ID:`, event.sessionId);
					this.agentSessions[agent.id] = event.sessionId;
					this.onSessionUpdate(agent.id, event.sessionId);
				} else if (event.type === "error") {
					console.error(`[cv-agent:${agent.id}] Error:`, event.message);
				} else if (event.type === "done") {
					console.log(`[cv-agent:${agent.id}] Stream done`);
				}
				this.emit("agent-event", {
					agentId: agent.id,
					agentName: agent.name,
					agentColor,
					event,
				});
			};

			const onDone = () => {
				service!.removeListener("event", onEvent);
				service!.removeListener("done", onDone);
				resolve();
			};

			service.on("event", onEvent);
			service.on("done", onDone);
			service.on("error", (err) => {
				console.error(`[cv-agent:${agent.id}] Service error:`, err.message);
			});

			service.send(message, model, sessionId, systemPrompt);
		});
	}
```

- [ ] **Step 4: Build — errors expected in ChatView.ts (constructor call)**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 5: Commit**

```bash
git add src/AgentOrchestrator.ts
git commit -m "feat: use agent.systemPrompt and gradient colors in AgentOrchestrator"
```

---

## Task 8: Update `src/AgentPanel.ts`

**Files:**
- Modify: `src/AgentPanel.ts`

Replace the static image / color fallback in avatar rendering with gradient presets. Remove `assetResolver` dependency.

- [ ] **Step 1: Add import for gradientPresets**

At the top of the file, add after existing imports:
```typescript
import { GRADIENT_PRESETS, gradientToCss } from "./gradientPresets";
```

- [ ] **Step 2: Remove `assetResolver` from the class**

In the class body, delete:
```typescript
	private assetResolver: ((path: string) => string) | null;
```

Update constructor signature (remove `assetResolver?` param) and body (remove the assignment):

```typescript
	constructor(
		agents: AgentConfig[],
		onSave: (agents: AgentConfig[]) => void,
	) {
		this.agents = agents;
		this.onSaveCallback = onSave;
		// no assetResolver needed — avatars use gradient presets
```

- [ ] **Step 3: Update `applyAvatarImage()`**

Find the `applyAvatarImage` method (currently around line 265). Replace its entire body:

```typescript
	private applyAvatarImage(el: HTMLElement, i: number): void {
		const agent = this.agents[i];
		const preset = GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0];
		el.style.backgroundImage = "none";
		el.style.background = gradientToCss(preset);
		el.style.backgroundSize = "cover";
	}
```

- [ ] **Step 4: Build — errors expected in ChatView.ts (passes assetResolver to AgentPanel)**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 5: Commit**

```bash
git add src/AgentPanel.ts
git commit -m "feat: replace static avatar images with CSS gradient presets in AgentPanel"
```

---

## Task 9: Update `src/InputBar.ts`

**Files:**
- Modify: `src/InputBar.ts`

Replace `AGENT_COLORS` import and usage with `primaryColor` from gradientPresets.

- [ ] **Step 1: Swap the import**

Find:
```typescript
import { AGENT_COLORS } from "./agentColors";
```

Replace with:
```typescript
import { GRADIENT_PRESETS, primaryColor } from "./gradientPresets";
```

- [ ] **Step 2: Update the mention chip color (InputBar.ts line ~331)**

Find:
```typescript
name.style.color = AGENT_COLORS[agent.id] ?? agent.color;
```

Replace with:
```typescript
name.style.color = primaryColor(GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0]);
```

- [ ] **Step 3: Build — check for remaining AGENT_COLORS references**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add src/InputBar.ts
git commit -m "feat: use gradient primaryColor for mention chips in InputBar"
```

---

## Task 10: Update `src/VaultSyncService.ts`

**Files:**
- Modify: `src/VaultSyncService.ts`

Accept `cliPath`, `vaultRoot`, `vaultWriteDir` via constructor. Create write dir if missing. Remove hardcoded constants.

- [ ] **Step 1: Update imports — add `mkdirSync`, remove `realpathSync`**

Replace:
```typescript
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, realpathSync } from "fs";
```

With:
```typescript
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, mkdirSync } from "fs";
```

- [ ] **Step 2: Remove the hardcoded constants and update constructor**

Delete lines 7–8:
```typescript
const CLAUDE_BIN = "/Users/timothyachumba/.local/bin/claude";
const VAULT_PATH = realpathSync("/Users/timothyachumba/Vault");
```

Update constructor:

```typescript
export class VaultSyncService {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private isRunning = false;

	constructor(
		private getHistory: () => StoredEvent[],
		private getLastSavedIndex: () => number,
		private onSaved: (newIndex: number) => void,
		private cliPath: string,
		private vaultRoot: string,
		private vaultWriteDir: string,
	) {}
```

- [ ] **Step 3: Update `runSync()` — ensure write dir exists and pass config**

Inside `runSync()`, before calling `spawnOneShot`, ensure the write directory exists:

```typescript
		// Ensure write dir exists
		const writePath = path.join(this.vaultRoot, this.vaultWriteDir);
		mkdirSync(writePath, { recursive: true });

		const transcript = formatTranscript(unsaved);
		const prompt = buildPrompt(transcript, this.vaultRoot, this.vaultWriteDir);
		await spawnOneShot(prompt, this.cliPath, this.vaultRoot);
```

- [ ] **Step 4: Update `buildPrompt` to accept vault paths**

Change the function signature and update the hardcoded path:

```typescript
function buildPrompt(transcript: string, vaultRoot: string, vaultWriteDir: string): string {
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }).replace(":", "");
	const timeFormatted = `${time.slice(0, 2)}:${time.slice(2)}`;
	const hour = now.getHours();
	const ampm = hour >= 12 ? "pm" : "am";
	const hour12 = hour % 12 || 12;
	const min = String(now.getMinutes()).padStart(2, "0");
	const streamTime = `${hour12}:${min}${ampm}`;
	const writeDir = path.join(vaultRoot, vaultWriteDir);

	return `You are capturing thinking from a claude-vault session into the knowledge base. Today is ${date}, time is ${timeFormatted}.

claude-vault is a one-long-continuous-chat Obsidian plugin where the user thinks alongside AI agents (Edge, Loom, Ember, Quill). Source type for stream entries is \`chat\`.

Here is the conversation transcript to process:

<transcript>
${transcript}
</transcript>

**Your task — follow the session-end protocol:**

## Step 1: Assess significance
If this transcript is purely mechanical, too thin (less than 2 substantive exchanges), or contains no evolved thinking — print "Nothing to capture." and stop.

## Step 2: Write stream entries
For each substantive insight, evolved position, or meaningful connection that emerged:

Append to \`${writeDir}/${date}.md\` (create the day-file with standard frontmatter if it doesn't exist):

\`\`\`
---
[${streamTime} | chat]
{The developed position or new connection. 1-3 sentences. Capture the core idea, not the full exchange.}
> thread: {thread-slug}

\`\`\`

Day-file frontmatter (if creating):
\`\`\`
---
type: stream
date: "${date}"
---
# Stream — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
\`\`\`

## Step 3: Route each entry to a thread
Search for thread files in the vault. If a matching thread exists, append the entry. Create a new thread if nothing matches and there's enough substance.

## Step 4: Print a compact summary
\`\`\`
=== claude-vault sync ===
Stream entries: N | Threads touched: N
\`\`\`

Do not write session files — only stream entries, thread routing, and memory index updates.`;
}
```

- [ ] **Step 5: Update `spawnOneShot` to accept `cliPath` and `vaultRoot`**

```typescript
function spawnOneShot(prompt: string, cliPath: string, vaultRoot: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const args = [
			"--print",
			"--output-format", "text",
			"--bare",   // sync call — skip hooks, skills, MCP, CLAUDE.md discovery
			"--add-dir", vaultRoot,
			"--model", "claude-haiku-4-5-20251001",
			prompt,
		];

		const env = { ...process.env };
		delete env["CLAUDECODE"];
		delete env["CLAUDE_CODE_ENTRYPOINT"];

		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "cv-sync-"));
		const outFile = path.join(tmpDir, "out.txt");
		const argsFile = path.join(tmpDir, "args.txt");
		const scriptFile = path.join(tmpDir, "run.sh");

		writeFileSync(argsFile, args.map((a) => a + "\0").join(""), "utf8");
		writeFileSync(scriptFile, [
			`#!/bin/bash`,
			`xargs -0 "${cliPath}" < "${argsFile}" > "${outFile}" 2>&1`,
		].join("\n"));

		const proc = spawn("bash", [scriptFile], { cwd: vaultRoot, env });

		proc.on("close", (code) => {
			try {
				const { readFileSync } = require("fs") as typeof import("fs");
				const out = readFileSync(outFile, "utf8");
				console.log("[cv-vault-sync] Claude output:", out.slice(0, 500));
			} catch { /* noop */ }

			try { unlinkSync(outFile); } catch { /* noop */ }
			try { unlinkSync(argsFile); } catch { /* noop */ }
			try { unlinkSync(scriptFile); } catch { /* noop */ }
			try { rmdirSync(tmpDir); } catch { /* noop */ }

			if (code === 0 || code === null) resolve();
			else reject(new Error(`claude-sync exited with code ${code}`));
		});

		proc.on("error", reject);
	});
}
```

- [ ] **Step 6: Build — errors expected in ChatView.ts**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 7: Commit**

```bash
git add src/VaultSyncService.ts
git commit -m "feat: make VaultSyncService configurable — cliPath, vaultRoot, vaultWriteDir"
```

---

## Task 11: Update `src/ChatView.ts`

**Files:**
- Modify: `src/ChatView.ts`

Wire updated constructors. Remove `ClaudeService` from constructor args (create in `onOpen()`). Pass vault config to all services.

- [ ] **Step 1: Update imports**

Add to the existing import block:
```typescript
import { FileSystemAdapter } from "obsidian";
import { detectClaudeCli } from "./cliDetector";
```

Remove the unused `SETTINGS_PATH` constant (lines 24–28):
```typescript
const SETTINGS_PATH = path.join(
	process.env.HOME ?? "/Users/timothyachumba",
	".claude",
	"settings.json",
);
```

- [ ] **Step 2: Update constructor — remove `claude` parameter**

Replace:
```typescript
	constructor(
		leaf: WorkspaceLeaf,
		settings: ClaudeVaultSettings,
		saveSettings: () => Promise<void>,
		claude: ClaudeService,
		sessionStore: SessionStore,
	) {
		super(leaf);
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.claude = claude;
		this.sessionStore = sessionStore;
		this.currentSessionId = settings.activeSessionId;
	}
```

With:
```typescript
	constructor(
		leaf: WorkspaceLeaf,
		settings: ClaudeVaultSettings,
		saveSettings: () => Promise<void>,
		sessionStore: SessionStore,
	) {
		super(leaf);
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.sessionStore = sessionStore;
		this.currentSessionId = settings.activeSessionId;
	}
```

- [ ] **Step 3: Update `onOpen()` — create services with settings config**

At the top of `onOpen()`, before the existing service setup, add:

```typescript
		const vaultRoot = (this.app.vault.adapter as FileSystemAdapter).basePath;
		const cliPath = this.settings.claudeCliPath ?? "";
		const readDirs = this.settings.vaultReadDirs.length > 0
			? this.settings.vaultReadDirs.map((d) => path.join(vaultRoot, d))
			: [vaultRoot];
```

Then replace:
```typescript
		this.claude = new ClaudeService();
```
With:
```typescript
		this.claude = new ClaudeService(cliPath, vaultRoot, readDirs);
```

Update the AgentPanel constructor call (remove `this.assetResolver` from the third arg):
```typescript
		this.agentPanel = new AgentPanel(this.settings.agents, (agents) => {
			this.settings.agents = agents;
			void this.saveSettings();
		});
```

Update the VaultSyncService constructor call:
```typescript
		this.vaultSync = new VaultSyncService(
			() => this.settings.chatHistory ?? [],
			() => this.settings.lastSavedIndex ?? 0,
			(newIndex) => {
				this.settings.lastSavedIndex = newIndex;
				void this.saveSettings();
			},
			cliPath,
			vaultRoot,
			this.settings.vaultWriteDir ?? "Stream",
		);
```

Update the AgentOrchestrator constructor call:
```typescript
		this.orchestrator = new AgentOrchestrator(
			this.settings.agentSessions,
			(agentId, sessionId) => {
				this.settings.agentSessions[agentId] = sessionId;
				void this.saveSettings();
			},
			cliPath,
			vaultRoot,
			readDirs,
		);
```

- [ ] **Step 4: Remove `assetResolver` usages that no longer exist**

Remove the `assetResolver` field and its initialization (it's only still needed if MessageList uses it for something else — check):

```bash
grep -n "assetResolver" /Users/timothyachumba/Apps/claude-vault/src/ChatView.ts
```

If `assetResolver` is still passed to `showAgentThinking` / `appendAgentCard` in MessageList, leave those calls but the AgentPanel call is already removed above. If MessageList also uses it purely for avatar images that can be replaced by color, remove those args too in a follow-up — for now leave as-is.

- [ ] **Step 5: Build**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

Fix any remaining type errors.

- [ ] **Step 6: Commit**

```bash
git add src/ChatView.ts
git commit -m "feat: wire updated service constructors in ChatView, read paths from settings"
```

---

## Task 12: Update `src/main.ts`

**Files:**
- Modify: `src/main.ts`

Seed agent system prompts on first load. Register SettingsTab. Run CLI auto-detection.

- [ ] **Step 1: Update imports**

```typescript
import { Plugin, Notice } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./ChatView";
import { SessionStore } from "./SessionStore";
import { DEFAULT_SETTINGS } from "./types";
import type { ClaudeVaultSettings } from "./types";
import { AGENT_PROMPTS } from "./agentPrompts";
import { detectClaudeCli } from "./cliDetector";
import { SettingsTab } from "./SettingsTab";
```

- [ ] **Step 2: Remove `this.claude` from the plugin class**

Delete the field declaration:
```typescript
	private claude!: ClaudeService;
```

And the import:
```typescript
import { ClaudeService } from "./ClaudeService";
```

- [ ] **Step 3: Update `onload()` — remove ClaudeService instantiation, add settings tab, add CLI detection**

Replace the full `onload()` method:

```typescript
	async onload(): Promise<void> {
		await this.loadSettings();

		this.sessionStore = new SessionStore();

		// Register the chat view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => {
			return new ChatView(
				leaf,
				this.settings,
				() => this.saveSettings(),
				this.sessionStore,
			);
		});

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon("message-square", "Claude", () => {
			void this.activateChatView();
		});

		// Command palette
		this.addCommand({
			id: "open-chat",
			name: "Open chat",
			callback: () => void this.activateChatView(),
		});

		this.addCommand({
			id: "new-chat",
			name: "New chat",
			callback: () => void this.newChat(),
		});

		// Auto-detect Claude CLI if not already set
		if (!this.settings.claudeCliPath) {
			detectClaudeCli().then(async (found) => {
				if (found) {
					this.settings.claudeCliPath = found;
					await this.saveSettings();
					console.log("[cv] Claude CLI found at:", found);
				} else {
					new Notice("Claude Vault: Claude CLI not found. Set the path in plugin settings.");
				}
			}).catch(console.error);
		}

		// Restore view in right sidebar if it was previously open
		this.app.workspace.onLayoutReady(() => {
			const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			if (existing.length === 0) return;
			this.app.workspace.revealLeaf(existing[0]);
		});
	}
```

- [ ] **Step 4: Update `loadSettings()` — seed systemPrompts for agents that have empty ones**

```typescript
	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ClaudeVaultSettings>);

		// Seed systemPrompt for any agent that doesn't have one yet
		for (const agent of this.settings.agents) {
			if (!agent.systemPrompt && AGENT_PROMPTS[agent.id]) {
				agent.systemPrompt = AGENT_PROMPTS[agent.id];
			}
		}
	}
```

- [ ] **Step 5: Build — SettingsTab.ts doesn't exist yet, expect import error**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

Expected: error about missing `./SettingsTab` module. All other errors should be resolved.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: seed agent prompts, register settings tab, run CLI detection in main.ts"
```

---

## Task 13: Create `src/AgentEditorModal.ts`

**Files:**
- Create: `src/AgentEditorModal.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/AgentEditorModal.ts

import { App, Modal, Setting } from "obsidian";
import { GRADIENT_PRESETS, gradientToCss, primaryColor } from "./gradientPresets";
import type { AgentConfig, AgentState } from "./types";

export class AgentEditorModal extends Modal {
	private draft: AgentConfig;
	private onSave: (agent: AgentConfig) => void;

	constructor(
		app: App,
		agent: AgentConfig | null, // null = new agent
		onSave: (agent: AgentConfig) => void,
	) {
		super(app);
		this.onSave = onSave;

		// Clone for editing, or create blank
		if (agent) {
			this.draft = { ...agent };
		} else {
			this.draft = {
				id: `agent-${Date.now()}`,
				name: "",
				description: "",
				state: "watching",
				systemPrompt: "",
				gradientPreset: 0,
			};
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.draft.name ? `Edit ${this.draft.name}` : "New agent");

		// ── Gradient picker ──────────────────────────────────────────────────
		contentEl.createEl("p", { text: "Gradient", cls: "cv-settings-label" });

		// Large preview swatch
		const preview = contentEl.createDiv({ cls: "cv-gradient-preview" });
		this.updatePreview(preview);

		// Grid of 20 swatches
		const grid = contentEl.createDiv({ cls: "cv-gradient-grid" });
		GRADIENT_PRESETS.forEach((preset) => {
			const swatch = grid.createDiv({ cls: "cv-gradient-swatch" });
			swatch.style.background = gradientToCss(preset);
			if (preset.id === this.draft.gradientPreset) {
				swatch.addClass("cv-gradient-swatch--selected");
			}
			swatch.addEventListener("click", () => {
				// Deselect all, select this
				grid.querySelectorAll(".cv-gradient-swatch--selected")
					.forEach((el) => el.removeClass("cv-gradient-swatch--selected"));
				swatch.addClass("cv-gradient-swatch--selected");
				this.draft.gradientPreset = preset.id;
				this.updatePreview(preview);
			});
		});

		// ── Name ─────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName("Name")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Critic")
					.setValue(this.draft.name)
					.onChange((value) => { this.draft.name = value; })
			);

		// ── Description ──────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName("Description")
			.setDesc("Short subtitle shown in the agent panel.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Pushes back on half-baked ideas")
					.setValue(this.draft.description)
					.onChange((value) => { this.draft.description = value; })
			);

		// ── System prompt ─────────────────────────────────────────────────────
		contentEl.createEl("p", { text: "System prompt", cls: "cv-settings-label" });
		const promptEl = contentEl.createEl("textarea", { cls: "cv-prompt-textarea" });
		promptEl.value = this.draft.systemPrompt;
		promptEl.rows = 10;
		promptEl.placeholder = "Describe this agent's identity, voice, format, and boundaries.";
		promptEl.addEventListener("input", () => {
			this.draft.systemPrompt = promptEl.value;
		});

		// ── Actions ──────────────────────────────────────────────────────────
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						if (!this.draft.name.trim()) {
							return; // name required
						}
						this.onSave({ ...this.draft });
						this.close();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private updatePreview(preview: HTMLElement): void {
		const preset = GRADIENT_PRESETS[this.draft.gradientPreset] ?? GRADIENT_PRESETS[0];
		preview.style.background = gradientToCss(preset);
		preview.style.borderColor = primaryColor(preset);
	}
}
```

- [ ] **Step 2: Add CSS for the new modal elements to `styles.css`**

Append to `styles.css`:

```css
/* ── Agent editor modal ──────────────────────────────────────────────────── */
.cv-settings-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 1rem 0 0.4rem;
}

.cv-gradient-preview {
  width: 100%;
  height: 80px;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  border: 2px solid transparent;
}

.cv-gradient-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 1rem;
}

.cv-gradient-swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.1s ease;
}

.cv-gradient-swatch:hover {
  transform: scale(1.08);
}

.cv-gradient-swatch--selected {
  border-color: var(--interactive-accent);
  outline: 2px solid var(--interactive-accent);
  outline-offset: 1px;
}

.cv-prompt-textarea {
  width: 100%;
  min-height: 180px;
  resize: vertical;
  font-family: var(--font-monospace);
  font-size: 0.85rem;
  padding: 0.5rem;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-secondary);
  color: var(--text-normal);
  margin-bottom: 0.5rem;
}
```

- [ ] **Step 3: Build**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add src/AgentEditorModal.ts styles.css
git commit -m "feat: add AgentEditorModal with gradient picker, name, description, and prompt fields"
```

---

## Task 14: Create `src/SettingsTab.ts` and complete `main.ts`

**Files:**
- Create: `src/SettingsTab.ts`

- [ ] **Step 1: Create SettingsTab.ts**

```typescript
// src/SettingsTab.ts

import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { GRADIENT_PRESETS, gradientToCss, primaryColor } from "./gradientPresets";
import { AgentEditorModal } from "./AgentEditorModal";
import { detectClaudeCli } from "./cliDetector";
import type { ClaudeVaultSettings, AgentConfig } from "./types";
import type ClaudeVaultPlugin from "./main";

export class SettingsTab extends PluginSettingTab {
	plugin: ClaudeVaultPlugin;

	constructor(app: App, plugin: ClaudeVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Claude Setup ─────────────────────────────────────────────────────
		containerEl.createEl("h2", { text: "Claude Setup" });

		let cliStatusEl: HTMLElement;

		new Setting(containerEl)
			.setName("Claude CLI path")
			.setDesc("Path to the claude binary.")
			.addText((text) =>
				text
					.setPlaceholder("/usr/local/bin/claude")
					.setValue(this.plugin.settings.claudeCliPath ?? "")
					.onChange(async (value) => {
						this.plugin.settings.claudeCliPath = value.trim() || null;
						await this.plugin.saveSettings();
						this.updateCliStatus(cliStatusEl, this.plugin.settings.claudeCliPath);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Auto-detect")
					.onClick(async () => {
						btn.setButtonText("Detecting…");
						btn.setDisabled(true);
						const found = await detectClaudeCli();
						btn.setButtonText("Auto-detect");
						btn.setDisabled(false);
						if (found) {
							this.plugin.settings.claudeCliPath = found;
							await this.plugin.saveSettings();
							this.display(); // re-render to show updated value
						} else {
							new Notice("Claude CLI not found. Install Claude Code and try again, or enter the path manually.");
						}
					})
			);

		// Status line under CLI setting
		cliStatusEl = containerEl.createDiv({ cls: "cv-settings-cli-status" });
		this.updateCliStatus(cliStatusEl, this.plugin.settings.claudeCliPath);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Claude model used for chat and agents.")
			.addDropdown((drop) =>
				drop
					.addOption("claude-sonnet-4-6", "Sonnet 4.6")
					.addOption("claude-opus-4-6", "Opus 4.6")
					.addOption("claude-haiku-4-5-20251001", "Haiku 4.5")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value as ClaudeVaultSettings["model"];
						await this.plugin.saveSettings();
					})
			);

		// ── Vault Access ──────────────────────────────────────────────────────
		containerEl.createEl("h2", { text: "Vault Access" });

		containerEl.createEl("p", {
			text: "Read folders — paths relative to vault root. Claude can read these when responding. Leave empty to use the entire vault.",
			cls: "setting-item-description",
		});

		const readFoldersContainer = containerEl.createDiv({ cls: "cv-settings-list" });
		this.renderReadFolders(readFoldersContainer);

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText("Add folder")
					.onClick(async () => {
						this.plugin.settings.vaultReadDirs.push("");
						await this.plugin.saveSettings();
						this.renderReadFolders(readFoldersContainer);
					})
			);

		new Setting(containerEl)
			.setName("Write destination")
			.setDesc("Folder where sync writes stream entries. Created if it doesn't exist. Relative to vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Stream")
					.setValue(this.plugin.settings.vaultWriteDir ?? "Stream")
					.onChange(async (value) => {
						this.plugin.settings.vaultWriteDir = value.trim() || "Stream";
						await this.plugin.saveSettings();
					})
			);

		// ── Agents ────────────────────────────────────────────────────────────
		containerEl.createEl("h2", { text: "Agents" });

		const agentsContainer = containerEl.createDiv({ cls: "cv-settings-agents" });
		this.renderAgents(agentsContainer);
	}

	private updateCliStatus(el: HTMLElement, cliPath: string | null): void {
		el.empty();
		if (cliPath) {
			el.createSpan({ text: `✓ ${cliPath}`, cls: "cv-cli-status cv-cli-status--found" });
		} else {
			el.createSpan({ text: "✗ Not found — enter path manually", cls: "cv-cli-status cv-cli-status--missing" });
		}
	}

	private renderReadFolders(container: HTMLElement): void {
		container.empty();
		const dirs = this.plugin.settings.vaultReadDirs;

		dirs.forEach((dir, i) => {
			const row = container.createDiv({ cls: "cv-settings-list-row" });
			const input = row.createEl("input", { type: "text", cls: "cv-settings-list-input" });
			input.value = dir;
			input.placeholder = "e.g. Notes";
			input.addEventListener("change", async () => {
				this.plugin.settings.vaultReadDirs[i] = input.value.trim();
				await this.plugin.saveSettings();
			});

			const removeBtn = row.createEl("button", { text: "×", cls: "cv-settings-list-remove" });
			removeBtn.addEventListener("click", async () => {
				this.plugin.settings.vaultReadDirs.splice(i, 1);
				await this.plugin.saveSettings();
				this.renderReadFolders(container);
			});
		});
	}

	private renderAgents(container: HTMLElement): void {
		container.empty();
		const agents = this.plugin.settings.agents;

		agents.forEach((agent, i) => {
			const row = container.createDiv({ cls: "cv-settings-agent-row" });

			// Gradient swatch
			const swatch = row.createDiv({ cls: "cv-settings-agent-swatch" });
			const preset = GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0];
			swatch.style.background = gradientToCss(preset);
			swatch.style.borderColor = primaryColor(preset);

			// Name
			row.createSpan({ text: agent.name, cls: "cv-settings-agent-name" });

			// Edit button
			const editBtn = row.createEl("button", { text: "Edit", cls: "cv-btn" });
			editBtn.addEventListener("click", () => {
				new AgentEditorModal(this.app, agent, async (updated) => {
					this.plugin.settings.agents[i] = updated;
					await this.plugin.saveSettings();
					this.renderAgents(container);
				}).open();
			});

			// Delete button
			const deleteBtn = row.createEl("button", { text: "Delete", cls: "cv-btn cv-btn--danger" });
			deleteBtn.addEventListener("click", async () => {
				this.plugin.settings.agents.splice(i, 1);
				await this.plugin.saveSettings();
				this.renderAgents(container);
			});
		});

		// Add agent button
		const addBtn = container.createEl("button", { text: "+ Add agent", cls: "cv-btn cv-btn--add" });
		addBtn.addEventListener("click", () => {
			const nextPreset = this.plugin.settings.agents.length % GRADIENT_PRESETS.length;
			new AgentEditorModal(this.app, null, async (newAgent) => {
				newAgent.gradientPreset = nextPreset;
				this.plugin.settings.agents.push(newAgent);
				await this.plugin.saveSettings();
				this.renderAgents(container);
			}).open();
		});
	}
}
```

- [ ] **Step 2: Add CSS for settings tab elements to `styles.css`**

Append to `styles.css`:

```css
/* ── Settings tab ────────────────────────────────────────────────────────── */
.cv-settings-cli-status {
  margin: -0.5rem 0 1rem 0;
  font-size: 0.8rem;
}

.cv-cli-status--found {
  color: var(--color-green);
}

.cv-cli-status--missing {
  color: var(--color-orange);
}

.cv-settings-list {
  margin-bottom: 0.5rem;
}

.cv-settings-list-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
}

.cv-settings-list-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-secondary);
  color: var(--text-normal);
  font-size: 0.9rem;
}

.cv-settings-list-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 1.1rem;
  padding: 0 6px;
}

.cv-settings-list-remove:hover {
  color: var(--color-red);
}

.cv-settings-agents {
  margin-top: 0.5rem;
}

.cv-settings-agent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--background-modifier-border);
}

.cv-settings-agent-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  flex-shrink: 0;
}

.cv-settings-agent-name {
  flex: 1;
  font-weight: 500;
}

.cv-btn--danger {
  color: var(--color-red);
}

.cv-btn--add {
  margin-top: 0.75rem;
}
```

- [ ] **Step 3: Full build**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1
```

Expected: clean build with zero TypeScript errors.

- [ ] **Step 4: Reload plugin in Obsidian and verify**

Open Obsidian → Settings → Claude Vault. Verify:
- Claude Setup section shows CLI path (auto-detected or empty) with status indicator
- Auto-detect button works
- Model dropdown works
- Vault Access section shows read folders list and write destination
- Agents section shows the 4 default agents with gradient swatches
- Edit opens the modal with gradient picker, name, description, prompt
- Gradient picker shows 20 swatches; selecting one updates the preview
- Delete removes an agent from the list
- Add agent creates a new one

Open the chat view and confirm agents respond correctly.

- [ ] **Step 5: Commit**

```bash
git add src/SettingsTab.ts styles.css
git commit -m "feat: add Obsidian settings tab with Claude setup, vault access, and agent CRUD"
```

---

## Task 15: Final integration verification

- [ ] **Step 1: Verify the build is clean**

```bash
cd /Users/timothyachumba/Apps/claude-vault && npm run build 2>&1
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Check for any remaining hardcoded user paths**

```bash
grep -r "timothyachumba\|/Users/timothy" /Users/timothyachumba/Apps/claude-vault/src --include="*.ts"
```

Expected: zero matches. If any remain, fix them.

- [ ] **Step 3: Verify dead imports are gone**

```bash
grep -r "ThinkingTimeline\|agentColors\|AGENT_COLORS\|effortLevel\|showThinkingTimeline" /Users/timothyachumba/Apps/claude-vault/src --include="*.ts"
```

Expected: zero matches.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: beta sharing complete — all hardcoded paths removed, settings UI live"
```
