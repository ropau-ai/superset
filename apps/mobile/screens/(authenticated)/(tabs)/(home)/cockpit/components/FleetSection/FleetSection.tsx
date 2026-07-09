import type { SelectChatSession } from "@superset/db/schema";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Cloud, CloudOff, Layers } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AgentTypeChip } from "@/components/AgentTypeChip";
import { LivePulseDot } from "@/components/LivePulseDot";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { STATUS_COLORS } from "@/lib/theme";
import type { LiveAgentStatus } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";
import { AgentStatusBadge } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/components/AgentStatusBadge";

/** A session is "hot" if it moved in the last two minutes → live green pulse. */
const HOT_WINDOW_MS = 2 * 60 * 1000;

export interface FleetGroupView {
	key: string;
	workspaceName: string;
	branch: string | null;
	hostOnline: boolean | undefined;
	/** Most-active binding's definition, for the agent-type chip. */
	agentDefinitionId: string | null;
	/** Workspace-level live status, when the relay resolved one. */
	status: LiveAgentStatus | null;
	sessions: SelectChatSession[];
}

export interface FleetSectionProps {
	groups: FleetGroupView[];
	now: number;
	/** Data still hydrating with nothing cached yet — show a skeleton, not "empty". */
	loading?: boolean;
	onPressSession: (session: SelectChatSession) => void;
}

function activeAt(session: SelectChatSession): Date {
	return session.lastActiveAt ?? session.updatedAt ?? session.createdAt;
}

function FleetRow({
	session,
	now,
	onPress,
}: {
	session: SelectChatSession;
	now: number;
	onPress: () => void;
}) {
	const at = activeAt(session);
	const hot = now - at.getTime() < HOT_WINDOW_MS;

	return (
		<Pressable
			className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-accent"
			onPress={onPress}
		>
			<LivePulseDot
				active={hot}
				color={hot ? STATUS_COLORS.live : STATUS_COLORS.idle}
				size={7}
			/>
			<View className="flex-1 gap-0.5">
				<Text className="font-medium text-sm" numberOfLines={1}>
					{session.title ?? "Untitled session"}
				</Text>
				{/* A fleet row's session isn't open, so there's no live runtime to sum
				    tokens from — rather than a column of honest-but-noisy "— tok", we
				    show just the activity time (real usage appears once opened). */}
				<Text className="text-muted-foreground text-xs" numberOfLines={1}>
					{formatDistanceToNow(at, { addSuffix: true })}
				</Text>
			</View>
			<Icon
				as={ChevronRight}
				className="size-4 text-muted-foreground"
				strokeWidth={2}
			/>
		</Pressable>
	);
}

function FleetGroup({
	group,
	now,
	onPressSession,
}: {
	group: FleetGroupView;
	now: number;
	onPressSession: (session: SelectChatSession) => void;
}) {
	const HostIcon =
		group.hostOnline === undefined
			? Cloud
			: group.hostOnline
				? Cloud
				: CloudOff;

	return (
		<View className="gap-1 rounded-2xl border border-border bg-card p-2">
			<View className="flex-row items-center gap-2 px-1.5 pt-1 pb-0.5">
				<Icon
					as={HostIcon}
					className={
						group.hostOnline
							? "size-3.5 text-emerald-500"
							: "size-3.5 text-muted-foreground"
					}
					strokeWidth={1.75}
				/>
				<Text
					className="shrink text-muted-foreground text-xs font-medium uppercase tracking-wide"
					numberOfLines={1}
				>
					{group.workspaceName}
				</Text>
				{group.branch ? (
					<Text
						className="font-mono text-[11px] text-muted-foreground"
						numberOfLines={1}
					>
						{group.branch}
					</Text>
				) : null}
				<AgentTypeChip definitionId={group.agentDefinitionId} />
				<View className="flex-1" />
				{group.status ? (
					<AgentStatusBadge
						kind={group.status.kind}
						label={group.status.label}
					/>
				) : null}
			</View>
			{group.sessions.map((session) => (
				<FleetRow
					key={session.id}
					now={now}
					onPress={() => onPressSession(session)}
					session={session}
				/>
			))}
		</View>
	);
}

/** A calm 2-row placeholder while the fleet hydrates on a cold start. */
function FleetSkeleton() {
	return (
		<View className="gap-3">
			{[0, 1].map((i) => (
				<View
					className="gap-2 rounded-2xl border border-border bg-card p-3"
					key={i}
				>
					<Skeleton className="h-3 w-32" />
					<Skeleton className="h-9 w-full rounded-xl" />
					<Skeleton className="h-9 w-full rounded-xl" />
				</View>
			))}
		</View>
	);
}

/**
 * The fleet: every non-Emilien session, grouped by workspace and sorted by
 * activity, with the workspace's live agent-type + status pulled from the relay.
 * Cache-first: shows whatever groups it already has. With nothing cached it
 * distinguishes still-loading (skeleton) from genuinely-idle (Emilien's calm
 * empty state) so a cold start never claims the fleet is idle mid-hydration.
 */
export function FleetSection({
	groups,
	now,
	loading = false,
	onPressSession,
}: FleetSectionProps) {
	const sessionCount = groups.reduce((sum, g) => sum + g.sessions.length, 0);

	return (
		<View className="gap-3">
			<View className="flex-row items-center justify-between px-1">
				<View className="flex-row items-center gap-2">
					<Icon
						as={Layers}
						className="size-4 text-muted-foreground"
						strokeWidth={1.75}
					/>
					<Text className="font-semibold">Fleet</Text>
				</View>
				{sessionCount > 0 ? (
					<Text className="text-muted-foreground text-xs">
						{sessionCount} {sessionCount === 1 ? "sub-agent" : "sub-agents"}
					</Text>
				) : null}
			</View>

			{groups.length === 0 ? (
				loading ? (
					<FleetSkeleton />
				) : (
					<View className="items-center gap-2 rounded-2xl border border-border border-dashed px-6 py-10">
						<LivePulseDot active color={STATUS_COLORS.live} size={9} />
						<Text className="text-center font-medium text-sm">
							Emilien is watching.
						</Text>
						<Text className="max-w-xs text-center text-muted-foreground text-xs">
							No sub-agents running. The fleet appears here the moment Emilien
							kicks off a run.
						</Text>
					</View>
				)
			) : (
				<View className="gap-3">
					{groups.map((group) => (
						<FleetGroup
							group={group}
							key={group.key}
							now={now}
							onPressSession={onPressSession}
						/>
					))}
				</View>
			)}
		</View>
	);
}
