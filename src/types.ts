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

// ─── Chat history ──────────────────────────────────────────────────────────

export type StoredEvent =
	| { type: "user_top";   id?: string; text: string }
	| { type: "user_reply"; id?: string; text: string }
	| { type: "agent";      id?: string; agentId: string; agentName: string; agentColor: string; content: string };

export function makeEventId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const CHAT_HISTORY_LIMIT = 200;

export function appendStoredEvent(history: StoredEvent[], event: StoredEvent): StoredEvent[] {
	const next = [...history, event];
	return next.length > CHAT_HISTORY_LIMIT ? next.slice(next.length - CHAT_HISTORY_LIMIT) : next;
}

// ─── Plugin settings ───────────────────────────────────────────────────────

export type ClaudeModel = "claude-sonnet-4-6" | "claude-opus-4-6" | "claude-haiku-4-5-20251001";

export type AgentState = "watching" | "still";

export interface AgentConfig {
	id: string;
	name: string;
	description: string;
	state: AgentState;
	systemPrompt: string;   // full system prompt — seeded from agentPrompts.ts on first load
	gradientPreset: number; // index into GRADIENT_PRESETS (0–19)
}

export interface CouncilSettings {
	activeSessionId: string | null;
	model: ClaudeModel;
	claudeCliPath: string | null;       // resolved CLI binary path
	vaultReadDirs: string[];            // folders passed as --add-dir (relative to vault root)
	vaultWriteDir: string;              // sync write destination (relative to vault root)
	vaultThreadsDir: string;            // threads folder (relative to vault root)
	vaultMemoryPath: string;            // memory index file (relative to vault root)
	syncSetupDone: boolean;             // whether user has confirmed or skipped sync setup
	agents: AgentConfig[];
	agentSessions: Record<string, string | null>;
	parakeetPath: string | null;
	voiceAutoSend: boolean;
	chatHistory: StoredEvent[];
	lastSavedIndex: number;
}

// Default agents — systemPrompt is empty here and seeded in main.ts loadSettings()
export const DEFAULT_AGENTS: AgentConfig[] = [
	{ id: "edge",  name: "Edge",  description: "Challenges your assumptions",      state: "watching", systemPrompt: "", gradientPreset: 0 },
	{ id: "loom",  name: "Loom",  description: "Surfaces cross-context resonance", state: "watching", systemPrompt: "", gradientPreset: 1 },
	{ id: "ember", name: "Ember", description: "Extends half-formed ideas",        state: "watching", systemPrompt: "", gradientPreset: 2 },
	{ id: "quill", name: "Quill", description: "Shapes thoughts toward writing",   state: "still",    systemPrompt: "", gradientPreset: 3 },
];

export const DEFAULT_SETTINGS: CouncilSettings = {
	activeSessionId: null,
	model: "claude-sonnet-4-6",
	claudeCliPath: null,
	vaultReadDirs: [],
	vaultWriteDir: "Stream",
	vaultThreadsDir: "Threads",
	vaultMemoryPath: "System/memory.md",
	syncSetupDone: false,
	agents: DEFAULT_AGENTS,
	agentSessions: {},
	parakeetPath: null,
	voiceAutoSend: true,
	chatHistory: [],
	lastSavedIndex: 0,
};
