import type { SelectChatSession } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { compareDesc } from "date-fns";
import { useRouter } from "expo-router";
import { ChevronsUpDown, FolderGit2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmilienLogo } from "@/components/EmilienLogo";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAgentTokens } from "@/hooks/useAgentTokens";
import { useSession } from "@/lib/auth/client";
import { buildHostRoutingKey, isRelayConfigured } from "@/lib/relay/relay";
import {
	deriveAgentStatus,
	type LiveAgentStatus,
} from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import { useAgentActivity } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/hooks/useAgentActivity";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationSwitcherSheet } from "../workspaces/components/OrganizationSwitcherSheet";
import { OrganizationAvatar } from "../workspaces/components/OrganizationSwitcherSheet/components/OrganizationAvatar";
import { type AttentionSourceGroup, buildAttentionItems } from "./attention";
import { AttentionInbox } from "./components/AttentionInbox";
import { EmilienCard } from "./components/EmilienCard";
import { useEmilienSession } from "./hooks/useEmilienSession";
import { type FleetWorkspaceRef, useFleetAgents } from "./hooks/useFleetAgents";

const NO_WORKSPACE_KEY = "__no_workspace__";

/** Ticking wall clock so durations + staleness re-derive live. */
function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

function lastActiveAt(session: SelectChatSession): Date {
	return session.lastActiveAt ?? session.updatedAt ?? session.createdAt;
}

/**
 * The cockpit Home — Emilien-centric. A pinned Emilien hero (live status, tap →
 * chat) sits above the attention inbox: every other agent/workspace as one row,
 * sorted by cost of inaction (waiting > review > offline > working > idle) with
 * live status pulled from the relay. The old workspace list lives on as a
 * sub-screen reachable from the header.
 */
export function CockpitScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const collections = useCollections();
	const { width } = useWindowDimensions();
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;
	// Durations ("up 2h 14m", "last active…") only need a coarse tick; a 1s clock
	// re-rendered the whole cockpit every second (battery on a left-open screen).
	const now = useNow(20_000);
	const [switcherOpen, setSwitcherOpen] = useState(false);

	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const emilien = useEmilienSession();

	const { data: sessions, isReady: sessionsReady } = useLiveQuery(
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

	const hostsById = useMemo(
		() => new Map((hosts ?? []).map((host) => [host.machineId, host])),
		[hosts],
	);
	const workspacesById = useMemo(
		() =>
			new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace])),
		[workspaces],
	);

	// --- Emilien live status (single-workspace relay poll) ------------------
	const relayConfigured = isRelayConfigured();
	const emilienHostOnline = emilien.host ? emilien.host.isOnline : null;
	const emilienRoutingKey =
		organizationId && emilien.workspace
			? buildHostRoutingKey(organizationId, emilien.workspace.hostId)
			: null;
	const emilienRelayReady =
		relayConfigured &&
		emilienHostOnline === true &&
		!!emilienRoutingKey &&
		!!emilien.workspace;
	const emilienActivity = useAgentActivity({
		routingKey: emilienRoutingKey,
		workspaceId: emilien.workspace?.id ?? null,
		enabled: emilienRelayReady,
	});
	const emilienStatus = useMemo<LiveAgentStatus>(() => {
		if (!relayConfigured || emilienHostOnline === null) {
			return { kind: "idle", label: "Idle" };
		}
		if (emilienHostOnline === false) {
			return { kind: "ended", label: "Host offline" };
		}
		if (
			emilienActivity.phase === "loading" &&
			emilienActivity.bindings.length === 0
		) {
			return { kind: "unknown", label: "Connecting…" };
		}
		return deriveAgentStatus(emilienActivity.bindings, now);
	}, [
		relayConfigured,
		emilienHostOnline,
		emilienActivity.phase,
		emilienActivity.bindings,
		now,
	]);
	// Real cumulative usage for Emilien's session, polled over the relay. Emilien
	// runs 24/7 so its host runtime stays live → the card shows a running total.
	const emilienTokens = useAgentTokens({
		sessionId: emilien.session?.id ?? null,
		workspaceId: emilien.workspace?.id ?? null,
		routingKey: emilienRoutingKey,
		enabled: emilienRelayReady,
	});

	// --- Fleet: every non-Emilien session, grouped by workspace -------------
	const rawFleetGroups = useMemo<AttentionSourceGroup[]>(() => {
		const emilienSessionId = emilien.session?.id ?? null;
		const groups = new Map<string, AttentionSourceGroup>();
		for (const session of sessions ?? []) {
			if (emilienSessionId && session.id === emilienSessionId) continue;
			const workspace = session.v2WorkspaceId
				? (workspacesById.get(session.v2WorkspaceId) ?? null)
				: null;
			const key = workspace?.id ?? NO_WORKSPACE_KEY;
			let group = groups.get(key);
			if (!group) {
				group = { workspace, sessions: [] };
				groups.set(key, group);
			}
			group.sessions.push(session);
		}
		for (const group of groups.values()) {
			group.sessions.sort((a, b) =>
				compareDesc(lastActiveAt(a), lastActiveAt(b)),
			);
		}
		return [...groups.values()].sort((a, b) => {
			if (!a.workspace) return 1;
			if (!b.workspace) return -1;
			return compareDesc(
				lastActiveAt(a.sessions[0]),
				lastActiveAt(b.sessions[0]),
			);
		});
	}, [sessions, workspacesById, emilien.session?.id]);

	// Online fleet workspaces we poll for live agent-type + status (full coverage).
	const fleetWorkspaceRefs = useMemo<FleetWorkspaceRef[]>(() => {
		if (!organizationId) return [];
		const refs: FleetWorkspaceRef[] = [];
		for (const group of rawFleetGroups) {
			const workspace = group.workspace;
			if (!workspace) continue;
			if (!hostsById.get(workspace.hostId)?.isOnline) continue;
			refs.push({
				workspaceId: workspace.id,
				routingKey: buildHostRoutingKey(organizationId, workspace.hostId),
			});
		}
		return refs;
	}, [rawFleetGroups, hostsById, organizationId]);

	const fleetAgents = useFleetAgents({
		workspaces: fleetWorkspaceRefs,
		enabled: relayConfigured && fleetWorkspaceRefs.length > 0,
	});

	const attentionItems = useMemo(
		() =>
			buildAttentionItems(
				rawFleetGroups,
				hostsById,
				fleetAgents.byWorkspace,
				now,
			),
		[rawFleetGroups, hostsById, fleetAgents.byWorkspace, now],
	);

	const projectLabel = emilien.project
		? `${emilien.project.name} / ${emilien.workspace?.branch ?? "main"}`
		: "Zuno-Emilien / main";

	const openEmilienChat = () => {
		if (emilien.session && emilien.workspace) {
			router.push(
				`/(authenticated)/workspace/${emilien.workspace.id}/chat/${emilien.session.id}`,
			);
		}
	};

	const handleSwitchOrganization = (id: string) => {
		setSwitcherOpen(false);
		switchOrganization(id);
	};

	return (
		<View className="flex-1 bg-background">
			<View
				className="flex-row items-center gap-2.5 px-5 pb-3"
				style={{ paddingTop: insets.top + 6 }}
			>
				<EmilienLogo size={26} />
				<Pressable
					className="flex-1 flex-row items-center gap-1.5"
					onPress={() => setSwitcherOpen(true)}
				>
					<Text className="font-bold text-xl" numberOfLines={1}>
						{activeOrganization?.name ?? "Emilien"}
					</Text>
					<Icon
						as={ChevronsUpDown}
						className="size-4 text-muted-foreground"
						strokeWidth={2}
					/>
				</Pressable>
				<Pressable
					hitSlop={8}
					onPress={() =>
						router.push("/(authenticated)/(tabs)/(home)/workspaces")
					}
					className="p-1"
				>
					<Icon
						as={FolderGit2}
						className="size-5 text-muted-foreground"
						strokeWidth={1.75}
					/>
				</Pressable>
				<Pressable hitSlop={8} onPress={() => setSwitcherOpen(true)}>
					<OrganizationAvatar
						logo={activeOrganization?.logo}
						name={activeOrganization?.name}
						size={30}
					/>
				</Pressable>
			</View>

			<ScrollView
				className="flex-1"
				contentContainerClassName="gap-6 px-5 pt-2"
				contentContainerStyle={{ paddingBottom: 120 }}
			>
				<EmilienCard
					hasSession={!!emilien.session && !!emilien.workspace}
					hostOnline={emilienHostOnline}
					lastActiveAt={emilien.session ? lastActiveAt(emilien.session) : null}
					now={now}
					onPress={openEmilienChat}
					projectLabel={projectLabel}
					startedAt={emilien.session?.createdAt ?? null}
					status={emilienStatus}
					tokens={emilienTokens}
				/>

				<AttentionInbox
					items={attentionItems}
					loading={!sessionsReady}
					now={now}
					onPressItem={(item) =>
						router.push(`/(authenticated)/(tabs)/(sessions)/${item.session.id}`)
					}
				/>
			</ScrollView>

			<OrganizationSwitcherSheet
				activeOrganizationId={activeOrganizationId}
				isPresented={switcherOpen}
				onIsPresentedChange={setSwitcherOpen}
				onSwitchOrganization={handleSwitchOrganization}
				organizations={organizations}
				width={width}
			/>
		</View>
	);
}
