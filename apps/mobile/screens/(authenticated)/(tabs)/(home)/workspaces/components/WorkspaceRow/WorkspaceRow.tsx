import type {
	SelectGithubPullRequest,
	SelectV2Workspace,
} from "@superset/db/schema";
import { formatDistanceToNow } from "date-fns";
import {
	Circle,
	CircleDot,
	Cloud,
	CloudOff,
	GitBranch,
	GitMerge,
	GitPullRequest,
} from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";
import { AgentTypeChip } from "@/components/AgentTypeChip";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { DIFF_COLORS } from "@/lib/theme";

const PR_BADGE_CONFIG = {
	closed: {
		containerClassName: "bg-destructive/10",
		icon: CircleDot,
		iconClassName: "text-destructive",
	},
	draft: {
		containerClassName: "bg-muted",
		icon: GitPullRequest,
		iconClassName: "text-muted-foreground",
	},
	merged: {
		containerClassName: "bg-purple-500/10",
		icon: GitMerge,
		iconClassName: "text-purple-500",
	},
	open: {
		containerClassName: "bg-emerald-500/10",
		icon: GitPullRequest,
		iconClassName: "text-emerald-500",
	},
} as const;

type PrBadgeState = keyof typeof PR_BADGE_CONFIG;

/**
 * Color of the small PR-status dot on the branch glyph (the `branch-status`
 * leading variant), matching the desktop sidebar's PRIcon palette: open = green,
 * merged = purple, draft/closed = muted. No PR → no dot (a plain branch).
 */
const PR_DOT_CLASS: Record<PrBadgeState, string> = {
	open: "bg-emerald-500",
	merged: "bg-purple-500",
	draft: "bg-muted-foreground",
	closed: "bg-destructive",
} as const;

const ADDITIONS_COLOR = DIFF_COLORS.addition;
const DELETIONS_COLOR = DIFF_COLORS.deletion;

export function WorkspaceRow({
	workspace,
	pullRequest,
	hostOnline,
	agentDefinitionId,
	leadingVariant = "host",
	onPress,
	onLongPress,
}: {
	workspace: SelectV2Workspace;
	pullRequest?: SelectGithubPullRequest;
	hostOnline?: boolean;
	/**
	 * Live agent runtime on this workspace, when the relay resolved one — renders
	 * an agent-type chip. Omitted (the WorkspacesScreen list) shows nothing.
	 */
	agentDefinitionId?: string | null;
	/**
	 * The leading (left) glyph. `host` (default, WorkspacesScreen) shows the host
	 * cloud state; `branch-status` (the cockpit Fleet) shows a git-branch glyph
	 * with a PR-status dot, mirroring the desktop sidebar.
	 */
	leadingVariant?: "host" | "branch-status";
	onPress: () => void;
	onLongPress: () => void;
}) {
	const prState: PrBadgeState | null = pullRequest
		? pullRequest.isDraft && pullRequest.state === "open"
			? "draft"
			: pullRequest.state === "merged"
				? "merged"
				: pullRequest.state === "closed"
					? "closed"
					: "open"
		: null;
	const prBadge = prState ? PR_BADGE_CONFIG[prState] : null;

	const HostIcon =
		hostOnline === undefined ? Circle : hostOnline ? Cloud : CloudOff;

	return (
		<Pressable
			className="flex-row items-center gap-3 px-4 py-3"
			onPress={onPress}
			onLongPress={onLongPress}
		>
			<View className="size-9 items-center justify-center">
				{leadingVariant === "branch-status" ? (
					<View className="relative">
						<Icon
							as={GitBranch}
							className="text-muted-foreground size-5"
							strokeWidth={1.75}
						/>
						{prState ? (
							<View
								className={`-bottom-0.5 -right-0.5 absolute size-2.5 rounded-full border border-card ${PR_DOT_CLASS[prState]}`}
							/>
						) : null}
					</View>
				) : (
					<Icon
						as={HostIcon}
						className="text-muted-foreground size-5"
						strokeWidth={1.75}
					/>
				)}
			</View>
			<View className="flex-1 gap-0.5">
				<Text className="font-medium" numberOfLines={1}>
					{workspace.name}
				</Text>
				<View className="flex-row items-center gap-1.5">
					<Text
						className="text-muted-foreground flex-shrink font-mono text-xs"
						numberOfLines={1}
					>
						{workspace.branch}
					</Text>
					<Text className="text-muted-foreground text-xs">
						· {formatDistanceToNow(workspace.updatedAt, { addSuffix: true })}
					</Text>
					{agentDefinitionId ? (
						<AgentTypeChip definitionId={agentDefinitionId} />
					) : null}
				</View>
			</View>
			<View className="flex-row items-center gap-2">
				{pullRequest ? (
					<Text className="font-mono text-sm">
						<Text
							className="font-mono text-sm"
							style={{ color: ADDITIONS_COLOR }}
						>
							+{pullRequest.additions}
						</Text>{" "}
						<Text
							className="font-mono text-sm"
							style={{ color: DELETIONS_COLOR }}
						>
							−{pullRequest.deletions}
						</Text>
					</Text>
				) : null}
				{pullRequest && prBadge ? (
					<Pressable
						hitSlop={8}
						onPress={() => Linking.openURL(pullRequest.url)}
						className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${prBadge.containerClassName}`}
					>
						<Icon
							as={prBadge.icon}
							className={`size-4 ${prBadge.iconClassName}`}
							strokeWidth={1.75}
						/>
						<Text className="text-muted-foreground font-mono text-xs leading-none">
							#{pullRequest.prNumber}
						</Text>
					</Pressable>
				) : null}
			</View>
		</Pressable>
	);
}
