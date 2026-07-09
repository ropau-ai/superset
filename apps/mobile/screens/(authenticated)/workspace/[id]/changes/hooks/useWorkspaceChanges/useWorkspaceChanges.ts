import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getWorkspaceGitStatus, HostRequestError } from "@/lib/relay/relay";
import { type MergedChanges, mergeChanges } from "../../utils/mergeChanges";

// Git status spawns a git process on the host (throttled there by
// `gitStatusRefreshLimiter`), so poll gently — the phone is battery-bound and a
// changed-files list doesn't need sub-second freshness.
const POLL_INTERVAL_MS = 5_000;

// `unavailable`: the host answered but `git.getStatus` failed — most likely an
// out-of-date host without the git procedures. Treated as a calm "not yet"
// state, not a red error. `error`: the host couldn't be reached at all.
export type ChangesPhase =
	| "disabled"
	| "loading"
	| "ready"
	| "unavailable"
	| "error";

export interface WorkspaceChangesResult {
	changes: MergedChanges | null;
	phase: ChangesPhase;
	/** Manually trigger an immediate refresh (pull-to-refresh). Resolves when done. */
	refresh: () => Promise<void>;
}

interface UseWorkspaceChangesArgs {
	routingKey: string | null;
	workspaceId: string | null;
	/** Relay reachable (configured + host online) AND the tab is visible. */
	enabled: boolean;
}

/**
 * Polls the host's `git.getStatus` over the relay so the Changes tab shows the
 * workspace's real changed-files list (the same source desktop's DiffPane and
 * web's SessionDiff read). There is no Electric-synced git table, so this relay
 * poll is the source. When the relay isn't reachable it reports `disabled`; when
 * the host is reached but the procedure fails it reports `unavailable` (the UI
 * degrades to a calm "changes will appear once the host updates" rather than a
 * raw error).
 */
export function useWorkspaceChanges({
	routingKey,
	workspaceId,
	enabled,
}: UseWorkspaceChangesArgs): WorkspaceChangesResult {
	const [changes, setChanges] = useState<MergedChanges | null>(null);
	const [phase, setPhase] = useState<ChangesPhase>("disabled");
	const activeRef = useRef(true);
	// Lets `refresh()` reuse the latest poll without re-creating it every render.
	const pollRef = useRef<() => Promise<void>>(async () => {});

	useEffect(() => {
		activeRef.current = true;
		if (!enabled || !routingKey || !workspaceId) {
			setPhase("disabled");
			setChanges(null);
			pollRef.current = async () => {};
			return;
		}

		setPhase((prev) => (prev === "ready" ? prev : "loading"));

		const poll = async () => {
			if (!activeRef.current) return;
			if (AppState.currentState !== "active") return;
			try {
				const snapshot = await getWorkspaceGitStatus(routingKey, workspaceId);
				if (!activeRef.current) return;
				setChanges(mergeChanges(snapshot));
				setPhase("ready");
			} catch (err) {
				if (!activeRef.current) return;
				// A host-side failure (e.g. an out-of-date host without the git
				// procedures) is "not available yet", not a reachability error. Only a
				// thrown fetch (no HTTP status) is a real "can't reach the host". Either
				// way we never surface the raw `procedure failed (500)` string, and we
				// keep any snapshot we already have on screen (cache-first).
				const hostReached = err instanceof HostRequestError;
				setPhase((prev) =>
					prev === "ready" ? prev : hostReached ? "unavailable" : "error",
				);
			}
		};
		pollRef.current = poll;

		void poll();
		const timer = setInterval(poll, POLL_INTERVAL_MS);
		return () => {
			activeRef.current = false;
			clearInterval(timer);
		};
	}, [routingKey, workspaceId, enabled]);

	const refresh = useCallback(async () => {
		await pollRef.current();
	}, []);

	return { changes, phase, refresh };
}
