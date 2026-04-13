import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, mkdirSync } from "fs";
import * as path from "path";
import * as os from "os";
import type { StoredEvent } from "./types";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MIN_USER_MESSAGES = 2; // don't sync single-message exchanges

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
		private vaultThreadsDir: string,
		private vaultMemoryPath: string,
	) {}

	/** Call on every user send — resets the idle countdown */
	resetTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => { void this.runSync(); }, IDLE_TIMEOUT_MS);
	}

	/** Call on view close */
	cancel(): void {
		if (this.timer) { clearTimeout(this.timer); this.timer = null; }
	}

	/** Force an immediate sync (e.g. from a manual save button) */
	async syncNow(): Promise<void> {
		if (this.timer) { clearTimeout(this.timer); this.timer = null; }
		await this.runSync();
	}

	private async runSync(): Promise<void> {
		if (this.isRunning) return;

		const history = this.getHistory();
		const savedIndex = this.getLastSavedIndex();
		const unsaved = history.slice(savedIndex);

		// Gate: need enough substance to be worth writing
		const userMessages = unsaved.filter(
			(e) => e.type === "user_top" || e.type === "user_reply",
		);
		if (userMessages.length < MIN_USER_MESSAGES) {
			console.log("[cv-vault-sync] Skipping — not enough user messages:", userMessages.length);
			return;
		}

		this.isRunning = true;
		console.log("[cv-vault-sync] Starting sync. Events to process:", unsaved.length);

		try {
			// Ensure write dirs exist
			mkdirSync(path.join(this.vaultRoot, this.vaultWriteDir),  { recursive: true });
			mkdirSync(path.join(this.vaultRoot, this.vaultThreadsDir), { recursive: true });

			// Bootstrap memory file if missing
			const memoryAbs = path.join(this.vaultRoot, this.vaultMemoryPath);
			mkdirSync(path.dirname(memoryAbs), { recursive: true });
			if (!require("fs").existsSync(memoryAbs)) {
				const today = new Date().toISOString().slice(0, 10);
				writeFileSync(memoryAbs,
					`---\nupdated: ${today}\n---\n\n## Active Topics\n\n## Recent Decisions\n\n## Open Questions\n`,
					"utf8",
				);
			}

			const transcript = formatTranscript(unsaved);
			const prompt = buildPrompt(transcript, this.vaultRoot, this.vaultWriteDir, this.vaultThreadsDir, this.vaultMemoryPath);
			await spawnOneShot(prompt, this.cliPath, this.vaultRoot);
			this.onSaved(history.length);
			console.log("[cv-vault-sync] Sync complete. New savedIndex:", history.length);
		} catch (err) {
			console.error("[cv-vault-sync] Sync failed:", err);
		} finally {
			this.isRunning = false;
		}
	}
}

// ─── Transcript formatting ────────────────────────────────────────────────────

function formatTranscript(events: StoredEvent[]): string {
	const lines: string[] = [];
	for (const e of events) {
		if (e.type === "user_top") {
			lines.push(`[You]\n${e.text}`);
		} else if (e.type === "user_reply") {
			lines.push(`[You — reply]\n${e.text}`);
		} else if (e.type === "agent") {
			lines.push(`[${e.agentName}]\n${e.content}`);
		}
	}
	return lines.join("\n\n---\n\n");
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(transcript: string, vaultRoot: string, vaultWriteDir: string, vaultThreadsDir: string, vaultMemoryPath: string): string {
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }).replace(":", "");
	const timeFormatted = `${time.slice(0, 2)}:${time.slice(2)}`;
	const hour = now.getHours();
	const ampm = hour >= 12 ? "pm" : "am";
	const hour12 = hour % 12 || 12;
	const min = String(now.getMinutes()).padStart(2, "0");
	const streamTime = `${hour12}:${min}${ampm}`;
	const writeDir   = path.join(vaultRoot, vaultWriteDir);
	const threadsDir = path.join(vaultRoot, vaultThreadsDir);
	const memoryFile = path.join(vaultRoot, vaultMemoryPath);

	return `You are capturing insights from a Council conversation into an Obsidian vault. Today is ${date}, time is ${timeFormatted}.

Council is an Obsidian plugin where the user thinks alongside AI agents (Edge, Loom, Ember, Quill). Your job is to distil the conversation into the vault's knowledge structure.

## Vault structure

- **Daily log**: \`${writeDir}/\` — one file per day, named \`${date}.md\`
- **Topics**: \`${threadsDir}/\` — one file per topic, kebab-case filenames (e.g. \`ai-tools.md\`)
- **Memory**: \`${memoryFile}\` — a short index of what's active across topics

## Transcript

<transcript>
${transcript}
</transcript>

## Instructions

### Step 1: Assess significance
If this transcript is purely mechanical, too short (less than 2 substantive exchanges), or contains no developed thinking, print "Nothing to capture." and stop.

### Step 2: Write daily log entries
For each substantive insight, evolved position, or meaningful connection:

Append to \`${writeDir}/${date}.md\`. Create the file if it doesn't exist.

**Day-file format** (create with this frontmatter if new):
\`\`\`markdown
---
type: stream
date: "${date}"
---
# ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
\`\`\`

**Entry format** (append one block per insight):
\`\`\`markdown
---
[${streamTime} | chat]
{1-3 sentences. The developed position or connection — not a summary of the conversation, but the idea that emerged.}
> topic: {topic-slug}
\`\`\`

### Step 3: Route entries to topics
For each entry, search \`${threadsDir}/\` for an existing topic file whose subject matches (check the filename and the \`topic:\` field in frontmatter).

**If a matching topic file exists:** append the entry text under a \`## ${date}\` heading (create the heading if this is the first entry for today).

**If no match exists and the insight has enough substance:** create a new topic file:
\`\`\`markdown
---
topic: {Topic Name}
created: ${date}
updated: ${date}
---
# {Topic Name}

## ${date}
{The entry text}
\`\`\`

**If the topics folder is empty**, that's fine — just create new topic files for each distinct theme.

### Step 4: Update memory index
Read \`${memoryFile}\` and update these three sections:

- **Active Topics** — list each topic touched in this sync, with a one-line summary of the latest position
- **Recent Decisions** — add any decisions or commitments made (keep the 10 most recent across all syncs)
- **Open Questions** — add unresolved questions raised (remove any that were answered)

Update the \`updated:\` date in the frontmatter. Keep the file under 200 lines.

If the memory file only contains the initial template (empty sections), populate it from this sync.

### Step 5: Print summary
\`\`\`
=== council sync ===
Entries: {n} | Topics: {n touched or created}
\`\`\`

Only write daily log entries, topic files, and the memory index. Do not create any other files.`;
}

// ─── One-shot Claude invocation ───────────────────────────────────────────────

function spawnOneShot(prompt: string, cliPath: string, vaultRoot: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const args = [
			"--print",
			"--output-format", "text",
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
			// Log the output for debugging
			try {
				const { readFileSync } = require("fs") as typeof import("fs");
				const out = readFileSync(outFile, "utf8");
				console.log("[cv-vault-sync] Claude output:", out.slice(0, 500));
			} catch { /* noop */ }

			// Cleanup
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
