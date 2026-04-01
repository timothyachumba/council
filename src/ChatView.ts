import { ItemView, WorkspaceLeaf, Modal, App, setIcon } from "obsidian";
import { ClaudeService } from "./ClaudeService";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { AgentPanel } from "./AgentPanel";
import { SessionStore } from "./SessionStore";
import { VoiceService } from "./VoiceService";
import { AgentOrchestrator } from "./AgentOrchestrator";
import type {
	CouncilSettings,
	ClaudeModel,
	SessionEntry,
	PermissionBlock,
	StoredEvent,
} from "./types";
import { appendStoredEvent, makeEventId } from "./types";
import * as fs from "fs";
import * as path from "path";
import { getStatusString, getToolPhase } from "./agentStatus";
import { VaultSyncService } from "./VaultSyncService";

export const CHAT_VIEW_TYPE = "council:chat";

const SETTINGS_PATH = path.join(
	process.env.HOME ?? "/Users/timothyachumba",
	".claude",
	"settings.json",
);

export class ChatView extends ItemView {
	private settings: CouncilSettings;
	private saveSettings: () => Promise<void>;
	private claude: ClaudeService;
	private sessionStore: SessionStore;

	// UI
	private messageList!: MessageList;
	private inputBar!: InputBar;
	private agentPanel!: AgentPanel;
	private headerEl!: HTMLElement;

	// Services
	private voiceService!: VoiceService;
	private orchestrator!: AgentOrchestrator;
	private vaultSync!: VaultSyncService;
	private assetResolver!: (path: string) => string;

	// State
	private currentSessionId: string | null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: CouncilSettings,
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

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return "Claude"; }
	getIcon(): string { return "message-square"; }

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("cv-root");

		const pluginDir = ".obsidian/plugins/council";
		this.assetResolver = (path: string) =>
			this.app.vault.adapter.getResourcePath(`${pluginDir}/${path}`);

		this.agentPanel = new AgentPanel(this.settings.agents, (agents) => {
			this.settings.agents = agents;
			void this.saveSettings();
		}, this.assetResolver);
		this.agentPanel.onStateChange((open) => this.inputBar.setDimmed(open));

		// Voice service
		this.voiceService = new VoiceService(this.settings.parakeetPath);

		// Vault sync service
		this.vaultSync = new VaultSyncService(
			() => this.settings.chatHistory ?? [],
			() => this.settings.lastSavedIndex ?? 0,
			(newIndex) => {
				this.settings.lastSavedIndex = newIndex;
				void this.saveSettings();
			},
		);

		// Agent orchestrator
		this.orchestrator = new AgentOrchestrator(
			this.settings.agentSessions,
			(agentId, sessionId) => {
				this.settings.agentSessions[agentId] = sessionId;
				void this.saveSettings();
			},
		);

		this.buildHeader(root);
		this.buildMessages(root);
		this.buildInput(root);

		// Replay persisted history
		console.log("[cv-history] onOpen — chatHistory length:", this.settings.chatHistory?.length ?? 0);
		if (this.settings.chatHistory?.length) {
			this.messageList.replay(this.settings.chatHistory, this.assetResolver, (id) => {
				this.settings.chatHistory = (this.settings.chatHistory ?? []).filter((e) => e.id !== id);
				void this.saveSettings();
			});
		}

		// Close panel on outside click
		root.addEventListener("click", (e) => {
			if (!this.agentPanel.isOpen()) return;
			const target = e.target as HTMLElement;
			if (this.headerEl.contains(target)) return;
			if (this.agentPanel.contentEl.contains(target)) return;
			this.agentPanel.close();
		});

		this.inputBar.focus();
	}

	async onClose(): Promise<void> {
		this.claude.abort();
		this.orchestrator.abort();
		this.vaultSync.cancel();
		if (this.voiceService.isRecording) {
			this.voiceService.stopRecording();
		}
	}

	// ─── Layout ──────────────────────────────────────────────────────────

	private buildHeader(root: HTMLElement): void {
		this.headerEl = root.createDiv({ cls: "cv-header" });

		// Bar: menu + spacer + more (48px)
		const bar = this.headerEl.createDiv({ cls: "cv-header__bar" });
		const menuBtn = bar.createDiv({ cls: "cv-icon-btn" });
		setIcon(menuBtn, "menu");
		menuBtn.addEventListener("click", () => this.openSessionModal());
		bar.createDiv({ cls: "cv-header__spacer" });
		const syncBtn = bar.createDiv({ cls: "cv-icon-btn", attr: { title: "Save to vault" } });
		setIcon(syncBtn, "archive");
		syncBtn.addEventListener("click", () => { void this.vaultSync.syncNow(); });
		const moreBtn = bar.createDiv({ cls: "cv-icon-btn" });
		setIcon(moreBtn, "more-horizontal");

		// Avatar group: below bar in DOM, overlays bar via negative margin when closed
		this.headerEl.appendChild(this.agentPanel.avatarGroupEl);

		// Content panel: below avatars, expands when open
		this.headerEl.appendChild(this.agentPanel.contentEl);

		// Now in DOM — start observing width and position avatars
		this.agentPanel.mounted();
	}

	private buildMessages(root: HTMLElement): void {
		const scrollEl = root.createDiv({ cls: "cv-messages-scroll" });
		const messagesEl = scrollEl.createDiv({ cls: "cv-messages" });
		this.messageList = new MessageList(messagesEl, this, this.assetResolver);

		// Wire reply action
		this.messageList.onReply((agentId, agentName) => {
			this.inputBar.setReplyContext(agentId, agentName);
		});
	}

	private buildInput(root: HTMLElement): void {
		const container = root.createDiv({ cls: "cv-input-container" });
		this.inputBar = new InputBar(container, this.settings.model);
		this.inputBar.setAgents(this.settings.agents, this.assetResolver);
		this.inputBar.setVoiceService(this.voiceService, this.settings.voiceAutoSend);
		this.inputBar.onSend((text) => this.handleSend(text));
		this.inputBar.onModelChange((model) => {
			this.settings.model = model;
			this.writeModelToSettings(model);
			void this.saveSettings();
		});
		this.inputBar.onStop(() => {
			this.claude.abort();
			this.orchestrator.abort();
		});
	}

	// ─── Send / receive ──────────────────────────────────────────────────

	private handleSend(text: string): void {
		if (this.claude.isActive() || this.orchestrator.isActive()) return;
		this.vaultSync.resetTimer();

		// Reply stays in thread, new message breaks out
		const isReply = this.inputBar.hasReplyContext();
		const userEventId = makeEventId();
		let userEl: HTMLElement;
		if (isReply) {
			userEl = this.messageList.appendUserMessage(text);
		} else {
			userEl = this.messageList.appendTopLevelMessage(text);
		}

		// Persist to history
		const userEvent: StoredEvent = isReply
			? { type: "user_reply", id: userEventId, text }
			: { type: "user_top", id: userEventId, text };
		this.settings.chatHistory = appendStoredEvent(this.settings.chatHistory ?? [], userEvent);
		console.log("[cv-history] Saving user event, history length:", this.settings.chatHistory.length);
		void this.saveSettings();

		// Attach delete handler for top-level messages (deletes message + thread below)
		if (!isReply) {
			this.messageList.attachDeleteHandler(userEl, () => {
				const thread = userEl.nextElementSibling as HTMLElement | null;
				userEl.remove();
				if (thread?.classList.contains("cv-thread")) thread.remove();
				this.settings.chatHistory = (this.settings.chatHistory ?? []).filter((e) => e.id !== userEventId);
				void this.saveSettings();
			});
		}
		this.inputBar.setEnabled(false);

		const hasWatching = this.settings.agents.some((a) => a.state === "watching");
		const hasDirectMention = /@(\w+)/i.test(text);

		if (hasWatching || hasDirectMention) {
			this.handleAgentPipeline(text);
		} else {
			this.handleDirectChat(text);
		}
	}

	private handleAgentPipeline(text: string): void {
		// Per-agent state: thinking label while working, full card when done
		const agentThinkingEls = new Map<string, HTMLElement>();
		const agentBuffers = new Map<string, string>();
		const agentWritingPhase = new Set<string>();

		this.orchestrator.on("agent-event", ({ agentId, agentName, agentColor, event }) => {
			switch (event.type) {
				case "tool_use": {
					const thinkingEl = agentThinkingEls.get(agentId);
					if (thinkingEl) {
						const phase = getToolPhase(event.name);
						this.messageList.updateAgentThinkingStatus(thinkingEl, getStatusString(agentId, phase));
					}
					break;
				}

				case "text_delta": {
					// Show thinking label on first event from this agent
					if (!agentThinkingEls.has(agentId)) {
						const thinkingEl = this.messageList.showAgentThinking(
							agentId, agentName, agentColor, this.assetResolver,
						);
						agentThinkingEls.set(agentId, thinkingEl);
						agentBuffers.set(agentId, "");
					}
					// Transition to writing phase on first text
					if (!agentWritingPhase.has(agentId)) {
						agentWritingPhase.add(agentId);
						const thinkingEl = agentThinkingEls.get(agentId)!;
						this.messageList.updateAgentThinkingStatus(thinkingEl, getStatusString(agentId, "writing"));
					}
					// Buffer — don't render
					const prev = agentBuffers.get(agentId) ?? "";
					agentBuffers.set(agentId, prev + event.delta);
					break;
				}

				case "text_full": {
					if (!agentThinkingEls.has(agentId)) {
						const thinkingEl = this.messageList.showAgentThinking(
							agentId, agentName, agentColor, this.assetResolver,
						);
						agentThinkingEls.set(agentId, thinkingEl);
					}
					agentBuffers.set(agentId, event.text);
					break;
				}

				case "thinking":
				case "session_id": {
					// Show thinking label when agent starts
					if (!agentThinkingEls.has(agentId)) {
						const thinkingEl = this.messageList.showAgentThinking(
							agentId, agentName, agentColor, this.assetResolver,
						);
						agentThinkingEls.set(agentId, thinkingEl);
					}
					break;
				}

				case "done": {
					// Agent finished — remove thinking, render full card
					const thinkingEl = agentThinkingEls.get(agentId);
					if (thinkingEl) {
						this.messageList.removeAgentThinking(thinkingEl);
						agentThinkingEls.delete(agentId);
					}
					const content = agentBuffers.get(agentId) ?? "";
					if (content.trim()) {
						const card = this.messageList.appendAgentCard(
							agentId, agentName, agentColor, content, this.assetResolver,
						);
						// Persist agent response to history
						const agentEventId = makeEventId();
						const agentEvent: StoredEvent = { type: "agent", id: agentEventId, agentId, agentName, agentColor, content };
						this.settings.chatHistory = appendStoredEvent(this.settings.chatHistory ?? [], agentEvent);
						console.log("[cv-history] Saving agent event, history length:", this.settings.chatHistory.length);
						void this.saveSettings();
						// Attach delete handler
						this.messageList.attachDeleteHandler(card, () => {
							card.remove();
							this.settings.chatHistory = (this.settings.chatHistory ?? []).filter((e) => e.id !== agentEventId);
							void this.saveSettings();
						});
					}
					agentBuffers.delete(agentId);
					break;
				}

				case "permission_prompt": {
					const block: PermissionBlock = {
						kind: "permission",
						id: event.id,
						toolName: event.toolName,
						input: event.input,
					};
					this.messageList.renderPermission(block);
					this.messageList.onPermission(event.id, (answer) => {
						this.orchestrator.respond(agentId, answer);
					});
					break;
				}

				case "error": {
					this.messageList.showError(`${agentName}: ${event.message}`);
					break;
				}
			}
		});

		this.orchestrator.once("all-done", () => {
			// Clean up any remaining thinking labels
			for (const [, el] of agentThinkingEls) {
				this.messageList.removeAgentThinking(el);
			}
			this.orchestrator.removeAllListeners("agent-event");
			this.inputBar.setEnabled(true);
			this.inputBar.focus();
		});

		// Wire reply action
		this.messageList.onReply((agentId, agentName) => {
			this.inputBar.setReplyContext(agentId, agentName);
		});

		void this.orchestrator.processMessage(text, this.settings.agents, this.settings.model);
	}

	private handleDirectChat(text: string): void {
		let textEl: HTMLElement | null = null;
		let textContent = "";

		this.claude.on("event", (event) => {
			switch (event.type) {
				case "session_id": {
					this.currentSessionId = event.sessionId;
					this.settings.activeSessionId = event.sessionId;
					void this.saveSettings();
					break;
				}

				case "tool_use": {
					textEl = null;
					textContent = "";

					if (event.name === "AskUserQuestion") {
						const questions = (event.input.questions as Array<Record<string, unknown>>) ?? [];
						const block = {
							kind: "question" as const,
							id: event.id,
							questions: questions.map((q) => ({
								question: (q.question as string) ?? "",
								header: (q.header as string) ?? "",
								options: ((q.options as Array<Record<string, string>>) ?? []).map((o) => ({
									label: o.label ?? "",
									description: o.description ?? "",
								})),
								multiSelect: (q.multiSelect as boolean) ?? false,
							})),
						};
						this.messageList.renderQuestion(block);
						this.messageList.onQuestion(event.id, (answers) => {
							this.claude.respond(JSON.stringify(answers));
						});
					}
					break;
				}

				case "text_delta": {
					if (!textEl) {
						textEl = this.messageList.appendAssistantText("");
					}
					textContent += event.delta;
					this.messageList.updateAssistantText(textEl, textContent);
					break;
				}

				case "text_full": {
					if (!textEl) {
						textEl = this.messageList.appendAssistantText("");
					}
					textContent = event.text;
					this.messageList.updateAssistantText(textEl, textContent);
					break;
				}

				case "permission_prompt": {
					const block: PermissionBlock = {
						kind: "permission",
						id: event.id,
						toolName: event.toolName,
						input: event.input,
					};
					this.messageList.renderPermission(block);
					this.messageList.onPermission(event.id, (answer) => {
						this.claude.respond(answer);
					});
					break;
				}

				case "compact_boundary": {
					this.messageList.showCompactBoundary();
					break;
				}

				case "error": {
					this.messageList.showError(event.message);
					break;
				}
			}
		});

		this.claude.once("done", () => {
			this.inputBar.setEnabled(true);
			this.inputBar.focus();
			this.claude.removeAllListeners("event");
		});

		this.claude.send(text, this.settings.model, this.currentSessionId);
	}

	// ─── Sessions ────────────────────────────────────────────────────────

	startNewChat(): void {
		this.claude.abort();
		this.currentSessionId = null;
		this.settings.activeSessionId = null;
		this.settings.chatHistory = [];
		void this.saveSettings();
		this.messageList.clear();
		this.inputBar.setEnabled(true);
		this.inputBar.focus();
	}

	private async openSessionModal(): Promise<void> {
		const sessions = await this.sessionStore.getSessions();
		new SessionModal(this.app, sessions, (session) => {
			this.resumeSession(session);
		}).open();
	}

	private resumeSession(session: SessionEntry): void {
		this.claude.abort();
		this.currentSessionId = session.sessionId;
		this.settings.activeSessionId = session.sessionId;
		void this.saveSettings();
		this.messageList.clear();
		this.inputBar.setEnabled(true);
		this.inputBar.focus();
	}

	// ─── Settings ────────────────────────────────────────────────────────

	private writeModelToSettings(model: ClaudeModel): void {
		try {
			let raw = "{}";
			try { raw = fs.readFileSync(SETTINGS_PATH, "utf8"); } catch { /* noop */ }
			const obj = JSON.parse(raw) as Record<string, unknown>;
			obj.model = model;
			fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), "utf8");
		} catch (e) {
			console.error("[claude-vault] Failed to write model to settings.json", e);
		}
	}
}

// ─── Session modal ───────────────────────────────────────────────────────

class SessionModal extends Modal {
	private sessions: SessionEntry[];
	private onSelect: (session: SessionEntry) => void;

	constructor(app: App, sessions: SessionEntry[], onSelect: (s: SessionEntry) => void) {
		super(app);
		this.sessions = sessions;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { cls: "cv-modal-title", text: "Sessions" });

		if (this.sessions.length === 0) {
			contentEl.createDiv({ cls: "cv-modal-empty", text: "No previous sessions found." });
			return;
		}

		const list = contentEl.createDiv({ cls: "cv-session-list" });
		for (const session of this.sessions) {
			const item = list.createDiv({ cls: "cv-session-item" });
			item.createDiv({ cls: "cv-session-item__text", text: session.displayText });
			const meta = item.createDiv({ cls: "cv-session-item__meta" });
			const date = new Date(session.timestamp);
			meta.createSpan({
				cls: "cv-session-item__date",
				text: date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
			});
			item.addEventListener("click", () => { this.onSelect(session); this.close(); });
		}
	}

	onClose(): void { this.contentEl.empty(); }
}
