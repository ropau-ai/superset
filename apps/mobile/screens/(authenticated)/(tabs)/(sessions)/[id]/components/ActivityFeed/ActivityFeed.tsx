import { formatDistanceToNow } from "date-fns";
import { Bot, CloudOff, Unplug, WifiOff } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { BrailleSpinner } from "@/components/ai-elements/braille-spinner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { TerminalAgentBinding } from "@/lib/relay/relay";
import { statusForBinding } from "../../agentStatus";
import type { AgentActivityPhase } from "../../hooks/useAgentActivity";
import { AgentStatusBadge } from "../AgentStatusBadge";

const EVENT_DETAIL: Record<string, string> = {
	working: "Running a tool",
	waiting: "Waiting for your input",
	idle: "Idle — turn complete",
	ended: "Agent ended",
	unknown: "Connecting",
};

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

function AgentActivityRow({
	binding,
	now,
}: {
	binding: TerminalAgentBinding;
	now: number;
}) {
	const status = statusForBinding(binding, now);
	return (
		<View className="flex-row items-start gap-3 rounded-xl border border-border bg-card p-3">
			<View className="mt-0.5 size-8 items-center justify-center rounded-lg bg-muted">
				<Icon as={Bot} className="size-4 text-foreground" strokeWidth={1.75} />
			</View>
			<View className="min-w-0 flex-1 gap-1.5">
				<View className="flex-row items-center justify-between gap-2">
					<Text
						className="min-w-0 shrink font-medium font-mono text-foreground text-sm"
						numberOfLines={1}
					>
						{binding.agentId}
					</Text>
					<AgentStatusBadge kind={status.kind} label={status.label} />
				</View>
				<Text className="text-muted-foreground text-xs">
					{EVENT_DETAIL[status.kind] ?? "Active"} ·{" "}
					{formatDistanceToNow(binding.lastEventAt, { addSuffix: true })}
				</Text>
			</View>
		</View>
	);
}

export interface ActivityFeedProps {
	bindings: TerminalAgentBinding[];
	phase: AgentActivityPhase;
	error: string | null;
	relayConfigured: boolean;
	hostOnline: boolean | null;
	now: number;
}

/**
 * Timeline of the workspace's live agent lifecycle, sourced from the host's
 * `terminalAgents.listByWorkspace` over the relay. Rich per-tool activity (bash
 * output, diffs, commits) isn't synced to mobile yet, so this surfaces the real
 * agent state that IS reachable and degrades to a clear notice otherwise.
 */
export function ActivityFeed({
	bindings,
	phase,
	error,
	relayConfigured,
	hostOnline,
	now,
}: ActivityFeedProps) {
	const sorted = useMemo(
		() => [...bindings].sort((a, b) => b.lastEventAt - a.lastEventAt),
		[bindings],
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

	if (sorted.length === 0) {
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
					description="Attaching to the host to read live agent activity."
					spinner
					title="Connecting to host…"
				/>
			);
		}
		return (
			<FeedNotice
				description={
					hostOnline
						? "No agents are running in this workspace right now."
						: "No recent agent activity."
				}
				icon={
					<Icon
						as={Bot}
						className="size-6 text-muted-foreground"
						strokeWidth={1.5}
					/>
				}
				title="No active agents"
			/>
		);
	}

	return (
		<View className="gap-2">
			{sorted.map((binding) => (
				<AgentActivityRow
					binding={binding}
					key={binding.terminalId}
					now={now}
				/>
			))}
		</View>
	);
}
