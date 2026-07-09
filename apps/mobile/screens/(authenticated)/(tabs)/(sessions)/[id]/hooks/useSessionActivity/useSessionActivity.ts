import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
	type ChatActivityMessage,
	HostRequestError,
	listSessionMessages,
} from "@/lib/relay/relay";

// Slower than the web's 4fps poll on purpose: the phone is battery-constrained
// and the host lazily (re)creates a runtime per read, so a few seconds keeps
// the timeline live without hammering the host.
const POLL_INTERVAL_MS = 3_000;

// `unavailable`: the host answered but has no chat thread for this session
// (terminal agents like Emilien never open a mastra thread) — an empty state,
// not a failure. `error`: the host couldn't be reached at all.
export type SessionActivityPhase =
	| "disabled"
	| "loading"
	| "ready"
	| "unavailable"
	| "error";

export interface SessionActivityResult {
	messages: ChatActivityMessage[];
	phase: SessionActivityPhase;
	error: string | null;
}

interface UseSessionActivityArgs {
	routingKey: string | null;
	sessionId: string | null;
	workspaceId: string | null;
	/** Relay reachable (configured + host online) AND the tab is visible. */
	enabled: boolean;
}

/**
 * Polls the host's `chat.listMessages` over the relay so the Activity tab shows
 * the agent's real per-tool timeline (bash / diffs / commits / tool-use). There
 * is no Electric-synced message table today, so this relay poll is the real
 * source; when the relay isn't reachable the hook reports `disabled` and the
 * feed degrades to a clear notice. Errors (host has no model credentials, the
 * session never started) surface as `error` rather than crashing.
 */
export function useSessionActivity({
	routingKey,
	sessionId,
	workspaceId,
	enabled,
}: UseSessionActivityArgs): SessionActivityResult {
	const [messages, setMessages] = useState<ChatActivityMessage[]>([]);
	const [phase, setPhase] = useState<SessionActivityPhase>("disabled");
	const [error, setError] = useState<string | null>(null);
	const activeRef = useRef(true);
	// The session identity the cached messages belong to, so a tab toggle (which
	// only flips `enabled`) can be told apart from navigating to another session.
	const identityRef = useRef<string | null>(null);

	useEffect(() => {
		activeRef.current = true;
		const identityKey =
			routingKey && sessionId && workspaceId
				? `${routingKey}::${sessionId}::${workspaceId}`
				: null;

		// Only wipe the cached transcript when the session identity actually
		// changes. A tab toggle keeps the same identity, so the timeline survives
		// the switch — no reset, no loading flash on the way back.
		if (identityKey !== identityRef.current) {
			setMessages([]);
			setError(null);
			identityRef.current = identityKey;
		}

		// Equivalent to `!identityKey`, but written out so TS narrows the three
		// params to non-null for the poll below.
		if (!routingKey || !sessionId || !workspaceId) {
			setPhase("disabled");
			return;
		}
		if (!enabled) {
			// Tab hidden but the same session — pause polling and keep the last
			// transcript + phase so switching back shows it instantly.
			return;
		}

		setPhase((prev) => (prev === "ready" ? prev : "loading"));

		const poll = async () => {
			if (!activeRef.current) return;
			if (AppState.currentState !== "active") return;
			try {
				const result = await listSessionMessages(
					routingKey,
					sessionId,
					workspaceId,
				);
				if (!activeRef.current) return;
				setMessages(Array.isArray(result) ? result : []);
				setError(null);
				setPhase("ready");
			} catch (err) {
				if (!activeRef.current) return;
				// A 5xx from `chat.listMessages` means the host was reached but has no
				// live chat thread for this session — treat it as "nothing here yet",
				// not a red error. Only a real reachability failure is an error. Either
				// way we never surface the raw `procedure failed (500)` string.
				const noThread = err instanceof HostRequestError && err.status >= 500;
				setError(noThread ? null : "Couldn't reach the host. Retrying…");
				setPhase((prev) =>
					prev === "ready" ? prev : noThread ? "unavailable" : "error",
				);
			}
		};

		void poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		return () => {
			activeRef.current = false;
			clearInterval(timer);
		};
	}, [routingKey, sessionId, workspaceId, enabled]);

	return { messages, phase, error };
}
