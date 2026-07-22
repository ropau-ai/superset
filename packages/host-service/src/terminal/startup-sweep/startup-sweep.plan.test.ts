import { describe, expect, it } from "bun:test";
import { planStartupSweep, type StartupSweepRow } from "./startup-sweep.ts";

const noneLive = () => false;

/** Row factory: workspace defaults to `ws-<id>` unless explicitly null. */
function row(
	id: string,
	status: string,
	originWorkspaceId: string | null = `ws-${id}`,
): StartupSweepRow {
	return { id, status, originWorkspaceId };
}

const ids = (rows: StartupSweepRow[]): string[] => rows.map((r) => r.id);

describe("planStartupSweep", () => {
	it("closes an active row absent from both observations", () => {
		const rowSnapshot: StartupSweepRow[] = [row("dead", "active")];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: [],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual(["dead"]);
	});

	it("carries the row's originWorkspaceId through to the caller", () => {
		// The effectful shell emits this on the lifecycle event so it stays
		// faithful to the pty onExit event (renderer WS clients filter on it).
		const rowSnapshot: StartupSweepRow[] = [
			row("with-ws", "active", "ws-42"),
			row("ws-less", "active", null),
		];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: [],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(candidates).toEqual([
			{ id: "with-ws", status: "active", originWorkspaceId: "ws-42" },
			{ id: "ws-less", status: "active", originWorkspaceId: null },
		]);
	});

	it("spares a row present in the FIRST observation only (still resolving)", () => {
		const rowSnapshot: StartupSweepRow[] = [row("term-1", "active")];
		const candidates = planStartupSweep({
			firstObservation: ["term-1"],
			secondObservation: [],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual([]);
	});

	it("spares a row present in the SECOND observation only (adoption race)", () => {
		// The terminal re-attached during the observation gap: absent from the
		// first list, present in the second. It must NOT be closed.
		const rowSnapshot: StartupSweepRow[] = [row("term-1", "active")];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: ["term-1"],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual([]);
	});

	it("closes every active row when an empty-but-ready daemon lists nothing twice (reboot case)", () => {
		// A fresh daemon after a reboot knows none of the ptys that died during
		// downtime. Unlike the reaper, the sweep must NOT short-circuit on empty:
		// every active row is genuinely dead and must be closed.
		const rowSnapshot: StartupSweepRow[] = [
			row("a", "active"),
			row("b", "active"),
			row("c", "active"),
		];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: [],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual(["a", "b", "c"]);
	});

	it("skips rows that are not active in the snapshot", () => {
		const rowSnapshot: StartupSweepRow[] = [
			row("exited", "exited"),
			row("disposed", "disposed"),
			row("active", "active"),
		];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: [],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual(["active"]);
	});

	it("skips a row a live in-memory session re-created during the sweep", () => {
		const rowSnapshot: StartupSweepRow[] = [
			row("reborn", "active"),
			row("dead", "active"),
		];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: [],
			rowSnapshot,
			isLive: (id) => id === "reborn",
		});
		expect(ids(candidates)).toEqual(["dead"]);
	});

	it("row-snapshot discipline: only rows in the snapshot can be candidates", () => {
		// A row created after the snapshot (id "new") is simply not in the
		// snapshot, so it can never be a candidate even though the daemon never
		// reported it. Absence from the observations alone must not close it.
		const rowSnapshot: StartupSweepRow[] = [row("old", "active")];
		const candidates = planStartupSweep({
			firstObservation: [],
			secondObservation: [],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual(["old"]);
		expect(ids(candidates)).not.toContain("new");
	});

	it("closes only the rows the daemon does not know among a mixed snapshot", () => {
		const rowSnapshot: StartupSweepRow[] = [
			row("known-live", "active"),
			row("stranded", "active"),
		];
		const candidates = planStartupSweep({
			firstObservation: ["known-live"],
			secondObservation: ["known-live"],
			rowSnapshot,
			isLive: noneLive,
		});
		expect(ids(candidates)).toEqual(["stranded"]);
	});
});
