// The agent kinds a host can launch. Paul orchestrates through Emilien today,
// but the fleet is meant to be multi-runtime (Claude + Codex + Gemini + …), so
// these presets back both the new-session agent picker (future launch) and the
// agent-type chip we derive from a live binding's `definitionId`.

export type AgentTypeId =
	| "claude"
	| "codex"
	| "gemini"
	| "opencode"
	| "amp"
	| "mastracode"
	| "cursor-agent";

export interface AgentTypePreset {
	id: AgentTypeId;
	/** Full display name for the picker. */
	label: string;
	/** Compact chip label. */
	short: string;
}

export const AGENT_TYPE_PRESETS: readonly AgentTypePreset[] = [
	{ id: "claude", label: "Claude", short: "claude" },
	{ id: "codex", label: "Codex", short: "codex" },
	{ id: "gemini", label: "Gemini", short: "gemini" },
	{ id: "opencode", label: "OpenCode", short: "opencode" },
	{ id: "amp", label: "Amp", short: "amp" },
	{ id: "mastracode", label: "Mastra", short: "mastra" },
	{ id: "cursor-agent", label: "Cursor", short: "cursor" },
];

export const DEFAULT_AGENT_TYPE: AgentTypeId = "claude";

/**
 * Best-effort agent-type label from a live binding's `definitionId`. The host's
 * definition ids aren't a fixed enum on mobile, so we match known presets by
 * substring (case-insensitive) and otherwise fall back to the first token — good
 * enough for a chip, and it degrades to `null` when there's nothing to show.
 */
export function agentTypeLabelFromDefinition(
	definitionId?: string | null,
): string | null {
	const raw = definitionId?.trim();
	if (!raw) return null;
	const lower = raw.toLowerCase();
	const match = AGENT_TYPE_PRESETS.find((preset) => lower.includes(preset.id));
	if (match) return match.short;
	// Unknown definition — surface its first path/colon segment as a hint.
	const token = raw.split(/[:/\s]/)[0];
	return token.length > 0 ? token.toLowerCase() : null;
}
