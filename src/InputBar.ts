import { setIcon } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import type { ClaudeModel } from "./types";
import type { VoiceService } from "./VoiceService";

const COMMANDS_PATH = path.join(
	process.env.HOME ?? "/Users/timothyachumba",
	".claude",
	"commands",
);

const MODELS: Array<{ value: ClaudeModel; label: string }> = [
	{ value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
	{ value: "claude-opus-4-6", label: "Opus 4.6" },
	{ value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export class InputBar {
	private container: HTMLElement;
	private textarea: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private modelLabelEl: HTMLElement;
	private picker: HTMLElement | null = null;
	private commands: string[] = [];
	private sendIconEl!: HTMLElement;
	private onSendCallback: ((text: string) => void) | null = null;
	private onModelChangeCallback: ((model: ClaudeModel) => void) | null = null;
	private onStopCallback: (() => void) | null = null;
	private currentModelIndex = 0;
	private voiceService: VoiceService | null = null;
	private voiceBtnEl!: HTMLElement;
	private voiceAutoSend = true;

	constructor(container: HTMLElement, initialModel: ClaudeModel) {
		this.container = container;
		this.loadCommands();
		this.currentModelIndex = MODELS.findIndex((m) => m.value === initialModel);
		if (this.currentModelIndex === -1) this.currentModelIndex = 0;

		const card = container.createDiv({ cls: "cv-input-card" });

		// ─── Row 1: Textarea ──────────────────────────────────────────
		const row1 = card.createDiv({ cls: "cv-input-row1" });
		this.textarea = row1.createEl("textarea", {
			cls: "cv-input-textarea",
			attr: { placeholder: "What's on your mind?", rows: "1" },
		});

		// ─── Row 2: Actions ───────────────────────────────────────────
		const row2 = card.createDiv({ cls: "cv-input-row2" });

		// Left group: image + attach + model selector
		const left = row2.createDiv({ cls: "cv-input-left" });

		const imageBtn = left.createDiv({ cls: "clickable-icon cv-icon-btn" });
		setIcon(imageBtn, "image");

		const attachBtn = left.createDiv({ cls: "clickable-icon cv-icon-btn" });
		setIcon(attachBtn, "paperclip");

		const modelBtn = left.createDiv({ cls: "cv-model-btn" });
		this.modelLabelEl = modelBtn.createSpan({
			cls: "cv-model-btn__label",
			text: MODELS[this.currentModelIndex].label,
		});
		const chevron = modelBtn.createDiv({ cls: "cv-model-btn__chevron" });
		setIcon(chevron, "chevron-down");
		modelBtn.addEventListener("click", () => this.cycleModel());

		// Right group: settings + send
		const right = row2.createDiv({ cls: "cv-input-right" });

		const settingsBtn = right.createDiv({ cls: "clickable-icon cv-icon-btn" });
		setIcon(settingsBtn, "sliders-horizontal");

		this.voiceBtnEl = right.createDiv({ cls: "clickable-icon cv-icon-btn cv-voice-btn" });
		setIcon(this.voiceBtnEl, "mic");
		this.voiceBtnEl.addEventListener("click", () => this.handleVoiceToggle());

		this.sendBtn = right.createEl("button", {
			cls: "cv-send-btn",
			attr: { "aria-label": "Send" },
		});
		this.sendIconEl = this.sendBtn.createDiv();
		setIcon(this.sendIconEl, "arrow-up");

		this.bindEvents();
	}

	private loadCommands(): void {
		try {
			this.commands = fs
				.readdirSync(COMMANDS_PATH)
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""));
		} catch {
			this.commands = [];
		}
	}

	private bindEvents(): void {
		this.textarea.addEventListener("input", () => {
			this.autoResize();
			this.handleSlashCommand();
		});

		this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				if (this.picker) {
					const highlighted = this.picker.querySelector(".cv-picker-item--active") as HTMLElement | null;
					if (highlighted) { highlighted.click(); return; }
				}
				this.submit();
			}
			if (e.key === "Escape" && this.picker) this.closePicker();
			if (this.picker) {
				if (e.key === "ArrowDown") { e.preventDefault(); this.movePickerSelection(1); }
				else if (e.key === "ArrowUp") { e.preventDefault(); this.movePickerSelection(-1); }
			}
		});

		this.sendBtn.addEventListener("click", () => {
			if (this.sendBtn.hasClass("cv-stop-btn")) {
				this.onStopCallback?.();
			} else {
				this.submit();
			}
		});
	}

	private autoResize(): void {
		this.textarea.style.height = "auto";
		this.textarea.style.height = Math.min(this.textarea.scrollHeight, 160) + "px";
	}

	private cycleModel(): void {
		this.currentModelIndex = (this.currentModelIndex + 1) % MODELS.length;
		const model = MODELS[this.currentModelIndex];
		this.modelLabelEl.textContent = model.label;
		this.onModelChangeCallback?.(model.value);
	}

	// ─── Slash command picker ─────────────────────────────────────────────

	private handleSlashCommand(): void {
		const val = this.textarea.value;
		const cursorPos = this.textarea.selectionStart ?? 0;
		const beforeCursor = val.slice(0, cursorPos);
		const slashIdx = beforeCursor.lastIndexOf("/");
		if (slashIdx === -1) { this.closePicker(); return; }
		const charBefore = beforeCursor[slashIdx - 1];
		if (charBefore !== undefined && charBefore !== " " && charBefore !== "\n") { this.closePicker(); return; }
		const query = beforeCursor.slice(slashIdx + 1).toLowerCase();
		const matches = this.commands.filter((c) => c.toLowerCase().startsWith(query));
		if (matches.length === 0) { this.closePicker(); return; }
		this.showPicker(matches, slashIdx, query.length);
	}

	private showPicker(commands: string[], slashIdx: number, queryLen: number): void {
		this.closePicker();
		const picker = this.container.createDiv({ cls: "cv-picker" });
		this.picker = picker;
		for (let i = 0; i < Math.min(commands.length, 8); i++) {
			const cmd = commands[i];
			const item = picker.createDiv({
				cls: "cv-picker-item" + (i === 0 ? " cv-picker-item--active" : ""),
				text: "/" + cmd,
			});
			item.addEventListener("click", () => {
				this.insertCommand(cmd, slashIdx, queryLen);
				this.closePicker();
				this.textarea.focus();
			});
			item.addEventListener("mouseenter", () => {
				picker.querySelectorAll(".cv-picker-item").forEach((el) => el.removeClass("cv-picker-item--active"));
				item.addClass("cv-picker-item--active");
			});
		}
	}

	private insertCommand(cmd: string, slashIdx: number, queryLen: number): void {
		const val = this.textarea.value;
		const before = val.slice(0, slashIdx);
		const after = val.slice(slashIdx + 1 + queryLen);
		this.textarea.value = before + "/" + cmd + " " + after;
		const newPos = slashIdx + cmd.length + 2;
		this.textarea.setSelectionRange(newPos, newPos);
		this.autoResize();
	}

	private closePicker(): void {
		if (this.picker) { this.picker.remove(); this.picker = null; }
	}

	private movePickerSelection(delta: number): void {
		if (!this.picker) return;
		const items = Array.from(this.picker.querySelectorAll(".cv-picker-item"));
		const activeIdx = items.findIndex((el) => el.hasClass("cv-picker-item--active"));
		const nextIdx = Math.max(0, Math.min(items.length - 1, activeIdx + delta));
		items.forEach((el, i) => {
			if (i === nextIdx) el.addClass("cv-picker-item--active");
			else el.removeClass("cv-picker-item--active");
		});
	}

	private submit(): void {
		const text = this.textarea.value.trim();
		if (!text || !this.onSendCallback) return;
		this.onSendCallback(text);
		this.textarea.value = "";
		this.textarea.style.height = "auto";
		this.closePicker();
	}

	// ─── Voice ────────────────────────────────────────────────────────────

	private handleVoiceToggle(): void {
		if (!this.voiceService) return;

		if (this.voiceService.isRecording) {
			this.voiceService.stopRecording();
		} else {
			void this.voiceService.startRecording();
		}
	}

	// ─── Public API ───────────────────────────────────────────────────────

	setVoiceService(service: VoiceService, autoSend: boolean): void {
		this.voiceService = service;
		this.voiceAutoSend = autoSend;

		service.on("recording", () => {
			this.voiceBtnEl.addClass("cv-voice-btn--recording");
			setIcon(this.voiceBtnEl, "mic");
		});

		service.on("transcribing", () => {
			this.voiceBtnEl.removeClass("cv-voice-btn--recording");
			this.voiceBtnEl.addClass("cv-voice-btn--transcribing");
			setIcon(this.voiceBtnEl, "loader");
		});

		service.on("transcribed", (text: string) => {
			this.voiceBtnEl.removeClass("cv-voice-btn--transcribing");
			setIcon(this.voiceBtnEl, "mic");

			if (this.voiceAutoSend && this.onSendCallback) {
				this.onSendCallback(text);
			} else {
				this.textarea.value += (this.textarea.value ? " " : "") + text;
				this.autoResize();
				this.textarea.focus();
			}
		});

		service.on("error", () => {
			this.voiceBtnEl.removeClass("cv-voice-btn--recording");
			this.voiceBtnEl.removeClass("cv-voice-btn--transcribing");
			setIcon(this.voiceBtnEl, "mic");
		});
	}

	onSend(callback: (text: string) => void): void {
		this.onSendCallback = callback;
	}

	onModelChange(callback: (model: ClaudeModel) => void): void {
		this.onModelChangeCallback = callback;
	}

	setEnabled(enabled: boolean): void {
		this.textarea.disabled = !enabled;
		this.container.toggleClass("cv-input--disabled", !enabled);
		if (enabled) {
			setIcon(this.sendIconEl, "arrow-up");
			this.sendBtn.removeClass("cv-stop-btn");
			this.sendBtn.disabled = false;
		} else {
			setIcon(this.sendIconEl, "square");
			this.sendBtn.addClass("cv-stop-btn");
			this.sendBtn.disabled = false;
		}
	}

	onStop(callback: () => void): void {
		this.onStopCallback = callback;
	}

	setDimmed(dimmed: boolean): void {
		this.container.toggleClass("cv-input--dimmed", dimmed);
	}

	focus(): void {
		this.textarea.focus();
	}
}
