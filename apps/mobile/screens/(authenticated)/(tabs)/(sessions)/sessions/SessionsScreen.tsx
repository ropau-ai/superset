import type { SelectChatSession, SelectV2Workspace } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { compareDesc } from "date-fns";
import { useRouter } from "expo-router";
import { Circle, Cloud, CloudOff } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { SectionList, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { SessionRow } from "./components/SessionRow";

const NO_WORKSPACE_KEY = "__no_workspace__";

type SessionSection = {
	key: string;
	workspace: SelectV2Workspace | null;
	hostOnline: boolean | undefined;
	data: SelectChatSession[];
};

function lastActiveAt(session: SelectChatSession): Date {
	return session.lastActiveAt ?? session.updatedAt ?? session.createdAt;
}

export function SessionsScreen() {
	const router = useRouter();
	const collections = useCollections();

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

	const sections = useMemo<SessionSection[]>(() => {
		const workspacesById = new Map(
			(workspaces ?? []).map((workspace) => [workspace.id, workspace]),
		);
		const hostsById = new Map(
			(hosts ?? []).map((host) => [host.machineId, host]),
		);

		const groups = new Map<string, SessionSection>();
		for (const session of sessions ?? []) {
			const workspace = session.v2WorkspaceId
				? (workspacesById.get(session.v2WorkspaceId) ?? null)
				: null;
			const key = workspace?.id ?? NO_WORKSPACE_KEY;
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					workspace,
					hostOnline: workspace
						? hostsById.get(workspace.hostId)?.isOnline
						: undefined,
					data: [],
				};
				groups.set(key, group);
			}
			group.data.push(session);
		}

		for (const group of groups.values()) {
			group.data.sort((a, b) => compareDesc(lastActiveAt(a), lastActiveAt(b)));
		}

		return [...groups.values()].sort((a, b) => {
			if (a.key === NO_WORKSPACE_KEY) return 1;
			if (b.key === NO_WORKSPACE_KEY) return -1;
			return compareDesc(lastActiveAt(a.data[0]), lastActiveAt(b.data[0]));
		});
	}, [sessions, workspaces, hosts]);

	const renderItem = useCallback(
		({ item }: { item: SelectChatSession }) => (
			<SessionRow
				session={item}
				onPress={() =>
					router.push(`/(authenticated)/(tabs)/(sessions)/${item.id}`)
				}
			/>
		),
		[router],
	);

	const renderSectionHeader = useCallback(
		({ section }: { section: SessionSection }) => {
			const HostIcon =
				section.hostOnline === undefined
					? Circle
					: section.hostOnline
						? Cloud
						: CloudOff;
			return (
				<View className="bg-background flex-row items-center gap-2 px-4 pt-5 pb-1">
					<Icon
						as={HostIcon}
						className="text-muted-foreground size-4"
						strokeWidth={1.75}
					/>
					<Text
						className="text-muted-foreground text-xs font-medium uppercase tracking-wide"
						numberOfLines={1}
					>
						{section.workspace?.name ?? "No workspace"}
					</Text>
				</View>
			);
		},
		[],
	);

	return (
		<SectionList
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ paddingBottom: 112 }}
			sections={sections}
			extraData={renderItem}
			keyExtractor={(item) => item.id}
			renderItem={renderItem}
			renderSectionHeader={renderSectionHeader}
			stickySectionHeadersEnabled={false}
			ListEmptyComponent={
				sessionsReady ? (
					<View className="items-center justify-center py-20">
						<Text className="text-center text-muted-foreground">
							No sessions yet
						</Text>
					</View>
				) : null
			}
		/>
	);
}
