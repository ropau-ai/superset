import type { SelectChatSession } from "@superset/db/schema";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function SessionRow({
	session,
	onPress,
}: {
	session: SelectChatSession;
	onPress: () => void;
}) {
	const activeAt =
		session.lastActiveAt ?? session.updatedAt ?? session.createdAt;
	// `endedAt` is authoritative (the host stamped the terminal's exit) — say so
	// instead of presenting finished history as a live session.
	const ended = session.endedAt != null;

	return (
		<Pressable
			className="active:bg-accent flex-row items-center gap-3 px-4 py-3"
			onPress={onPress}
		>
			<View className="size-9 items-center justify-center">
				<Icon
					as={MessageSquare}
					className="text-muted-foreground size-5"
					strokeWidth={1.75}
				/>
			</View>
			<View className="flex-1 gap-0.5">
				<Text className="font-medium" numberOfLines={1}>
					{session.title ?? "Untitled session"}
				</Text>
				<Text className="text-muted-foreground text-xs" numberOfLines={1}>
					{ended
						? `Ended ${formatDistanceToNow(session.endedAt ?? activeAt, { addSuffix: true })}`
						: formatDistanceToNow(activeAt, { addSuffix: true })}
				</Text>
			</View>
		</Pressable>
	);
}
