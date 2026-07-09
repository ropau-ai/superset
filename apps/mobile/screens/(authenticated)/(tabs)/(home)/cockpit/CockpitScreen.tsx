import type {
	SelectGithubPullRequest,
	SelectV2Project,
	SelectV2Workspace,
} from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { compareDesc } from "date-fns";
import { useRouter } from "expo-router";
import { ChevronsUpDown } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAgentTokens } from "@/hooks/useAgentTokens";
import { useSession } from "@/lib/auth/client";
import { buildHostRoutingKey, isRelayConfigured } from "@/lib/relay/relay";
import {
	deriveAgentStatus,
	type LiveAgentStatus,
	pickActiveBinding,
} from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import { useAgentActivity } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/hooks/useAgentActivity";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationSwitcherSheet } from "../workspaces/components/OrganizationSwitcherSheet";
import { OrganizationAvatar } from "../workspaces/components/OrganizationSwitcherSheet/components/OrganizationAvatar";
import { EmilienCard } from "./components/EmilienCard";
import {
	type FleetProjectGroup,
	FleetSection,
} from "./components/FleetSection";
import { UserAvatar } from "./components/UserAvatar";
import { useEmilienSession } from "./hooks/useEmilienSession";
import { type FleetWorkspaceRef, useFleetAgents } from "./hooks/useFleetAgents";

const EPOCH = new Date(0);

/** Ticking wall clock so durations + staleness re-derive live. */
function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

/** Raw project grouping before per-workspace view data is resolved. */
interface RawProjectGroup {
	projectId: string;
	project: SelectV2Project | null;
	workspaces: SelectV2Workspace[];
}

/**
 * The cockpit Home — Emilien-centric. A pinned Emilien hero (live status, tap →
 * chat) sits above the fleet: every workspace (branch) in the org except
 * Emilien's own, grouped by project like the desktop sidebar. Each row carries
 * its diff, host state, and live agent-type. The header is the org switcher on
 * the left and the signed-in user's account avatar on the right.
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

	const { data: workspaces, isReady: workspacesReady } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);
	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
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
	const projectsById = useMemo(
		() => new Map((projects ?? []).map((project) => [project.id, project])),
		[projects],
	);

	// Best PR per branch (open > merged > closed/draft), for each row's diff badge.
	const pullRequestsByBranch = useMemo(() => {
		const byBranch = new Map<string, SelectGithubPullRequest>();
		const rank = (state: string) =>
			state === "open" ? 2 : state === "merged" ? 1 : 0;
		for (const pullRequest of pullRequests ?? []) {
			const existing = byBranch.get(pullRequest.headBranch);
			if (!existing || rank(pullRequest.state) > rank(existing.state)) {
				byBranch.set(pullRequest.headBranch, pullRequest);
			}
		}
		return byBranch;
	}, [pullRequests]);

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

	// --- Fleet: every non-Emilien workspace, grouped by project -------------
	const rawGroups = useMemo<RawProjectGroup[]>(() => {
		const emilienWorkspaceId = emilien.workspace?.id ?? null;
		const groups = new Map<string, RawProjectGroup>();
		for (const workspace of workspaces ?? []) {
			if (emilienWorkspaceId && workspace.id === emilienWorkspaceId) continue;
			let group = groups.get(workspace.projectId);
			if (!group) {
				group = {
					projectId: workspace.projectId,
					project: projectsById.get(workspace.projectId) ?? null,
					workspaces: [],
				};
				groups.set(workspace.projectId, group);
			}
			group.workspaces.push(workspace);
		}
		for (const group of groups.values()) {
			group.workspaces.sort((a, b) => compareDesc(a.updatedAt, b.updatedAt));
		}
		return [...groups.values()].sort((a, b) =>
			compareDesc(
				a.workspaces[0]?.updatedAt ?? EPOCH,
				b.workspaces[0]?.updatedAt ?? EPOCH,
			),
		);
	}, [workspaces, projectsById, emilien.workspace?.id]);

	// Online fleet workspaces we poll for live agent-type (bounded fan-out).
	const fleetWorkspaceRefs = useMemo<FleetWorkspaceRef[]>(() => {
		if (!organizationId) return [];
		const refs: FleetWorkspaceRef[] = [];
		for (const group of rawGroups) {
			for (const workspace of group.workspaces) {
				if (!hostsById.get(workspace.hostId)?.isOnline) continue;
				refs.push({
					workspaceId: workspace.id,
					routingKey: buildHostRoutingKey(organizationId, workspace.hostId),
				});
			}
		}
		return refs;
	}, [rawGroups, hostsById, organizationId]);

	const fleetAgents = useFleetAgents({
		workspaces: fleetWorkspaceRefs,
		enabled: relayConfigured && fleetWorkspaceRefs.length > 0,
	});

	const fleetGroups = useMemo<FleetProjectGroup[]>(() => {
		return rawGroups.map((group) => ({
			key: group.projectId,
			projectName: group.project?.name ?? "Project",
			projectIconUrl: group.project?.iconUrl ?? null,
			workspaces: group.workspaces.map((workspace) => {
				const bindings = fleetAgents.byWorkspace.get(workspace.id) ?? [];
				const active = pickActiveBinding(bindings);
				return {
					workspace,
					pullRequest: pullRequestsByBranch.get(workspace.branch),
					hostOnline: hostsById.get(workspace.hostId)?.isOnline,
					agentDefinitionId: active?.definitionId ?? null,
				};
			}),
		}));
	}, [rawGroups, fleetAgents.byWorkspace, pullRequestsByBranch, hostsById]);

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
				<Pressable
					className="flex-1 flex-row items-center gap-2"
					hitSlop={6}
					onPress={() => setSwitcherOpen(true)}
				>
					<OrganizationAvatar
						logo={activeOrganization?.logo}
						name={activeOrganization?.name}
						size={30}
					/>
					<Text className="shrink font-bold text-xl" numberOfLines={1}>
						{activeOrganization?.name ?? "Organization"}
					</Text>
					<Icon
						as={ChevronsUpDown}
						className="size-4 text-muted-foreground"
						strokeWidth={2}
					/>
				</Pressable>
				<Pressable
					accessibilityLabel="Account"
					accessibilityRole="button"
					hitSlop={8}
					onPress={() => router.navigate("/(authenticated)/(tabs)/(more)")}
				>
					<UserAvatar
						image={authData?.user?.image}
						name={authData?.user?.name}
						size={32}
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
					lastActiveAt={
						emilien.session
							? (emilien.session.lastActiveAt ??
								emilien.session.updatedAt ??
								emilien.session.createdAt)
							: null
					}
					now={now}
					onPress={openEmilienChat}
					projectLabel={projectLabel}
					startedAt={emilien.session?.createdAt ?? null}
					status={emilienStatus}
					tokens={emilienTokens}
				/>

				<FleetSection
					groups={fleetGroups}
					loading={!workspacesReady}
					onPressWorkspace={(workspace) =>
						router.push(`/(authenticated)/workspace/${workspace.id}/chat`)
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
