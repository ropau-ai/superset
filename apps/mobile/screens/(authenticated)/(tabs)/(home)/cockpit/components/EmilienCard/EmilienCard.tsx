import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Clock } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { EmilienLogo } from "@/components/EmilienLogo";
import { LivePulseDot } from "@/components/LivePulseDot";
import { TokenBadge } from "@/components/TokenBadge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { AgentTokens } from "@/hooks/useAgentTokens";
import { EMBER } from "@/lib/theme";
import { AgentStatusBadge } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/components/AgentStatusBadge";
import type { LiveAgentStatus } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";

const EMBER_BORDER = "rgba(240,101,58,0.42)";
const EMBER_WASH = "rgba(240,101,58,0.06)";
const EMBER_TILE = "rgba(240,101,58,0.12)";

function formatUptime(ms: number): string {
	const totalMinutes = Math.max(0, Math.floor(ms / 60000));
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export interface EmilienCardProps {
	/** e.g. "Zuno-Emilien / main". */
	projectLabel: string;
	status: LiveAgentStatus;
	/** `null` when there's no associated host. */
	hostOnline: boolean | null;
	tokens: AgentTokens | null;
	lastActiveAt: Date | null;
	/** Run start, for the 24/7 uptime readout. */
	startedAt: Date | null;
	now: number;
	/** Whether a live conversation exists to open on tap. */
	hasSession: boolean;
	onPress: () => void;
}

/**
 * The pinned hero of the cockpit: Emilien, the orchestrator. A prominent
 * ember-washed card with the brand mark, a live pulse, current status, uptime,
 * token total, and last activity. Tapping opens the live chat with Emilien —
 * the one entry point for the Paul↔Emilien dialogue. When no session has
 * materialized it still renders (Emilien is the constant), in a calm "veille"
 * state, non-tappable.
 */
export function EmilienCard({
	projectLabel,
	status,
	hostOnline,
	tokens,
	lastActiveAt,
	startedAt,
	now,
	hasSession,
	onPress,
}: EmilienCardProps) {
	const online = hostOnline === true;
	const live = online && status.kind !== "ended";
	const dotColor = online ? "#34d399" : "#71717a";

	const activityLine = hasSession
		? lastActiveAt
			? `Last active ${formatDistanceToNow(lastActiveAt, { addSuffix: true })}`
			: "Live conversation ready — tap to open."
		: "Emilien veille — no live conversation yet.";

	return (
		<Pressable
			accessibilityRole="button"
			disabled={!hasSession}
			onPress={onPress}
			style={({ pressed }) => ({ opacity: pressed && hasSession ? 0.85 : 1 })}
		>
			<View
				className="gap-4 overflow-hidden rounded-2xl border p-5"
				style={{ borderColor: EMBER_BORDER, backgroundColor: EMBER_WASH }}
			>
				<View className="flex-row items-center gap-3.5">
					<View
						className="size-14 items-center justify-center rounded-2xl border"
						style={{ borderColor: EMBER_BORDER, backgroundColor: EMBER_TILE }}
					>
						<EmilienLogo size={34} />
						<View className="absolute -right-1 -top-1 rounded-full bg-background p-0.5">
							<LivePulseDot active={live} color={dotColor} size={9} />
						</View>
					</View>

					<View className="flex-1 gap-1">
						<View className="flex-row items-center gap-2">
							<Text className="font-bold text-xl">Emilien</Text>
							<View
								className="rounded-md px-1.5 py-0.5"
								style={{ backgroundColor: EMBER_TILE }}
							>
								<Text
									className="text-[10px] font-semibold uppercase tracking-wide"
									style={{ color: EMBER }}
								>
									Orchestrator
								</Text>
							</View>
						</View>
						<Text className="text-muted-foreground text-xs" numberOfLines={1}>
							{projectLabel}
						</Text>
					</View>

					{hasSession ? (
						<Icon
							as={ChevronRight}
							className="size-5 text-muted-foreground"
							strokeWidth={2}
						/>
					) : null}
				</View>

				<View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
					<AgentStatusBadge kind={status.kind} label={status.label} />
					{startedAt ? (
						<View className="flex-row items-center gap-1.5">
							<Icon
								as={Clock}
								className="size-3.5 text-muted-foreground"
								strokeWidth={1.75}
							/>
							<Text className="font-mono text-muted-foreground text-xs">
								up {formatUptime(now - startedAt.getTime())}
							</Text>
						</View>
					) : null}
					<TokenBadge tokens={tokens} />
				</View>

				<Text className="text-muted-foreground text-xs">{activityLine}</Text>
			</View>
		</Pressable>
	);
}
