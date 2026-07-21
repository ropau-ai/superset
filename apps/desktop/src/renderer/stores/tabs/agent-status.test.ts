import { describe, expect, it } from "bun:test";
import { resolveStopPaneStatus } from "./agent-status";

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
