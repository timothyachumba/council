import { spawn } from "child_process";
import type { AgentConfig } from "./types";

const CLAUDE_BIN = "/Users/timothyachumba/.local/bin/claude";
const RELEVANCE_THRESHOLD = 0.4;

export interface RouteResult {
	agentId: string;
	relevance: number;
	reason: string;
}

export class AgentRouter {
	/**
	 * Score all watching agents against a user message using a single Haiku call.
	 * Returns agents sorted by relevance (descending), filtered by threshold.
	 */
	async route(message: string, watchingAgents: AgentConfig[]): Promise<RouteResult[]> {
		console.log("[cv-router] Routing message to", watchingAgents.length, "watching agents:", watchingAgents.map(a => a.id));
		if (watchingAgents.length === 0) return [];

		const agentDescriptions = watchingAgents.map((a) =>
			`- id: "${a.id}", name: "${a.name}", description: "${a.description}"${a.prompt ? `, focus: "${a.prompt}"` : ""}`
		).join("\n");

		const systemPrompt = [
			"You are a routing function. Given a user message and a list of AI agents, pick the SINGLE most relevant agent to respond.",
			"Score each agent 0-1. Only the highest-scoring agent above 0.4 will respond. If none are relevant, all scores should be below 0.4.",
			"Respond with ONLY a JSON array. No explanation, no markdown.",
			"Format: [{\"agentId\": \"id\", \"relevance\": 0.0, \"reason\": \"brief reason\"}]",
		].join(" ");

		const userPrompt = [
			"Agents:",
			agentDescriptions,
			"",
			"User message:",
			message,
		].join("\n");

		return new Promise((resolve) => {
			const env = { ...process.env };
			delete env["CLAUDECODE"];

			const proc = spawn(CLAUDE_BIN, [
				"--print",
				"--output-format", "stream-json",
				"--model", "claude-haiku-4-5-20251001",
				"--append-system-prompt", systemPrompt,
				userPrompt,
			], { env });

			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			proc.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString("utf8");
			});

			proc.on("close", (code) => {
				console.log("[cv-router] Haiku exited with code", code);
				if (stderr) console.log("[cv-router] stderr:", stderr);

				// Parse stream-json: extract assistant text from result message
				let assistantText = "";
				const lines = stdout.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const msg = JSON.parse(line);
						if (msg.type === "result" && msg.result) {
							// result.content is the full assistant text
							assistantText = msg.result;
						} else if (msg.type === "assistant" && msg.message?.content) {
							// Or extract from message content blocks
							for (const block of msg.message.content) {
								if (block.type === "text") assistantText = block.text;
							}
						}
					} catch { /* skip non-JSON lines */ }
				}

				console.log("[cv-router] Assistant text:", assistantText.slice(0, 300));

				try {
					// Strip markdown fences if present
					let cleaned = assistantText.trim();
					if (cleaned.startsWith("```")) {
						cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
					}

					const results = JSON.parse(cleaned) as RouteResult[];
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
