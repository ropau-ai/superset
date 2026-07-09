import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
	listWorkspaceAgents,
	type TerminalAgentBinding,
} from "@/lib/relay/relay";

const POLL_INTERVAL_MS = 4_000;

export type AgentActivityPhase = "disabled" | "loading" | "ready" | "error";

export interface AgentActivityResult {
	bindings: TerminalAgentBinding[];
	phase: AgentActivityPhase;
	error: string | null;
}

interface UseAgentActivityArgs {
	routingKey: string | null;
	workspaceId: string | null;
	/** Relay reachable (configured + host online). */
	enabled: boolean;
}

/**
 * Polls the host's `terminalAgents.listByWorkspace` over the relay so the Live
 * Session header + activity feed reflect the workspace's live agent lifecycle.
 * There is no Electric-synced agent-state on mobile today, so this relay poll is
 * the real source; when the relay isn't reachable the hook reports `disabled`
 * and the screen degrades to a "connecting to host" state.
 */
export function useAgentActivity({
	routingKey,
	workspaceId,
	enabled,
}: UseAgentActivityArgs): AgentActivityResult {
	const [bindings, setBindings] = useState<TerminalAgentBinding[]>([]);
	const [phase, setPhase] = useState<AgentActivityPhase>("disabled");
	const [error, setError] = useState<string | null>(null);
	const activeRef = useRef(true);

	useEffect(() => {
		activeRef.current = true;
		if (!enabled || !routingKey || !workspaceId) {
			setPhase("disabled");
			setBindings([]);
			setError(null);
			return;
		}

		setPhase((prev) => (prev === "ready" ? prev : "loading"));

		const poll = async () => {
			if (!activeRef.current) return;
			if (AppState.currentState !== "active") return;
			try {
				const result = await listWorkspaceAgents(routingKey, workspaceId);
				if (!activeRef.current) return;
				setBindings(result);
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
	}, [routingKey, workspaceId, enabled]);

	return { bindings, phase, error };
}
