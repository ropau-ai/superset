import type {
	SelectGithubPullRequest,
	SelectV2Workspace,
} from "@superset/db/schema";
import { Layers } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ProjectAvatar } from "../../../workspaces/components/ProjectAvatar";
import { WorkspaceRow } from "../../../workspaces/components/WorkspaceRow";

/** One workspace (branch) row's fully-resolved view data. */
export interface FleetWorkspaceView {
	workspace: SelectV2Workspace;
	pullRequest?: SelectGithubPullRequest;
	hostOnline: boolean | undefined;
	/** Live agent runtime on the workspace, when the relay resolved one. */
	agentDefinitionId: string | null;
}

/** The fleet, grouped by project — mirrors the desktop sidebar. */
export interface FleetProjectGroup {
	key: string;
	projectName: string;
	projectIconUrl: string | null;
	workspaces: FleetWorkspaceView[];
}

export interface FleetSectionProps {
	groups: FleetProjectGroup[];
	/** Data still hydrating with nothing cached yet — show a skeleton, not "empty". */
	loading?: boolean;
	onPressWorkspace: (workspace: SelectV2Workspace) => void;
	onLongPressWorkspace?: (workspace: SelectV2Workspace) => void;
}

function ProjectGroup({
	group,
	onPressWorkspace,
	onLongPressWorkspace,
}: {
	group: FleetProjectGroup;
	onPressWorkspace: (workspace: SelectV2Workspace) => void;
	onLongPressWorkspace?: (workspace: SelectV2Workspace) => void;
}) {
	return (
		<View className="gap-0.5 overflow-hidden rounded-2xl border border-border bg-card">
			<View className="flex-row items-center gap-2 px-3 pt-2.5 pb-1">
				<ProjectAvatar
					iconUrl={group.projectIconUrl}
					name={group.projectName}
					size={18}
				/>
				<Text
					className="shrink font-semibold text-muted-foreground text-xs uppercase tracking-wide"
					numberOfLines={1}
				>
					{group.projectName}
				</Text>
				<View className="flex-1" />
				<Text className="text-muted-foreground text-xs">
					{group.workspaces.length}
				</Text>
			</View>
			{group.workspaces.map((view) => (
				<WorkspaceRow
					agentDefinitionId={view.agentDefinitionId}
					hostOnline={view.hostOnline}
					key={view.workspace.id}
					onLongPress={() => onLongPressWorkspace?.(view.workspace)}
					onPress={() => onPressWorkspace(view.workspace)}
					pullRequest={view.pullRequest}
					workspace={view.workspace}
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
					<Skeleton className="h-10 w-full rounded-xl" />
					<Skeleton className="h-10 w-full rounded-xl" />
				</View>
			))}
		</View>
	);
}

/**
 * The fleet: every workspace (branch) in the org except Emilien's own, grouped
 * by project and sorted by activity — the mobile mirror of the desktop sidebar.
 * Cache-first: renders whatever groups it already holds. With nothing cached it
 * distinguishes still-loading (skeleton) from genuinely-empty (a calm prompt) so
 * a cold start never claims the fleet is empty mid-hydration.
 */
export function FleetSection({
	groups,
	loading = false,
	onPressWorkspace,
	onLongPressWorkspace,
}: FleetSectionProps) {
	const workspaceCount = groups.reduce(
		(sum, g) => sum + g.workspaces.length,
		0,
	);

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
				{workspaceCount > 0 ? (
					<Text className="text-muted-foreground text-xs">
						{workspaceCount} {workspaceCount === 1 ? "branch" : "branches"}
					</Text>
				) : null}
			</View>

			{groups.length === 0 ? (
				loading ? (
					<FleetSkeleton />
				) : (
					<View className="items-center gap-2 rounded-2xl border border-border border-dashed px-6 py-10">
						<Text className="text-center font-medium text-sm">
							No workspaces yet.
						</Text>
						<Text className="max-w-xs text-center text-muted-foreground text-xs">
							Branches appear here as soon as a workspace is created for one of
							your projects.
						</Text>
					</View>
				)
			) : (
				<View className="gap-3">
					{groups.map((group) => (
						<ProjectGroup
							group={group}
							key={group.key}
							onLongPressWorkspace={onLongPressWorkspace}
							onPressWorkspace={onPressWorkspace}
						/>
					))}
				</View>
			)}
		</View>
	);
}
