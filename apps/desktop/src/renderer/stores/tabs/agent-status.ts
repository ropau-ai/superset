import type { PaneStatus } from "shared/tabs-types";

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
