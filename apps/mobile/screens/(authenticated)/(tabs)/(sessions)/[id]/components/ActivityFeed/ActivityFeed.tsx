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
	relayConfigured: boolean;
	hostOnline: boolean | null;
	/** Tailors the empty-state copy: the Emilien chat vs. the fleet Activity tab. */
	variant?: "chat" | "activity";
	/** Id currently spoken aloud (chat only). Absent on the Activity tab. */
	speakingId?: string | null;
	/** Toggles read-aloud for an assistant message (chat only). */
	onToggleSpeak?: (message: ChatActivityMessage) => void;
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
	relayConfigured,
	hostOnline,
	variant = "activity",
	speakingId,
	onToggleSpeak,
}: ActivityFeedProps) {
	const isChat = variant === "chat";
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
		if (phase === "loading") {
			return (
				<FeedNotice
					description={
						isChat
							? "Fetching this conversation from the host."
							: "Reading the agent's live activity from the host."
					}
					spinner
					title={isChat ? "Loading conversation…" : "Loading activity…"}
				/>
			);
		}
		// A genuine reachability failure. We keep the copy calm and generic — the
		// poll retries on its own — and never leak the raw `procedure failed (500)`.
		if (phase === "error") {
			return (
				<FeedNotice
					description="We'll reconnect automatically — hang tight."
					icon={
						<Icon
							as={WifiOff}
							className="size-6 text-muted-foreground"
							strokeWidth={1.5}
						/>
					}
					title="Can't reach the host"
				/>
			);
		}
		// `unavailable` (host reached, no chat thread) and `ready`-but-empty both
		// land here: nothing to show yet, calmly.
		return (
			<FeedNotice
				description={
					isChat
						? "Your conversation with this session will appear here."
						: hostOnline
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
				title={isChat ? "No messages yet" : "No activity yet"}
			/>
		);
	}

	return (
		<View className="gap-4">
			{visible.map((message) => (
				<ActivityMessage
					key={message.id}
					message={message}
					onToggleSpeak={onToggleSpeak}
					speakingId={speakingId}
				/>
			))}
		</View>
	);
}
