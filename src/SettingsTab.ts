// src/SettingsTab.ts

import { App, PluginSettingTab, Setting, Notice } from "obsidian";
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

		// ── Claude Setup ─────────────────────────────────────────────────────
		containerEl.createEl("h2", { text: "Claude Setup" });

		let cliStatusEl: HTMLElement;

		new Setting(containerEl)
			.setName("Claude CLI path")
			.setDesc("Path to the claude binary.")
			.addText((text) =>
				text
					.setPlaceholder("/usr/local/bin/claude")
					.setValue(this.plugin.settings.claudeCliPath ?? "")
					.onChange(async (value) => {
						this.plugin.settings.claudeCliPath = value.trim() || null;
						await this.plugin.saveSettings();
						this.updateCliStatus(cliStatusEl, this.plugin.settings.claudeCliPath);
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
							this.display(); // re-render to show updated value
						} else {
							new Notice("Claude CLI not found. Install Claude Code and try again, or enter the path manually.");
						}
					})
			);

		// Status line under CLI setting
		cliStatusEl = containerEl.createDiv({ cls: "cv-settings-cli-status" });
		this.updateCliStatus(cliStatusEl, this.plugin.settings.claudeCliPath);

		new Setting(containerEl)
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

		// ── Vault Access ──────────────────────────────────────────────────────
		containerEl.createEl("h2", { text: "Vault Access" });

		containerEl.createEl("p", {
			text: "Read folders — paths relative to vault root. Claude can read these when responding. Leave empty to use the entire vault.",
			cls: "setting-item-description",
		});

		const readFoldersContainer = containerEl.createDiv({ cls: "cv-settings-list" });
		this.renderReadFolders(readFoldersContainer);

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText("Add folder")
					.onClick(async () => {
						this.plugin.settings.vaultReadDirs.push("");
						await this.plugin.saveSettings();
						this.renderReadFolders(readFoldersContainer);
					})
			);

		new Setting(containerEl)
			.setName("Write destination")
			.setDesc("Folder where sync writes stream entries. Created if it doesn't exist. Relative to vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Stream")
					.setValue(this.plugin.settings.vaultWriteDir ?? "Stream")
					.onChange(async (value) => {
						this.plugin.settings.vaultWriteDir = value.trim() || "Stream";
						await this.plugin.saveSettings();
					})
			);

		// ── Agents ────────────────────────────────────────────────────────────
		containerEl.createEl("h2", { text: "Agents" });

		const agentsContainer = containerEl.createDiv({ cls: "cv-settings-agents" });
		this.renderAgents(agentsContainer);
	}

	private notifyChatView(): void {
		const leaves = this.app.workspace.getLeavesOfType("council:chat");
		for (const leaf of leaves) {
			(leaf.view as ChatView).refreshAgents?.();
		}
	}

	private updateCliStatus(el: HTMLElement, cliPath: string | null): void {
		el.empty();
		if (cliPath) {
			el.createSpan({ text: `✓ ${cliPath}`, cls: "cv-cli-status cv-cli-status--found" });
		} else {
			el.createSpan({ text: "✗ Not found — enter path manually", cls: "cv-cli-status cv-cli-status--missing" });
		}
	}

	private renderReadFolders(container: HTMLElement): void {
		container.empty();
		const dirs = this.plugin.settings.vaultReadDirs;

		dirs.forEach((dir, i) => {
			const row = container.createDiv({ cls: "cv-settings-list-row" });
			const input = row.createEl("input", { type: "text", cls: "cv-settings-list-input" });
			input.value = dir;
			input.placeholder = "e.g. Notes";
			input.addEventListener("change", async () => {
				this.plugin.settings.vaultReadDirs[i] = input.value.trim();
				await this.plugin.saveSettings();
			});

			const removeBtn = row.createEl("button", { text: "×", cls: "cv-settings-list-remove" });
			removeBtn.addEventListener("click", async () => {
				this.plugin.settings.vaultReadDirs.splice(i, 1);
				await this.plugin.saveSettings();
				this.renderReadFolders(container);
			});
		});
	}

	private renderAgents(container: HTMLElement): void {
		container.empty();
		const agents = this.plugin.settings.agents;

		agents.forEach((agent, i) => {
			const row = container.createDiv({ cls: "cv-settings-agent-row" });

			// Gradient swatch
			const swatch = row.createDiv({ cls: "cv-settings-agent-swatch" });
			const preset = GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0];
			swatch.style.background = gradientToCss(preset);

			// Name + description
			const info = row.createDiv({ cls: "cv-settings-agent-info" });
			info.createDiv({ text: agent.name, cls: "cv-settings-agent-name" });
			if (agent.description) {
				info.createDiv({ text: agent.description, cls: "cv-settings-agent-desc" });
			}

			// Edit button
			const editBtn = row.createEl("button", { text: "Edit", cls: "cv-btn" });
			editBtn.addEventListener("click", () => {
				new AgentEditorModal(this.app, agent, async (updated) => {
					this.plugin.settings.agents[i] = updated;
					await this.plugin.saveSettings();
					this.renderAgents(container);
					this.notifyChatView();
				}).open();
			});

			// Delete button
			const deleteBtn = row.createEl("button", { text: "Delete", cls: "cv-btn cv-btn--danger" });
			deleteBtn.addEventListener("click", async () => {
				this.plugin.settings.agents.splice(i, 1);
				await this.plugin.saveSettings();
				this.renderAgents(container);
				this.notifyChatView();
			});
		});

		// Add agent button
		const addBtn = container.createEl("button", { text: "+ Add agent", cls: "cv-btn cv-btn--add" });
		addBtn.addEventListener("click", () => {
			const nextPreset = this.plugin.settings.agents.length % GRADIENT_PRESETS.length;
			new AgentEditorModal(this.app, null, async (newAgent) => {
				newAgent.gradientPreset = nextPreset;
				this.plugin.settings.agents.push(newAgent);
				await this.plugin.saveSettings();
				this.renderAgents(container);
				this.notifyChatView();
			}).open();
		});
	}
}
