import { setIcon } from "obsidian";
import { animate } from "motion";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ClaudeModel, AgentConfig } from "./types";
import type { VoiceService } from "./VoiceService";
import { GRADIENT_PRESETS, primaryColor } from "./gradientPresets";

const COMMANDS_PATH = path.join(
	process.env.HOME ?? os.homedir(),
	".claude",
	"commands",
);

const MODELS: Array<{ value: ClaudeModel; label: string }> = [
	{ value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
	{ value: "claude-opus-4-6", label: "Opus 4.6" },
	{ value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

type InputPhase = "idle" | "recording" | "processing";

const SPRING = { type: "spring" as const, stiffness: 400, damping: 35 };
const SPRING_FAST = { type: "spring" as const, stiffness: 500, damping: 40 };

const WAVEFORM_BAR_MIN = 4;
const WAVEFORM_BAR_MAX = 26;
const WAVEFORM_TICK_MS = 80;
const WAVEFORM_MAX_BARS = 60;

export class InputBar {
	private container: HTMLElement;
	private cardEl!: HTMLElement;
	private row1El!: HTMLElement;
	private row2El!: HTMLElement;
	private leftGroupEl!: HTMLElement;
	private rightGroupEl!: HTMLElement;
	private textarea: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private sendIconEl!: HTMLElement;
	private modelLabelEl: HTMLElement;
	private picker: HTMLElement | null = null;
	private commands: string[] = [];
	private voiceBtnEl!: HTMLElement;

	// Callbacks
	private onSendCallback: ((text: string) => void) | null = null;
	private onModelChangeCallback: ((model: ClaudeModel) => void) | null = null;
	private onStopCallback: (() => void) | null = null;
	private currentModelIndex = 0;

	// Voice
	private voiceService: VoiceService | null = null;
	private voiceAutoSend = true;

	// Phase state machine
	private phase: InputPhase = "idle";
	private demoMode = false;

	// Agents (for @mention completion)
	private agents: AgentConfig[] = [];
	private assetResolver: ((path: string) => string) | null = null;

	// Reply context
	private replyChipEl: HTMLElement | null = null;
	private replyAgentId: string | null = null;
	private replyAgentName: string | null = null;

	// Recording UI (created/destroyed per recording)
	private recordingRowEl: HTMLElement | null = null;
	private waveformEl: HTMLElement | null = null;
	private timerEl: HTMLElement | null = null;
	private recordingSendBtn: HTMLElement | null = null;
	private recordingSendIconEl: HTMLElement | null = null;
	private recordingStartTime = 0;
	private timerInterval: ReturnType<typeof setInterval> | null = null;
	private waveformInterval: ReturnType<typeof setInterval> | null = null;

	constructor(container: HTMLElement, initialModel: ClaudeModel) {
		this.container = container;
		this.loadCommands();
		this.currentModelIndex = MODELS.findIndex((m) => m.value === initialModel);
		if (this.currentModelIndex === -1) this.currentModelIndex = 0;

		this.cardEl = container.createDiv({ cls: "cv-input-card" });

		// ─── Row 1: Textarea ──────────────────────────────────────────
		this.row1El = this.cardEl.createDiv({ cls: "cv-input-row1" });
		this.textarea = this.row1El.createEl("textarea", {
			cls: "cv-input-textarea",
			attr: { placeholder: "What's on your mind?", rows: "1" },
		});

		// ─── Row 2: Actions ───────────────────────────────────────────
		this.row2El = this.cardEl.createDiv({ cls: "cv-input-row2" });

		// Left group: commands + image + attach + model selector
		this.leftGroupEl = this.row2El.createDiv({ cls: "cv-input-left" });

		const commandsBtn = this.leftGroupEl.createDiv({ cls: "cv-icon-btn" });
		setIcon(commandsBtn, "zap");

		const imageBtn = this.leftGroupEl.createDiv({ cls: "cv-icon-btn" });
		setIcon(imageBtn, "image");

		const attachBtn = this.leftGroupEl.createDiv({ cls: "cv-icon-btn" });
		setIcon(attachBtn, "paperclip");

		const modelBtn = this.leftGroupEl.createDiv({ cls: "cv-icon-btn cv-model-btn" });
		this.modelLabelEl = modelBtn.createSpan({
			cls: "cv-model-btn__label",
			text: MODELS[this.currentModelIndex].label,
		});
		const chevron = modelBtn.createDiv({ cls: "cv-model-btn__chevron" });
		setIcon(chevron, "chevron-down");
		modelBtn.addEventListener("click", () => this.cycleModel());

		// Right group: voice + send
		this.rightGroupEl = this.row2El.createDiv({ cls: "cv-input-right" });

		this.voiceBtnEl = this.rightGroupEl.createDiv({ cls: "cv-icon-btn cv-voice-btn" });
		setIcon(this.voiceBtnEl, "audio-lines");
		this.voiceBtnEl.addEventListener("click", () => this.handleVoiceToggle());

		this.sendBtn = this.rightGroupEl.createEl("button", {
			cls: "cv-icon-btn cv-send-btn",
			attr: { "aria-label": "Send" },
		});
		this.sendIconEl = this.sendBtn.createDiv();
		setIcon(this.sendIconEl, "arrow-up");

		// Send button starts hidden
		this.sendBtn.style.display = "none";
		this.sendBtn.style.opacity = "0";

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
			if (!this.picker) this.handleMentionCompletion();
			this.updateSendState();
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

	private updateSendState(): void {
		const hasText = this.textarea.value.trim().length > 0;
		const isHidden = this.sendBtn.style.display === "none";

		if (hasText && isHidden) {
			this.sendBtn.style.display = "flex";
			this.sendBtn.addClass("cv-send-btn--active");
			animate(this.sendBtn, { opacity: 1, scale: 1 }, SPRING_FAST);
		} else if (!hasText && !isHidden) {
			this.sendBtn.removeClass("cv-send-btn--active");
			const ctrl = animate(this.sendBtn, { opacity: 0, scale: 0.8 }, SPRING_FAST);
			ctrl.then(() => {
				if (this.textarea.value.trim().length === 0) {
					this.sendBtn.style.display = "none";
				}
			});
		}
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
		this.showUnifiedPicker(
			commands.slice(0, 8).map((cmd) => ({
				renderLeft: (el: HTMLElement) => {
					const iconEl = el.createDiv({ cls: "cv-picker-item__icon" });
					setIcon(iconEl, "zap");
					el.createSpan({ cls: "cv-picker-item__name cv-picker-item__name--mono", text: "/" + cmd });
				},
				onSelect: () => this.insertCommand(cmd, slashIdx, queryLen),
			})),
		);
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

	// ─── Shared picker ────────────────────────────────────────────────────

	private showUnifiedPicker(items: Array<{
		renderLeft: (el: HTMLElement) => void;
		renderRight?: (el: HTMLElement) => void;
		onSelect: () => void;
	}>): void {
		this.closePicker();
		const picker = this.container.createDiv({ cls: "cv-picker" });
		this.picker = picker;
		items.forEach((item, i) => {
			const row = picker.createDiv({
				cls: "cv-picker-item" + (i === 0 ? " cv-picker-item--active" : ""),
			});
			const left = row.createDiv({ cls: "cv-picker-item__left" });
			item.renderLeft(left);
			if (item.renderRight) {
				const right = row.createDiv({ cls: "cv-picker-item__right" });
				item.renderRight(right);
			}
			row.addEventListener("click", () => {
				item.onSelect();
				this.closePicker();
				this.textarea.focus();
			});
			row.addEventListener("mouseenter", () => {
				picker.querySelectorAll(".cv-picker-item").forEach((el) => el.removeClass("cv-picker-item--active"));
				row.addClass("cv-picker-item--active");
			});
		});
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

	// ─── @mention completion ──────────────────────────────────────────────

	private handleMentionCompletion(): void {
		const val = this.textarea.value;
		const cursorPos = this.textarea.selectionStart ?? 0;
		const beforeCursor = val.slice(0, cursorPos);
		const atIdx = beforeCursor.lastIndexOf("@");
		if (atIdx === -1) { this.closePicker(); return; }
		const charBefore = beforeCursor[atIdx - 1];
		if (charBefore !== undefined && !/\s/.test(charBefore)) { this.closePicker(); return; }
		const afterAt = beforeCursor.slice(atIdx + 1);
		if (/\s/.test(afterAt)) { this.closePicker(); return; }
		const query = afterAt.toLowerCase();
		const matches = this.agents.filter(
			(a) => a.name.toLowerCase().startsWith(query) || a.id.toLowerCase().startsWith(query),
		);
		if (matches.length === 0) { this.closePicker(); return; }
		this.showMentionPicker(matches, atIdx, afterAt.length);
	}

	private showMentionPicker(agents: AgentConfig[], atIdx: number, queryLen: number): void {
		this.showUnifiedPicker(
			agents.map((agent) => ({
				renderLeft: (el: HTMLElement) => {
					const avatar = el.createDiv({ cls: "cv-picker-item__avatar" });
					if (this.assetResolver) {
						avatar.createEl("img", {
							attr: { src: this.assetResolver(`assets/${agent.id}.png`), alt: "" },
						});
					}
					const name = el.createSpan({ cls: "cv-picker-item__name", text: agent.name });
					name.style.color = primaryColor(GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0]);
				},
				renderRight: (el: HTMLElement) => {
					el.createSpan({ cls: "cv-picker-item__desc", text: agent.description });
				},
				onSelect: () => this.insertMention(agent, atIdx, queryLen),
			})),
		);
	}

	private insertMention(agent: AgentConfig, atIdx: number, queryLen: number): void {
		const val = this.textarea.value;
		const before = val.slice(0, atIdx);
		const after = val.slice(atIdx + 1 + queryLen);
		const mention = `@${agent.name} `;
		this.textarea.value = before + mention + after;
		const newPos = atIdx + mention.length;
		this.textarea.setSelectionRange(newPos, newPos);
		this.autoResize();
		this.updateSendState();
	}

	private submit(): void {
		let text = this.textarea.value.trim();
		if (!text || !this.onSendCallback) return;

		// Prepend @mention if replying to a specific agent
		const isReply = !!this.replyAgentName;
		if (this.replyAgentName) {
			text = `@${this.replyAgentName} ${text}`;
		}

		this.onSendCallback(text);
		if (isReply) this.clearReplyContext();
		this.textarea.value = "";
		this.textarea.style.height = "auto";
		this.closePicker();
		this.updateSendState();
	}

	// ─── Voice: Phase transitions ─────────────────────────────────────────

	private handleVoiceToggle(): void {
		if (this.phase !== "idle") return;
		if (!this.demoMode && !this.voiceService) return;
		void this.enterRecordingPhase();
	}

	private async enterRecordingPhase(): Promise<void> {
		this.phase = "recording";

		// Measure current card height
		const fromHeight = this.cardEl.offsetHeight;

		// Start mic setup AND exit animation in parallel, wait for both
		const exitTarget = { opacity: 0 };
		await Promise.all([
			this.voiceService?.startRecording() ?? Promise.resolve(),
			animate(this.row1El, exitTarget, SPRING_FAST).finished,
			animate(this.row2El, exitTarget, SPRING_FAST).finished,
		]);

		// Hide exited elements (row2 has padding so must be fully hidden)
		this.row1El.style.display = "none";
		this.row2El.style.display = "none";

		// Build recording row
		this.buildRecordingRow();

		// Measure new card height, then animate from old to new
		const toHeight = this.cardEl.offsetHeight;
		this.cardEl.style.height = `${fromHeight}px`;
		this.cardEl.style.overflow = "hidden";
		animate(this.cardEl, { height: `${toHeight}px` }, SPRING).finished.then(() => {
			this.cardEl.style.height = "";
			this.cardEl.style.overflow = "";
		});

		// Animate in recording elements with stagger
		const els = [
			this.recordingRowEl!.querySelector(".cv-recording-cancel")!,
			this.waveformEl!,
			this.timerEl!,
			this.recordingSendBtn!,
		] as HTMLElement[];

		els.forEach((el, i) => {
			el.style.opacity = "0";
			animate(el, { opacity: 1 }, { ...SPRING, delay: i * 0.04 });
		});

		// Start waveform + timer
		this.startWaveform();
		this.startTimer();
	}

	private buildRecordingRow(): void {
		this.recordingRowEl = this.cardEl.createDiv({ cls: "cv-recording-row" });

		// Cancel button
		const cancelBtn = this.recordingRowEl.createDiv({ cls: "cv-icon-btn cv-recording-cancel" });
		setIcon(cancelBtn, "x");
		cancelBtn.addEventListener("click", () => this.cancelRecording());

		// Waveform container
		this.waveformEl = this.recordingRowEl.createDiv({ cls: "cv-waveform" });
		this.prefillIdleBars();

		// Timer
		this.timerEl = this.recordingRowEl.createDiv({ cls: "cv-recording-timer" });
		this.timerEl.textContent = "00:00";

		// Send button (accent)
		this.recordingSendBtn = this.recordingRowEl.createEl("button", {
			cls: "cv-icon-btn cv-send-btn cv-send-btn--active",
			attr: { "aria-label": "Send" },
		});
		this.recordingSendIconEl = this.recordingSendBtn.createDiv();
		setIcon(this.recordingSendIconEl, "arrow-up");
		this.recordingSendBtn.addEventListener("click", () => this.finishRecording());
	}

	private waveformBars: { el: HTMLElement; x: number }[] = [];
	private waveformRafId: number | null = null;
	private waveformLastBarTime = 0;
	private waveformLastFrameTime = 0;
	private waveformNextX = 0;

	private prefillIdleBars(): void {
		if (!this.waveformEl) return;
		const containerWidth = this.waveformEl.offsetWidth;
		const barStep = 2 + 3;
		const count = Math.floor(containerWidth / barStep);

		// Position idle bars so they fill from the right edge
		const startX = containerWidth - count * barStep;
		for (let i = 0; i < count; i++) {
			const x = startX + i * barStep;
			const bar = this.waveformEl.createDiv({ cls: "cv-waveform-bar cv-waveform-bar--idle" });
			bar.style.height = `${WAVEFORM_BAR_MIN}px`;
			bar.style.left = `${x}px`;
			this.waveformBars.push({ el: bar, x });
		}
		// Next new bar spawns just inside the right edge so it's immediately visible
		this.waveformNextX = containerWidth - barStep;
	}

	private startWaveform(): void {
		const barStep = 2 + 3;
		const speed = barStep / WAVEFORM_TICK_MS; // px per ms
		const containerWidth = this.waveformEl?.offsetWidth ?? 0;
		const spawnX = containerWidth - barStep; // fixed spawn point at right edge

		this.waveformLastBarTime = performance.now();
		this.waveformLastFrameTime = performance.now();

		const tick = (now: number) => {
			if (!this.waveformEl) return;

			const dt = now - this.waveformLastFrameTime;
			this.waveformLastFrameTime = now;
			const shift = speed * dt;

			// Move all bars left
			for (const entry of this.waveformBars) {
				entry.x -= shift;
				entry.el.style.left = `${entry.x}px`;
			}

			// Append a new bar every WAVEFORM_TICK_MS
			if (now - this.waveformLastBarTime >= WAVEFORM_TICK_MS) {
				this.waveformLastBarTime = now;

				const amplitude = this.voiceService?.getAmplitude() ?? 0;
				const height = WAVEFORM_BAR_MIN + amplitude * (WAVEFORM_BAR_MAX - WAVEFORM_BAR_MIN);

				const bar = document.createElement("div");
				bar.className = "cv-waveform-bar cv-waveform-bar--active";
				bar.style.height = `${Math.round(height)}px`;
				bar.style.left = `${spawnX}px`;
				this.waveformEl.appendChild(bar);
				this.waveformBars.push({ el: bar, x: spawnX });
			}

			// Remove bars that have scrolled off the left
			while (this.waveformBars.length > 0 && this.waveformBars[0].x < -5) {
				this.waveformBars[0].el.remove();
				this.waveformBars.shift();
			}

			this.waveformRafId = requestAnimationFrame(tick);
		};

		this.waveformRafId = requestAnimationFrame(tick);
	}

	private stopWaveform(): void {
		if (this.waveformInterval) {
			clearInterval(this.waveformInterval);
			this.waveformInterval = null;
		}
		if (this.waveformRafId) {
			cancelAnimationFrame(this.waveformRafId);
			this.waveformRafId = null;
		}
	}

	private startTimer(): void {
		this.recordingStartTime = Date.now();
		this.timerInterval = setInterval(() => {
			if (!this.timerEl) return;
			const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
			const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
			const secs = String(elapsed % 60).padStart(2, "0");
			this.timerEl.textContent = `${mins}:${secs}`;
		}, 1000);
	}

	private stopTimer(): void {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	private finishRecording(): void {
		if (this.phase !== "recording") return;
		this.phase = "processing";

		this.voiceService?.stopRecording();
		this.stopWaveform();
		this.stopTimer();

		// Swap send icon to animated dots
		if (this.recordingSendIconEl) {
			this.recordingSendIconEl.empty();
			const dots = this.recordingSendIconEl.createDiv({ cls: "cv-dots" });
			dots.createDiv({ cls: "cv-dot" });
			dots.createDiv({ cls: "cv-dot" });
			dots.createDiv({ cls: "cv-dot" });
		}

		if (this.demoMode) {
			// Simulate transcription delay then send fake text
			setTimeout(() => {
				void this.exitRecordingPhase().then(() => {
					if (this.onSendCallback) {
						this.onSendCallback("[demo] This is a simulated voice transcription.");
					}
				});
			}, 1500);
		}
	}

	private showRecordingError(message: string): void {
		this.stopWaveform();
		this.stopTimer();

		// Replace waveform + timer with error text
		if (this.waveformEl) {
			this.waveformEl.empty();
			this.waveformEl.addClass("cv-waveform--error");
			this.waveformEl.textContent = message || "Something went wrong";
		}
		if (this.timerEl) {
			this.timerEl.style.display = "none";
		}

		// Swap send dots back to dismiss
		if (this.recordingSendIconEl) {
			this.recordingSendIconEl.empty();
			setIcon(this.recordingSendIconEl, "x");
		}
		if (this.recordingSendBtn) {
			this.recordingSendBtn.removeClass("cv-send-btn--active");
			this.recordingSendBtn.addEventListener("click", () => {
				void this.exitRecordingPhase();
			}, { once: true });
		}

		// Auto-dismiss after 5 seconds
		setTimeout(() => {
			if (this.phase === "processing") {
				void this.exitRecordingPhase();
			}
		}, 5000);
	}

	private cancelRecording(): void {
		this.voiceService?.stopRecording();
		this.stopWaveform();
		this.stopTimer();
		void this.exitRecordingPhase();
	}

	private async exitRecordingPhase(): Promise<void> {
		// Measure current card height
		const fromHeight = this.cardEl.offsetHeight;

		// Animate out recording row
		if (this.recordingRowEl) {
			await animate(this.recordingRowEl, { opacity: 0 }, SPRING_FAST).finished;
			this.recordingRowEl.remove();
			this.recordingRowEl = null;
		}

		// Clean up
		this.waveformEl = null;
		this.waveformBars = [];
		this.timerEl = null;
		this.recordingSendBtn = null;
		this.recordingSendIconEl = null;

		// Restore idle DOM
		this.row1El.style.display = "";
		this.row1El.style.opacity = "";
		this.row2El.style.display = "";
		this.row2El.style.opacity = "";

		// Measure new card height, animate from old to new
		const toHeight = this.cardEl.offsetHeight;
		this.cardEl.style.height = `${fromHeight}px`;
		this.cardEl.style.overflow = "hidden";
		animate(this.cardEl, { height: `${toHeight}px` }, SPRING).finished.then(() => {
			this.cardEl.style.height = "";
			this.cardEl.style.overflow = "";
		});

		this.phase = "idle";
		this.updateSendState();
	}

	// ─── Public API ───────────────────────────────────────────────────────

	setAgents(agents: AgentConfig[], assetResolver?: (path: string) => string): void {
		this.agents = agents;
		this.assetResolver = assetResolver ?? null;
	}

	setVoiceService(service: VoiceService, autoSend: boolean, available = true): void {
		this.voiceService = service;
		this.voiceAutoSend = autoSend;
		this.voiceBtnEl.style.display = available ? "" : "none";

		service.on("transcribed", (text: string) => {
			void this.exitRecordingPhase().then(() => {
				if (this.voiceAutoSend && this.onSendCallback) {
					this.onSendCallback(text);
				} else {
					this.textarea.value += (this.textarea.value ? " " : "") + text;
					this.autoResize();
					this.textarea.focus();
					this.updateSendState();
				}
			});
		});

		service.on("error", (err: Error) => {
			if (this.phase !== "idle") {
				this.showRecordingError(err.message);
			}
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

	setReplyContext(agentId: string, agentName: string): void {
		this.replyAgentId = agentId;
		this.replyAgentName = agentName;

		if (!this.replyChipEl) {
			this.replyChipEl = this.cardEl.createDiv({ cls: "cv-reply-chip" });
			// Insert before row1
			this.cardEl.insertBefore(this.replyChipEl, this.row1El);
		}

		this.replyChipEl.empty();
		this.replyChipEl.createSpan({ cls: "cv-reply-chip__text", text: `Replying to ${agentName}` });
		const dismiss = this.replyChipEl.createDiv({ cls: "cv-reply-chip__dismiss" });
		setIcon(dismiss, "x");
		dismiss.addEventListener("click", () => this.clearReplyContext());

		this.textarea.focus();
	}

	clearReplyContext(): void {
		this.replyAgentId = null;
		this.replyAgentName = null;
		if (this.replyChipEl) {
			this.replyChipEl.remove();
			this.replyChipEl = null;
		}
	}

	hasReplyContext(): boolean {
		return this.replyAgentId !== null;
	}

	focus(): void {
		this.textarea.focus();
	}
}
