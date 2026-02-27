// ─── Stream event types ────────────────────────────────────────────────────

export type StreamEventType =
	| "text_delta"
	| "text_full"
	| "thinking"
	| "tool_use"
	| "tool_result"
	| "permission_prompt"
	| "compact_boundary"
	| "session_id"
	| "error"
	| "done";

export interface TextDeltaEvent {
	type: "text_delta";
	delta: string;
}

/** Full replacement — emitted when a partial assistant message arrives */
export interface TextFullEvent {
	type: "text_full";
	text: string;
}

export interface ThinkingEvent {
	type: "thinking";
	content: string;
	partial: boolean;
}

export interface ToolUseEvent {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface ToolResultEvent {
	type: "tool_result";
	toolUseId: string;
	content: string;
	isError: boolean;
}

export interface PermissionPromptEvent {
	type: "permission_prompt";
	toolName: string;
	input: Record<string, unknown>;
	id: string;
}

export interface CompactBoundaryEvent {
	type: "compact_boundary";
	trigger: "auto" | "manual";
}

export interface SessionIdEvent {
	type: "session_id";
	sessionId: string;
}

export interface ErrorEvent {
	type: "error";
	message: string;
}

export interface DoneEvent {
	type: "done";
}

export type StreamEvent =
	| TextDeltaEvent
	| TextFullEvent
	| ThinkingEvent
	| ToolUseEvent
	| ToolResultEvent
	| PermissionPromptEvent
	| CompactBoundaryEvent
	| SessionIdEvent
	| ErrorEvent
	| DoneEvent;

// ─── Message types ─────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface TextBlock {
	kind: "text";
	content: string;
}

export interface ThinkingBlock {
	kind: "thinking";
	content: string;
}

export interface ToolUseBlock {
	kind: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
	result?: string;
	isError?: boolean;
}

export interface PermissionBlock {
	kind: "permission";
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	resolved?: "approved" | "denied";
}

export interface QuestionOption {
	label: string;
	description: string;
}

export interface Question {
	question: string;
	header: string;
	options: QuestionOption[];
	multiSelect: boolean;
}

export interface QuestionBlock {
	kind: "question";
	id: string;
	questions: Question[];
	resolved?: Record<string, string>;
}

export type MessageBlock = TextBlock | ThinkingBlock | ToolUseBlock | PermissionBlock | QuestionBlock;

export interface ChatMessage {
	id: string;
	role: MessageRole;
	blocks: MessageBlock[];
	timestamp: number;
}

// ─── Session types ─────────────────────────────────────────────────────────

export interface SessionEntry {
	sessionId: string;
	slug: string;
	displayText: string;
	timestamp: number;
	projectPath: string;
}

// ─── Plugin settings ───────────────────────────────────────────────────────

export type ClaudeModel = "claude-sonnet-4-6" | "claude-opus-4-6" | "claude-haiku-4-5-20251001";

export type AgentState = "watching" | "still";

export interface AgentConfig {
	id: string;
	name: string;
	description: string;
	state: AgentState;
	prompt: string;
	color: string;
}

export interface ClaudeVaultSettings {
	activeSessionId: string | null;
	model: ClaudeModel;
	effortLevel: "low" | "normal" | "high";
	showThinkingTimeline: boolean;
	agents: AgentConfig[];
	agentSessions: Record<string, string | null>;
	parakeetPath: string | null;
	voiceAutoSend: boolean;
}

export const DEFAULT_AGENTS: AgentConfig[] = [
	{ id: "edge",  name: "Edge",  description: "Challenges your assumptions",      state: "watching", prompt: "", color: "var(--cv-agent-edge)" },
	{ id: "loom",  name: "Loom",  description: "Surfaces cross-context resonance", state: "watching", prompt: "", color: "var(--cv-agent-loom)" },
	{ id: "ember", name: "Ember", description: "Extends half-formed ideas",        state: "watching", prompt: "", color: "var(--cv-agent-ember)" },
	{ id: "quill", name: "Quill", description: "Shapes thoughts toward writing",   state: "still",    prompt: "", color: "var(--cv-agent-quill)" },
];

export const DEFAULT_SETTINGS: ClaudeVaultSettings = {
	activeSessionId: null,
	model: "claude-sonnet-4-6",
	effortLevel: "normal",
	showThinkingTimeline: false,
	agents: DEFAULT_AGENTS,
	agentSessions: {},
	parakeetPath: null,
	voiceAutoSend: true,
};
