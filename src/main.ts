import { Plugin, Notice } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./ChatView";
import { SessionStore } from "./SessionStore";
import { DEFAULT_SETTINGS } from "./types";
import type { CouncilSettings } from "./types";
import { AGENT_PROMPTS } from "./agentPrompts";
import { detectClaudeCli } from "./cliDetector";
import { SettingsTab } from "./SettingsTab";
import { GRADIENT_PRESETS, gradientToCss } from "./gradientPresets";

export default class CouncilPlugin extends Plugin {
	settings!: CouncilSettings;
	private sessionStore!: SessionStore;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.sessionStore = new SessionStore();

		// Register the chat view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => {
			return new ChatView(
				leaf,
				this.settings,
				() => this.saveSettings(),
				this.sessionStore,
			);
		});

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon("message-square", "Council", () => {
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

		// Auto-detect Claude CLI if not already set
		if (!this.settings.claudeCliPath) {
			detectClaudeCli().then(async (found) => {
				if (found) {
					this.settings.claudeCliPath = found;
					await this.saveSettings();
					console.log("[cv] Claude CLI found at:", found);
				} else {
					new Notice("Council: Claude CLI not found. Set the path in plugin settings.");
				}
			}).catch(console.error);
		}

		// Restore view in right sidebar if it was previously open
		this.app.workspace.onLayoutReady(() => {
			const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			if (existing.length === 0) return;
			this.app.workspace.revealLeaf(existing[0]);
		});
	}

	onunload(): void {
		// Don't detach — let the view persist across hot reloads
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CouncilSettings>);

		// Seed systemPrompt and clamp gradientPreset for each agent.
		for (const agent of this.settings.agents) {
			if (!agent.systemPrompt && AGENT_PROMPTS[agent.id]) {
				agent.systemPrompt = AGENT_PROMPTS[agent.id];
			}
			if (agent.gradientPreset > 9) {
				agent.gradientPreset = agent.gradientPreset % 10;
			}
		}

		// Migrate stored chat history: replace old hex agentColor values with
		// the current gradient CSS so replayed messages show proper avatars.
		const agentGradientMap = new Map(
			this.settings.agents.map((a) => [
				a.id,
				gradientToCss(GRADIENT_PRESETS[a.gradientPreset] ?? GRADIENT_PRESETS[0]),
			])
		);
		let migrated = false;
		for (const event of this.settings.chatHistory ?? []) {
			// Migrate any stored event that isn't already a gradient CSS string
		if (event.type === "agent" && !event.agentColor.startsWith("radial-gradient")) {
				event.agentColor = agentGradientMap.get(event.agentId) ?? event.agentColor;
				migrated = true;
			}
		}
		if (migrated) await this.saveData(this.settings);
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
