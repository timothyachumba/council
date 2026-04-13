// src/SettingsTab.ts

import { App, PluginSettingTab, Setting, Notice, setIcon } from "obsidian";
import { existsSync } from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { GRADIENT_PRESETS, gradientToCss } from "./gradientPresets";
import { AgentEditorModal } from "./AgentEditorModal";
import { detectClaudeCli } from "./cliDetector";
import type { CouncilSettings } from "./types";
import type CouncilPlugin from "./main";
import type { ChatView } from "./ChatView";

export class SettingsTab extends PluginSettingTab {
	plugin: CouncilPlugin;

	constructor(app: App, plugin: CouncilPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Model + CLI (no section heading — Model is the only common item) ──
		const topItems = containerEl.createDiv({ cls: "setting-group" })
			.createDiv({ cls: "setting-items" });

		if (!this.plugin.settings.claudeCliPath) {
			new Setting(topItems)
				.setName("Claude CLI path")
				.setDesc("Claude CLI not found. Enter the path manually or click Auto-detect.")
				.addText((text) =>
					text
						.setPlaceholder("/usr/local/bin/claude")
						.setValue("")
						.onChange(async (value) => {
							this.plugin.settings.claudeCliPath = value.trim() || null;
							await this.plugin.saveSettings();
						})
				)
				.addButton((btn) =>
					btn
						.setButtonText("Auto-detect")
						.onClick(async () => {
							btn.setButtonText("Detecting…");
							btn.setDisabled(true);
							const found = await detectClaudeCli();
							btn.setButtonText("Auto-detect");
							btn.setDisabled(false);
							if (found) {
								this.plugin.settings.claudeCliPath = found;
								await this.plugin.saveSettings();
								this.display();
							} else {
								new Notice("Claude CLI not found. Install Claude Code and try again, or enter the path manually.");
							}
						})
				);
		}

		new Setting(topItems)
			.setName("Model")
			.setDesc("Claude model used for chat and agents.")
			.addDropdown((drop) =>
				drop
					.addOption("claude-sonnet-4-6", "Sonnet 4.6")
					.addOption("claude-opus-4-6", "Opus 4.6")
					.addOption("claude-haiku-4-5-20251001", "Haiku 4.5")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value as CouncilSettings["model"];
						await this.plugin.saveSettings();
					})
			);

		// ── Voice ─────────────────────────────────────────────────────────────
		const voiceItems = this.makeSection(containerEl, "Voice");

		const detectedParakeet = this.detectParakeetPath();
		const isInstalled = !!(this.plugin.settings.parakeetPath ?? detectedParakeet);

		if (isInstalled) {
			new Setting(voiceItems)
				.setName("Voice model")
				.setDesc("Powered by parakeet-mlx.")
				.addText((text) => {
					text.setValue("Installed");
					text.inputEl.disabled = true;
					text.inputEl.addClass("cv-status-label");
				});
		} else {
			new Setting(voiceItems)
				.setName("Install voice model")
				.setDesc("Powered by parakeet-mlx. The model (~500 MB) downloads automatically on first use.")
				.addButton((btn) =>
					btn.setButtonText("Install").onClick(() => {
						btn.setButtonText("Installing…");
						btn.setDisabled(true);
						exec("uv tool install parakeet-mlx", (err) => {
							if (err) {
								new Notice("Install failed. Make sure uv is installed: brew install uv");
								btn.setButtonText("Install");
								btn.setDisabled(false);
							} else {
								new Notice("Voice model installed.");
								this.notifyVoiceRefresh();
								this.display();
							}
						});
					})
				);
		}

		new Setting(voiceItems)
			.setName("Auto-send")
			.setDesc("Automatically send the transcribed text without requiring confirmation.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.voiceAutoSend ?? true)
					.onChange(async (value) => {
						this.plugin.settings.voiceAutoSend = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Vault Access ──────────────────────────────────────────────────────
		const vaultItems = this.makeSection(containerEl, "Vault Access", () => {
			this.plugin.settings.vaultReadDirs.push("");
			void this.plugin.saveSettings();
			this.display();
		});

		this.renderReadFolders(vaultItems);

		new Setting(vaultItems)
			.setName("Daily log")
			.setDesc("Where insights are written after each conversation. Relative to vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Stream")
					.setValue(this.plugin.settings.vaultWriteDir ?? "Stream")
					.onChange(async (value) => {
						this.plugin.settings.vaultWriteDir = value.trim() || "Stream";
						await this.plugin.saveSettings();
					})
			);

		new Setting(vaultItems)
			.setName("Topics")
			.setDesc("Where entries are sorted into topic files as themes emerge. Relative to vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Threads")
					.setValue(this.plugin.settings.vaultThreadsDir ?? "Threads")
					.onChange(async (value) => {
						this.plugin.settings.vaultThreadsDir = value.trim() || "Threads";
						await this.plugin.saveSettings();
					})
			);

		new Setting(vaultItems)
			.setName("Memory")
			.setDesc("Tracks active topics, recent decisions, and open questions. Relative to vault root.")
			.addText((text) =>
				text
					.setPlaceholder("System/memory.md")
					.setValue(this.plugin.settings.vaultMemoryPath ?? "System/memory.md")
					.onChange(async (value) => {
						this.plugin.settings.vaultMemoryPath = value.trim() || "System/memory.md";
						await this.plugin.saveSettings();
					})
			);

		// ── Agents ────────────────────────────────────────────────────────────
		const agentItems = this.makeSection(containerEl, "Agents", () => {
			const nextPreset = this.plugin.settings.agents.length % GRADIENT_PRESETS.length;
			new AgentEditorModal(this.app, null, async (newAgent) => {
				newAgent.gradientPreset = nextPreset;
				this.plugin.settings.agents.push(newAgent);
				await this.plugin.saveSettings();
				this.display();
				this.notifyChatView();
			}).open();
		});

		this.renderAgents(agentItems);
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	/** Build a native Obsidian setting-group with optional + button. Returns the .setting-items container. */
	private makeSection(containerEl: HTMLElement, title: string, onAdd?: () => void): HTMLElement {
		const group = containerEl.createDiv({ cls: "setting-group" });

		const heading = group.createDiv({ cls: "setting-item setting-item-heading" });
		heading.createDiv({ cls: "setting-item-info" })
			.createDiv({ cls: "setting-item-name", text: title });

		if (onAdd) {
			const control = heading.createDiv({ cls: "setting-item-control" });
			const btn = control.createEl("button", { cls: "clickable-icon" });
			setIcon(btn, "plus");
			btn.addEventListener("click", onAdd);
		}

		return group.createDiv({ cls: "setting-items" });
	}

	private renderReadFolders(container: HTMLElement): void {
		this.plugin.settings.vaultReadDirs.forEach((dir, i) => {
			new Setting(container)
				.setName(`Read folder ${i + 1}`)
				.addText((text) =>
					text
						.setPlaceholder("e.g. Notes")
						.setValue(dir)
						.onChange(async (value) => {
							this.plugin.settings.vaultReadDirs[i] = value.trim();
							await this.plugin.saveSettings();
						})
				)
				.addButton((btn) =>
					btn.setIcon("trash").onClick(async () => {
						this.plugin.settings.vaultReadDirs.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		});
	}

	private renderAgents(container: HTMLElement): void {
		this.plugin.settings.agents.forEach((agent, i) => {
			const s = new Setting(container)
				.setName(agent.name)
				.setDesc(agent.description ?? "")
				.addButton((btn) =>
					btn.setButtonText("Edit").onClick(() => {
						new AgentEditorModal(this.app, agent, async (updated) => {
							this.plugin.settings.agents[i] = updated;
							await this.plugin.saveSettings();
							this.display();
							this.notifyChatView();
						}).open();
					})
				)
				.addButton((btn) =>
					btn
						.setButtonText("Delete")
						.setClass("cv-btn-delete")
						.onClick(async () => {
							this.plugin.settings.agents.splice(i, 1);
							await this.plugin.saveSettings();
							this.display();
							this.notifyChatView();
						})
				);

			// Gradient swatch injected as its own column before the info block
			const preset = GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0];
			const swatch = createEl("div", { cls: "cv-settings-agent-swatch" });
			swatch.style.background = gradientToCss(preset);
			s.settingEl.prepend(swatch);
		});
	}

	private detectParakeetPath(): string | null {
		const candidate = path.join(os.homedir(), ".local", "bin", "parakeet-mlx");
		return existsSync(candidate) ? candidate : null;
	}


	private notifyChatView(): void {
		const leaves = this.app.workspace.getLeavesOfType("council:chat");
		for (const leaf of leaves) {
			(leaf.view as ChatView).refreshAgents?.();
		}
	}

	private notifyVoiceRefresh(): void {
		const leaves = this.app.workspace.getLeavesOfType("council:chat");
		for (const leaf of leaves) {
			(leaf.view as ChatView).refreshVoice?.();
		}
	}
}
