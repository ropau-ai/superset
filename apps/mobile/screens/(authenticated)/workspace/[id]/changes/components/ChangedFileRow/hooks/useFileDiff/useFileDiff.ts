import { useCallback, useEffect, useRef, useState } from "react";
import {
	type GitDiffCategory,
	getWorkspaceFileDiff,
	HostRequestError,
} from "@/lib/relay/relay";
import {
	computeLineDiff,
	type LineDiff,
} from "../../../../utils/computeLineDiff";

export type FileDiffState =
	| "idle"
	| "loading"
	| "ready"
	| "unavailable"
	| "error";

export interface UseFileDiffResult {
	state: FileDiffState;
	diff: LineDiff | null;
	/** Re-fetch after an error (the row's "Try again"). */
	retry: () => void;
}

interface UseFileDiffArgs {
	routingKey: string | null;
	workspaceId: string | null;
	path: string;
	category: GitDiffCategory;
	/** Only fetch once the row is expanded — the diff is lazy per file. */
	enabled: boolean;
}

/**
 * Lazily fetches one file's before/after contents from the host `git.getDiff`
 * (only once its row is expanded) and turns them into a line diff. Fetches a
 * single time per (path, category) and caches the result — collapsing then
 * re-expanding doesn't refetch. A host-side failure degrades to `unavailable`,
 * a reachability failure to `error`, and neither leaks a raw status string.
 */
export function useFileDiff({
	routingKey,
	workspaceId,
	path,
	category,
	enabled,
}: UseFileDiffArgs): UseFileDiffResult {
	const [state, setState] = useState<FileDiffState>("idle");
	const [diff, setDiff] = useState<LineDiff | null>(null);
	const activeRef = useRef(true);
	// The (path, category) we've already resolved, so re-expanding a row (which
	// re-runs the effect) doesn't refetch a diff we already hold.
	const resolvedKeyRef = useRef<string | null>(null);

	const load = useCallback(async () => {
		if (!routingKey || !workspaceId) return;
		const key = `${path}::${category}`;
		setState("loading");
		try {
			const result = await getWorkspaceFileDiff(routingKey, workspaceId, {
				path,
				category,
			});
			if (!activeRef.current) return;
			setDiff(
				computeLineDiff(result.oldFile.contents, result.newFile.contents),
			);
			resolvedKeyRef.current = key;
			setState("ready");
		} catch (err) {
			if (!activeRef.current) return;
			setState(err instanceof HostRequestError ? "unavailable" : "error");
		}
	}, [routingKey, workspaceId, path, category]);

	useEffect(() => {
		activeRef.current = true;
		const key = `${path}::${category}`;
		if (
			enabled &&
			routingKey &&
			workspaceId &&
			resolvedKeyRef.current !== key
		) {
			void load();
		}
		return () => {
			activeRef.current = false;
		};
	}, [enabled, routingKey, workspaceId, path, category, load]);

	const retry = useCallback(() => {
		resolvedKeyRef.current = null;
		void load();
	}, [load]);

	return { state, diff, retry };
}
