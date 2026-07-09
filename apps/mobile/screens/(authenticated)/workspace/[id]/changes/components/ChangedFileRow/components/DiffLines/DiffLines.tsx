import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { DiffHunk } from "../../../../utils/computeLineDiff";

type RowKind = "hunk" | "added" | "removed" | "context";
interface Row {
	/** Stable per-render id (position-based) so React keys don't fall back to the map index. */
	id: string;
	kind: RowKind;
	content: string;
}

/**
 * How many rows to show before collapsing behind a "show more" toggle. Rows are
 * already lazily fetched per file, but a huge diff would still jank a phone list
 * on first paint, so we cap the initial render.
 */
const MAX_VISIBLE_ROWS = 200;

const TEXT_CLASS: Record<RowKind, string> = {
	added: "text-green-700 dark:text-green-400",
	removed: "text-red-700 dark:text-red-400",
	context: "text-muted-foreground",
	hunk: "text-muted-foreground/70",
};

const PREFIX: Record<"added" | "removed" | "context", string> = {
	added: "+",
	removed: "-",
	context: " ",
};

/** Flatten hunks (with their `@@` headers) into a single rendered row list. */
function toRows(hunks: DiffHunk[]): Row[] {
	const rows: Row[] = [];
	let seq = 0;
	for (const hunk of hunks) {
		rows.push({ id: `r${seq++}`, kind: "hunk", content: hunk.header });
		for (const line of hunk.lines) {
			const marker = line[0];
			const content = line.slice(1);
			const kind: RowKind =
				marker === "+" ? "added" : marker === "-" ? "removed" : "context";
			rows.push({ id: `r${seq++}`, kind, content });
		}
	}
	return rows;
}

/**
 * Renders unified-diff hunks with the shared diff visual language (green/red
 * left-border rows, mono text, `@@` hunk separators), mirroring the app's
 * `file-diff-tool` primitive. Kept local to the Changes tab because that
 * primitive is a chat tool-call card (its own "Wrote/Edited" header + collapse)
 * and lives outside this feature's scope, so it can't be driven as a bare diff
 * body here.
 */
export function DiffLines({ hunks }: { hunks: DiffHunk[] }) {
	const [expanded, setExpanded] = useState(false);
	const rows = useMemo(() => toRows(hunks), [hunks]);
	const isOverflowing = rows.length > MAX_VISIBLE_ROWS;
	const visible =
		isOverflowing && !expanded ? rows.slice(0, MAX_VISIBLE_ROWS) : rows;

	return (
		<View>
			{visible.map((row) =>
				row.kind === "hunk" ? (
					<View className="bg-muted/40 px-2.5 py-1" key={row.id}>
						<Text className={cn("font-mono text-[11px]", TEXT_CLASS.hunk)}>
							{row.content}
						</Text>
					</View>
				) : (
					<View
						className={cn(
							"flex-row border-l-2 px-2.5 py-0.5",
							row.kind === "added" && "border-l-green-500 bg-green-500/10",
							row.kind === "removed" && "border-l-red-500 bg-red-500/10",
							row.kind === "context" && "border-l-transparent",
						)}
						key={row.id}
					>
						<Text
							className={cn("mr-2 font-mono text-xs", TEXT_CLASS[row.kind])}
						>
							{PREFIX[row.kind]}
						</Text>
						<Text
							className={cn(
								"min-w-0 flex-1 font-mono text-xs",
								TEXT_CLASS[row.kind],
							)}
						>
							{row.content.length > 0 ? row.content : " "}
						</Text>
					</View>
				),
			)}
			{isOverflowing ? (
				<Pressable
					accessibilityRole="button"
					className="px-2.5 py-1.5"
					hitSlop={8}
					onPress={() => setExpanded((prev) => !prev)}
				>
					<Text className="text-muted-foreground text-xs underline">
						{expanded
							? "Show less"
							: `Show ${rows.length - MAX_VISIBLE_ROWS} more lines`}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}
