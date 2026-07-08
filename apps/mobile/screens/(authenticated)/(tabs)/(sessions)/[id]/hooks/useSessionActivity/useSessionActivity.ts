import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
	type ChatActivityMessage,
	listSessionMessages,
} from "@/lib/relay/relay";

// Slower than the web's 4fps poll on purpose: the phone is battery-constrained
// and the host lazily (re)creates a runtime per read, so a few seconds keeps
// the timeline live without hammering the host.
const POLL_INTERVAL_MS = 3_000;

export type SessionActivityPhase = "disabled" | "loading" | "ready" | "error";

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

	useEffect(() => {
		activeRef.current = true;
		if (!enabled || !routingKey || !sessionId || !workspaceId) {
			setPhase("disabled");
			setMessages([]);
			setError(null);
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
				setError(err instanceof Error ? err.message : "Failed to reach host");
				setPhase((prev) => (prev === "ready" ? prev : "error"));
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
