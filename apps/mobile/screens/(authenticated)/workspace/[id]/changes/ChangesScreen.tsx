import { useLiveQuery } from "@tanstack/react-db";
import { useLocalSearchParams } from "expo-router";
import { CloudOff, GitCompare, Unplug, WifiOff } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { buildHostRoutingKey, isRelayConfigured } from "@/lib/relay/relay";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { ChangedFileRow } from "./components/ChangedFileRow";
import { ChangesNotice } from "./components/ChangesNotice";
import { ChangesSkeleton } from "./components/ChangesSkeleton";
import { useWorkspaceChanges } from "./hooks/useWorkspaceChanges";

/**
 * The workspace Changes tab: a live, tappable list of the files this workspace's
 * branch changed, each expanding to its per-file diff. Data comes from the
 * host's `git.getStatus` / `git.getDiff` over the relay — the same source
 * desktop's DiffPane and web's SessionDiff read (see useWorkspaceChanges). It
 * renders four states — loading skeleton, populated list, empty ("No changes"),
 * and a calm notice when the relay/host is unreachable — and never surfaces a
 * raw host error.
 */
export function ChangesScreen() {
	const { id: workspaceId } = useLocalSearchParams<{ id: string }>();
	const theme = useTheme();
	const collections = useCollections();
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;

	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const workspace =
		(workspaces ?? []).find((item) => item.id === workspaceId) ?? null;
	const host = workspace
		? ((hosts ?? []).find((item) => item.machineId === workspace.hostId) ??
			null)
		: null;

	const hostOnline = host ? host.isOnline : null;
	const relayConfigured = isRelayConfigured();
	const routingKey =
		organizationId && workspace
			? buildHostRoutingKey(organizationId, workspace.hostId)
			: null;
	const relayReady =
		relayConfigured && hostOnline === true && !!routingKey && !!workspace;

	const { changes, phase, refresh } = useWorkspaceChanges({
		routingKey,
		workspaceId: workspace?.id ?? null,
		enabled: relayReady,
	});

	const [refreshing, setRefreshing] = useState(false);
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await refresh();
		} finally {
			setRefreshing(false);
		}
	}, [refresh]);

	const hasFiles = !!changes && changes.fileCount > 0;

	// Cache-first: whenever we hold a snapshot with files, render the list — even
	// if a later poll transiently flips to loading/unavailable/error.
	if (hasFiles && changes) {
		return (
			<ScrollView
				className="flex-1 bg-background"
				contentContainerClassName="gap-2 p-4"
				refreshControl={
					<RefreshControl
						onRefresh={onRefresh}
						refreshing={refreshing}
						tintColor={theme.mutedForeground}
					/>
				}
			>
				<View className="flex-row items-center gap-2 px-1 pb-1">
					<Text className="font-medium text-sm">
						{changes.fileCount} {changes.fileCount === 1 ? "file" : "files"}{" "}
						changed
					</Text>
					<View className="flex-row items-center gap-1.5">
						{changes.additions > 0 ? (
							<Text className="font-mono text-green-600 text-xs dark:text-green-400">
								+{changes.additions}
							</Text>
						) : null}
						{changes.deletions > 0 ? (
							<Text className="font-mono text-red-600 text-xs dark:text-red-400">
								-{changes.deletions}
							</Text>
						) : null}
					</View>
				</View>
				{changes.entries.map((entry) => (
					<ChangedFileRow
						entry={entry}
						key={`${entry.category}:${entry.path}`}
						routingKey={routingKey}
						workspaceId={workspace?.id ?? null}
					/>
				))}
			</ScrollView>
		);
	}

	// No files to show yet — pick the right non-list state.
	let body: ReactNode;
	if (phase === "disabled") {
		body = relayConfigured ? (
			<ChangesNotice
				description="This workspace's host is offline. Its changes will appear when it reconnects."
				icon={CloudOff}
				title="Host offline"
			/>
		) : (
			<ChangesNotice
				description="This build isn't pointed at a relay yet, so this workspace's changes can't be reached."
				icon={Unplug}
				title="Relay not configured"
			/>
		);
	} else if (phase === "loading") {
		body = <ChangesSkeleton />;
	} else if (phase === "error") {
		body = (
			<ChangesNotice
				description="We'll reconnect automatically — pull to refresh to retry now."
				icon={WifiOff}
				title="Can't reach the host"
			/>
		);
	} else if (phase === "unavailable") {
		body = (
			<ChangesNotice
				description="Changes will appear once this workspace's host is updated."
				icon={GitCompare}
				title="Changes unavailable"
			/>
		);
	} else {
		// ready + empty
		body = (
			<ChangesNotice
				description="When the agent edits files in this workspace, they'll show up here."
				icon={GitCompare}
				title="No changes yet"
			/>
		);
	}

	// Keep pull-to-refresh available on the notice states too (except the plain
	// loading skeleton, which is already refreshing on its own).
	if (phase === "loading") {
		return <View className="flex-1 bg-background">{body}</View>;
	}

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerClassName="flex-1"
			refreshControl={
				<RefreshControl
					onRefresh={onRefresh}
					refreshing={refreshing}
					tintColor={theme.mutedForeground}
				/>
			}
		>
			{body}
		</ScrollView>
	);
}
