import type { TerminalAgentBinding } from "@/lib/relay/relay";

// The host-service normalizes every agent hook into one of these lifecycle
// events (see `mapEventType`), which is what `lastEventType` carries.
export type LiveAgentStatusKind =
	| "working"
	| "waiting"
	| "idle"
	| "ended"
	| "unknown";

export interface LiveAgentStatus {
	kind: LiveAgentStatusKind;
	/** Short human label for the status pill. */
	label: string;
	/** Agent identifier of the binding this status was derived from. */
	agentId?: string;
	/** Epoch ms of the last lifecycle event. */
	since?: number;
}

// A `Start` event with no follow-up for this long is treated as settled: some
// agents finish a turn without emitting a clean `Stop` hook, so we don't want
// the pill stuck on "Working" forever.
const WORKING_STALE_MS = 2 * 60 * 1000;

const LABELS: Record<LiveAgentStatusKind, string> = {
	working: "Working",
	waiting: "Waiting for you",
	idle: "Idle",
	ended: "Session ended",
	unknown: "Connecting…",
};

function kindFromEvent(eventType: string): LiveAgentStatusKind {
	switch (eventType) {
		case "Start":
			return "working";
		case "PermissionRequest":
			return "waiting";
		case "Stop":
		case "Attached":
			return "idle";
		case "Detached":
			return "ended";
		default:
			return "unknown";
	}
}

/** Most recently active binding wins (by `lastEventAt`). */
export function pickActiveBinding(
	bindings: readonly TerminalAgentBinding[],
): TerminalAgentBinding | null {
	if (bindings.length === 0) return null;
	return bindings.reduce((latest, b) =>
		b.lastEventAt > latest.lastEventAt ? b : latest,
	);
}

/** Status for a single binding, with the same staleness fold as the header. */
export function statusForBinding(
	binding: TerminalAgentBinding,
	now: number,
): LiveAgentStatus {
	let kind = kindFromEvent(binding.lastEventType);
	if (kind === "working" && now - binding.lastEventAt > WORKING_STALE_MS) {
		kind = "idle";
	}
	return {
		kind,
		label: LABELS[kind],
		agentId: binding.agentId,
		since: binding.lastEventAt,
	};
}

/**
 * Derive the display status from the workspace's agent bindings. `now` is
 * injected so callers can re-derive on a ticking clock for staleness.
 */
export function deriveAgentStatus(
	bindings: readonly TerminalAgentBinding[],
	now: number,
): LiveAgentStatus {
	const active = pickActiveBinding(bindings);
	if (!active) {
		return { kind: "idle", label: LABELS.idle };
	}
	return statusForBinding(active, now);
}
