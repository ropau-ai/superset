import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Clock } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { TokenBadge } from "@/components/TokenBadge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { AgentTokens } from "@/hooks/useAgentTokens";
import { EMBER, withAlpha } from "@/lib/theme";
import type { LiveAgentStatus } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import { AgentStatusBadge } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/components/AgentStatusBadge";

const EMBER_BORDER = withAlpha(EMBER, 0.42);
const EMBER_WASH = withAlpha(EMBER, 0.06);
const EMBER_TILE = withAlpha(EMBER, 0.12);

// Emilien's mark: a still violet gradient, from a deep indigo-violet to a
// lighter orchid on the diagonal. One color, gradient only — no loader, no
// orbital, no animation. The `border` hairline (a faint violet) frames it so
// the tile reads as a crafted brand chip, not a flat swatch.
const VIOLET_FROM = "#7C3AED";
const VIOLET_MID = "#9333EA";
const VIOLET_TO = "#A855F7";
const VIOLET_BORDER = withAlpha(VIOLET_TO, 0.35);

/**
 * Emilien's avatar tile — a clean 56×56 rounded-square filled with a subtle
 * violet gradient. Deliberately inert: the live status is carried by the
 * Working/Idle pill below, so the mark itself never animates.
 */
function EmilienAvatar() {
	return (
		<View
			className="size-14 overflow-hidden rounded-2xl border"
			style={{ borderColor: VIOLET_BORDER }}
		>
			<Svg width="100%" height="100%">
				<Defs>
					<LinearGradient id="emilienViolet" x1="0" y1="0" x2="1" y2="1">
						<Stop offset="0" stopColor={VIOLET_FROM} />
						<Stop offset="0.55" stopColor={VIOLET_MID} />
						<Stop offset="1" stopColor={VIOLET_TO} />
					</LinearGradient>
				</Defs>
				<Rect width="100%" height="100%" fill="url(#emilienViolet)" />
			</Svg>
		</View>
	);
}

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
 * ember-washed card fronted by a still violet gradient avatar tile, with the
 * current status, uptime, token total, and last activity. Tapping opens the
 * live chat with Emilien — the one entry point for the Paul↔Emilien dialogue.
 * When no session has materialized it still renders (Emilien is the constant),
 * in a calm "veille" state, non-tappable. Live status is read from the
 * Working/Idle pill below, so the avatar itself stays inert.
 */
export function EmilienCard({
	projectLabel,
	status,
	tokens,
	lastActiveAt,
	startedAt,
	now,
	hasSession,
	onPress,
}: EmilienCardProps) {
	const activityLine = hasSession
		? lastActiveAt
			? `Last active ${formatDistanceToNow(lastActiveAt, { addSuffix: true })}`
			: "Live conversation ready — tap to open."
		: "Emilien is watching — no live conversation yet.";

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
					<EmilienAvatar />

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
