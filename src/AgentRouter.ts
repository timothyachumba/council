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
		if (watchingAgents.length === 0) return [];

		const agentDescriptions = watchingAgents.map((a) =>
			`- id: "${a.id}", name: "${a.name}", description: "${a.description}"${a.prompt ? `, focus: "${a.prompt}"` : ""}`
		).join("\n");

		const systemPrompt = [
			"You are a routing function. Given a user message and a list of AI agents, score each agent's relevance to the message from 0 to 1.",
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
				"--model", "claude-haiku-4-5-20251001",
				"--append-system-prompt", systemPrompt,
				userPrompt,
			], { env });

			let stdout = "";

			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			proc.on("close", () => {
				try {
					// Strip markdown fences if present
					let cleaned = stdout.trim();
					if (cleaned.startsWith("```")) {
						cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
					}

					const results = JSON.parse(cleaned) as RouteResult[];
					const filtered = results
						.filter((r) => r.relevance >= RELEVANCE_THRESHOLD)
						.sort((a, b) => b.relevance - a.relevance);
					resolve(filtered);
				} catch {
					// If parsing fails, route to all watching agents as fallback
					resolve(watchingAgents.map((a) => ({
						agentId: a.id,
						relevance: 0.5,
						reason: "routing fallback",
					})));
				}
			});

			proc.on("error", () => {
				resolve(watchingAgents.map((a) => ({
					agentId: a.id,
					relevance: 0.5,
					reason: "routing error fallback",
				})));
			});
		});
	}
}
