import type {
	SelectChatSession,
	SelectV2Host,
	SelectV2Workspace,
} from "@superset/db/schema";
import {
	pickActiveBinding,
	statusForBinding,
} from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import type { FleetAgentsMap } from "./hooks/useFleetAgents";

// The attention inbox: the Home's fleet, re-read as "who is waiting on Paul, for
// what, since when". Pure composition over data the app already has — Electric
// sessions/workspaces/hosts + the relay agent bindings — no new backend surface.
// Ranks follow cost-of-inaction: an agent blocked on input beats a finished run
// waiting for review, beats a host that just dropped offline, beats agents that
// are fine on their own, beats history.

export type AttentionRank =
	| "waiting"
	| "review"
	| "offline"
	| "working"
	| "idle";

const RANK_ORDER: Record<AttentionRank, number> = {
	waiting: 0,
	review: 1,
	offline: 2,
	working: 3,
	idle: 4,
};

/** A settled agent reads as "review ready" this long after its last activity. */
const REVIEW_WINDOW_MS = 30 * 60 * 1000;

/**
 * An offline host only outranks working agents while the loss is fresh — a
 * workspace idle since yesterday whose laptop lid closed is history, not an
 * incident.
 */
const OFFLINE_RELEVANCE_MS = 60 * 60 * 1000;

export interface AttentionItem {
	key: string;
	rank: AttentionRank;
	title: string;
	workspaceName: string | null;
	branch: string | null;
	agentDefinitionId: string | null;
	agentId: string | null;
	/** Epoch ms anchoring the age copy ("waiting for…" / "finished … ago"). */
	since: number | null;
	/** The latest agent poll failed — the row shows the last good snapshot. */
	pollErrored: boolean;
	/** Epoch ms of the last successful agent poll (`0` = never reached). */
	fetchedAt: number;
	/**
	 * Tap target — a live agent row's OWN session (joined by `terminalId`),
	 * falling back to the workspace's most recently active session.
	 */
	session: SelectChatSession;
	/** Sessions behind this row (history lives on the workspace screens). */
	sessionCount: number;
}

export interface AttentionSourceGroup {
	workspace: SelectV2Workspace | null;
	/** Sessions sorted most-recent-first. */
	sessions: SelectChatSession[];
}

function activeAtMs(session: SelectChatSession): number {
	const date = session.lastActiveAt ?? session.updatedAt ?? session.createdAt;
	return date instanceof Date ? date.getTime() : 0;
}

function compareAttention(a: AttentionItem, b: AttentionItem): number {
	const rankDelta = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
	if (rankDelta !== 0) return rankDelta;
	const aSince = a.since ?? 0;
	const bSince = b.since ?? 0;
	// Waiting: the agent that has waited longest is the most expensive to keep
	// ignoring. Everything else: freshest signal first.
	return a.rank === "waiting" ? aSince - bSince : bSince - aSince;
}

/**
 * Compose the prioritized attention list for the cockpit Home. One row per
 * live agent (two agents in one workspace are two things Paul may owe an
 * answer to), one row per settled workspace, one row per workspace-less
 * session. Sorted `waiting > review > offline > working > idle`, each row
 * anchored to the timestamp its age copy should count from.
 */
export function buildAttentionItems(
	groups: readonly AttentionSourceGroup[],
	hostsById: ReadonlyMap<string, SelectV2Host>,
	agentsByWorkspace: FleetAgentsMap,
	now: number,
): AttentionItem[] {
	const items: AttentionItem[] = [];

	for (const group of groups) {
		const rep = group.sessions[0];
		if (!rep) continue;
		const workspace = group.workspace;

		if (!workspace) {
			// Sessions without a workspace have no agent lifecycle to read — they
			// are plain history rows at the bottom of the inbox.
			for (const session of group.sessions) {
				items.push({
					key: `session:${session.id}`,
					rank: "idle",
					title: session.title?.trim() || "Untitled session",
					workspaceName: null,
					branch: null,
					agentDefinitionId: null,
					agentId: null,
					since: activeAtMs(session),
					pollErrored: false,
					fetchedAt: 0,
					session,
					sessionCount: 1,
				});
			}
			continue;
		}

		const online = hostsById.get(workspace.hostId)?.isOnline === true;
		const agents = agentsByWorkspace.get(workspace.id);
		const bindings = agents?.bindings ?? [];
		const title = rep.title?.trim() || workspace.name || "Untitled session";
		const base = {
			title,
			workspaceName: workspace.name ?? null,
			branch: workspace.branch ?? null,
			pollErrored: agents?.errored ?? false,
			fetchedAt: agents?.fetchedAt ?? 0,
			session: rep,
			sessionCount: group.sessions.length,
		};

		if (online) {
			const active = bindings.filter((binding) => {
				const kind = statusForBinding(binding, now).kind;
				return kind === "working" || kind === "waiting";
			});
			if (active.length > 0) {
				for (const binding of active) {
					const kind = statusForBinding(binding, now).kind;
					// Join the row to its OWN session via the terminal truth link, so
					// tapping a live agent opens that agent's session — never a
					// sibling's from the same workspace. Legacy sessions (null
					// `terminalId`, mirrored before the link existed) can't match a
					// binding, so they keep the representative fallback.
					const bound =
						group.sessions.find(
							(session) => session.terminalId === binding.terminalId,
						) ?? rep;
					items.push({
						...base,
						key: `agent:${workspace.id}:${binding.agentId}`,
						rank: kind === "waiting" ? "waiting" : "working",
						title: bound.title?.trim() || title,
						agentDefinitionId: binding.definitionId ?? null,
						agentId: binding.agentId,
						since: binding.lastEventAt,
						session: bound,
					});
				}
				continue;
			}
		}

		// No live agent → one workspace-level row.
		const latest = pickActiveBinding(bindings);
		const lastSignalAt = latest?.lastEventAt ?? activeAtMs(rep);
		let rank: AttentionRank;
		if (!online) {
			rank = now - lastSignalAt < OFFLINE_RELEVANCE_MS ? "offline" : "idle";
		} else {
			// A recently-settled agent is a result to review. Some agents end a turn
			// without a clean Stop hook (the working→idle staleness fold in
			// `statusForBinding`), so a folded `Start` counts as settled too.
			const settledRecently =
				latest != null &&
				(latest.lastEventType === "Stop" || latest.lastEventType === "Start") &&
				now - latest.lastEventAt < REVIEW_WINDOW_MS;
			rank = settledRecently ? "review" : "idle";
		}
		items.push({
			...base,
			key: `workspace:${workspace.id}`,
			rank,
			agentDefinitionId: latest?.definitionId ?? null,
			agentId: latest?.agentId ?? null,
			since: lastSignalAt,
		});
	}

	return items.sort(compareAttention);
}
