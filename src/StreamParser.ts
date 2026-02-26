import type { StreamEvent } from "./types";

/**
 * Parses JSONL lines from claude --print --output-format stream-json --verbose
 *
 * Actual line types (with --include-partial-messages):
 *   {"type":"system","subtype":"init","session_id":"..."}
 *   {"type":"stream_event","event":{"type":"content_block_start","content_block":{...}}}
 *   {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
 *   {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"..."}}}
 *   {"type":"assistant","message":{"content":[...]},...}  ← complete message (used for tool_use blocks)
 *   {"type":"result","subtype":"success","session_id":"..."}
 */
export class StreamParser {
	parse(line: string): StreamEvent[] {
		const trimmed = line.trim();
		if (!trimmed) return [];

		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			return [];
		}

		const type = obj.type as string | undefined;

		// ── System init ──────────────────────────────────────────────────────
		if (type === "system" && obj.subtype === "init") {
			const sessionId = obj.session_id as string | undefined;
			if (sessionId) return [{ type: "session_id", sessionId }];
			return [];
		}

		// ── Compact boundary ────────────────────────────────────────────────
		if (type === "system" && obj.subtype === "compact_boundary") {
			const meta = obj.compact_metadata as Record<string, unknown> | undefined;
			return [{
				type: "compact_boundary",
				trigger: (meta?.trigger as "auto" | "manual") ?? "auto",
			}];
		}

		// ── Permission prompt ────────────────────────────────────────────────
		if (type === "system" && obj.subtype === "permission_prompt") {
			return [{
				type: "permission_prompt",
				toolName: (obj.tool_name as string) ?? "unknown",
				input: (obj.tool_input as Record<string, unknown>) ?? {},
				id: (obj.id as string) ?? String(Date.now()),
			}];
		}

		// ── Streaming events (the main path for text) ────────────────────────
		if (type === "stream_event") {
			const event = obj.event as Record<string, unknown> | undefined;
			if (!event) return [];
			return this.parseStreamEvent(event);
		}

		// ── Complete assistant message (tool_use blocks + session_id) ────────
		if (type === "assistant") {
			const message = obj.message as Record<string, unknown> | undefined;
			const content = message?.content as Array<Record<string, unknown>> | undefined;
			if (!content) return [];

			const events: StreamEvent[] = [];
			for (const block of content) {
				if (block.type === "tool_use") {
					events.push({
						type: "tool_use",
						id: (block.id as string) ?? "",
						name: (block.name as string) ?? "",
						input: (block.input as Record<string, unknown>) ?? {},
					});
				}
			}

			// Capture session_id from assistant message
			const sessionId = obj.session_id as string | undefined;
			if (sessionId) events.push({ type: "session_id", sessionId });

			return events;
		}

		// ── Tool results (arrive as user messages) ───────────────────────────
		if (type === "user") {
			const message = obj.message as Record<string, unknown> | undefined;
			const content = message?.content as Array<Record<string, unknown>> | undefined;
			if (!content) return [];

			const events: StreamEvent[] = [];
			for (const block of content) {
				if (block.type === "tool_result") {
					const raw = block.content;
					let text: string;
					if (typeof raw === "string") {
						text = raw;
					} else if (Array.isArray(raw)) {
						text = (raw as Array<Record<string, unknown>>)
							.filter((b) => b.type === "text")
							.map((b) => b.text as string)
							.join("\n");
					} else {
						text = "";
					}
					events.push({
						type: "tool_result",
						toolUseId: (block.tool_use_id as string) ?? "",
						content: text,
						isError: (block.is_error as boolean) ?? false,
					});
				}
			}
			return events;
		}

		// ── Final result ─────────────────────────────────────────────────────
		if (type === "result") {
			const events: StreamEvent[] = [];
			const sessionId = obj.session_id as string | undefined;
			if (sessionId) events.push({ type: "session_id", sessionId });

			if ((obj.is_error as boolean) || obj.subtype === "error_during_execution") {
				events.push({ type: "error", message: (obj.result as string) ?? "Execution error" });
			}

			events.push({ type: "done" });
			return events;
		}

		return [];
	}

	private parseStreamEvent(event: Record<string, unknown>): StreamEvent[] {
		const eventType = event.type as string;

		if (eventType === "content_block_delta") {
			const delta = event.delta as Record<string, unknown> | undefined;
			if (!delta) return [];

			if (delta.type === "text_delta") {
				return [{ type: "text_delta", delta: (delta.text as string) ?? "" }];
			}

			if (delta.type === "thinking_delta") {
				return [{
					type: "thinking",
					content: (delta.thinking as string) ?? "",
					partial: true,
				}];
			}
		}

		if (eventType === "content_block_start") {
			const block = event.content_block as Record<string, unknown> | undefined;
			if (!block) return [];

			if (block.type === "thinking") {
				return [{
					type: "thinking",
					content: (block.thinking as string) ?? "",
					partial: false,
				}];
			}
		}

		return [];
	}
}
