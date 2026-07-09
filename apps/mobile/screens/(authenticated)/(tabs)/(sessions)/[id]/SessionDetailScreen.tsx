import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
import { Activity, TerminalIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Header + terminal placeholder while the session hydrates (vs. a blank screen). */
function SessionDetailSkeleton() {
	return (
		<View className="flex-1 gap-5 p-6">
			<View className="gap-3">
				<Skeleton className="h-6 w-40" />
				<View className="flex-row gap-2">
					<Skeleton className="h-7 w-28 rounded-full" />
					<Skeleton className="h-7 w-20 rounded-full" />
				</View>
			</View>
			<Skeleton className="h-9 w-48 rounded-lg" />
			<Skeleton className="flex-1 rounded-2xl" />
		</View>
	);
}

export function SessionDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const collections = useCollections();
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;
	// Durations/staleness only need a coarse tick — a 1s clock re-rendered the
	// whole session screen (incl. the live terminal) every second.
	const now = useNow(20_000);
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

	if (!session) {
		return (
			<View className="flex-1 bg-background">
				{sessionsReady ? (
					<View className="flex-1 items-center justify-center p-6">
						<Text className="text-center text-muted-foreground">
							Session not found
						</Text>
					</View>
				) : (
					// Cache-first: still hydrating → a header + terminal skeleton, never
					// a blank dark screen.
					<SessionDetailSkeleton />
				)}
			</View>
		);
	}

	return (
		// A non-scrolling flex column: the header + sub-agents sit fixed above, and
		// the terminal (or the Activity list) owns the remaining height via flex-1.
		// This kills the old page-ScrollView-wrapping-a-terminal-ScrollView, whose
		// same-axis nesting made terminal history scroll the page on iOS.
		<View className="flex-1 gap-5 bg-background p-6">
			<Stack.Screen options={{ title: workspace?.name ?? "Live session" }} />
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
				className="flex-1 gap-4"
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

				<TabsContent className="flex-1" value="terminal">
					<LiveTerminal
						className="flex-1"
						relayConfigured={relayConfigured}
						stream={stream}
					/>
				</TabsContent>

				<TabsContent className="flex-1" value="activity">
					<ScrollView
						className="flex-1"
						contentContainerClassName="pb-6"
						keyboardDismissMode="interactive"
					>
						<ActivityFeed
							hostOnline={hostOnline}
							messages={sessionActivity.messages}
							phase={sessionActivity.phase}
							relayConfigured={relayConfigured}
							variant="activity"
						/>
					</ScrollView>
				</TabsContent>
			</Tabs>
		</View>
	);
}
