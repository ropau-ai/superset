import { Bot, CloudOff, Unplug, WifiOff } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { BrailleSpinner } from "@/components/ai-elements/braille-spinner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { ChatActivityMessage } from "@/lib/relay/relay";
import type { SessionActivityPhase } from "../../hooks/useSessionActivity";
import { ActivityMessage } from "./components/ActivityMessage";

function FeedNotice({
	icon,
	title,
	description,
	spinner,
}: {
	icon?: ReactNode;
	title: string;
	description: string;
	spinner?: boolean;
}) {
	return (
		<View className="items-center justify-center gap-3 px-6 py-12">
			{spinner ? <BrailleSpinner className="text-xl" /> : icon}
			<View className="items-center gap-1">
				<Text className="text-center font-medium text-sm">{title}</Text>
				<Text className="max-w-xs text-center text-muted-foreground text-sm">
					{description}
				</Text>
			</View>
		</View>
	);
}

/** A message contributes to the timeline only if it renders visible content. */
function hasRenderableContent(message: ChatActivityMessage): boolean {
	const content = Array.isArray(message.content) ? message.content : [];
	return content.some((part) => {
		const record = part as unknown as Record<string, unknown>;
		const type = record.type;
		if (type === "text" || type === "thinking") {
			return (
				typeof record[type] === "string" && (record[type] as string).length > 0
			);
		}
		return (
			type === "tool_call" ||
			type === "tool_result" ||
			type === "image" ||
			type === "file"
		);
	});
}

export interface ActivityFeedProps {
	messages: ChatActivityMessage[];
	phase: SessionActivityPhase;
	error: string | null;
	relayConfigured: boolean;
	hostOnline: boolean | null;
}

/**
 * The Activity tab: a live, dark, premium timeline of the agent's real actions
 * — bash commands, file diffs, tool-use — sourced from the host's
 * `chat.listMessages` over the relay (see useSessionActivity). Rich per-tool
 * cards come from `components/ai-elements/*`; when the relay isn't reachable or
 * there's nothing yet, it degrades to a clear notice rather than a blank tab.
 */
export function ActivityFeed({
	messages,
	phase,
	error,
	relayConfigured,
	hostOnline,
}: ActivityFeedProps) {
	const visible = useMemo(
		() => messages.filter(hasRenderableContent),
		[messages],
	);

	if (phase === "disabled") {
		if (!relayConfigured) {
			return (
				<FeedNotice
					description="This build isn't pointed at a terminal relay, so live agent activity can't be reached yet."
					icon={
						<Icon
							as={Unplug}
							className="size-6 text-muted-foreground"
							strokeWidth={1.5}
						/>
					}
					title="Relay not configured"
				/>
			);
		}
		return (
			<FeedNotice
				description="The host for this workspace is offline. Activity will resume when it reconnects."
				icon={
					<Icon
						as={CloudOff}
						className="size-6 text-muted-foreground"
						strokeWidth={1.5}
					/>
				}
				title="Host offline"
			/>
		);
	}

	if (visible.length === 0) {
		if (phase === "error") {
			return (
				<FeedNotice
					description={error ?? "Couldn't reach the host. Retrying…"}
					icon={
						<Icon
							as={WifiOff}
							className="size-6 text-muted-foreground"
							strokeWidth={1.5}
						/>
					}
					title="Can't reach host"
				/>
			);
		}
		if (phase === "loading") {
			return (
				<FeedNotice
					description="Reading the agent's live activity from the host."
					spinner
					title="Loading activity…"
				/>
			);
		}
		return (
			<FeedNotice
				description={
					hostOnline
						? "Nothing here yet — the agent's commands and file edits will appear as it works."
						: "No recent agent activity."
				}
				icon={
					<Icon
						as={Bot}
						className="size-6 text-muted-foreground"
						strokeWidth={1.5}
					/>
				}
				title="No activity yet"
			/>
		);
	}

	return (
		<View className="gap-4">
			{visible.map((message) => (
				<ActivityMessage key={message.id} message={message} />
			))}
		</View>
	);
}
