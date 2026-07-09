import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { GitFileStatus } from "@/lib/relay/relay";
import { cn } from "@/lib/utils";

/** Single-letter label + color per git status, GitHub/desktop style. */
const STATUS_STYLE: Record<
	string,
	{ letter: string; label: string; className: string }
> = {
	added: {
		letter: "A",
		label: "Added",
		className: "bg-green-500/15 text-green-600 dark:text-green-400",
	},
	untracked: {
		letter: "A",
		label: "Added",
		className: "bg-green-500/15 text-green-600 dark:text-green-400",
	},
	copied: {
		letter: "C",
		label: "Copied",
		className: "bg-green-500/15 text-green-600 dark:text-green-400",
	},
	modified: {
		letter: "M",
		label: "Modified",
		className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
	},
	changed: {
		letter: "M",
		label: "Modified",
		className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
	},
	deleted: {
		letter: "D",
		label: "Deleted",
		className: "bg-red-500/15 text-red-600 dark:text-red-400",
	},
	renamed: {
		letter: "R",
		label: "Renamed",
		className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
	},
};

const FALLBACK = {
	letter: "•",
	label: "Changed",
	className: "bg-muted text-muted-foreground",
};

/** A compact, colored one-letter badge for a changed file's git status. */
export function StatusBadge({ status }: { status: GitFileStatus }) {
	const style = STATUS_STYLE[status] ?? FALLBACK;
	return (
		<View
			accessibilityLabel={style.label}
			className={cn(
				"size-5 shrink-0 items-center justify-center rounded",
				style.className,
			)}
		>
			<Text
				className={cn("font-mono font-semibold text-[11px]", style.className)}
			>
				{style.letter}
			</Text>
		</View>
	);
}
