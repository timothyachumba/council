import { ItemView, WorkspaceLeaf, Modal, App, setIcon } from "obsidian";
import { ClaudeService } from "./ClaudeService";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { AgentPanel } from "./AgentPanel";
import { SessionStore } from "./SessionStore";
import type {
	ClaudeVaultSettings,
	ClaudeModel,
	SessionEntry,
	ToolUseBlock,
	PermissionBlock,
} from "./types";
import * as fs from "fs";
import * as path from "path";

export const CHAT_VIEW_TYPE = "claude-vault:chat";

const SETTINGS_PATH = path.join(
	process.env.HOME ?? "/Users/timothyachumba",
	".claude",
	"settings.json",
);

export class ChatView extends ItemView {
	private settings: ClaudeVaultSettings;
	private saveSettings: () => Promise<void>;
	private claude: ClaudeService;
	private sessionStore: SessionStore;

	// UI
	private messageList!: MessageList;
	private inputBar!: InputBar;
	private agentPanel!: AgentPanel;
	private headerEl!: HTMLElement;

	// State
	private currentSessionId: string | null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: ClaudeVaultSettings,
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

		const pluginDir = ".obsidian/plugins/claude-vault";
		const resolver = (path: string) =>
			this.app.vault.adapter.getResourcePath(`${pluginDir}/${path}`);

		this.agentPanel = new AgentPanel(this.settings.agents, (agents) => {
			this.settings.agents = agents;
			void this.saveSettings();
		}, resolver);
		this.agentPanel.onStateChange((open) => this.inputBar.setDimmed(open));

		this.buildHeader(root);
		this.buildMessages(root);
		this.buildInput(root);

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
	}

	// ─── Layout ──────────────────────────────────────────────────────────

	private buildHeader(root: HTMLElement): void {
		this.headerEl = root.createDiv({ cls: "cv-header" });

		// Bar: menu + spacer + more (48px)
		const bar = this.headerEl.createDiv({ cls: "cv-header__bar" });
		const menuBtn = bar.createDiv({ cls: "clickable-icon cv-icon-btn" });
		setIcon(menuBtn, "menu");
		menuBtn.addEventListener("click", () => this.openSessionModal());
		bar.createDiv({ cls: "cv-header__spacer" });
		const moreBtn = bar.createDiv({ cls: "clickable-icon cv-icon-btn" });
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
		this.messageList = new MessageList(messagesEl, this);
	}

	private buildInput(root: HTMLElement): void {
		const container = root.createDiv({ cls: "cv-input-container" });
		this.inputBar = new InputBar(container, this.settings.model);
		this.inputBar.onSend((text) => this.handleSend(text));
		this.inputBar.onModelChange((model) => {
			this.settings.model = model;
			this.writeModelToSettings(model);
			void this.saveSettings();
		});
		this.inputBar.onStop(() => {
			this.claude.abort();
		});
	}

	// ─── Send / receive ──────────────────────────────────────────────────

	private handleSend(text: string): void {
		if (this.claude.isActive()) return;

		this.messageList.appendUserMessage(text);
		this.inputBar.setEnabled(false);

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

				case "thinking": {
					if (this.settings.showThinkingTimeline) {
						if (event.partial) {
							this.messageList.updateThinkingText(event.content);
						} else {
							this.messageList.addThinkingText(event.content);
						}
					}
					break;
				}

				case "tool_use": {
					// Summarize any pending thinking before moving on
	
					// New tool after text means a new response segment
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
					} else if (this.settings.showThinkingTimeline) {
						const block: ToolUseBlock = {
							kind: "tool_use",
							id: event.id,
							name: event.name,
							input: event.input,
						};
						this.messageList.addToolToTimeline(block);
					}
					break;
				}

				case "tool_result": {
					this.messageList.updateToolResult(event.toolUseId, event.content, event.isError);
					break;
				}

				case "text_delta": {
					if (this.settings.showThinkingTimeline) this.messageList.completeTimeline();
					if (!textEl) {
						textEl = this.messageList.appendAssistantText("");
					}
					textContent += event.delta;
					this.messageList.updateAssistantText(textEl, textContent);
					break;
				}

				case "text_full": {
					if (this.settings.showThinkingTimeline) this.messageList.completeTimeline();
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
			if (this.settings.showThinkingTimeline) this.messageList.completeTimeline();
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
