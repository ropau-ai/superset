import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getSessionTokenUsage } from "@/lib/relay/relay";

// Token usage per session — see the Cockpit spec §TOKENS.
//
// SOURCE (2026-07-08): the mastracode chat harness on the host tracks real,
// model-reported cumulative token usage per thread and persists it to the
// thread metadata (so it survives a runtime re-attach). The host-service now
// exposes it over the relay as `chat.getTokenUsage`, and this hook polls it —
// so a session with a live runtime (the pinned Emilien card, an open session
// detail) shows its real running total. When the host has no live runtime for
// the session it returns `null` and every token surface renders a clean "—":
// we never fabricate a number, and we never spin up a runtime just to read a
// counter (that's why unopened fleet rows and per-terminal-agent rows, which
// have no live chat runtime / no clean source, stay "—").

export interface AgentTokens {
	/** Total tokens across the run (input + output + cache). */
	total: number;
	/** Input tokens, when the source breaks it down (else `null`). */
	input: number | null;
	/** Output tokens, when the source breaks it down (else `null`). */
	output: number | null;
}

export interface UseAgentTokensArgs {
	/** The chat session whose cumulative usage to read (`chat_sessions.id`). */
	sessionId?: string | null;
	/** The session's `v2WorkspaceId` — required to reach the host runtime. */
	workspaceId?: string | null;
	/** Relay routing key for the session's host. */
	routingKey?: string | null;
	/** Relay reachable (configured + host online) AND the surface is visible. */
	enabled?: boolean;
	/**
	 * A single terminal-agent binding's usage. Kept for the SubAgentsPanel per-row
	 * badge, but there is no clean per-terminal-agent usage source today (the CLI
	 * agents run in an interactive PTY and the hook events carry no usage), so this
	 * path always resolves to `null` → "—". Never fabricated.
	 */
	agentId?: string | null;
}

// A few seconds is plenty: usage only moves when the agent finishes a turn, and
// the phone is battery-constrained. Mirrors the session-activity poll cadence.
const POLL_INTERVAL_MS = 4_000;

/**
 * Real cumulative token usage for a chat session, polled from the host over the
 * relay. Returns `null` — so callers render "—" — until a live source is
 * reachable (relay configured, host online, session has a live runtime). The
 * single seam every token badge reads through: fleet rows, SubAgentsPanel, and
 * session/chat headers all flow through here.
 */
export function useAgentTokens(
	args: UseAgentTokensArgs = {},
): AgentTokens | null {
	const { sessionId, workspaceId, routingKey, enabled = true } = args;
	const [tokens, setTokens] = useState<AgentTokens | null>(null);
	const activeRef = useRef(true);

	useEffect(() => {
		activeRef.current = true;
		if (!enabled || !routingKey || !sessionId || !workspaceId) {
			setTokens(null);
			return;
		}

		const poll = async () => {
			if (!activeRef.current) return;
			if (AppState.currentState !== "active") return;
			try {
				const usage = await getSessionTokenUsage(
					routingKey,
					sessionId,
					workspaceId,
				);
				if (!activeRef.current) return;
				setTokens(
					usage
						? { total: usage.total, input: usage.input, output: usage.output }
						: null,
				);
			} catch {
				// Transient relay/host error — keep the last known value rather than
				// flashing "—"; the next poll recovers.
			}
		};

		void poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		return () => {
			activeRef.current = false;
			clearInterval(timer);
		};
	}, [enabled, routingKey, sessionId, workspaceId]);

	return tokens;
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
