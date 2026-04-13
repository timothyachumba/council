import { ItemView, WorkspaceLeaf, Modal, App, setIcon, FileSystemAdapter } from "obsidian";
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
import * as os from "os";
import { getStatusString, getToolPhase } from "./agentStatus";
import { VaultSyncService } from "./VaultSyncService";
import { detectClaudeCli } from "./cliDetector";

export const CHAT_VIEW_TYPE = "council:chat";


export class ChatView extends ItemView {
	private settings: CouncilSettings;
	private saveSettings: () => Promise<void>;
	private claude!: ClaudeService;
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
		sessionStore: SessionStore,
	) {
		super(leaf);
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.sessionStore = sessionStore;
		this.currentSessionId = settings.activeSessionId;
	}

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return "Claude"; }
	getIcon(): string { return "message-square"; }

	/** Called by SettingsTab after agent changes to refresh the carousel live. */
	refreshAgents(): void {
		this.agentPanel.setAgents(this.settings.agents);
	}

	/** Called by SettingsTab after parakeet install to show the voice button. */
	refreshVoice(): void {
		const available = (() => {
			const configured = this.settings.parakeetPath;
			if (configured) return fs.existsSync(configured);
			return fs.existsSync(path.join(os.homedir(), ".local", "bin", "parakeet-mlx"));
		})();
		this.inputBar.setVoiceAvailable(available);
	}

	async onOpen(): Promise<void> {
		const vaultRoot = (this.app.vault.adapter as FileSystemAdapter).basePath;
		const cliPath = this.settings.claudeCliPath ?? "";
		const readDirs = this.settings.vaultReadDirs.length > 0
			? this.settings.vaultReadDirs.map((d) => path.join(vaultRoot, d))
			: [vaultRoot];

		const root = this.contentEl;
		root.empty();
		root.addClass("cv-root");

		const pluginDir = ".obsidian/plugins/council";
		this.assetResolver = (path: string) =>
			this.app.vault.adapter.getResourcePath(`${pluginDir}/${path}`);

		this.agentPanel = new AgentPanel(this.settings.agents, (agents) => {
			this.settings.agents = agents;
			void this.saveSettings();
		});
		this.agentPanel.onStateChange((open) => this.inputBar.setDimmed(open));

		// Voice service
		this.voiceService = new VoiceService(this.settings.parakeetPath);

		// Claude service
		this.claude = new ClaudeService(cliPath, vaultRoot, readDirs);

		// Vault sync service
		this.vaultSync = new VaultSyncService(
			() => this.settings.chatHistory ?? [],
			() => this.settings.lastSavedIndex ?? 0,
			(newIndex) => {
				this.settings.lastSavedIndex = newIndex;
				void this.saveSettings();
			},
			cliPath,
			vaultRoot,
			this.settings.vaultWriteDir   ?? "Stream",
			this.settings.vaultThreadsDir ?? "Threads",
			this.settings.vaultMemoryPath ?? "System/memory.md",
		);

		// Agent orchestrator
		this.orchestrator = new AgentOrchestrator(
			this.settings.agentSessions,
			(agentId, sessionId) => {
				this.settings.agentSessions[agentId] = sessionId;
				void this.saveSettings();
			},
			cliPath,
			vaultRoot,
			readDirs,
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

		// Skip setup card for existing users upgrading — they already have vault configured
		const isExistingUser = (this.settings.chatHistory?.length ?? 0) > 0;
		if (!this.settings.syncSetupDone && !isExistingUser) {
			this.buildSetupCard(messagesEl);
		}
	}

	private buildSetupCard(container: HTMLElement): void {
		const card = container.createDiv({ cls: "cv-setup-card" });

		// Header
		const header = card.createDiv({ cls: "cv-setup-card__header" });
		const iconEl = header.createDiv({ cls: "cv-setup-card__icon" });
		setIcon(iconEl, "archive");
		header.createDiv({ cls: "cv-setup-card__title", text: "Set up Council" });

		// Description
		card.createDiv({
			cls: "cv-setup-card__desc",
			text: "After each conversation, Council writes insights to your daily log. As themes emerge, entries are sorted into topic folders. A memory index tracks what's active across topics. Folders are created if they don't exist — you can change these paths in settings at any time.",
		});

		// Path rows
		const paths = card.createDiv({ cls: "cv-setup-card__paths" });

		const makeRow = (icon: string, label: string, value: string, isFile = false) => {
			const row = paths.createDiv({ cls: "cv-setup-card__path-row" });
			const rowIcon = row.createDiv({ cls: "cv-setup-card__path-icon" });
			setIcon(rowIcon, icon);
			row.createDiv({ cls: "cv-setup-card__path-label", text: label });
			const input = row.createEl("input", { type: "text", cls: "cv-setup-card__path-input" });
			input.value = value;
			input.placeholder = isFile ? "path/to/file.md" : "FolderName";
			return input;
		};

		const streamInput  = makeRow("folder-open", "Daily log", this.settings.vaultWriteDir   ?? "Stream");
		const threadsInput = makeRow("git-branch",  "Topics",    this.settings.vaultThreadsDir  ?? "Threads");
		const memoryInput  = makeRow("file-text",   "Memory",    this.settings.vaultMemoryPath  ?? "System/memory.md", true);

		// Actions
		const actions = card.createDiv({ cls: "cv-setup-card__actions" });

		const skipBtn = actions.createEl("button", { cls: "cv-btn", text: "Skip for now" });
		skipBtn.addEventListener("click", () => {
			this.settings.syncSetupDone = true;
			void this.saveSettings();
			card.remove();
		});

		const confirmBtn = actions.createEl("button", { cls: "cv-btn cv-setup-card__confirm", text: "Set up sync" });
		confirmBtn.addEventListener("click", () => {
			this.settings.vaultWriteDir   = streamInput.value.trim()  || "Stream";
			this.settings.vaultThreadsDir = threadsInput.value.trim() || "Threads";
			this.settings.vaultMemoryPath = memoryInput.value.trim()  || "System/memory.md";
			this.settings.syncSetupDone   = true;

			// Create folders and bootstrap memory file
			const root = (this.app.vault.adapter as FileSystemAdapter).basePath;
			const { mkdirSync, writeFileSync, existsSync } = require("fs") as typeof import("fs");
			const streamPath  = path.join(root, this.settings.vaultWriteDir);
			const threadsPath = path.join(root, this.settings.vaultThreadsDir);
			const memoryAbs   = path.join(root, this.settings.vaultMemoryPath);
			try { mkdirSync(streamPath,                    { recursive: true }); } catch { /* noop */ }
			try { mkdirSync(threadsPath,                   { recursive: true }); } catch { /* noop */ }
			try { mkdirSync(path.dirname(memoryAbs),       { recursive: true }); } catch { /* noop */ }
			if (!existsSync(memoryAbs)) {
				const today = new Date().toISOString().slice(0, 10);
				writeFileSync(memoryAbs,
					`---\nupdated: ${today}\n---\n\n## Active Topics\n\n## Recent Decisions\n\n## Open Questions\n`,
					"utf8",
				);
			}

			void this.saveSettings();
			card.remove();
		});
	}

	private buildInput(root: HTMLElement): void {
		const container = root.createDiv({ cls: "cv-input-container" });
		this.inputBar = new InputBar(container, this.settings.model);
		this.inputBar.setAgents(this.settings.agents, this.assetResolver);
		const parakeetAvailable = (() => {
			const configured = this.settings.parakeetPath;
			if (configured) return fs.existsSync(configured);
			return fs.existsSync(path.join(os.homedir(), ".local", "bin", "parakeet-mlx"));
		})();
		this.inputBar.setVoiceService(this.voiceService, this.settings.voiceAutoSend, parakeetAvailable);
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
			const settingsPath = path.join(
				process.env.HOME ?? "",
				".claude",
				"settings.json",
			);
			let raw = "{}";
			try { raw = fs.readFileSync(settingsPath, "utf8"); } catch { /* noop */ }
			const obj = JSON.parse(raw) as Record<string, unknown>;
			obj.model = model;
			fs.writeFileSync(settingsPath, JSON.stringify(obj, null, 2), "utf8");
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
