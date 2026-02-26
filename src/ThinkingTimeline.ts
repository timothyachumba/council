import { setIcon } from "obsidian";
import { animate as _animate } from "motion";
import type { ToolUseBlock } from "./types";

/** Map tool names to Lucide icon ids */
const TOOL_ICONS: Record<string, string> = {
	Read: "file-text",
	Bash: "terminal",
	Task: "list-checks",
	Skill: "zap",
	Write: "pencil",
	Edit: "file-pen",
	Glob: "search",
	Grep: "search",
	WebFetch: "globe",
	WebSearch: "globe",
	NotebookEdit: "book-open",
	// MCP tools
	mcp__workiq__ask_work_iq: "building-2",
	mcp__figma__get_design_context: "pen-tool",
	mcp__figma__get_screenshot: "image",
	mcp__figma__get_metadata: "layers",
	mcp__figma__get_variable_defs: "sliders-horizontal",
	mcp__figma__generate_diagram: "git-branch",
};

/** Tools whose primary display is a filename pill */
const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);

/** Extract a human-readable description from a tool_use event */
function toolDescription(name: string, input: Record<string, unknown>): string {
	// Bash: Claude provides a human-readable description
	if (input.description && typeof input.description === "string")
		return input.description;

	// Skill: show the skill name
	if (name === "Skill" && input.skill && typeof input.skill === "string")
		return `Running /${input.skill}`;

	// Task (subagent): use the short description
	if (name === "Task" && input.prompt && typeof input.prompt === "string")
		return (input.prompt as string).slice(0, 80);

	// Bash: truncated command
	if (input.command && typeof input.command === "string")
		return (input.command as string).slice(0, 80);

	// Grep: clean up pattern display
	if (name === "Grep" && input.pattern && typeof input.pattern === "string")
		return `Searching for "${(input.pattern as string).slice(0, 50)}"`;

	// Glob: clean up pattern display
	if (name === "Glob" && input.pattern && typeof input.pattern === "string")
		return `Finding ${input.pattern} files`;

	// Web tools
	if (input.query && typeof input.query === "string")
		return (input.query as string).slice(0, 80);
	if (input.prompt && typeof input.prompt === "string")
		return (input.prompt as string).slice(0, 80);

	// MCP tools: extract readable name + use primary input as description
	if (name.startsWith("mcp__")) {
		// Work IQ: use the question text
		if (input.question && typeof input.question === "string")
			return (input.question as string).slice(0, 80);
		// Figma: use the node or file context
		if (input.nodeId && typeof input.nodeId === "string")
			return `Node ${input.nodeId as string}`;
		// Fallback: humanise the tool name segment
		const parts = name.split("__");
		const toolPart = parts[parts.length - 1] ?? name;
		return toolPart.replace(/_/g, " ");
	}

	return name;
}

/** Map file extension to Lucide icon id */
function fileIcon(filename: string): string {
	const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
	switch (ext) {
		case ".md": return "file-text";
		case ".ts": case ".tsx": case ".js": case ".jsx": return "file-code-2";
		case ".json": return "braces";
		case ".css": case ".scss": case ".less": return "paintbrush";
		default: return "file";
	}
}

/** Extract just the filename from a full path */
function basename(filepath: string): string {
	const parts = filepath.split("/");
	return parts[parts.length - 1] ?? filepath;
}

export class ThinkingTimeline {
	readonly el: HTMLElement;
	private headerEl: HTMLElement;
	private labelEl: HTMLElement;
	private dotsEl: HTMLElement;
	private iconEl: HTMLElement;
	private chevronEl: HTMLElement;
	private bodyEl!: HTMLElement;
	private timelineEl!: HTMLElement;
	private lineEl!: HTMLElement;
	private contentEl!: HTMLElement;
	private dotEl!: HTMLElement;
	private startTime: number;
	private collapsed = false;
	private toolEls = new Map<string, HTMLElement>();
	private filePillData = new Map<string, { iconEl: HTMLElement; filename: string; toolName: string }>();
	private activeFileGroup: {
		wrapper: HTMLElement;
		pillsEl: HTMLElement;
		summaryEl: HTMLElement;
		parentRow: HTMLElement | null; // the tool row this group is attached to
		count: number;
	} | null = null;
	private lastToolRow: HTMLElement | null = null;
	private activeThoughtEl: HTMLElement | null = null;
	private activeThoughtFull = "";
	private static readonly THOUGHT_MAX = 300;

	constructor(parent: HTMLElement) {
		this.startTime = Date.now();

		this.el = parent.createDiv({ cls: "cv-timeline" });

		// ─── Header row ────────────────────────────────────────────────
		this.headerEl = this.el.createDiv({ cls: "cv-timeline__header" });
		this.headerEl.addEventListener("click", () => this.toggle());

		this.iconEl = this.headerEl.createDiv({ cls: "cv-timeline__header-icon" });

		// Animated dots
		this.dotsEl = this.iconEl.createDiv({ cls: "cv-dots" });
		this.dotsEl.createSpan({ cls: "cv-dot" });
		this.dotsEl.createSpan({ cls: "cv-dot" });
		this.dotsEl.createSpan({ cls: "cv-dot" });

		this.labelEl = this.headerEl.createSpan({ cls: "cv-timeline__label" });
		this.labelEl.textContent = "Thinking";

		this.chevronEl = this.headerEl.createDiv({ cls: "cv-timeline__chevron" });
		setIcon(this.chevronEl, "chevron-right");
	}

	/** Create the body (rail + content) on first use */
	private ensureBody(): void {
		if (this.bodyEl) return;
		this.bodyEl = this.el.createDiv({ cls: "cv-timeline__body" });

		this.timelineEl = this.bodyEl.createDiv({ cls: "cv-timeline__rail" });
		this.dotEl = this.timelineEl.createDiv({ cls: "cv-timeline__dot cv-timeline__dot--hidden" });
		setIcon(this.dotEl, "circle");
		this.lineEl = this.timelineEl.createDiv({ cls: "cv-timeline__line" });

		this.contentEl = this.bodyEl.createDiv({ cls: "cv-timeline__content" });
	}

	// ─── Public API ──────────────────────────────────────────────────────

	/** Render truncated text with word-boundary break */
	private renderThought(): void {
		if (!this.activeThoughtEl) return;
		const full = this.activeThoughtFull;
		if (full.length <= ThinkingTimeline.THOUGHT_MAX) {
			this.activeThoughtEl.textContent = full;
			return;
		}
		const cut = full.lastIndexOf(" ", ThinkingTimeline.THOUGHT_MAX);
		const truncated = full.slice(0, cut > 0 ? cut : ThinkingTimeline.THOUGHT_MAX) + "…";

		// Show truncated text + "more" link
		this.activeThoughtEl.empty();
		this.activeThoughtEl.appendText(truncated + " ");
		const more = this.activeThoughtEl.createSpan({ cls: "cv-timeline__more", text: "more" });
		more.addEventListener("click", (e) => {
			e.stopPropagation();
			this.activeThoughtEl!.textContent = full;
		});
	}

	/** Collapse consecutive newlines to a single newline */
	private static normalizeWhitespace(text: string): string {
		return text.replace(/\n{2,}/g, "\n").trim();
	}

	/** Add a complete thinking block */
	addThinking(text: string): void {
		if (!text.trim()) return;
		this.ensureBody();
		this.collapseFileGroup();
		this.lastToolRow = null;
		// Show rail dot for thinking blocks
		if (this.dotEl.hasClass("cv-timeline__dot--hidden")) {
			this.dotEl.removeClass("cv-timeline__dot--hidden");
		}
		this.activeThoughtFull = ThinkingTimeline.normalizeWhitespace(text);
		this.activeThoughtEl = this.contentEl.createDiv({
			cls: "cv-timeline__item cv-timeline__thought",
		});
		this.renderThought();
		this.animateIn(this.activeThoughtEl);
		this.growLine();
	}

	/** Append a streaming delta */
	updateThinking(text: string): void {
		if (!this.activeThoughtEl) {
			this.addThinking(text);
			return;
		}
		this.activeThoughtFull = ThinkingTimeline.normalizeWhitespace(this.activeThoughtFull + text);
		this.renderThought();
		this.growLine();
	}

	/** Add a tool_use event to the timeline */
	addTool(block: ToolUseBlock): void {
		this.ensureBody();
		this.activeThoughtEl = null;
		this.activeThoughtFull = "";
		const name = block.name;
		const input = block.input;

		if (FILE_TOOLS.has(name)) {
			// Ensure we have an active file group
			if (!this.activeFileGroup) {
				// Pills always go in contentEl, below the parent tool row
				const wrapper = this.contentEl.createDiv({ cls: "cv-file-group" });
				const pillsEl = wrapper.createDiv({ cls: "cv-file-pills" });
				// Inline summary sits on the parent tool row; standalone if no parent
				const summaryEl = this.lastToolRow
					? this.createInlineSummary(this.lastToolRow)
					: wrapper.createDiv({ cls: "cv-file-summary" });
				this.activeFileGroup = { wrapper, pillsEl, summaryEl, parentRow: this.lastToolRow, count: 0 };
			}

			// File tools render as a pill with spinner
			const filepath = (input.file_path as string) ?? (input.path as string) ?? name;
			const filename = basename(filepath);
			const pill = this.createFilePill(filename, this.activeFileGroup.pillsEl);
			this.toolEls.set(block.id, pill);

			// Store pill data for updating on result
			const iconEl = pill.querySelector(".cv-timeline__pill-icon") as HTMLElement;
			if (iconEl) {
				this.filePillData.set(block.id, { iconEl, filename, toolName: name });
			}

			// Update group count and summary
			this.activeFileGroup.count++;
			this.updateFileGroupSummary();
		} else {
			// Non-file tool — collapse any active file group first
			this.collapseFileGroup();

			// Other tools render as a description row with icon
			const desc = toolDescription(name, input);
			const row = this.contentEl.createDiv({ cls: "cv-timeline__item cv-timeline__tool" });

			// Tool icon floats in the timeline gap
			const icon = row.createDiv({ cls: "cv-timeline__tool-icon" });
			setIcon(icon, TOOL_ICONS[name] ?? "wrench");

			row.createSpan({ cls: "cv-timeline__tool-desc", text: desc });
			this.toolEls.set(block.id, row);
			this.lastToolRow = row;
			this.animateIn(row);
		}
		this.growLine();
	}

	/** Update a tool with its result — swap spinner for file-type icon */
	updateToolResult(toolUseId: string, _content: string, _isError: boolean): void {
		const data = this.filePillData.get(toolUseId);
		if (!data) return;

		// Replace spinner with the appropriate icon
		data.iconEl.empty();
		const iconName = data.toolName === "Write" ? "pencil"
			: data.toolName === "Edit" ? "file-pen"
			: fileIcon(data.filename);
		setIcon(data.iconEl, iconName);
		this.filePillData.delete(toolUseId);
	}

	/** Transition to completed state */
	complete(): void {
		this.collapseFileGroup();
		const elapsed = Math.round((Date.now() - this.startTime) / 1000);
		const label = `Thought for ${elapsed} second${elapsed !== 1 ? "s" : ""}`;

		// Replace dots with circle-check icon
		this.dotsEl.remove();
		setIcon(this.iconEl, "circle-check");

		this.labelEl.textContent = label;

		const hasContent = this.bodyEl && this.contentEl.childElementCount > 0;

		if (hasContent) {
			// Collapse with toggle
			this.collapsed = true;
			this.bodyEl.addClass("cv-timeline__body--collapsed");
			this.chevronEl.addClass("cv-timeline__chevron--visible");
		} else if (this.bodyEl) {
			// No thinking/tools — hide the body entirely, no chevron
			this.bodyEl.remove();
		}

		this.el.addClass("cv-timeline--complete");
	}

	destroy(): void {
		// cleanup if needed
	}

	// ─── Private ─────────────────────────────────────────────────────────

	private toggle(): void {
		if (!this.collapsed) return; // only toggle when complete
		const open = this.bodyEl.hasClass("cv-timeline__body--collapsed");
		this.bodyEl.toggleClass("cv-timeline__body--collapsed", !open);
		this.chevronEl.toggleClass("cv-timeline__chevron--open", open);
	}

	private createFilePill(filename: string, container: HTMLElement): HTMLElement {
		const pill = container.createDiv({ cls: "cv-timeline__item cv-timeline__pill" });
		const icon = pill.createDiv({ cls: "cv-timeline__pill-icon" });

		// Show spinner dots while reading
		const spinner = icon.createDiv({ cls: "cv-timeline__pill-spinner" });
		spinner.createSpan({ cls: "cv-dot" });
		spinner.createSpan({ cls: "cv-dot" });
		spinner.createSpan({ cls: "cv-dot" });

		pill.createSpan({ cls: "cv-timeline__pill-name", text: filename });
		this.animateIn(pill);
		return pill;
	}

	/** Create an inline summary element inside a parent tool row */
	private createInlineSummary(parentRow: HTMLElement): HTMLElement {
		const summary = parentRow.createSpan({ cls: "cv-file-summary cv-file-summary--inline" });
		return summary;
	}

	private updateFileGroupSummary(): void {
		if (!this.activeFileGroup) return;
		const { summaryEl, count } = this.activeFileGroup;
		summaryEl.empty();
		const chevron = summaryEl.createDiv({ cls: "cv-file-summary__chevron" });
		setIcon(chevron, "chevron-right");
		summaryEl.createSpan({ text: `${count} file${count !== 1 ? "s" : ""}` });
	}

	private collapseFileGroup(): void {
		if (!this.activeFileGroup || this.activeFileGroup.count === 0) {
			this.activeFileGroup = null;
			return;
		}

		const group = this.activeFileGroup;
		group.wrapper.addClass("cv-file-group--collapsed");
		group.summaryEl.addClass("cv-file-summary--visible");

		// Click to toggle expand/collapse
		const toggleHandler = (e: MouseEvent) => {
			e.stopPropagation();
			const isCollapsed = group.wrapper.hasClass("cv-file-group--collapsed");
			group.wrapper.toggleClass("cv-file-group--collapsed", !isCollapsed);
			group.summaryEl.toggleClass("cv-file-summary--visible", !isCollapsed);
			const chevron = group.summaryEl.querySelector(".cv-file-summary__chevron");
			if (chevron) chevron.toggleClass("cv-file-summary__chevron--open", isCollapsed);
		};
		group.summaryEl.addEventListener("click", toggleHandler);

		this.activeFileGroup = null;
		this.lastToolRow = null;
	}

	private animateIn(el: HTMLElement): void {
		try {
			el.style.opacity = "0";
			el.style.transform = "translateY(4px)";
			requestAnimationFrame(() => {
				try {
					_animate(el, { opacity: 1, y: 0 }, { type: "spring", stiffness: 500, damping: 35 });
				} catch {
					el.style.opacity = "1";
					el.style.transform = "";
				}
				// Safety: ensure visible after animation duration
				setTimeout(() => {
					el.style.opacity = "1";
					el.style.transform = "";
				}, 300);
			});
		} catch {
			// No animation, just show it
		}
	}

	private growLine(): void {
		try {
			_animate(this.lineEl, { opacity: 1 }, { duration: 0.2 });
		} catch {
			// graceful fallback
		}
	}
}
