import type { ChatActivityMessage, ChatMessagePart } from "@/lib/relay/relay";

function partText(part: ChatMessagePart): string {
	const record = part as unknown as Record<string, unknown>;
	if (record.type !== "text") return "";
	return typeof record.text === "string" ? record.text : "";
}

/**
 * The plain prose an assistant message would read aloud: its `text` parts joined,
 * with reasoning, tool calls, and attachments deliberately skipped (they don't
 * speak well). Returns "" for user messages or anything with nothing speakable,
 * so callers can cheaply decide whether to offer a speaker affordance at all.
 */
export function speakableText(message: ChatActivityMessage): string {
	if (message.role === "user") return "";
	const content = Array.isArray(message.content) ? message.content : [];
	return content.map(partText).filter(Boolean).join("\n\n").trim();
}
