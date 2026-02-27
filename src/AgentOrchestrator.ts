import { EventEmitter } from "events";
import { ClaudeService } from "./ClaudeService";
import { AgentRouter } from "./AgentRouter";
import type { AgentConfig, ClaudeModel, StreamEvent } from "./types";

export interface AgentEvent {
	agentId: string;
	agentName: string;
	agentColor: string;
	event: StreamEvent;
}

export interface OrchestratorEvents {
	"agent-event": (e: AgentEvent) => void;
	"all-done": () => void;
}

export declare interface AgentOrchestrator {
	on<K extends keyof OrchestratorEvents>(event: K, listener: OrchestratorEvents[K]): this;
	emit<K extends keyof OrchestratorEvents>(event: K, ...args: Parameters<OrchestratorEvents[K]>): boolean;
}

const MENTION_RE = /@(\w+)/gi;

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

	isActive(): boolean {
		return this._isActive;
	}

	/**
	 * Process a user message through the agent pipeline.
	 * 1. Parse @mentions for direct agents
	 * 2. Route message to watching agents via Haiku
	 * 3. Sequentially send to each responding agent
	 */
	async processMessage(
		message: string,
		agents: AgentConfig[],
		model: ClaudeModel,
	): Promise<void> {
		this._isActive = true;

		// 1. Parse @mentions
		const mentions = new Set<string>();
		let match: RegExpExecArray | null;
		while ((match = MENTION_RE.exec(message)) !== null) {
			mentions.add(match[1].toLowerCase());
		}

		const directAgents = agents.filter((a) => mentions.has(a.id.toLowerCase()) || mentions.has(a.name.toLowerCase()));

		// 2. Filter watching agents (exclude already-mentioned)
		const directIds = new Set(directAgents.map((a) => a.id));
		const watchingAgents = agents.filter((a) => a.state === "watching" && !directIds.has(a.id));

		// 3. Route watching agents
		let routedAgents: AgentConfig[] = [];
		if (watchingAgents.length > 0) {
			const results = await this.router.route(message, watchingAgents);
			const routedIds = new Set(results.map((r) => r.agentId));
			routedAgents = watchingAgents.filter((a) => routedIds.has(a.id));
		}

		// 4. Combine and deduplicate
		const respondingMap = new Map<string, AgentConfig>();
		for (const a of directAgents) respondingMap.set(a.id, a);
		for (const a of routedAgents) {
			if (!respondingMap.has(a.id)) respondingMap.set(a.id, a);
		}
		const respondingAgents = Array.from(respondingMap.values());

		if (respondingAgents.length === 0) {
			this._isActive = false;
			this.emit("all-done");
			return;
		}

		// 5. Sequential agent responses
		for (const agent of respondingAgents) {
			await this.runAgent(agent, message, model);
		}

		this._isActive = false;
		this.emit("all-done");
	}

	private runAgent(agent: AgentConfig, message: string, model: ClaudeModel): Promise<void> {
		return new Promise((resolve) => {
			let service = this.agentServices.get(agent.id);
			if (!service) {
				service = new ClaudeService();
				this.agentServices.set(agent.id, service);
			}

			const systemPrompt = [
				`You are ${agent.name}. ${agent.description}.`,
				agent.prompt ? `You care about: ${agent.prompt}.` : "",
				"Keep responses concise and focused. You are one of several agents responding to the user.",
			].filter(Boolean).join(" ");

			const sessionId = this.agentSessions[agent.id] ?? null;

			const onEvent = (event: StreamEvent) => {
				if (event.type === "session_id") {
					this.agentSessions[agent.id] = event.sessionId;
					this.onSessionUpdate(agent.id, event.sessionId);
				}
				this.emit("agent-event", {
					agentId: agent.id,
					agentName: agent.name,
					agentColor: agent.color,
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

			service.send(message, model, sessionId, systemPrompt);
		});
	}

	/** Respond to a permission prompt for a specific agent */
	respond(agentId: string, answer: "y" | "n"): void {
		const service = this.agentServices.get(agentId);
		if (service) service.respond(answer);
	}

	abort(): void {
		for (const service of this.agentServices.values()) {
			service.abort();
		}
		this._isActive = false;
	}
}
