import type { WorkspaceStore } from "@superset/panes";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

interface UseCloseTerminalPaneOnExitArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
}

/**
 * Closes a terminal's pane automatically when its command exits, for terminals
 * created with `closeOnExit`. The host-service flags the exit lifecycle event
 * with `closeOnExit`; we remove the matching pane(s), which triggers the pane
 * registry's `onAfterClose` → `killSession` — the same cleanup path as an
 * explicit delete. Terminals created without the flag keep their frozen exited
 * buffer (the default, unchanged behavior).
 */
export function useCloseTerminalPaneOnExit({
	store,
	workspaceId,
}: UseCloseTerminalPaneOnExitArgs): void {
	useWorkspaceEvent("terminal:lifecycle", workspaceId, (payload) => {
		if (payload.eventType !== "exit" || !payload.closeOnExit) return;

		const state = store.getState();
		// Collect first, then close — closePane mutates the tab/pane tree.
		const targets: Array<{ tabId: string; paneId: string }> = [];
		for (const tab of state.tabs) {
			for (const [paneId, pane] of Object.entries(tab.panes)) {
				if (pane.kind !== "terminal") continue;
				if ((pane.data as TerminalPaneData).terminalId === payload.terminalId) {
					targets.push({ tabId: tab.id, paneId });
				}
			}
		}
		for (const target of targets) {
			state.closePane(target);
		}
	});
}
