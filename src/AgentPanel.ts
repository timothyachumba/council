import { animate } from "motion";
import { TextMorph } from "torph";
import type { AgentConfig, AgentState } from "./types";
import { GRADIENT_PRESETS, gradientToCss } from "./gradientPresets";

// ─── Layout constants ───────────────────────────────────────────────────

const SM = 28;        // closed avatar size
const SM_GAP = -4;    // closed overlap
const LG = 64;        // open avatar size (inactive)
const LG_ACTIVE = 72; // open avatar size (active — slightly larger)
const LG_GAP = 24;    // open gap between avatars
const BAR_H = 48;     // header bar height
const OPEN_H = LG_ACTIVE - 16; // open group height

const SPRING = { type: "spring" as const, stiffness: 400, damping: 35 };
const SPRING_FAST = { type: "spring" as const, stiffness: 500, damping: 40 };

// ─── Position calculators ───────────────────────────────────────────────

/** Total width of the closed avatar strip */
function closedStripWidth(n: number): number {
	return SM * n + SM_GAP * (n - 1);
}

/** X position of the i-th avatar left edge in closed state, centered in container */
function closedAvatarX(i: number, n: number, containerW: number): number {
	const stripW = closedStripWidth(n);
	const stripLeft = (containerW - stripW) / 2;
	return stripLeft + i * (SM + SM_GAP);
}

/** Size of avatar at index i when active index is known */
function openAvatarSize(i: number, activeIndex: number): number {
	return i === activeIndex ? LG_ACTIVE : LG;
}

/** X position of the i-th avatar left edge in open state */
function openAvatarX(i: number, activeIndex: number, containerW: number): number {
	// Active avatar center = container center
	const centerX = containerW / 2;

	if (i === activeIndex) {
		return centerX - LG_ACTIVE / 2;
	}

	// Walk outward from active, accumulating widths + gaps
	let x = centerX;
	if (i > activeIndex) {
		x += LG_ACTIVE / 2 + LG_GAP; // right edge of active + gap
		for (let j = activeIndex + 1; j < i; j++) {
			x += LG + LG_GAP;
		}
		return x;
	} else {
		x -= LG_ACTIVE / 2 + LG_GAP; // left edge of active - gap
		for (let j = activeIndex - 1; j > i; j--) {
			x -= LG + LG_GAP;
		}
		return x - LG;
	}
}

/** Y position — vertically centered in OPEN_H, shifted up */
function openAvatarY(i: number, activeIndex: number): number {
	const size = openAvatarSize(i, activeIndex);
	return (OPEN_H - size) / 2 - 24;
}

function closedAvatarY(): number {
	return (BAR_H - SM) / 2;
}

// ─── AgentPanel ─────────────────────────────────────────────────────────

export class AgentPanel {
	readonly avatarGroupEl: HTMLElement;
	readonly contentEl: HTMLElement;

	private avatarEls: HTMLElement[] = [];
	private agents: AgentConfig[];
	private drafts: AgentConfig[] = [];
	private currentIndex = 0;
	private open = false;
	private containerW = 0;
	private onSaveCallback: (agents: AgentConfig[]) => void;
	private stateCallbacks: Array<(open: boolean) => void> = [];
	private resizeObserver: ResizeObserver;

	private nameEl!: HTMLElement;
	private descEl!: HTMLElement;
	private nameMorph: TextMorph | null = null;
	private descMorph: TextMorph | null = null;
	private stillTab!: HTMLElement;
	private watchingTab!: HTMLElement;
	private textareaEl!: HTMLTextAreaElement;

	constructor(
		agents: AgentConfig[],
		onSave: (agents: AgentConfig[]) => void,
	) {
		this.agents = agents;
		this.onSaveCallback = onSave;

		// Avatar group — position:relative container, no flexbox
		this.avatarGroupEl = createDiv({ cls: "cv-avatar-group" });
		this.buildAvatars();

		// Content panel
		this.contentEl = createDiv({ cls: "cv-agent-content" });
		this.buildContent();
		this.syncAvatarFilters();

		// Watch for container resize
		this.resizeObserver = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width ?? 0;
			if (w > 0 && w !== this.containerW) {
				this.containerW = w;
				this.positionAvatars(false);
			}
		});

		// Apply initial closed state (positioned after first resize)
		this.avatarGroupEl.style.height = `${BAR_H}px`;
		this.avatarGroupEl.style.marginTop = `${-BAR_H}px`;
	}

	/** Call after element is in the DOM so ResizeObserver can measure */
	private ensureObserver(): void {
		this.resizeObserver.observe(this.avatarGroupEl);
	}

	// ─── Build ───────────────────────────────────────────────────────────

	private buildAvatars(): void {
		for (let i = 0; i < this.agents.length; i++) {
			const el = this.avatarGroupEl.createDiv({ cls: "cv-avatar" });
			this.applyAvatarImage(el, i);

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				if (this.open) {
					this.selectAgent(i);
				} else {
					this.openPanel(i);
				}
			});

			// Hover scale when open
			el.addEventListener("mouseenter", () => {
				if (!this.open || i === this.currentIndex) return;
				animate(el, { scale: 1.08 }, { type: "spring", stiffness: 600, damping: 25 });
			});
			el.addEventListener("mouseleave", () => {
				if (!this.open || i === this.currentIndex) return;
				animate(el, { scale: 1 }, { type: "spring", stiffness: 600, damping: 25 });
			});

			this.avatarEls.push(el);
		}

		this.avatarGroupEl.addEventListener("click", () => {
			if (!this.open) this.openPanel(0);
		});
	}

	private buildContent(): void {
		const top = this.contentEl.createDiv({ cls: "cv-agent-top" });

		const info = top.createDiv({ cls: "cv-agent-info" });
		this.nameEl = info.createDiv({ cls: "cv-agent-name" });
		this.descEl = info.createDiv({ cls: "cv-agent-desc" });

		const segment = top.createDiv({ cls: "cv-agent-segment" });
		this.stillTab = segment.createDiv({ cls: "cv-agent-segment__tab" });
		this.stillTab.textContent = "Still";
		this.watchingTab = segment.createDiv({ cls: "cv-agent-segment__tab" });
		this.watchingTab.textContent = "Watching";

		this.stillTab.addEventListener("click", () => {
			this.drafts[this.currentIndex].state = "still";
			this.updateSegment("still");
			this.avatarEls[this.currentIndex].style.filter = "grayscale(1)";
		});
		this.watchingTab.addEventListener("click", () => {
			this.drafts[this.currentIndex].state = "watching";
			this.updateSegment("watching");
			this.avatarEls[this.currentIndex].style.filter = "";
		});

		const bottom = this.contentEl.createDiv({ cls: "cv-agent-bottom" });

		this.textareaEl = bottom.createEl("textarea", {
			cls: "cv-agent-textarea",
			attr: { placeholder: "What should this agent care about?" },
		});
		this.textareaEl.addEventListener("input", () => {
			this.drafts[this.currentIndex].prompt = this.textareaEl.value;
		});

		const actions = bottom.createDiv({ cls: "cv-agent-actions" });

		const cancelBtn = actions.createEl("button", { cls: "cv-btn cv-agent-btn", text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.resetDrafts();
			this.syncAvatarFilters();
			this.close();
		});

		const saveBtn = actions.createEl("button", { cls: "cv-btn cv-agent-btn", text: "Save" });
		saveBtn.addEventListener("click", () => {
			for (let i = 0; i < this.agents.length; i++) {
				this.agents[i].state = this.drafts[i].state;
				this.agents[i].prompt = this.drafts[i].prompt;
			}
			this.onSaveCallback(this.agents);
			this.syncAvatarFilters();
			this.close();
		});
	}

	// ─── Positioning ────────────────────────────────────────────────────

	/** Position all avatars based on current state — no flexbox, pure math */
	private positionAvatars(animated: boolean): void {
		const n = this.avatarEls.length;
		const w = this.containerW;
		if (w === 0) return;

		this.avatarEls.forEach((el, i) => {
			if (this.open) {
				const size = openAvatarSize(i, this.currentIndex);
				const target = {
					left: `${openAvatarX(i, this.currentIndex, w)}px`,
					top: `${openAvatarY(i, this.currentIndex)}px`,
					width: `${size}px`,
					height: `${size}px`,
				};
				if (animated) {
					animate(el, target, SPRING);
				} else {
					Object.assign(el.style, target);
				}
			} else {
				const target = {
					left: `${closedAvatarX(i, n, w)}px`,
					top: `${closedAvatarY()}px`,
					width: `${SM}px`,
					height: `${SM}px`,
					scale: 1,
				};
				if (animated) {
					animate(el, target, SPRING);
				} else {
					Object.assign(el.style, target);
				}
			}
		});
	}

	// ─── Public API ──────────────────────────────────────────────────────

	/**
	 * Update the agents list and refresh gradients in place.
	 * Called by ChatView when settings change externally (e.g. via SettingsTab).
	 */
	setAgents(agents: AgentConfig[]): void {
		const countChanged = agents.length !== this.agents.length;
		this.agents = agents;
		this.resetDrafts();

		if (countChanged) {
			// Full rebuild needed — count changed
			this.avatarGroupEl.empty();
			this.avatarEls = [];
			this.buildAvatars();
			this.positionAvatars(false);
		} else {
			// Just re-apply gradients to existing elements
			this.avatarEls.forEach((el, i) => this.applyAvatarImage(el, i));
		}
		this.syncAvatarFilters();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────

	private applyAvatarImage(el: HTMLElement, i: number): void {
		const agent = this.agents[i];
		const preset = GRADIENT_PRESETS[agent.gradientPreset] ?? GRADIENT_PRESETS[0];
		el.style.backgroundImage = "none";
		el.style.background = gradientToCss(preset);
		el.style.backgroundSize = "cover";
	}

	private resetDrafts(): void {
		this.drafts = this.agents.map((a) => ({ ...a }));
	}

	/** Apply greyscale filter to avatars of agents in "still" state */
	private syncAvatarFilters(): void {
		for (let i = 0; i < this.agents.length; i++) {
			this.avatarEls[i].style.filter = this.agents[i].state === "still" ? "grayscale(1)" : "";
		}
	}

	private updateSegment(state: AgentState): void {
		this.stillTab.toggleClass("cv-agent-segment__tab--active", state === "still");
		this.watchingTab.toggleClass("cv-agent-segment__tab--active", state === "watching");
	}

	private updateContentForAgent(index: number): void {
		const draft = this.drafts[index];

		if (this.nameMorph) {
			this.nameMorph.update(draft.name);
		} else {
			this.nameEl.textContent = draft.name;
		}

		if (this.descMorph) {
			this.descMorph.update(draft.description);
		} else {
			this.descEl.textContent = draft.description;
		}

		this.updateSegment(draft.state);
		this.textareaEl.value = draft.prompt;
		this.textareaEl.setAttribute("placeholder", `What should ${draft.name} care about?`);
	}

	// ─── Public API ──────────────────────────────────────────────────────

	/** Call once the element is mounted in the DOM */
	mounted(): void {
		this.ensureObserver();
		this.nameMorph = new TextMorph({ element: this.nameEl, duration: 600 });
		this.descMorph = new TextMorph({ element: this.descEl, duration: 600 });
	}

	selectAgent(index: number): void {
		this.currentIndex = Math.max(0, Math.min(index, this.agents.length - 1));
		// Reset any hover scale
		this.avatarEls.forEach((el) => { el.style.transform = ""; });
		this.positionAvatars(true);
		this.updateContentForAgent(this.currentIndex);
	}

	isOpen(): boolean {
		return this.open;
	}

	toggle(): void {
		if (this.open) this.close();
		else this.openPanel();
	}

	private openPanel(initialIndex = 0): void {
		if (this.open) return;
		this.open = true;
		this.resetDrafts();
		this.currentIndex = initialIndex;
		this.updateContentForAgent(this.currentIndex);

		// Read container width if not yet known
		if (this.containerW === 0) {
			this.containerW = this.avatarGroupEl.offsetWidth;
		}

		// Animate group: slide down, grow
		animate(this.avatarGroupEl, {
			marginTop: "0px",
			height: `${OPEN_H}px`,
		}, SPRING);

		// Animate each avatar to its open position
		this.positionAvatars(true);

		// Content fades in
		animate(this.contentEl, { height: "auto", opacity: 1 }, SPRING);

		this.stateCallbacks.forEach((cb) => cb(true));
	}

	close(): void {
		if (!this.open) return;
		this.open = false;

		// Animate group: slide up, shrink
		animate(this.avatarGroupEl, {
			marginTop: `${-BAR_H}px`,
			height: `${BAR_H}px`,
		}, SPRING);

		// Animate each avatar to its closed position
		this.positionAvatars(true);

		// Content collapses
		animate(this.contentEl, { height: 0, opacity: 0 }, SPRING_FAST);

		this.stateCallbacks.forEach((cb) => cb(false));
	}

	onStateChange(callback: (open: boolean) => void): void {
		this.stateCallbacks.push(callback);
	}

	destroy(): void {
		this.resizeObserver.disconnect();
		this.nameMorph?.destroy();
		this.descMorph?.destroy();
	}
}
