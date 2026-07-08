// Token usage per agent run / session — see the Cockpit spec §TOKENS.
//
// AUDIT (2026-07-08): there is NO live token/usage source anywhere the mobile
// app can read. Not in the relay `chat.listMessages` payload (ChatActivityMessage
// carries no usage field), not in `terminalAgents.listByWorkspace` bindings
// (TerminalAgentBinding has none), not in the Electric-synced chat_sessions /
// v2_* tables, and the host-service never emits usage. So this hook returns
// `null` today and every token surface renders a clean "—" — NEVER a fabricated
// number.
//
// TODO(backend): once the host surfaces usage, wire it here in ONE place and
// every badge (fleet rows, SubAgentsPanel, session/chat headers) lights up.
// Two likely shapes to plumb through the relay:
//   1. add `usage?: { inputTokens; outputTokens; totalTokens }` to
//      ChatActivityMessage (host `chat.listMessages`) and sum per session; or
//   2. add a `usage` field to TerminalAgentBinding
//      (host `terminalAgents.listByWorkspace`) for per-agent totals.
// Then replace `resolveTokens()` below with the summed values and the whole UI
// becomes live with no component changes.

export interface AgentTokens {
	/** Total tokens across the run (input + output + cache). */
	total: number;
	/** Input tokens, when the source breaks it down (else `null`). */
	input: number | null;
	/** Output tokens, when the source breaks it down (else `null`). */
	output: number | null;
}

export interface UseAgentTokensArgs {
	/** Sum usage across a chat session's messages, when a source exists. */
	sessionId?: string | null;
	/** Or a single agent binding's usage, when a source exists. */
	agentId?: string | null;
}

// Single seam the backend wiring plugs into. Returns `null` until a real usage
// source lands — see the file header for the exact fields to sum.
function resolveTokens(_args: UseAgentTokensArgs): AgentTokens | null {
	return null;
}

/**
 * Token usage for a session or a sub-agent run. Returns `null` when no live
 * usage source is reachable (the case today) so callers render "—" rather than
 * inventing a number. Pure + synchronous: it's a formatting seam, not a fetch.
 */
export function useAgentTokens(
	args: UseAgentTokensArgs = {},
): AgentTokens | null {
	return resolveTokens(args);
}

/** Compact token label: 842 → "842", 12_400 → "12.4k", 1_200_000 → "1.2M". */
export function formatTokenCount(n: number): string {
	if (!Number.isFinite(n) || n < 0) return "—";
	if (n < 1000) return `${Math.round(n)}`;
	if (n < 1_000_000) {
		const k = n / 1000;
		return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
	}
	const m = n / 1_000_000;
	return `${m >= 100 ? Math.round(m) : m.toFixed(1)}M`;
}
