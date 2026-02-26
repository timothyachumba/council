import { MarkdownRenderer, Component, setIcon } from "obsidian";
import { ThinkingTimeline } from "./ThinkingTimeline";
import type { ToolUseBlock, PermissionBlock, QuestionBlock } from "./types";

export class MessageList {
	private container: HTMLElement;
	private component: Component;
	private permissionHandlers = new Map<string, (answer: "y" | "n") => void>();
	private activeTimeline: ThinkingTimeline | null = null;

	constructor(container: HTMLElement, component: Component) {
		this.container = container;
		this.component = component;
	}

	// ─── User messages ─────────────────────────────────────────────────────

	appendUserMessage(text: string): void {
		const el = this.container.createDiv({ cls: "cv-message cv-message--user" });
		el.createDiv({ cls: "cv-bubble", text });
		this.scrollToBottom();
	}

	// ─── Thinking timeline ─────────────────────────────────────────────────

	/** Create or return the active thinking timeline */
	ensureTimeline(): ThinkingTimeline {
		if (!this.activeTimeline) {
			this.activeTimeline = new ThinkingTimeline(this.container);
			this.scrollToBottom();
		}
		return this.activeTimeline;
	}

	addThinkingText(text: string): void {
		this.ensureTimeline().addThinking(text);
		this.scrollToBottom();
	}

	updateThinkingText(text: string): void {
		this.ensureTimeline().updateThinking(text);
		this.scrollToBottom();
	}

	addToolToTimeline(block: ToolUseBlock): void {
		this.ensureTimeline().addTool(block);
		this.scrollToBottom();
	}


	updateToolResult(toolUseId: string, content: string, isError: boolean): void {
		this.activeTimeline?.updateToolResult(toolUseId, content, isError);
	}

	completeTimeline(): void {
		if (!this.activeTimeline) return;
		this.activeTimeline.complete();
		this.activeTimeline = null;
	}

	// ─── Assistant text (renders below the timeline) ───────────────────────

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

	// ─── Permission prompts ────────────────────────────────────────────────

	renderPermission(block: PermissionBlock): HTMLElement {
		const card = this.container.createDiv({ cls: "cv-permission" });

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
				cls: "cv-permission__btn",
				text: "Allow",
			});
			const denyBtn = actions.createEl("button", {
				cls: "cv-permission__btn",
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
				// Already answered — show resolved state
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
							// Single select — clear others
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

				// Submit button — disabled until something is selected
				const submit = questionEl.createEl("button", {
					cls: "cv-question__submit",
					text: "Submit",
					attr: { disabled: "" },
				});
				const updateSubmit = () => { submit.disabled = selected.size === 0; };
				submit.addEventListener("click", () => {
					if (selected.size === 0) return;
					const answer = Array.from(selected).join(", ");
					const handler = this.questionHandlers.get(block.id);
					if (handler) handler({ [q.question]: answer });

					// Replace options with resolved state
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

	// ─── Utilities ─────────────────────────────────────────────────────────

	clear(): void {
		this.activeTimeline?.destroy();
		this.activeTimeline = null;
		this.container.empty();
		this.permissionHandlers.clear();
	}

	/** Render demo UI for styling — shows all states of the thinking timeline */
	renderDemo(): void {
		// User message
		this.appendUserMessage("Can you read the main config file and update the theme?");

		// Active thinking timeline (in-progress)
		const active = this.ensureTimeline();
		active.addThinking("I need to find the config file first. Let me check the project structure to understand where configuration lives.");
		active.addTool({
			kind: "tool_use",
			id: "demo-1",
			name: "Read",
			input: { file_path: "/src/config.ts" },
		});
		active.addTool({
			kind: "tool_use",
			id: "demo-2",
			name: "Glob",
			input: { pattern: "**/*.config.*" },
		});
		active.addThinking("Found it. Now let me read the theme settings and update the values.");
		active.addTool({
			kind: "tool_use",
			id: "demo-3",
			name: "Edit",
			input: { file_path: "/src/theme.ts" },
		});
		active.addTool({
			kind: "tool_use",
			id: "demo-4",
			name: "Bash",
			input: { command: "npm run build", description: "Build the project" },
		});

		// Complete it — but leave expanded for styling
		this.completeTimeline();
		// Re-expand so we can see the content for styling
		const completedBody = this.container.querySelector(".cv-timeline__body--collapsed");
		if (completedBody) {
			completedBody.removeClass("cv-timeline__body--collapsed");
		}

		// Assistant response — comprehensive markdown
		this.appendAssistantText([
			"I've updated the theme configuration. Here's a summary of the changes:",
			"",
			"## What changed",
			"",
			"The **primary palette** was updated and `border-radius` values were adjusted. The ~~old colours~~ have been replaced with *new semantic tokens*.",
			"",
			"### Unordered list",
			"",
			"- Updated the primary colour to use the new palette",
			"- Adjusted border radius values",
			"  - Inner radius: `4px`",
			"  - Outer radius: `8px`",
			"- Fixed the dark mode contrast ratio",
			"",
			"### Ordered list",
			"",
			"1. Read the existing config",
			"2. Updated colour tokens",
			"3. Rebuilt the project",
			"",
			"> **Note:** The contrast ratio now meets WCAG AA standards for all text sizes.",
			"",
			"### Code block",
			"",
			"```typescript",
			"const theme = {",
			"  colors: {",
			"    primary: 'var(--cv-surface)',",
			"    border: 'var(--cv-surface-border)',",
			"  },",
			"  radius: { s: '4px', m: '8px', l: '16px' },",
			"};",
			"```",
			"",
			"### Table",
			"",
			"| Token | Light | Dark |",
			"|---|---|---|",
			"| `--cv-surface` | `#f2f2f2` | `#1e1e1e` |",
			"| `--cv-surface-border` | `#d9d9d9` | `#333333` |",
			"| `--background-primary` | `#ffffff` | `#1a1a1a` |",
			"",
			"---",
			"",
			"The build completed successfully. You can check the [Obsidian docs](https://docs.obsidian.md) for CSS variable reference.",
		].join("\n"));

		// Single-select question
		this.renderQuestion({
			kind: "question",
			id: "demo-q1",
			questions: [{
				question: "Which approach should we use for the theme system?",
				header: "Approach",
				options: [
					{ label: "CSS Variables", description: "Use native CSS custom properties with light/dark mode selectors" },
					{ label: "CSS-in-JS", description: "Use a runtime theme provider like styled-components" },
					{ label: "Tailwind", description: "Use Tailwind's built-in dark mode with utility classes" },
				],
				multiSelect: false,
			}],
		});

		// Multi-select question
		this.renderQuestion({
			kind: "question",
			id: "demo-q2",
			questions: [{
				question: "Which features do you want to enable?",
				header: "Features",
				options: [
					{ label: "Dark mode", description: "Automatic light/dark theme switching" },
					{ label: "Animations", description: "Smooth transitions and micro-interactions" },
					{ label: "Compact mode", description: "Reduced spacing for information-dense views" },
					{ label: "Custom fonts", description: "Allow user-specified typefaces" },
				],
				multiSelect: true,
			}],
		});

		// Permission prompt demo
		this.renderPermission({
			kind: "permission",
			id: "demo-perm",
			toolName: "Bash",
			input: { command: "rm -rf node_modules && npm install" },
		});

		// Compact boundary demo
		this.showCompactBoundary();

		// Error demo
		this.showError("Connection to Claude CLI timed out after 30 seconds.");

		// Second exchange — active/in-progress timeline with thinking
		this.appendUserMessage("Can you also check if the tests pass?");
		const active2 = this.ensureTimeline();
		active2.addThinking("Let me run the test suite to check if everything passes after the theme changes.");
		active2.addTool({
			kind: "tool_use",
			id: "demo-5",
			name: "Bash",
			input: { command: "npm test", description: "Run test suite" },
		});
		active2.addTool({
			kind: "tool_use",
			id: "demo-6",
			name: "Read",
			input: { file_path: "/test/results.json" },
		});
	}

	private scrollToBottom(): void {
		const parent = this.container.parentElement;
		if (!parent) return;

		const distanceFromBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight;
		if (distanceFromBottom > 150) return; // user has scrolled up, don't hijack

		requestAnimationFrame(() => {
			parent.scrollTop = parent.scrollHeight;
		});
	}
}
