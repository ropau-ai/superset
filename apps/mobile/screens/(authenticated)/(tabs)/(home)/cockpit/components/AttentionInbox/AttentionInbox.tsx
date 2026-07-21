import { ChevronRight, Layers } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AgentTypeChip } from "@/components/AgentTypeChip";
import { LivePulseDot } from "@/components/LivePulseDot";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { STATUS_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionRank } from "../../attention";
import { formatShortAge } from "../../format";

// The mission-control list: every fleet agent/workspace as one row, sorted by
// cost of inaction (waiting > review > offline > working > idle), each row
// answering "who, what, since when" in one glance. Tap → the session.

interface RankPresentation {
	/** Inline dot color (LivePulseDot renders outside className-land). */
	color: string;
	pulse: boolean;
	/** Tailwind classes for the age copy. */
	ageClass: string;
}

const RANK_PRESENTATION: Record<AttentionRank, RankPresentation> = {
	waiting: {
		color: STATUS_COLORS.waiting,
		pulse: true,
		ageClass: "font-medium text-amber-500",
	},
	review: {
		color: STATUS_COLORS.info,
		pulse: true,
		ageClass: "font-medium text-sky-500",
	},
	offline: {
		color: STATUS_COLORS.offline,
		pulse: false,
		ageClass: "font-medium text-red-400",
	},
	working: {
		color: STATUS_COLORS.live,
		pulse: true,
		ageClass: "text-emerald-500",
	},
	idle: {
		color: STATUS_COLORS.idle,
		pulse: false,
		ageClass: "text-muted-foreground",
	},
};

function ageCopy(item: AttentionItem, now: number): string | null {
	if (item.since == null) return null;
	const age = formatShortAge(item.since, now);
	switch (item.rank) {
		case "waiting":
			return `waiting for ${age}`;
		case "review":
			return `finished ${age} ago`;
		case "offline":
			return `offline · ${age} ago`;
		case "working":
			return `working · ${age}`;
		case "idle":
			return `${age} ago`;
	}
}

function AttentionRow({
	item,
	now,
	onPress,
}: {
	item: AttentionItem;
	now: number;
	onPress: () => void;
}) {
	const presentation = RANK_PRESENTATION[item.rank];
	const age = ageCopy(item, now);

	return (
		<Pressable
			className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 active:bg-accent"
			onPress={onPress}
		>
			<LivePulseDot
				active={presentation.pulse}
				color={presentation.color}
				size={8}
			/>
			<View className="flex-1 gap-1">
				<View className="flex-row items-center gap-2">
					<Text className="flex-1 font-medium text-sm" numberOfLines={1}>
						{item.title}
					</Text>
					{age ? (
						<Text
							className={cn("text-xs", presentation.ageClass)}
							numberOfLines={1}
						>
							{age}
						</Text>
					) : null}
				</View>
				<View className="flex-row items-center gap-2">
					{item.workspaceName ? (
						<Text
							className="shrink text-muted-foreground text-xs"
							numberOfLines={1}
						>
							{item.workspaceName}
						</Text>
					) : null}
					{item.branch ? (
						<Text
							className="shrink font-mono text-[11px] text-muted-foreground"
							numberOfLines={1}
						>
							{item.branch}
						</Text>
					) : null}
					<AgentTypeChip definitionId={item.agentDefinitionId} />
					{item.agentId ? (
						<Text
							className="shrink font-mono text-[11px] text-muted-foreground"
							numberOfLines={1}
						>
							{item.agentId}
						</Text>
					) : null}
					<View className="flex-1" />
					{item.pollErrored ? (
						<Text className="font-medium text-[11px] text-amber-500">
							{item.fetchedAt > 0
								? `stale for ${formatShortAge(item.fetchedAt, now)}`
								: "unreachable"}
						</Text>
					) : item.sessionCount > 1 ? (
						<Text className="text-[11px] text-muted-foreground">
							{item.sessionCount} sessions
						</Text>
					) : null}
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

/** A calm 2-row placeholder while the inbox hydrates on a cold start. */
function InboxSkeleton() {
	return (
		<View className="gap-2">
			{[0, 1].map((i) => (
				<View
					className="gap-2 rounded-2xl border border-border bg-card p-3"
					key={i}
				>
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-3 w-32" />
				</View>
			))}
		</View>
	);
}

export interface AttentionInboxProps {
	items: AttentionItem[];
	now: number;
	/** Data still hydrating with nothing cached yet — skeleton, not "empty". */
	loading?: boolean;
	onPressItem: (item: AttentionItem) => void;
}

/**
 * The fleet as an attention inbox. Header counts surface what the sort already
 * encodes — how many rows need Paul, how many are ready to review, how many are
 * running on stale data — so the answer survives even a lazy half-glance.
 */
export function AttentionInbox({
	items,
	now,
	loading = false,
	onPressItem,
}: AttentionInboxProps) {
	const waitingCount = items.filter((item) => item.rank === "waiting").length;
	const reviewCount = items.filter((item) => item.rank === "review").length;
	// Stale is per-workspace metadata shared by that workspace's rows — count
	// workspaces, not rows, so one flaky host doesn't read as three failures.
	const staleCount = new Set(
		items
			.filter((item) => item.pollErrored)
			.map((item) => item.session.v2WorkspaceId ?? item.key),
	).size;

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
				<View className="flex-row items-center gap-2.5">
					{waitingCount > 0 ? (
						<Text className="font-medium text-amber-500 text-xs">
							{waitingCount} need{waitingCount === 1 ? "s" : ""} you
						</Text>
					) : null}
					{reviewCount > 0 ? (
						<Text className="font-medium text-sky-500 text-xs">
							{reviewCount} to review
						</Text>
					) : null}
					{staleCount > 0 ? (
						<Text className="font-medium text-amber-500 text-xs">
							{staleCount} stale
						</Text>
					) : null}
					{waitingCount === 0 &&
					reviewCount === 0 &&
					staleCount === 0 &&
					items.length > 0 ? (
						<Text className="text-muted-foreground text-xs">
							{items.length} {items.length === 1 ? "agent" : "agents"}
						</Text>
					) : null}
				</View>
			</View>

			{items.length === 0 ? (
				loading ? (
					<InboxSkeleton />
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
				<View className="gap-2">
					{items.map((item) => (
						<AttentionRow
							item={item}
							key={item.key}
							now={now}
							onPress={() => onPressItem(item)}
						/>
					))}
				</View>
			)}
		</View>
	);
}
