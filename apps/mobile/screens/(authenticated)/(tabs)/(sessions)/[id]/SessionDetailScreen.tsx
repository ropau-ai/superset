import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
import { Activity, TerminalIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useAgentTokens } from "@/hooks/useAgentTokens";
import { useSession } from "@/lib/auth/client";
import { buildHostRoutingKey, isRelayConfigured } from "@/lib/relay/relay";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { deriveAgentStatus, type LiveAgentStatus } from "./agentStatus";
import { ActivityFeed } from "./components/ActivityFeed";
import { LiveSessionHeader } from "./components/LiveSessionHeader";
import { LiveTerminal } from "./components/LiveTerminal";
import { SubAgentsPanel } from "./components/SubAgentsPanel";
import { useAgentActivity } from "./hooks/useAgentActivity";
import { useSessionActivity } from "./hooks/useSessionActivity";
import { useTerminalStream } from "./hooks/useTerminalStream";

type LiveTab = "terminal" | "activity";

/** Ticking wall clock so the duration + staleness re-derive live. */
function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

export function SessionDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const collections = useCollections();
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;
	const now = useNow(1000);
	const [tab, setTab] = useState<LiveTab>("terminal");

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

	const session = (sessions ?? []).find((item) => item.id === id) ?? null;
	const workspace =
		session?.v2WorkspaceId != null
			? ((workspaces ?? []).find((item) => item.id === session.v2WorkspaceId) ??
				null)
			: null;
	const host = workspace
		? ((hosts ?? []).find((item) => item.machineId === workspace.hostId) ??
			null)
		: null;

	const hostOnline = host ? host.isOnline : null;
	const relayConfigured = isRelayConfigured();
	const workspaceId = session?.v2WorkspaceId ?? null;
	const routingKey =
		organizationId && workspace
			? buildHostRoutingKey(organizationId, workspace.hostId)
			: null;
	const relayReady =
		relayConfigured && hostOnline === true && !!routingKey && !!workspaceId;

	// Real session-total token usage, polled from the host mastracode harness
	// over the relay; `null` (→ "—") until the host has a live runtime for it.
	const tokens = useAgentTokens({
		sessionId: id ?? null,
		workspaceId,
		routingKey,
		enabled: relayReady,
	});

	const activity = useAgentActivity({
		routingKey,
		workspaceId,
		enabled: relayReady,
	});
	const stream = useTerminalStream({
		routingKey,
		workspaceId,
		enabled: relayReady && tab === "terminal",
	});
	const sessionActivity = useSessionActivity({
		routingKey,
		sessionId: id ?? null,
		workspaceId,
		enabled: relayReady && tab === "activity",
	});

	const status = useMemo<LiveAgentStatus>(() => {
		if (!relayConfigured) return { kind: "ended", label: "Status unavailable" };
		if (hostOnline === false) return { kind: "ended", label: "Host offline" };
		if (hostOnline === null) return { kind: "ended", label: "No host" };
		if (activity.phase === "loading" && activity.bindings.length === 0) {
			return { kind: "unknown", label: "Connecting…" };
		}
		return deriveAgentStatus(activity.bindings, now);
	}, [relayConfigured, hostOnline, activity.phase, activity.bindings, now]);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerClassName="gap-5 p-6"
			contentInsetAdjustmentBehavior="automatic"
		>
			{session ? (
				<>
					<Stack.Screen
						options={{ title: workspace?.name ?? "Live session" }}
					/>
					<LiveSessionHeader
						hostOnline={hostOnline}
						lastActiveAt={
							session.lastActiveAt ?? session.updatedAt ?? session.createdAt
						}
						now={now}
						startedAt={session.createdAt}
						status={status}
						title={session.title ?? "Untitled session"}
						tokens={tokens}
						workspaceName={workspace?.name ?? "No workspace"}
					/>

					<SubAgentsPanel
						bindings={activity.bindings}
						now={now}
						phase={activity.phase}
						sessionTokens={tokens}
					/>

					<Tabs
						className="gap-4"
						onValueChange={(value) => setTab(value as LiveTab)}
						value={tab}
					>
						<TabsList>
							<TabsTrigger value="terminal">
								<Icon as={TerminalIcon} className="size-4" strokeWidth={2} />
								<Text>Terminal</Text>
							</TabsTrigger>
							<TabsTrigger value="activity">
								<Icon as={Activity} className="size-4" strokeWidth={2} />
								<Text>Activity</Text>
							</TabsTrigger>
						</TabsList>

						<TabsContent value="terminal">
							<LiveTerminal relayConfigured={relayConfigured} stream={stream} />
						</TabsContent>

						<TabsContent value="activity">
							<ActivityFeed
								hostOnline={hostOnline}
								messages={sessionActivity.messages}
								phase={sessionActivity.phase}
								relayConfigured={relayConfigured}
								variant="activity"
							/>
						</TabsContent>
					</Tabs>
				</>
			) : sessionsReady ? (
				<View className="items-center justify-center py-20">
					<Text className="text-center text-muted-foreground">
						Session not found
					</Text>
				</View>
			) : null}
		</ScrollView>
	);
}
