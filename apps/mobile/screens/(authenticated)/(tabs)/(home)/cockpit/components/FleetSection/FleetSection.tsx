import type { SelectChatSession } from "@superset/db/schema";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Cloud, CloudOff, Layers } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AgentTypeChip } from "@/components/AgentTypeChip";
import { LivePulseDot } from "@/components/LivePulseDot";
import { TokenBadge } from "@/components/TokenBadge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAgentTokens } from "@/hooks/useAgentTokens";
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
	// Per-sub-run usage — `null` today (no live source) → "— tok".
	const tokens = useAgentTokens({ sessionId: session.id });
	const at = activeAt(session);
	const hot = now - at.getTime() < HOT_WINDOW_MS;

	return (
		<Pressable
			className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-accent"
			onPress={onPress}
		>
			<LivePulseDot active={hot} color={hot ? "#34d399" : "#52525b"} size={7} />
			<View className="flex-1 gap-0.5">
				<Text className="font-medium text-sm" numberOfLines={1}>
					{session.title ?? "Untitled session"}
				</Text>
				<View className="flex-row items-center gap-2">
					<Text className="text-muted-foreground text-xs" numberOfLines={1}>
						{formatDistanceToNow(at, { addSuffix: true })}
					</Text>
					<Text className="text-muted-foreground text-xs">·</Text>
					<TokenBadge tokens={tokens} />
				</View>
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

/**
 * The fleet: every non-Emilien session, grouped by workspace and sorted by
 * activity, with the workspace's live agent-type + status pulled from the relay.
 * Renders Emilien's calm empty state when the fleet is idle.
 */
export function FleetSection({
	groups,
	now,
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
				<View className="items-center gap-2 rounded-2xl border border-border border-dashed px-6 py-10">
					<LivePulseDot active color="#34d399" size={9} />
					<Text className="text-center font-medium text-sm">
						Emilien veille.
					</Text>
					<Text className="max-w-xs text-center text-muted-foreground text-xs">
						Aucun sous-agent actif. La flotte apparaîtra ici dès qu'Emilien
						lancera un run.
					</Text>
				</View>
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
