import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { SessionEntry } from "./types";

const HISTORY_PATH = path.join(
	process.env.HOME ?? "/Users/timothyachumba",
	".claude",
	"projects",
);

const VAULT_PATH = "/Users/timothyachumba/vault";

export class SessionStore {
	/**
	 * Read all sessions from ~/.claude/projects/
	 * Each subfolder is a project; inside are session JSONL files.
	 * We filter to sessions whose project path matches the vault.
	 */
	async getSessions(): Promise<SessionEntry[]> {
		const sessions: SessionEntry[] = [];

		// Encode the vault path the same way Claude does (slashes → hyphens)
		const encodedVault = VAULT_PATH.replace(/\//g, "-");

		let projectDirs: string[] = [];
		try {
			projectDirs = fs.readdirSync(HISTORY_PATH);
		} catch {
			return sessions;
		}

		// Find dirs that match the vault path encoding
		const matchingDirs = projectDirs.filter((d) =>
			d.includes(encodedVault) || encodedVault.includes(d)
		);

		// Also include all dirs if none match specifically — show all sessions
		const dirsToScan = matchingDirs.length > 0 ? matchingDirs : projectDirs;

		for (const dir of dirsToScan) {
			const dirPath = path.join(HISTORY_PATH, dir);
			let stat: fs.Stats;
			try {
				stat = fs.statSync(dirPath);
			} catch {
				continue;
			}
			if (!stat.isDirectory()) continue;

			let files: string[] = [];
			try {
				files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
			} catch {
				continue;
			}

			for (const file of files) {
				const sessionId = file.replace(".jsonl", "");
				const filePath = path.join(dirPath, file);
				const entry = await this.readSessionEntry(sessionId, filePath, dir);
				if (entry) sessions.push(entry);
			}
		}

		// Sort by most recent first
		sessions.sort((a, b) => b.timestamp - a.timestamp);
		return sessions;
	}

	private async readSessionEntry(
		sessionId: string,
		filePath: string,
		projectDir: string,
	): Promise<SessionEntry | null> {
		return new Promise((resolve) => {
			let firstUserMessage = "";
			let timestamp = 0;
			let lineCount = 0;

			const rl = readline.createInterface({
				input: fs.createReadStream(filePath),
				crlfDelay: Infinity,
			});

			rl.on("line", (line) => {
				lineCount++;
				if (lineCount > 20) {
					rl.close();
					return;
				}
				try {
					const obj = JSON.parse(line) as Record<string, unknown>;

					// Capture timestamp from first line
					if (lineCount === 1 && obj.timestamp) {
						const ts = obj.timestamp as number | string;
						timestamp = typeof ts === "number" ? ts : Date.parse(ts as string);
					}

					// Capture first user message for display text
					if (!firstUserMessage && obj.type === "user") {
						const msg = obj.message as Record<string, unknown> | undefined;
						if (msg) {
							const content = msg.content;
							if (typeof content === "string") {
								firstUserMessage = content;
							} else if (Array.isArray(content)) {
								const textBlock = (content as Array<Record<string, unknown>>).find(
									(b) => b.type === "text"
								);
								if (textBlock) {
									firstUserMessage = textBlock.text as string ?? "";
								}
							}
						}
					}
				} catch {
					// skip malformed lines
				}
			});

			rl.on("close", () => {
				if (!firstUserMessage && !timestamp) {
					resolve(null);
					return;
				}

				const displayText = firstUserMessage
					? firstUserMessage.slice(0, 60) + (firstUserMessage.length > 60 ? "…" : "")
					: "Session " + sessionId.slice(0, 8);

				const slug = firstUserMessage
					? firstUserMessage
						.toLowerCase()
						.replace(/[^a-z0-9 ]/g, "")
						.split(" ")
						.slice(0, 4)
						.join("-")
					: sessionId.slice(0, 8);

				resolve({
					sessionId,
					slug,
					displayText,
					timestamp: timestamp || Date.now(),
					projectPath: projectDir,
				});
			});

			rl.on("error", () => resolve(null));
		});
	}
}
