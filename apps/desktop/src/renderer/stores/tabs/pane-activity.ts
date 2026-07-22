/**
 * Lightweight per-pane "last activity" tracker used by the stale-status safety
 * net (see `useStaleStatusWatcher` in `useAgentHookListener.ts`).
 *
 * This is intentionally a plain module-level Map, not a store: it is written on
 * the hot PTY-output path (every terminal data chunk), so it must be O(1) with
 * no React subscription churn. The stale watcher reads it imperatively on a
 * timer.
 */

/** How long a pane may sit in "working" with no PTY activity before it is
 * flagged as potentially stale. Kept conservative so that legitimately long
 * but quiet tasks are not falsely flagged; the state is soft and dismissable. */
export const STALE_WORKING_THRESHOLD_MS = 5 * 60_000;

const lastActivityAt = new Map<string, number>();

/** Record that a pane produced activity (PTY output, or entering "working"). */
export function recordPaneActivity(
	paneId: string,
	now: number = Date.now(),
): void {
	lastActivityAt.set(paneId, now);
}

/** Most recent activity timestamp for a pane, or undefined if never recorded. */
export function getLastPaneActivity(paneId: string): number | undefined {
	return lastActivityAt.get(paneId);
}

/** Drop tracking for a disposed pane. */
export function clearPaneActivity(paneId: string): void {
	lastActivityAt.delete(paneId);
}

/**
 * Decide whether a pane should be flagged stale.
 *
 * A pane is stale when it is "working" but its last recorded activity is older
 * than the threshold. If activity was never recorded we treat the pane as
 * freshly-active (not stale) to avoid flagging panes that predate tracking.
 */
export function isPaneStale(
	lastActivity: number | undefined,
	now: number,
	thresholdMs: number = STALE_WORKING_THRESHOLD_MS,
): boolean {
	if (lastActivity === undefined) return false;
	return now - lastActivity > thresholdMs;
}
