import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { BrailleSpinner } from "@/components/ai-elements/braille-spinner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { ChangeEntry } from "../../utils/mergeChanges";
import { DiffLines } from "./components/DiffLines";
import { StatusBadge } from "./components/StatusBadge";
import { useFileDiff } from "./hooks/useFileDiff";

/** Split a path into its directory prefix (kept dim) and file name (emphasized). */
function splitPath(path: string): { dir: string; name: string } {
	const idx = path.lastIndexOf("/");
	if (idx < 0) return { dir: "", name: path };
	return { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
}

/** A muted centered notice used for the per-file loading/empty/error bodies. */
function DiffNotice({
	children,
	spinner,
}: {
	children: string;
	spinner?: boolean;
}) {
	return (
		<View className="flex-row items-center gap-2 px-2.5 py-3">
			{spinner ? <BrailleSpinner className="text-sm" /> : null}
			<Text className="text-muted-foreground text-xs">{children}</Text>
		</View>
	);
}

interface ChangedFileRowProps {
	entry: ChangeEntry;
	routingKey: string | null;
	workspaceId: string | null;
}

/**
 * One row of the Changes list: a tappable header (status badge, path, +/-
 * counts) that expands to lazily load and render this file's diff. The diff is
 * fetched only on first expand (see useFileDiff) so opening the tab doesn't
 * hammer the host with a request per changed file.
 */
export function ChangedFileRow({
	entry,
	routingKey,
	workspaceId,
}: ChangedFileRowProps) {
	const [expanded, setExpanded] = useState(false);
	const { dir, name } = splitPath(entry.path);

	const { state, diff, retry } = useFileDiff({
		routingKey,
		workspaceId,
		path: entry.path,
		category: entry.category,
		enabled: expanded,
	});

	const renamedFrom =
		entry.oldPath && entry.oldPath !== entry.path ? entry.oldPath : null;

	return (
		<View className="overflow-hidden rounded-lg border border-border bg-card">
			<Pressable
				accessibilityHint="Toggles this file's diff"
				accessibilityLabel={`${name}, ${entry.additions} additions, ${entry.deletions} deletions`}
				accessibilityRole="button"
				className="flex-row items-center gap-2.5 px-3 py-2.5 active:bg-muted/50"
				onPress={() => setExpanded((prev) => !prev)}
			>
				<Icon
					as={expanded ? ChevronDown : ChevronRight}
					className="size-4 shrink-0 text-muted-foreground"
				/>
				<StatusBadge status={entry.status} />
				<View className="min-w-0 flex-1">
					<Text className="text-sm" ellipsizeMode="head" numberOfLines={1}>
						{dir ? <Text className="text-muted-foreground">{dir}</Text> : null}
						<Text className="font-medium text-foreground">{name}</Text>
					</Text>
					{renamedFrom ? (
						<Text
							className="text-[11px] text-muted-foreground"
							ellipsizeMode="head"
							numberOfLines={1}
						>
							from {renamedFrom}
						</Text>
					) : null}
				</View>
				<View className="shrink-0 flex-row items-center gap-1.5">
					{entry.additions > 0 ? (
						<Text className="font-mono text-green-600 text-xs dark:text-green-400">
							+{entry.additions}
						</Text>
					) : null}
					{entry.deletions > 0 ? (
						<Text className="font-mono text-red-600 text-xs dark:text-red-400">
							-{entry.deletions}
						</Text>
					) : null}
				</View>
			</Pressable>

			{expanded ? (
				<View className="border-border border-t">
					<ExpandedBody
						diff={diff}
						isBinary={entry.isBinary === true}
						onRetry={retry}
						state={state}
					/>
				</View>
			) : null}
		</View>
	);
}

/** The lazily-loaded body shown under an expanded row. */
function ExpandedBody({
	state,
	diff,
	isBinary,
	onRetry,
}: {
	state: ReturnType<typeof useFileDiff>["state"];
	diff: ReturnType<typeof useFileDiff>["diff"];
	isBinary: boolean;
	onRetry: () => void;
}) {
	if (isBinary) return <DiffNotice>Binary file — diff not shown.</DiffNotice>;

	if (state === "loading" || state === "idle") {
		return <DiffNotice spinner>Loading diff…</DiffNotice>;
	}

	if (state === "unavailable") {
		return (
			<DiffNotice>
				This diff isn't available yet — try again shortly.
			</DiffNotice>
		);
	}

	if (state === "error") {
		return (
			<View className="flex-row items-center gap-3 px-2.5 py-3">
				<Text className="text-muted-foreground text-xs">
					Couldn't load this diff.
				</Text>
				<Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry}>
					<Text className="font-medium text-primary text-xs underline">
						Try again
					</Text>
				</Pressable>
			</View>
		);
	}

	// ready
	if (!diff || diff.isEmpty) {
		return <DiffNotice>No textual changes.</DiffNotice>;
	}

	return (
		<View>
			{diff.truncated ? (
				<DiffNotice>Large file — showing an approximate diff.</DiffNotice>
			) : null}
			<DiffLines hunks={diff.hunks} />
		</View>
	);
}
