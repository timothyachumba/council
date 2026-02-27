import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { StreamParser } from "./StreamParser";
import type { StreamEvent, ClaudeModel } from "./types";

const CLAUDE_BIN = "/Users/timothyachumba/.local/bin/claude";
const VAULT_PATH = "/Users/timothyachumba/vault";

export interface ClaudeServiceEvents {
	event: (e: StreamEvent) => void;
	error: (err: Error) => void;
	done: () => void;
}

export declare interface ClaudeService {
	on<K extends keyof ClaudeServiceEvents>(event: K, listener: ClaudeServiceEvents[K]): this;
	emit<K extends keyof ClaudeServiceEvents>(event: K, ...args: Parameters<ClaudeServiceEvents[K]>): boolean;
}

export class ClaudeService extends EventEmitter {
	private parser = new StreamParser();
	private activeProcess: ChildProcess | null = null;

	/**
	 * Send a message to Claude. Spawns a new claude --print process.
	 * If sessionId is provided, resumes that session; otherwise starts a new one.
	 */
	send(message: string, model: ClaudeModel, sessionId: string | null, systemPrompt?: string): void {
		// Kill any existing process
		this.abort();

		const args = [
			"--print",
			"--output-format", "stream-json",
			"--verbose",
			"--include-partial-messages",
			"--add-dir", VAULT_PATH,
			"--model", model,
		];

		if (sessionId) {
			args.push("--resume", sessionId);
		}

		if (systemPrompt) {
			args.push("--append-system-prompt", systemPrompt);
		}

		args.push(message);

		// Unset CLAUDECODE so the nested-session check doesn't block us
		const env = { ...process.env };
		delete env["CLAUDECODE"];

		const proc = spawn(CLAUDE_BIN, args, {
			cwd: VAULT_PATH,
			env,
		});

		this.activeProcess = proc;


		let buffer = "";

		if (!proc.stdout) return;

		proc.stdout.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			const lines = buffer.split("\n");
			// Keep the last (potentially incomplete) line in the buffer
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const events = this.parser.parse(line);
				for (const event of events) {
					// Close stdin once the result line arrives so the process can exit.
					// stdin must stay open until this point so respond() can write to it.
					if (event.type === "done") {
						proc.stdin?.end();
					}
					this.emit("event", event);
				}
			}
		});

		proc.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8").trim();
			if (text) this.emit("error", new Error(text));
		});

		proc.on("close", (code) => {
			// Flush remaining buffer
			if (buffer.trim()) {
				const events = this.parser.parse(buffer);
				for (const event of events) this.emit("event", event);
			}
			buffer = "";
			this.activeProcess = null;
			this.emit("done");

			if (code !== 0 && code !== null) {
				this.emit("error", new Error(`claude exited with code ${code}`));
			}
		});

		proc.on("error", (err) => {
			this.emit("error", err);
		});
	}

	/**
	 * Write a response to an active process stdin (for permission prompts).
	 * Claude Code reads "y" or "n" from stdin when a permission is pending.
	 */
	respond(answer: "y" | "n"): void {
		if (this.activeProcess?.stdin) {
			this.activeProcess.stdin.write(answer + "\n");
		}
	}

	/**
	 * Kill the active process if any.
	 */
	abort(): void {
		if (this.activeProcess) {
			this.activeProcess.kill("SIGTERM");
			this.activeProcess = null;
		}
	}

	isActive(): boolean {
		return this.activeProcess !== null;
	}

}
