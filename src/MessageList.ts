import { MarkdownRenderer, Component, setIcon, Menu } from "obsidian";
import type { PermissionBlock, QuestionBlock, StoredEvent } from "./types";
import { getStatusString } from "./agentStatus";

const THINKING_CYCLE_MS = 6000;

/** Fallback color map for @mention chips — matches default agent colors */
const AGENT_COLORS: Record<string, string> = {
	edge:  "#4858D4",
	loom:  "#DC6845",
	ember: "#7B32C8",
	quill: "#5FA96E",
};

export class MessageList {
	private container: HTMLElement;
	private component: Component;
	private permissionHandlers = new Map<string, (answer: "y" | "n") => void>();
	private replyCallback: ((agentId: string, agentName: string) => void) | null = null;
	private assetResolver: ((path: string) => string) | null = null;
	private activeThread: HTMLElement | null = null;

	constructor(container: HTMLElement, component: Component, assetResolver?: (path: string) => string) {
		this.container = container;
		this.component = component;
		this.assetResolver = assetResolver ?? null;
	}

	/** Returns the active thread container, or the top-level container if no thread is open */
	private get target(): HTMLElement {
		return this.activeThread ?? this.container;
	}

	// ─── User messages (plain text, no bubble) ────────────────────────────

	/** Append a user message. Top-level messages close any active thread. */
	appendUserMessage(text: string): HTMLElement {
		// If we're in a thread, the message goes inside it
		// If not, it's a new top-level thought (and closes any thread)
		const parent = this.target;
		const el = parent.createDiv({ cls: "cv-message cv-message--user" });

		// Render @mentions with agent avatar clipping mask
		const mentionRe = /@(\w+)/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		const textEl = el.createDiv({ cls: "cv-text" });
		let hasMention = false;

		while ((match = mentionRe.exec(text)) !== null) {
			hasMention = true;
			if (match.index > lastIndex) {
				textEl.appendText(text.slice(lastIndex, match.index));
			}
			const name = match[1];
			const agentId = name.toLowerCase();
			const mentionSpan = textEl.createSpan({ cls: "cv-mention", text: `@${name}` });
			const color = AGENT_COLORS[agentId];
			if (color) mentionSpan.style.setProperty("--cv-mention-color", color);
			lastIndex = match.index + match[0].length;
		}

		if (hasMention && lastIndex < text.length) {
			textEl.appendText(text.slice(lastIndex));
		} else if (!hasMention) {
			textEl.textContent = text;
		}

		this.scrollToBottom();
		return el;
	}

	/** Post a new top-level thought — closes any active thread */
	appendTopLevelMessage(text: string): HTMLElement {
		this.activeThread = null;
		return this.appendUserMessage(text);
	}

	/** Ensure a thread container exists. Creates one with the curved connector if needed. */
	private ensureThread(): HTMLElement {
		if (!this.activeThread) {
			this.activeThread = this.container.createDiv({ cls: "cv-thread" });
			this.activeThread.createDiv({ cls: "cv-thread__connector" });
		}
		return this.activeThread;
	}

	// ─── Assistant text ───────────────────────────────────────────────────

	appendAssistantText(content: string): HTMLElement {
		const el = this.container.createDiv({ cls: "cv-message cv-message--assistant" });
		const body = el.createDiv({ cls: "cv-text" });
		void MarkdownRenderer.renderMarkdown(content, body, "", this.component);
		this.scrollToBottom();
		return body;
	}

	updateAssistantText(el: HTMLElement, content: string): void {
		el.empty();
		void MarkdownRenderer.renderMarkdown(content, el, "", this.component);
		this.scrollToBottom();
	}

	// ─── Agent thinking label ─────────────────────────────────────────────

	showAgentThinking(
		agentId: string,
		agentName: string,
		agentColor: string,
		assetResolver?: (path: string) => string,
	): HTMLElement {
		const thread = this.ensureThread();
		const el = thread.createDiv({ cls: "cv-agent-thinking" });

		const avatar = el.createDiv({ cls: "cv-agent-thinking__avatar" });
		if (assetResolver) {
			const url = assetResolver(`assets/${agentId}.png`);
			avatar.style.backgroundImage = `url("${url}")`;
		} else {
			avatar.style.background = agentColor;
		}

		const labelEl = el.createDiv({ cls: "cv-agent-thinking__label" });
		labelEl.createSpan({ cls: "cv-agent-thinking__name", text: agentName + " " });
		const actionEl = labelEl.createSpan({ cls: "cv-agent-thinking__action" });

		// Stream in action text character by character
		let charIndex = 0;
		let charInterval: ReturnType<typeof setInterval> | null = null;

		const streamAction = (text: string) => {
			actionEl.textContent = "";
			charIndex = 0;
			if (charInterval) clearInterval(charInterval);
			charInterval = setInterval(() => {
				if (charIndex < text.length) {
					actionEl.textContent = text.slice(0, charIndex + 1);
					charIndex++;
				} else {
					if (charInterval) clearInterval(charInterval);
					charInterval = null;
				}
			}, 30);
		};

		streamAction(getStatusString(agentId, "idle"));

		// Cycle through idle strings until externally updated
		let cycleInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
			streamAction(getStatusString(agentId, "idle"));
		}, THINKING_CYCLE_MS);

		type ThinkingEl = HTMLElement & { _cleanup?: () => void; _updateStatus?: (text: string) => void };

		// Store cleanup function on element
		(el as ThinkingEl)._cleanup = () => {
			if (cycleInterval) clearInterval(cycleInterval);
			if (charInterval) clearInterval(charInterval);
		};

		// Exposed so ChatView can push phase transitions
		(el as ThinkingEl)._updateStatus = (text: string) => {
			if (cycleInterval) {
				clearInterval(cycleInterval);
				cycleInterval = null;
			}
			streamAction(text);
		};

		this.scrollToBottom();
		return el;
	}

	/** Remove a thinking label and clean up its intervals */
	removeAgentThinking(el: HTMLElement): void {
		(el as HTMLElement & { _cleanup?: () => void })._cleanup?.();
		el.remove();
	}

	/** Push a status string update to an active thinking label */
	updateAgentThinkingStatus(el: HTMLElement, status: string): void {
		(el as HTMLElement & { _updateStatus?: (text: string) => void })._updateStatus?.(status);
	}

	// ─── Agent response cards ─────────────────────────────────────────────

	/** Create an agent card inside the active thread. */
	appendAgentCard(
		agentId: string,
		agentName: string,
		agentColor: string,
		content: string,
		assetResolver?: (path: string) => string,
	): HTMLElement {
		const thread = this.ensureThread();
		const card = thread.createDiv({ cls: "cv-agent-card" });

		const body = card.createDiv({ cls: "cv-agent-card__body" });
		const textEl = body.createDiv({ cls: "cv-text" });
		if (content) {
			void MarkdownRenderer.renderMarkdown(content, textEl, "", this.component);
		}

		const footer = card.createDiv({ cls: "cv-agent-card__footer" });

		const identity = footer.createDiv({ cls: "cv-agent-card__identity" });
		const avatar = identity.createDiv({ cls: "cv-agent-card__avatar" });
		if (assetResolver) {
			const url = assetResolver(`assets/${agentId}.png`);
			avatar.style.backgroundImage = `url("${url}")`;
		} else {
			avatar.style.background = agentColor;
		}
		identity.createDiv({ cls: "cv-agent-card__name", text: agentName });

		const replyBtn = footer.createDiv({ cls: "cv-agent-card__action", text: "Reply" });
		replyBtn.addEventListener("click", () => {
			this.replyCallback?.(agentId, agentName);
		});

		this.scrollToBottom();
		return card;
	}

	/** Update the streamed text content of an agent card */
	updateAgentCardText(textEl: HTMLElement, content: string): void {
		textEl.empty();
		void MarkdownRenderer.renderMarkdown(content, textEl, "", this.component);
		this.scrollToBottom();
	}

	onReply(callback: (agentId: string, agentName: string) => void): void {
		this.replyCallback = callback;
	}

	// ─── Delete (right-click) ─────────────────────────────────────────────

	attachDeleteHandler(el: HTMLElement, onDelete: () => void): void {
		el.addEventListener("mousedown", (e: MouseEvent) => {
			if (e.button !== 2) return;
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle("Delete");
				item.setIcon("trash");
				item.onClick(() => onDelete());
			});
			menu.showAtMouseEvent(e);
		});
	}

	// ─── Permission prompts ────────────────────────────────────────────────

	renderPermission(block: PermissionBlock): HTMLElement {
		const card = this.target.createDiv({ cls: "cv-permission" });

		const header = card.createDiv({ cls: "cv-permission__header" });
		const iconEl = header.createDiv({ cls: "cv-permission__icon" });
		setIcon(iconEl, "circle-help");
		header.createSpan({
			cls: "cv-permission__label",
			text: `Allow ${block.toolName}?`,
		});

		const inputEntries = Object.entries(block.input).slice(0, 1);
		if (inputEntries.length > 0) {
			const [k, v] = inputEntries[0];
			const detail = card.createDiv({ cls: "cv-permission__detail" });
			const valStr = typeof v === "string" ? v : JSON.stringify(v);
			detail.setText(`${k}: ${valStr.slice(0, 100)}`);
		}

		if (!block.resolved) {
			const actions = card.createDiv({ cls: "cv-permission__actions" });
			const approveBtn = actions.createEl("button", {
				cls: "cv-btn cv-permission__btn",
				text: "Allow",
			});
			const denyBtn = actions.createEl("button", {
				cls: "cv-btn cv-permission__btn",
				text: "Deny",
			});

			approveBtn.addEventListener("click", () => {
				const handler = this.permissionHandlers.get(block.id);
				if (handler) handler("y");
				actions.remove();
				card.createSpan({ cls: "cv-permission__resolved", text: "Allowed" });
			});

			denyBtn.addEventListener("click", () => {
				const handler = this.permissionHandlers.get(block.id);
				if (handler) handler("n");
				actions.remove();
				card.createSpan({ cls: "cv-permission__resolved", text: "Denied" });
			});
		}

		this.scrollToBottom();
		return card;
	}

	onPermission(id: string, handler: (answer: "y" | "n") => void): void {
		this.permissionHandlers.set(id, handler);
	}

	// ─── Questions (AskUserQuestion) ──────────────────────────────────────

	private questionHandlers = new Map<string, (answers: Record<string, string>) => void>();

	renderQuestion(block: QuestionBlock): HTMLElement {
		const card = this.container.createDiv({ cls: "cv-question" });

		for (const q of block.questions) {
			const questionEl = card.createDiv({ cls: "cv-question__group" });

			questionEl.createDiv({ cls: "cv-question__text", text: q.question });

			const optionsEl = questionEl.createDiv({ cls: "cv-question__options" });

			if (block.resolved) {
				const answer = block.resolved[q.question];
				const resolved = optionsEl.createDiv({ cls: "cv-question__resolved" });
				resolved.createSpan({ text: answer ?? "No answer" });
			} else {
				let selected: Set<string> = new Set();

				for (const opt of q.options) {
					const optEl = optionsEl.createDiv({ cls: "cv-question__option" });
					const radio = optEl.createDiv({ cls: "cv-question__radio" });
					const radioIcon = radio.createDiv({ cls: "cv-question__radio-icon" });
					setIcon(radioIcon, q.multiSelect ? "square" : "circle");

					const content = optEl.createDiv({ cls: "cv-question__option-content" });
					content.createDiv({ cls: "cv-question__option-label", text: opt.label });
					if (opt.description) {
						content.createDiv({ cls: "cv-question__option-desc", text: opt.description });
					}

					optEl.addEventListener("click", () => {
						if (q.multiSelect) {
							if (selected.has(opt.label)) {
								selected.delete(opt.label);
								optEl.removeClass("cv-question__option--selected");
								setIcon(radioIcon, "square");
							} else {
								selected.add(opt.label);
								optEl.addClass("cv-question__option--selected");
								setIcon(radioIcon, "check-square");
							}
							updateSubmit();
						} else {
							optionsEl.querySelectorAll(".cv-question__option").forEach((el) => {
								el.removeClass("cv-question__option--selected");
								const icon = el.querySelector(".cv-question__radio-icon");
								if (icon) setIcon(icon as HTMLElement, "circle");
							});
							selected = new Set([opt.label]);
							optEl.addClass("cv-question__option--selected");
							setIcon(radioIcon, "check-circle");
							updateSubmit();
						}
					});
				}

				const submit = questionEl.createEl("button", {
					cls: "cv-btn cv-question__submit",
					text: "Submit",
					attr: { disabled: "" },
				});
				const updateSubmit = () => { submit.disabled = selected.size === 0; };
				submit.addEventListener("click", () => {
					if (selected.size === 0) return;
					const answer = Array.from(selected).join(", ");
					const handler = this.questionHandlers.get(block.id);
					if (handler) handler({ [q.question]: answer });

					optionsEl.empty();
					const resolved = optionsEl.createDiv({ cls: "cv-question__resolved" });
					resolved.createSpan({ text: answer });
					submit.remove();
				});
			}
		}

		this.scrollToBottom();
		return card;
	}

	onQuestion(id: string, handler: (answers: Record<string, string>) => void): void {
		this.questionHandlers.set(id, handler);
	}

	// ─── Compact boundary ─────────────────────────────────────────────────

	showCompactBoundary(): void {
		const el = this.container.createDiv({ cls: "cv-compact" });
		el.createDiv({ cls: "cv-compact__line" });
		const center = el.createDiv({ cls: "cv-compact__center" });
		const iconEl = center.createDiv({ cls: "cv-compact__icon" });
		setIcon(iconEl, "scissors");
		center.createSpan({ cls: "cv-compact__text", text: "Context compressed" });
		el.createDiv({ cls: "cv-compact__line" });
		this.scrollToBottom();
	}

	// ─── Error ─────────────────────────────────────────────────────────────

	showError(message: string): void {
		const el = this.container.createDiv({ cls: "cv-error" });
		const iconEl = el.createDiv({ cls: "cv-error__icon" });
		setIcon(iconEl, "alert-circle");
		el.createSpan({ text: message });
		this.scrollToBottom();
	}

	// ─── History replay ────────────────────────────────────────────────────

	replay(
		events: StoredEvent[],
		assetResolver?: (path: string) => string,
		onDelete?: (id: string) => void,
	): void {
		for (const event of events) {
			if (event.type === "user_top") {
				const el = this.appendTopLevelMessage(event.text);
				if (onDelete && event.id) {
					const id = event.id;
					this.attachDeleteHandler(el, () => {
						const thread = el.nextElementSibling as HTMLElement | null;
						el.remove();
						if (thread?.classList.contains("cv-thread")) thread.remove();
						onDelete(id);
					});
				}
			} else if (event.type === "user_reply") {
				this.appendUserMessage(event.text);
			} else if (event.type === "agent") {
				const card = this.appendAgentCard(event.agentId, event.agentName, event.agentColor, event.content, assetResolver);
				if (onDelete && event.id) {
					const id = event.id;
					this.attachDeleteHandler(card, () => {
						card.remove();
						onDelete(id);
					});
				}
			}
		}
	}

	// ─── Utilities ─────────────────────────────────────────────────────────

	clear(): void {
		this.container.empty();
		this.permissionHandlers.clear();
	}

	private scrollToBottom(): void {
		const parent = this.container.parentElement;
		if (!parent) return;

		const distanceFromBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight;
		if (distanceFromBottom > 150) return;

		requestAnimationFrame(() => {
			parent.scrollTop = parent.scrollHeight;
		});
	}
}
