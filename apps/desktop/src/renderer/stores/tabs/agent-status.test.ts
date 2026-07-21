import { describe, expect, it } from "bun:test";
import { reconcileStaleStatus, resolveStopPaneStatus } from "./agent-status";

describe("resolveStopPaneStatus", () => {
	it("surfaces 'review' when the pane's tab is inactive", () => {
		expect(
			resolveStopPaneStatus({
				currentStatus: "working",
				isActivelyViewingPane: false,
			}),
		).toBe("review");
	});

	it("surfaces 'review' even when the tab is open but the pane is not actively viewed", () => {
		// This is the cockpit fix: an open/active tab must still show the
		// "result ready" signal unless the user is looking at this exact pane.
		expect(
			resolveStopPaneStatus({
				currentStatus: "working",
				isActivelyViewingPane: false,
			}),
		).toBe("review");
	});

	it("collapses to 'idle' only when actively viewing this exact pane", () => {
		expect(
			resolveStopPaneStatus({
				currentStatus: "working",
				isActivelyViewingPane: true,
			}),
		).toBe("idle");
	});

	it("always goes 'idle' from a permission state (user already engaged)", () => {
		expect(
			resolveStopPaneStatus({
				currentStatus: "permission",
				isActivelyViewingPane: false,
			}),
		).toBe("idle");
		expect(
			resolveStopPaneStatus({
				currentStatus: "permission",
				isActivelyViewingPane: true,
			}),
		).toBe("idle");
	});
});

describe("reconcileStaleStatus", () => {
	const now = 10_000;
	const thresholdMs = 1_000;

	it("flags a 'working' pane stale after the threshold with no activity", () => {
		expect(
			reconcileStaleStatus({
				currentStatus: "working",
				lastActivity: 5_000, // 5s old > 1s threshold
				now,
				thresholdMs,
			}),
		).toBe("stale");
	});

	it("leaves a 'working' pane alone while it is still active", () => {
		expect(
			reconcileStaleStatus({
				currentStatus: "working",
				lastActivity: 9_500, // 0.5s old < 1s threshold
				now,
				thresholdMs,
			}),
		).toBeNull();
	});

	it("never flags a pane that predates activity tracking", () => {
		expect(
			reconcileStaleStatus({
				currentStatus: "working",
				lastActivity: undefined,
				now,
				thresholdMs,
			}),
		).toBeNull();
	});

	it("self-heals a 'stale' pane back to 'working' when output resumes", () => {
		expect(
			reconcileStaleStatus({
				currentStatus: "stale",
				lastActivity: 9_500, // recent output
				now,
				thresholdMs,
			}),
		).toBe("working");
	});

	it("keeps a 'stale' pane stale while it stays quiet", () => {
		expect(
			reconcileStaleStatus({
				currentStatus: "stale",
				lastActivity: 5_000,
				now,
				thresholdMs,
			}),
		).toBeNull();
	});

	it("does not touch idle / review / permission panes", () => {
		for (const status of ["idle", "review", "permission"] as const) {
			expect(
				reconcileStaleStatus({
					currentStatus: status,
					lastActivity: 1,
					now,
					thresholdMs,
				}),
			).toBeNull();
		}
	});
});
