import type {
	SelectChatSession,
	SelectV2Host,
	SelectV2Workspace,
} from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { getCollections } from "@/lib/collections/collections";
import { resolveEmilienWorkspace } from "@/lib/emilien";
import {
	buildHostRoutingKey,
	listWorkspaceAgents,
	type TerminalAgentBinding,
} from "@/lib/relay/relay";
import type { LiveAgentStatusKind } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import {
	type AgentNotificationEvent,
	type AgentNotificationKind,
	diffAgentEvents,
} from "./agentNotificationEvents";
import {
	hasAgentNotificationPermission,
	presentAgentNotification,
	setAppBadgeCount,
} from "./notifier";
import { useNotificationScope } from "./preferences";

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
	/**
	 * Whether the workspace's host is currently online. Offline targets are not
	 * polled (they can't answer) but are kept so the watcher can notice a host
	 * dropping offline underneath an active agent — the observable failure mode.
	 */
	hostOnline: boolean;
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
		if (!host) continue;
		targets.push({
			workspaceId,
			routingKey: buildHostRoutingKey(organizationId, workspace.hostId),
			workspaceName: workspace.name ?? "Workspace",
			sessionId: session.id,
			sessionTitle: session.title ?? null,
			hostOnline: host.isOnline === true,
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
	if (kind === "offline") {
		return {
			title: `${label} unreachable`,
			body: `Host went offline while the agent was active${suffix}`,
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

	const { scope } = useNotificationScope();

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
	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
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

	// Granularity control (Settings → Notifications). `emilien` suppresses every
	// notification except Emilien's own workspace; `fleet` notifies for all. Read
	// through refs so the running poll honors a change without restarting.
	const emilienWorkspaceId = useMemo(
		() => resolveEmilienWorkspace(projects ?? [], workspaces ?? [])?.id ?? null,
		[projects, workspaces],
	);
	const scopeRef = useRef(scope);
	scopeRef.current = scope;
	const emilienWorkspaceIdRef = useRef(emilienWorkspaceId);
	emilienWorkspaceIdRef.current = emilienWorkspaceId;

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
			if (currentTargets.length === 0) {
				if (prevKindsRef.current.size > 0) {
					prevKindsRef.current = new Map();
					void setAppBadgeCount(0);
				}
				return;
			}

			const bindings: TerminalAgentBinding[] = [];
			await Promise.all(
				currentTargets
					.filter((target) => target.hostOnline)
					.map(async (target) => {
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

			// A host that dropped offline underneath an active agent is the failure
			// we can actually observe (agent crashes never reach the lifecycle
			// stream — a dead host just stops answering). Read the previous baseline
			// BEFORE the diff below rebuilds it from currently-answering hosts only:
			// the vanished keys exist exactly once, so this fires exactly once.
			const offlineEvents: AgentNotificationEvent[] = [];
			for (const target of currentTargets) {
				if (target.hostOnline) continue;
				for (const [key, kind] of prevKindsRef.current) {
					if (!key.startsWith(`${target.workspaceId}:`)) continue;
					if (kind !== "working" && kind !== "waiting") continue;
					offlineEvents.push({
						key,
						kind: "offline",
						workspaceId: target.workspaceId,
						agentId: key.slice(target.workspaceId.length + 1),
					});
					break;
				}
			}

			const { events: lifecycleEvents, next } = diffAgentEvents(
				prevKindsRef.current,
				bindings,
				Date.now(),
			);
			prevKindsRef.current = next;

			// App icon badge = agents waiting on Paul right now — kept in sync every
			// poll (not only when a notification fires) so an answered permission
			// clears the badge without a new alert.
			const waitingCount = [...next.values()].filter(
				(kind) => kind === "waiting",
			).length;
			void setAppBadgeCount(waitingCount);

			const events = [...offlineEvents, ...lifecycleEvents];
			if (events.length === 0) return;

			// Granularity: `emilien` keeps only Emilien's-own-workspace events (and
			// suppresses everything if we can't yet resolve which workspace that is —
			// "Emilien only" errs toward silence, never toward the whole fleet). The
			// lifecycle baseline `next` was already committed above for every agent,
			// so flipping back to `fleet` won't replay a burst of missed transitions.
			const emilienId = emilienWorkspaceIdRef.current;
			const scopedEvents =
				scopeRef.current === "emilien"
					? emilienId
						? events.filter((event) => event.workspaceId === emilienId)
						: []
					: events;
			if (scopedEvents.length === 0) return;

			// Only present if the user already granted permission — never prompt
			// from a background poll.
			if (!(await hasAgentNotificationPermission())) return;

			const targetByWorkspace = new Map(
				currentTargets.map((target) => [target.workspaceId, target]),
			);
			for (const event of scopedEvents) {
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
			// Toggle off / sign-out: a stale "2 waiting" badge with the watcher gone
			// would be a lie. An org-switch remount recomputes within one poll.
			void setAppBadgeCount(0);
		};
	}, []);

	return null;
}
