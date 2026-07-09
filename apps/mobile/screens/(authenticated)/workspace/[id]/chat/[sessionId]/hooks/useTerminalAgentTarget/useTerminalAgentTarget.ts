import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { listHostTerminals } from "@/lib/relay/relay";
import { deterministicSessionId } from "@/lib/relay/terminalSessionId";

// Poll cadence for terminal discovery. The mapping is stable once found (a
// session's terminalId never changes), so this only matters while the agent's
// terminal is still coming up; we stop polling the moment we resolve one.
const POLL_INTERVAL_MS = 4_000;

/**
 * Whether this chat session is backed by a terminal agent, and — if so — the
 * live `terminalId` to stream and write into.
 *
 * - `resolving`: no answer yet (first list in flight).
 * - `terminal`: a live terminal whose derived id matches this session → talk to
 *   it over the PTY (`terminal.writeInput`) and stream its output.
 * - `chat`: no terminal matched → a real chat agent, use `chat.sendMessage`.
 */
export type TerminalAgentTarget =
	| { status: "resolving" }
	| { status: "terminal"; terminalId: string; title: string | null }
	| { status: "chat" };

interface UseTerminalAgentTargetArgs {
	routingKey: string | null;
	workspaceId: string | null;
	sessionId: string | null;
	/** Relay reachable (configured + host online). */
	enabled: boolean;
}

/**
 * Resolves a chat session to its send path. A terminal/CLI agent (Emilien,
 * `claude`, any PTY agent) is mirrored into `chat_sessions` with a *derived* id
 * — `UUIDv5(namespace, terminalId)` — while a real chat agent gets a random id.
 * So we list the workspace's live terminals and recompute that id forward: a
 * match means this session is a terminal agent (and hands back its terminalId);
 * no match after a successful list means it's a chat agent. Purely a read; the
 * derivation is local (no extra host call beyond the terminal list the terminal
 * stream already makes).
 */
export function useTerminalAgentTarget({
	routingKey,
	workspaceId,
	sessionId,
	enabled,
}: UseTerminalAgentTargetArgs): TerminalAgentTarget {
	const [target, setTarget] = useState<TerminalAgentTarget>({
		status: "resolving",
	});
	// The session identity the current classification belongs to, so navigating
	// to another session resets to "resolving" instead of flashing a stale path.
	const identityRef = useRef<string | null>(null);

	useEffect(() => {
		const identity =
			routingKey && workspaceId && sessionId
				? `${routingKey}::${workspaceId}::${sessionId}`
				: null;
		if (identity !== identityRef.current) {
			setTarget({ status: "resolving" });
			identityRef.current = identity;
		}

		if (!enabled || !routingKey || !workspaceId || !sessionId) return;

		let active = true;
		let timer: ReturnType<typeof setInterval> | null = null;
		const stop = () => {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		};

		const resolve = async () => {
			if (!active || AppState.currentState !== "active") return;
			try {
				const { sessions } = await listHostTerminals(routingKey, workspaceId);
				if (!active) return;
				const match = sessions.find(
					(session) => deterministicSessionId(session.terminalId) === sessionId,
				);
				if (match) {
					setTarget({
						status: "terminal",
						terminalId: match.terminalId,
						title: match.title,
					});
					stop(); // The mapping is fixed — no need to keep polling.
				} else {
					// A successful list with no match means it's a chat agent. Don't
					// downgrade a terminal we already found on a later blip.
					setTarget((prev) =>
						prev.status === "terminal" ? prev : { status: "chat" },
					);
				}
			} catch {
				// Transient relay/host error — keep the last classification and retry.
			}
		};

		void resolve();
		timer = setInterval(resolve, POLL_INTERVAL_MS);
		return () => {
			active = false;
			stop();
		};
	}, [routingKey, workspaceId, sessionId, enabled]);

	return target;
}
