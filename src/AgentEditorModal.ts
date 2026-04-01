// src/AgentEditorModal.ts

import { App, Modal, Setting } from "obsidian";
import { GRADIENT_PRESETS, gradientToCss } from "./gradientPresets";
import type { AgentConfig } from "./types";

export class AgentEditorModal extends Modal {
	private draft: AgentConfig;
	private onSave: (agent: AgentConfig) => void;

	constructor(
		app: App,
		agent: AgentConfig | null, // null = new agent
		onSave: (agent: AgentConfig) => void,
	) {
		super(app);
		this.onSave = onSave;

		// Clone for editing, or create blank
		if (agent) {
			this.draft = { ...agent };
		} else {
			this.draft = {
				id: `agent-${Date.now()}`,
				name: "",
				description: "",
				state: "watching",
				systemPrompt: "",
				gradientPreset: 0,
			};
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.draft.name ? `Edit ${this.draft.name}` : "New agent");

		// ── Gradient picker ──────────────────────────────────────────────────
		contentEl.createEl("p", { text: "Gradient", cls: "cv-settings-label" });

		// Grid of 20 swatches
		const grid = contentEl.createDiv({ cls: "cv-gradient-grid" });
		GRADIENT_PRESETS.forEach((preset) => {
			const swatch = grid.createDiv({ cls: "cv-gradient-swatch" });
			swatch.style.background = gradientToCss(preset);
			if (preset.id === this.draft.gradientPreset) {
				swatch.addClass("cv-gradient-swatch--selected");
			}
			swatch.addEventListener("click", () => {
				grid.querySelectorAll(".cv-gradient-swatch--selected")
					.forEach((el) => el.removeClass("cv-gradient-swatch--selected"));
				swatch.addClass("cv-gradient-swatch--selected");
				this.draft.gradientPreset = preset.id;
			});
		});

		// ── Name ─────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName("Name")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Critic")
					.setValue(this.draft.name)
					.onChange((value) => { this.draft.name = value; })
			);

		// ── Description ──────────────────────────────────────────────────────
		contentEl.createEl("p", { text: "Description", cls: "cv-settings-label" });
		const descEl = contentEl.createEl("textarea", { cls: "cv-desc-textarea" });
		descEl.value = this.draft.description;
		descEl.rows = 2;
		descEl.placeholder = "Short subtitle shown in the agent panel.";
		descEl.addEventListener("input", () => {
			this.draft.description = descEl.value;
		});

		// ── System prompt ─────────────────────────────────────────────────────
		contentEl.createEl("p", { text: "System prompt", cls: "cv-settings-label" });
		const promptEl = contentEl.createEl("textarea", { cls: "cv-prompt-textarea" });
		promptEl.value = this.draft.systemPrompt;
		promptEl.rows = 10;
		promptEl.placeholder = "Describe this agent's identity, voice, format, and boundaries.";
		promptEl.addEventListener("input", () => {
			this.draft.systemPrompt = promptEl.value;
		});

		// ── Actions ──────────────────────────────────────────────────────────
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						if (!this.draft.name.trim()) {
							return; // name required
						}
						this.onSave({ ...this.draft });
						this.close();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
