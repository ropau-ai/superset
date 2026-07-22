import type { PaneStatus } from "shared/tabs-types";
import { isPaneStale, STALE_WORKING_THRESHOLD_MS } from "./pane-activity";

/**
 * Pure agent-status decision helpers, kept free of React/tRPC imports so they
 * can be unit-tested in isolation. The live subscription lives in
 * `useAgentHookListener.ts`.
 */

/**
 * Resolve the pane status to apply when an agent "Stop" event fires.
 *
 * "review" is the "result ready" signal. It stays visible in the tab bar and
 * pane title even when the tab is open, so a cockpit with several workspaces can
 * see "2 en review, 1 en permission" at a glance. It only collapses straight to
 * "idle" when the user is *actively viewing this exact pane* (its tab is active,
 * the pane is focused, and the workspace is on screen), or when the pane was
 * already engaged via a pending permission prompt.
 */
export function resolveStopPaneStatus(params: {
	currentStatus: PaneStatus | undefined;
	isActivelyViewingPane: boolean;
}): PaneStatus {
	if (params.currentStatus === "permission") return "idle";
	return params.isActivelyViewingPane ? "idle" : "review";
}

/**
 * Reconcile a pane's status against its PTY activity for the stale safety net.
 * Returns the status to apply, or `null` when nothing should change.
 *
 * - "working" with no activity past the threshold → "stale"
 *   (safety net for the hook leaks that never emit a Stop)
 * - "stale" that has since seen activity within the threshold → "working"
 *   (self-heal when the agent resumes producing output)
 *
 * Every other status is left untouched.
 */
export function reconcileStaleStatus(params: {
	currentStatus: PaneStatus | undefined;
	lastActivity: number | undefined;
	now: number;
	thresholdMs?: number;
}): PaneStatus | null {
	const { currentStatus, lastActivity, now } = params;
	const thresholdMs = params.thresholdMs ?? STALE_WORKING_THRESHOLD_MS;

	if (currentStatus === "working") {
		return isPaneStale(lastActivity, now, thresholdMs) ? "stale" : null;
	}
	if (currentStatus === "stale") {
		return isPaneStale(lastActivity, now, thresholdMs) ? null : "working";
	}
	return null;
}
