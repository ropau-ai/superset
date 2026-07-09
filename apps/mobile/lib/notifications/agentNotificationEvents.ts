import type { TerminalAgentBinding } from "@/lib/relay/relay";
import {
	type LiveAgentStatusKind,
	statusForBinding,
} from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";

// Pure transition logic for agent notifications. This is the read-only consumer
// of the Live Session's `agentStatus.ts`: we reuse the exact same host-event →
// lifecycle mapping (incl. the "working" staleness fold) so a notification and
// the on-screen status pill can never disagree about what an agent is doing.

/** The two moments worth a notification. */
export type AgentNotificationKind = "waiting" | "done";

export interface AgentNotificationEvent {
	/** Stable dedup key: `${workspaceId}:${agentId}`. */
	key: string;
	kind: AgentNotificationKind;
	workspaceId: string;
	agentId: string;
}

/** Dedup key for a binding — scoped by workspace since one machine hosts many. */
export function bindingKey(binding: TerminalAgentBinding): string {
	return `${binding.workspaceId}:${binding.agentId}`;
}

/**
 * Diff a fresh set of agent bindings against the previously-seen lifecycle state
 * and emit a notification event for each meaningful transition:
 *
 * - `waiting`  — an agent entered `PermissionRequest` ("Waiting for you").
 * - `done`     — an agent that was active (working/waiting) settled to idle/ended.
 *
 * The returned `next` map is the state to feed back on the following poll.
 *
 * First observations (a binding we've never seen) are seeded silently — never
 * notified — so a cold start, or a workspace coming online, doesn't fire a burst
 * of notifications for states that were already true before we were watching.
 */
export function diffAgentEvents(
	prev: ReadonlyMap<string, LiveAgentStatusKind>,
	bindings: readonly TerminalAgentBinding[],
	now: number,
): {
	events: AgentNotificationEvent[];
	next: Map<string, LiveAgentStatusKind>;
} {
	const next = new Map<string, LiveAgentStatusKind>();
	const events: AgentNotificationEvent[] = [];

	for (const binding of bindings) {
		const key = bindingKey(binding);
		const kind = statusForBinding(binding, now).kind;
		next.set(key, kind);

		const prevKind = prev.get(key);
		if (prevKind === undefined || prevKind === kind) continue;

		if (kind === "waiting") {
			events.push({
				key,
				kind: "waiting",
				workspaceId: binding.workspaceId,
				agentId: binding.agentId,
			});
		} else if (
			(kind === "idle" || kind === "ended") &&
			(prevKind === "working" || prevKind === "waiting")
		) {
			events.push({
				key,
				kind: "done",
				workspaceId: binding.workspaceId,
				agentId: binding.agentId,
			});
		}
	}

	return { events, next };
}
