import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { realpathSync, mkdtempSync, unlinkSync, rmdirSync } from "fs";
import * as path from "path";
import * as os from "os";
import { StreamParser } from "./StreamParser";
import type { StreamEvent, ClaudeModel } from "./types";

const CLAUDE_BIN = "/Users/timothyachumba/.local/bin/claude";
const VAULT_PATH = realpathSync("/Users/timothyachumba/Vault");

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

		// Unset Claude env vars so the nested-session check doesn't block us
		const env = { ...process.env };
		delete env["CLAUDECODE"];
		delete env["CLAUDE_CODE_ENTRYPOINT"];

		// claude doesn't flush stdout to Node pipes — write to file + tail workaround
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "cv-claude-"));
		const outFile = path.join(tmpDir, "stream.jsonl");

		console.log("[cv-claude] Spawning via file+tail, cwd:", VAULT_PATH);

		// Write args file — one arg per line, read by xargs in the script
		const argsFile = path.join(tmpDir, "args.txt");
		const { writeFileSync } = require("fs") as typeof import("fs");
		writeFileSync(argsFile, args.map((a) => a + "\0").join(""), "utf8");

		const scriptFile = path.join(tmpDir, "run.sh");
		writeFileSync(scriptFile, [
			`#!/bin/bash`,
			`xargs -0 "${CLAUDE_BIN}" < "${argsFile}" > "${outFile}" 2>&1 &`,
			`CLAUDE_PID=$!`,
			`tail -f "${outFile}" &`,
			`TAIL_PID=$!`,
			`wait $CLAUDE_PID`,
			`kill $TAIL_PID 2>/dev/null`,
		].join("\n"));

		const proc = spawn("bash", [scriptFile], {
			cwd: VAULT_PATH,
			env,
		});

		this.activeProcess = proc;
		console.log("[cv-claude] Process PID:", proc.pid);

		let buffer = "";

		proc.stdout.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const events = this.parser.parse(line);
				for (const event of events) {
					this.emit("event", event);
				}
			}
		});

		proc.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8").trim();
			if (text) console.log("[cv-claude] stderr:", text);
		});

		proc.on("close", (code) => {
			if (buffer.trim()) {
				const events = this.parser.parse(buffer);
				for (const event of events) this.emit("event", event);
			}
			buffer = "";
			this.activeProcess = null;
			this.emit("done");

			// Cleanup
			try { unlinkSync(outFile); } catch { /* noop */ }
			try { unlinkSync(scriptFile); } catch { /* noop */ }
			try { rmdirSync(tmpDir); } catch { /* noop */ }

			if (code !== 0 && code !== null && code !== 143) {
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
		const fifo = (this as unknown as { _stdinFifo?: string })._stdinFifo;
		if (fifo) {
			try {
				const { appendFileSync } = require("fs") as typeof import("fs");
				appendFileSync(fifo, answer + "\n");
			} catch (err) {
				console.error("[cv-claude] Failed to write to FIFO:", err);
			}
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
