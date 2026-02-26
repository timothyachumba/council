import { Plugin } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./ChatView";
import { ClaudeService } from "./ClaudeService";
import { SessionStore } from "./SessionStore";
import { DEFAULT_SETTINGS } from "./types";
import type { ClaudeVaultSettings } from "./types";

export default class ClaudeVaultPlugin extends Plugin {
	settings!: ClaudeVaultSettings;
	private claude!: ClaudeService;
	private sessionStore!: SessionStore;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.claude = new ClaudeService();
		this.sessionStore = new SessionStore();

		// Register the chat view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => {
			return new ChatView(
				leaf,
				this.settings,
				() => this.saveSettings(),
				this.claude,
				this.sessionStore,
			);
		});

		// Ribbon icon
		this.addRibbonIcon("message-square", "Claude", () => {
			void this.activateChatView();
		});

		// Command palette
		this.addCommand({
			id: "open-chat",
			name: "Open chat",
			callback: () => void this.activateChatView(),
		});

		this.addCommand({
			id: "new-chat",
			name: "New chat",
			callback: () => void this.newChat(),
		});

		// Restore view in right sidebar if it was previously open
		this.app.workspace.onLayoutReady(() => {
			const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			if (existing.length === 0) return;
			// Already exists — just reveal it
			this.app.workspace.revealLeaf(existing[0]);
		});
	}

	onunload(): void {
		// Don't detach — let the view persist across hot reloads
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ClaudeVaultSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async activateChatView(): Promise<void> {
		const { workspace } = this.app;

		// If already open, reveal it
		const existing = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		// Open in right sidebar
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	private async newChat(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			const view = leaves[0].view as ChatView;
			// Access internal method via cast — we control this class
			(view as unknown as { startNewChat: () => void }).startNewChat?.();
			this.app.workspace.revealLeaf(leaves[0]);
		} else {
			await this.activateChatView();
		}
	}
}
