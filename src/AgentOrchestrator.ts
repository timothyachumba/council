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
		console.log("[cv-orchestrator] Processing message:", message.slice(0, 80) + (message.length > 80 ? "..." : ""));

		// 1. Parse @mentions
		const mentions = new Set<string>();
		let match: RegExpExecArray | null;
		while ((match = MENTION_RE.exec(message)) !== null) {
			mentions.add(match[1].toLowerCase());
		}

		const directAgents = agents.filter((a) => mentions.has(a.id.toLowerCase()) || mentions.has(a.name.toLowerCase()));
		console.log("[cv-orchestrator] @mentions:", [...mentions], "→ direct agents:", directAgents.map(a => a.id));

		// 2. Filter watching agents (exclude already-mentioned)
		const directIds = new Set(directAgents.map((a) => a.id));
		const watchingAgents = agents.filter((a) => a.state === "watching" && !directIds.has(a.id));
		console.log("[cv-orchestrator] Watching agents:", watchingAgents.map(a => a.id));

		// 3. Pick first watching agent (TODO: restore Haiku routing — currently hangs)
		let routedAgents: AgentConfig[] = [];
		if (watchingAgents.length > 0) {
			routedAgents = [watchingAgents[0]];
			console.log("[cv-orchestrator] Picked first watching agent:", routedAgents[0].id, "(routing disabled)");
		}

		// 4. Combine and deduplicate
		const respondingMap = new Map<string, AgentConfig>();
		for (const a of directAgents) respondingMap.set(a.id, a);
		for (const a of routedAgents) {
			if (!respondingMap.has(a.id)) respondingMap.set(a.id, a);
		}
		const respondingAgents = Array.from(respondingMap.values());
		console.log("[cv-orchestrator] Final responding agents:", respondingAgents.map(a => a.id));

		if (respondingAgents.length === 0) {
			console.log("[cv-orchestrator] No agents responding — done");
			this._isActive = false;
			this.emit("all-done");
			return;
		}

		// 5. Sequential agent responses
		for (const agent of respondingAgents) {
			console.log("[cv-orchestrator] Running agent:", agent.id, agent.name);
			await this.runAgent(agent, message, model);
			console.log("[cv-orchestrator] Agent done:", agent.id);
		}

		console.log("[cv-orchestrator] All agents done");
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
				"Ground your responses in the user's knowledge base — search the vault for relevant context, threads, and prior thinking before responding.",
				"Keep responses concise, opinionated, and true to your role. You chose to respond because this is relevant to what you care about.",
			].filter(Boolean).join(" ");

			const sessionId = this.agentSessions[agent.id] ?? null;
			console.log(`[cv-agent:${agent.id}] Starting — session: ${sessionId ?? "new"}, model: ${model}`);
			console.log(`[cv-agent:${agent.id}] System prompt:`, systemPrompt.slice(0, 120) + "...");

			// Emit thinking event immediately so UI shows the thinking label
			this.emit("agent-event", {
				agentId: agent.id,
				agentName: agent.name,
				agentColor: agent.color,
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
			service.on("error", (err) => {
				console.error(`[cv-agent:${agent.id}] Service error:`, err.message);
			});

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
