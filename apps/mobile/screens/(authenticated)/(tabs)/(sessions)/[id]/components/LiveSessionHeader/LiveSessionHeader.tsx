import { formatDistanceToNow } from "date-fns";
import { Circle, Clock, Cloud, CloudOff } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { LiveAgentStatus } from "../../agentStatus";
import { AgentStatusBadge } from "../AgentStatusBadge";

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
	return `${seconds}s`;
}

export interface LiveSessionHeaderProps {
	title: string;
	workspaceName: string;
	/** `null` when there's no associated host. */
	hostOnline: boolean | null;
	status: LiveAgentStatus;
	startedAt: Date;
	lastActiveAt: Date;
	/** Ticking clock (epoch ms) so the duration updates live. */
	now: number;
}

export function LiveSessionHeader({
	title,
	workspaceName,
	hostOnline,
	status,
	startedAt,
	lastActiveAt,
	now,
}: LiveSessionHeaderProps) {
	const HostIcon = hostOnline === null ? Circle : hostOnline ? Cloud : CloudOff;
	const hostLabel =
		hostOnline === null ? null : hostOnline ? "online" : "offline";

	return (
		<View className="gap-3">
			<Text className="font-bold text-2xl" numberOfLines={3}>
				{title}
			</Text>

			<View className="flex-row items-center gap-2">
				<Icon
					as={HostIcon}
					className={
						hostOnline
							? "size-4 text-emerald-500"
							: "size-4 text-muted-foreground"
					}
					strokeWidth={1.75}
				/>
				<Text className="text-muted-foreground" numberOfLines={1}>
					{workspaceName}
				</Text>
				{hostLabel ? (
					<Text className="text-muted-foreground text-xs">· {hostLabel}</Text>
				) : null}
			</View>

			<View className="flex-row items-center gap-3 pt-0.5">
				<AgentStatusBadge kind={status.kind} label={status.label} />
				<View className="flex-row items-center gap-1.5">
					<Icon
						as={Clock}
						className="size-3.5 text-muted-foreground"
						strokeWidth={1.75}
					/>
					<Text className="font-mono text-muted-foreground text-xs">
						{formatDuration(now - startedAt.getTime())}
					</Text>
				</View>
			</View>

			<Text className="text-muted-foreground text-xs">
				Last active {formatDistanceToNow(lastActiveAt, { addSuffix: true })}
			</Text>
		</View>
	);
}
