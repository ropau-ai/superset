import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder rows (stable id + width %) so the skeleton doesn't look uniform. */
const ROWS: Array<{ id: string; width: `${number}%` }> = [
	{ id: "s1", width: "68%" },
	{ id: "s2", width: "52%" },
	{ id: "s3", width: "80%" },
	{ id: "s4", width: "44%" },
	{ id: "s5", width: "60%" },
	{ id: "s6", width: "72%" },
];

/**
 * The loading state for the Changes list: a few shimmering rows shaped like the
 * real changed-file rows (badge, path, counts). Shown only on the first load,
 * before any snapshot exists.
 */
export function ChangesSkeleton() {
	return (
		<View className="gap-2 p-4">
			<Skeleton className="mb-1 h-4 w-40" />
			{ROWS.map((row) => (
				<View
					className="flex-row items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-3"
					key={row.id}
				>
					<Skeleton className="size-5 rounded" />
					<Skeleton className="h-4 flex-1" style={{ maxWidth: row.width }} />
					<Skeleton className="h-4 w-10" />
				</View>
			))}
		</View>
	);
}
