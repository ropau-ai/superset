import type {
	SelectChatSession,
	SelectV2Host,
	SelectV2Workspace,
} from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { getCollections } from "@/lib/collections/collections";
import {
	buildHostRoutingKey,
	listWorkspaceAgents,
	type TerminalAgentBinding,
} from "@/lib/relay/relay";
import type { LiveAgentStatusKind } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import {
	type AgentNotificationKind,
	diffAgentEvents,
} from "./agentNotificationEvents";
import {
	hasAgentNotificationPermission,
	presentAgentNotification,
} from "./notifier";

// Root-mounted, render-nothing watcher. It consumes the same live agent state as
// the Live Session screen — Electric-synced sessions/workspaces/hosts to know
// *which* workspaces to watch, then the relay's `terminalAgents.listByWorkspace`
// (same call `useAgentActivity` makes) to read each one's lifecycle — and fires a
// LOCAL notification on the transitions that matter. It never mutates that state.
//
// Like `useAgentActivity`, it only polls while the app is foregrounded: local
// notifications are scheduled from JS, so true background delivery is the remote
// APNs story (see `registerForPushNotificationsAsync`). On returning to the
// foreground a transition that happened while away still fires on the next poll.

const POLL_INTERVAL_MS = 5_000;

interface PollTarget {
	workspaceId: string;
	routingKey: string;
	workspaceName: string;
	/** Representative (most-recently-active) session to deep-link to. */
	sessionId: string;
	sessionTitle: string | null;
}

function sessionRecency(session: SelectChatSession): number {
	const date =
		session.lastActiveAt ?? session.updatedAt ?? session.createdAt ?? null;
	return date instanceof Date ? date.getTime() : 0;
}

/**
 * Reduce Electric-synced rows to the set of workspaces worth polling: those on
 * an online host, each paired with its most-recently-active session so a tapped
 * notification lands on a live screen.
 */
function buildPollTargets(
	sessions: readonly SelectChatSession[],
	workspaces: readonly SelectV2Workspace[],
	hosts: readonly SelectV2Host[],
	organizationId: string,
): PollTarget[] {
	const hostByMachine = new Map(hosts.map((host) => [host.machineId, host]));
	const workspaceById = new Map(workspaces.map((ws) => [ws.id, ws]));

	const bestSessionByWorkspace = new Map<string, SelectChatSession>();
	for (const session of sessions) {
		const workspaceId = session.v2WorkspaceId;
		if (!workspaceId) continue;
		const current = bestSessionByWorkspace.get(workspaceId);
		if (!current || sessionRecency(session) > sessionRecency(current)) {
			bestSessionByWorkspace.set(workspaceId, session);
		}
	}

	const targets: PollTarget[] = [];
	for (const [workspaceId, session] of bestSessionByWorkspace) {
		const workspace = workspaceById.get(workspaceId);
		if (!workspace) continue;
		const host = hostByMachine.get(workspace.hostId);
		if (!host || !host.isOnline) continue;
		targets.push({
			workspaceId,
			routingKey: buildHostRoutingKey(organizationId, workspace.hostId),
			workspaceName: workspace.name ?? "Workspace",
			sessionId: session.id,
			sessionTitle: session.title ?? null,
		});
	}
	return targets;
}

function notificationCopy(
	kind: AgentNotificationKind,
	target: PollTarget,
): { title: string; body: string } {
	const label = target.sessionTitle?.trim() || target.workspaceName;
	const suffix =
		label === target.workspaceName ? "" : ` · ${target.workspaceName}`;
	if (kind === "waiting") {
		return {
			title: `${label} needs you`,
			body: `Waiting for your approval${suffix}`,
		};
	}
	return {
		title: `${label} finished`,
		body: `Agent is done${suffix}`,
	};
}

export function AgentNotificationWatcher({
	organizationId,
}: {
	organizationId: string;
}) {
	const collections = useMemo(
		() => getCollections(organizationId),
		[organizationId],
	);

	const { data: sessions } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);
	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const targets = useMemo(
		() =>
			buildPollTargets(
				sessions ?? [],
				workspaces ?? [],
				hosts ?? [],
				organizationId,
			),
		[sessions, workspaces, hosts, organizationId],
	);

	// Latest targets read inside the interval without restarting it.
	const targetsRef = useRef<PollTarget[]>(targets);
	targetsRef.current = targets;

	// Last-seen lifecycle kind per agent, so we only notify on real transitions.
	const prevKindsRef = useRef<Map<string, LiveAgentStatusKind>>(new Map());

	// A different org is a different world of agents — reset the baseline on an org
	// switch (during render, so it's in place before the next poll) rather than
	// carrying stale keys forward.
	const watchedOrgRef = useRef(organizationId);
	if (watchedOrgRef.current !== organizationId) {
		watchedOrgRef.current = organizationId;
		prevKindsRef.current = new Map();
	}

	useEffect(() => {
		let cancelled = false;

		const poll = async () => {
			if (cancelled || AppState.currentState !== "active") return;
			const currentTargets = targetsRef.current;
			if (currentTargets.length === 0) return;

			const bindings: TerminalAgentBinding[] = [];
			await Promise.all(
				currentTargets.map(async (target) => {
					try {
						const result = await listWorkspaceAgents(
							target.routingKey,
							target.workspaceId,
						);
						bindings.push(...result);
					} catch {
						// Host unreachable this tick — skip it, retry next interval.
					}
				}),
			);
			if (cancelled) return;

			const { events, next } = diffAgentEvents(
				prevKindsRef.current,
				bindings,
				Date.now(),
			);
			prevKindsRef.current = next;
			if (events.length === 0) return;

			// Only present if the user already granted permission — never prompt
			// from a background poll.
			if (!(await hasAgentNotificationPermission())) return;

			const targetByWorkspace = new Map(
				currentTargets.map((target) => [target.workspaceId, target]),
			);
			for (const event of events) {
				const target = targetByWorkspace.get(event.workspaceId);
				if (!target) continue;
				const { title, body } = notificationCopy(event.kind, target);
				await presentAgentNotification({
					title,
					body,
					sessionId: target.sessionId,
				});
			}
		};

		void poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		const appStateSub = AppState.addEventListener("change", (state) => {
			if (state === "active") void poll();
		});

		return () => {
			cancelled = true;
			clearInterval(timer);
			appStateSub.remove();
		};
	}, []);

	return null;
}
