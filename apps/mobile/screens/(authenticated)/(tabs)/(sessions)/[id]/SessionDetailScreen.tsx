import { useLiveQuery } from "@tanstack/react-db";
import { format, formatDistanceToNow } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { Circle, Cloud, CloudOff } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function SessionDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
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

	return (
		<ScrollView className="flex-1 bg-background">
			<View className="gap-5 p-6">
				{session ? (
					<>
						<View className="gap-3">
							<Text className="text-2xl font-bold" numberOfLines={3}>
								{session.title ?? "Untitled session"}
							</Text>
							<View className="flex-row items-center gap-2">
								<Icon
									as={host?.isOnline ? Cloud : host ? CloudOff : Circle}
									className="text-muted-foreground size-4"
									strokeWidth={1.75}
								/>
								<Text className="text-muted-foreground" numberOfLines={1}>
									{workspace?.name ?? "No workspace"}
								</Text>
								{host ? (
									<Text className="text-muted-foreground text-xs">
										· {host.isOnline ? "online" : "offline"}
									</Text>
								) : null}
							</View>
							<Text className="text-muted-foreground text-sm">
								Last active{" "}
								{formatDistanceToNow(
									session.lastActiveAt ??
										session.updatedAt ??
										session.createdAt,
									{ addSuffix: true },
								)}
							</Text>
							<Text className="text-muted-foreground text-xs">
								Created {format(session.createdAt, "PPp")}
							</Text>
						</View>
						<View className="border-border min-h-[220px] rounded-xl border">
							<ConversationEmptyState
								title="Live tracking coming soon"
								description="Session activity and messages will stream here once the agent runtime is wired up."
							/>
						</View>
					</>
				) : sessionsReady ? (
					<View className="items-center justify-center py-20">
						<Text className="text-center text-muted-foreground">
							Session not found
						</Text>
					</View>
				) : null}
			</View>
		</ScrollView>
	);
}
