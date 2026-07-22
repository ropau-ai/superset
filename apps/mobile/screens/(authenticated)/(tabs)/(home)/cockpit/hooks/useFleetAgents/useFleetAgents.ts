import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
	listWorkspaceAgents,
	type TerminalAgentBinding,
} from "@/lib/relay/relay";

// The cockpit Home polls live agent state for the fleet's workspaces so each row
// shows real agent-type + status. Coverage is COMPLETE — a cockpit that silently
// drops workspace #13 is lying to the person delegating to it — but the burst per
// tick stays bounded: the fan-out is chunked, so a large fleet issues a few
// requests at a time instead of N at once, and a tick that outlives the interval
// never stacks a second burst on top of itself.
const POLL_INTERVAL_MS = 5_000;
const CHUNK_SIZE = 8;

export interface FleetWorkspaceRef {
	workspaceId: string;
	routingKey: string;
}

/** Live agent state for one workspace, with the honesty metadata the UI needs. */
export interface FleetWorkspaceAgents {
	bindings: TerminalAgentBinding[];
	/** Epoch ms of the last successful poll — `0` when nothing ever succeeded. */
	fetchedAt: number;
	/**
	 * The latest poll attempt for this workspace failed. `bindings`/`fetchedAt`
	 * keep the last good snapshot (so one flaky tick never blanks a row), but the
	 * UI must say so — stale data presented as fresh is worse than an error.
	 */
	errored: boolean;
}

export type FleetAgentsMap = Map<string, FleetWorkspaceAgents>;
export type FleetAgentsPhase = "disabled" | "loading" | "ready";

export interface FleetAgentsResult {
	byWorkspace: FleetAgentsMap;
	phase: FleetAgentsPhase;
	/** Workspaces whose latest poll failed — surfaced to the UI, never swallowed. */
	erroredCount: number;
}

/**
 * Polls `terminalAgents.listByWorkspace` for EVERY online workspace and returns
 * live agent bindings + freshness metadata keyed by workspace id. A failed
 * workspace keeps its previous bindings but is flagged `errored` so callers can
 * render an explicit "stale since…" marker instead of passing old data off as
 * current. Callers MUST pass a memoized `workspaces` array — its identity drives
 * the poll lifecycle.
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
	const [erroredCount, setErroredCount] = useState(0);
	const [phase, setPhase] = useState<FleetAgentsPhase>("disabled");
	const activeRef = useRef(true);

	useEffect(() => {
		activeRef.current = true;
		if (!enabled || workspaces.length === 0) {
			setPhase("disabled");
			setByWorkspace(new Map());
			setErroredCount(0);
			return;
		}

		setPhase((prev) => (prev === "ready" ? prev : "loading"));

		// Overlap guard: a slow tick (big fleet / slow relay) must finish before
		// the next one starts, or bursts pile up on a struggling connection.
		let inFlight = false;

		const poll = async () => {
			if (!activeRef.current || inFlight) return;
			if (AppState.currentState !== "active") return;
			inFlight = true;
			try {
				const settled: PromiseSettledResult<TerminalAgentBinding[]>[] = [];
				for (let i = 0; i < workspaces.length; i += CHUNK_SIZE) {
					const chunk = workspaces.slice(i, i + CHUNK_SIZE);
					settled.push(
						...(await Promise.allSettled(
							chunk.map((ref) =>
								listWorkspaceAgents(ref.routingKey, ref.workspaceId),
							),
						)),
					);
					if (!activeRef.current) return;
				}

				const fetchedAt = Date.now();
				const errors = settled.filter(
					(result) => result.status !== "fulfilled",
				).length;
				setByWorkspace((prev) => {
					// Rebuilt from the current refs, so workspaces that left the fleet
					// (host offline, session gone) drop out instead of lingering forever.
					const next: FleetAgentsMap = new Map();
					workspaces.forEach((ref, index) => {
						const result = settled[index];
						if (result?.status === "fulfilled") {
							next.set(ref.workspaceId, {
								bindings: result.value,
								fetchedAt,
								errored: false,
							});
						} else {
							const previous = prev.get(ref.workspaceId);
							next.set(ref.workspaceId, {
								bindings: previous?.bindings ?? [],
								fetchedAt: previous?.fetchedAt ?? 0,
								errored: true,
							});
						}
					});
					return next;
				});
				setErroredCount(errors);
				setPhase("ready");
			} finally {
				inFlight = false;
			}
		};

		void poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		return () => {
			activeRef.current = false;
			clearInterval(timer);
		};
	}, [workspaces, enabled]);

	return { byWorkspace, phase, erroredCount };
}
