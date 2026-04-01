import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync, existsSync } from "fs";
import * as path from "path";
import * as os from "os";
import type { AgentConfig } from "./types";

const RELEVANCE_THRESHOLD = 0.5;

export interface RouteResult {
	agentId: string;
	relevance: number;
	reason: string;
}

export class AgentRouter {
	constructor(private cliPath: string) {}

	async route(message: string, watchingAgents: AgentConfig[]): Promise<RouteResult[]> {
		console.log("[cv-router] Routing message to", watchingAgents.length, "watching agents:", watchingAgents.map(a => a.id));
		if (watchingAgents.length === 0) return [];

		const agentDescriptions = watchingAgents.map((a) =>
			`- id: "${a.id}", name: "${a.name}", description: "${a.description}"${a.prompt ? `, focus: "${a.prompt}"` : ""}`
		).join("\n");

		const systemPrompt = [
			"You are a JSON routing function. Your only output is a JSON array. No text before it, no text after it, no markdown fences.",
			"Score each agent 0.0-1.0 for relevance to the user message. High score means the agent has something genuinely useful to add.",
			"If the message is casual, conversational, or the agents have nothing meaningful to contribute, score all agents below 0.5.",
			"Only scores above 0.5 will trigger a response. When in doubt, score lower.",
			"Output format — exactly this, nothing else: [{\"agentId\": \"id\", \"relevance\": 0.0, \"reason\": \"one phrase\"}]",
		].join(" ");

		const userPrompt = [
			"Agents:",
			agentDescriptions,
			"",
			"User message:",
			message,
		].join("\n");

		const args = [
			"--print",
			"--output-format", "stream-json",
			"--verbose",
			"--bare",   // routing call — skip all project config discovery, faster decision
			"--model", "claude-haiku-4-5-20251001",
			"--append-system-prompt", systemPrompt,
			userPrompt,
		];

		// Same file+tail workaround as ClaudeService (claude doesn't flush to Node pipes)
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "cv-router-"));
		const outFile = path.join(tmpDir, "stream.jsonl");
		const argsFile = path.join(tmpDir, "args.txt");
		const scriptFile = path.join(tmpDir, "run.sh");

		writeFileSync(argsFile, args.map((a) => a + "\0").join(""), "utf8");
		writeFileSync(scriptFile, [
			`#!/bin/bash`,
			`xargs -0 "${this.cliPath}" < "${argsFile}" > "${outFile}" 2>&1 &`,
			`CLAUDE_PID=$!`,
			`tail -f "${outFile}" &`,
			`TAIL_PID=$!`,
			`wait $CLAUDE_PID`,
			`kill $TAIL_PID 2>/dev/null`,
		].join("\n"));

		const env = { ...process.env };
		delete env["CLAUDECODE"];
		delete env["CLAUDE_CODE_ENTRYPOINT"];

		return new Promise((resolve) => {
			const proc = spawn("bash", [scriptFile], { env });

			let stdout = "";

			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			proc.on("close", (code) => {
				console.log("[cv-router] Haiku exited with code", code);

				// Cleanup
				try { unlinkSync(outFile); } catch { /* noop */ }
				try { unlinkSync(argsFile); } catch { /* noop */ }
				try { unlinkSync(scriptFile); } catch { /* noop */ }
				try { rmdirSync(tmpDir); } catch { /* noop */ }

				// Parse stream-json: extract assistant text from result message
				let assistantText = "";
				const lines = stdout.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const msg = JSON.parse(line);
						if (msg.type === "result" && msg.result) {
							assistantText = msg.result;
						} else if (msg.type === "assistant" && msg.message?.content) {
							for (const block of msg.message.content) {
								if (block.type === "text") assistantText = block.text;
							}
						}
					} catch { /* skip non-JSON lines */ }
				}

				console.log("[cv-router] Assistant text:", assistantText.slice(0, 300));

				try {
					// Extract the JSON array regardless of surrounding markdown or text
					const match = assistantText.match(/\[[\s\S]*\]/);
					if (!match) throw new Error("No JSON array found in response");
					const results = JSON.parse(match[0]) as RouteResult[];
					console.log("[cv-router] All scores:", results.map(r => `${r.agentId}: ${r.relevance} (${r.reason})`));
					const sorted = results
						.filter((r) => r.relevance >= RELEVANCE_THRESHOLD)
						.sort((a, b) => b.relevance - a.relevance);
					const winner = sorted.length > 0 ? [sorted[0]] : [];
					console.log("[cv-router] Winner:", winner.length > 0 ? `${winner[0].agentId} (${winner[0].relevance})` : "none — no agent above threshold");
					resolve(winner);
				} catch (err) {
					console.error("[cv-router] Failed to parse response:", assistantText, err);
					resolve(watchingAgents.length > 0 ? [{
						agentId: watchingAgents[0].id,
						relevance: 0.5,
						reason: "routing fallback",
					}] : []);
				}
			});

			proc.on("error", (err) => {
				console.error("[cv-router] Spawn error:", err);
				resolve(watchingAgents.length > 0 ? [{
					agentId: watchingAgents[0].id,
					relevance: 0.5,
					reason: "routing error fallback",
				}] : []);
			});
		});
	}
}
