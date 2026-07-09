import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
	listWorkspaceAgents,
	type TerminalAgentBinding,
} from "@/lib/relay/relay";

// The cockpit Home polls live agent state for the fleet's workspaces so each row
// shows real agent-type + status. To keep the phone honest, we poll a touch
// slower than the session detail and cap the fan-out — a cockpit with dozens of
// live workspaces still only issues a bounded burst per tick.
const POLL_INTERVAL_MS = 5_000;
const MAX_WORKSPACES = 12;

export interface FleetWorkspaceRef {
	workspaceId: string;
	routingKey: string;
}

export type FleetAgentsMap = Map<string, TerminalAgentBinding[]>;
export type FleetAgentsPhase = "disabled" | "loading" | "ready";

export interface FleetAgentsResult {
	byWorkspace: FleetAgentsMap;
	phase: FleetAgentsPhase;
}

/**
 * Polls `terminalAgents.listByWorkspace` for a bounded set of online workspaces
 * and returns their live agent bindings keyed by workspace id. Failures for a
 * single workspace are swallowed (its previous bindings are kept) so one flaky
 * host never blanks the whole fleet. Callers MUST pass a memoized `workspaces`
 * array — its identity drives the poll lifecycle.
 */
export function useFleetAgents({
	workspaces,
	enabled,
}: {
	workspaces: FleetWorkspaceRef[];
	enabled: boolean;
}): FleetAgentsResult {
	const [byWorkspace, setByWorkspace] = useState<FleetAgentsMap>(
		() => new Map(),
	);
	const [phase, setPhase] = useState<FleetAgentsPhase>("disabled");
	const activeRef = useRef(true);

	useEffect(() => {
		activeRef.current = true;
		const refs = workspaces.slice(0, MAX_WORKSPACES);
		if (!enabled || refs.length === 0) {
			setPhase("disabled");
			setByWorkspace(new Map());
			return;
		}

		setPhase((prev) => (prev === "ready" ? prev : "loading"));

		const poll = async () => {
			if (!activeRef.current || AppState.currentState !== "active") return;
			const results = await Promise.allSettled(
				refs.map((ref) =>
					listWorkspaceAgents(ref.routingKey, ref.workspaceId).then(
						(bindings) => [ref.workspaceId, bindings] as const,
					),
				),
			);
			if (!activeRef.current) return;
			setByWorkspace((prev) => {
				const next = new Map(prev);
				for (const result of results) {
					if (result.status === "fulfilled") {
						next.set(result.value[0], result.value[1]);
					}
				}
				return next;
			});
			setPhase("ready");
		};

		void poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		return () => {
			activeRef.current = false;
			clearInterval(timer);
		};
	}, [workspaces, enabled]);

	return { byWorkspace, phase };
}
