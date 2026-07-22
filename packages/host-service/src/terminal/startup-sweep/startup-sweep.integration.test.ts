import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { terminalAgentBindings, terminalSessions } from "../../db/schema";
import {
	EventBus,
	type TerminalLifecycleEvent,
} from "../../events/event-bus.ts";
import type { GitWatcher } from "../../events/git-watcher";
import type { WorkspaceFilesystemManager } from "../../runtime/filesystem";
import { SqliteTerminalAgentBindingPersistence } from "../../terminal-agents/persistence.ts";
import { runStartupSweep } from "./startup-sweep.ts";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function createEventBus(): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {
			resolveWorkspaceRoot: () => "/tmp/missing-workspace",
		} as unknown as WorkspaceFilesystemManager,
		gitWatcher: {
			onChanged: () => () => {},
		} as unknown as GitWatcher,
	});
}

function seedSession(
	db: HostDb,
	{
		id,
		status,
		workspaceId,
		withBinding = true,
	}: {
		id: string;
		status: string;
		workspaceId: string | null;
		withBinding?: boolean;
	},
) {
	db.insert(terminalSessions)
		.values({ id, status, originWorkspaceId: workspaceId, createdAt: 1 })
		.run();
	if (withBinding) {
		db.insert(terminalAgentBindings)
			.values({
				terminalId: id,
				workspaceId: workspaceId ?? "ws-1",
				agentId: "claude",
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Start",
			})
			.run();
	}
}

function statusOf(db: HostDb, id: string): string | undefined {
	return db
		.select({
			status: terminalSessions.status,
			endedAt: terminalSessions.endedAt,
		})
		.from(terminalSessions)
		.where(eq(terminalSessions.id, id))
		.all()[0]?.status;
}

function endedAtOf(db: HostDb, id: string): number | null | undefined {
	return db
		.select({ endedAt: terminalSessions.endedAt })
		.from(terminalSessions)
		.where(eq(terminalSessions.id, id))
		.all()[0]?.endedAt;
}

const noSleep = async () => {};
const noWait = async () => {};

describe("runStartupSweep effectful shell", () => {
	let db: HostDb;
	let eventBus: EventBus;
	let emitted: TerminalLifecycleEvent[];
	let deleteDefunctCalls: number;
	let persistence: Pick<SqliteTerminalAgentBindingPersistence, "deleteDefunct">;

	beforeEach(() => {
		db = createTestDb();
		eventBus = createEventBus();
		emitted = [];
		eventBus.onTerminalLifecycle((event) => emitted.push(event));
		const real = new SqliteTerminalAgentBindingPersistence(db);
		deleteDefunctCalls = 0;
		persistence = {
			deleteDefunct: () => {
				deleteDefunctCalls += 1;
				real.deleteDefunct();
			},
		};
	});

	it("closes a stranded active row: exited + endedAt + lifecycle event + deleteDefunct", async () => {
		// The daemon after a reboot knows none of the ptys that died in downtime.
		seedSession(db, { id: "dead", status: "active", workspaceId: "ws-1" });

		const result = await runStartupSweep({
			db,
			eventBus,
			terminalAgentPersistence: persistence,
			organizationId: "org-1",
			waitForReady: noWait,
			listLiveSessions: async () => [],
			isLive: () => false,
			sleep: noSleep,
		});

		expect(result.closed).toBe(1);
		expect(statusOf(db, "dead")).toBe("exited");
		expect(typeof endedAtOf(db, "dead")).toBe("number");

		// The SAME lifecycle exit event the pty onExit path emits — this is what
		// the app.ts hook turns into closeMirroredTerminalSession. It must carry
		// the row's real workspaceId (renderer WS clients filter on it), not "".
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			workspaceId: "ws-1",
			terminalId: "dead",
			eventType: "exit",
		});

		// The freed binding is pruned once, after the sweep.
		expect(deleteDefunctCalls).toBe(1);
		const remainingBindings = db
			.select({ terminalId: terminalAgentBindings.terminalId })
			.from(terminalAgentBindings)
			.all();
		expect(remainingBindings).toEqual([]);
	});

	it("spares a terminal that re-attaches in the SECOND observation (adoption race)", async () => {
		seedSession(db, { id: "reattach", status: "active", workspaceId: "ws-1" });

		let call = 0;
		const result = await runStartupSweep({
			db,
			eventBus,
			terminalAgentPersistence: persistence,
			organizationId: "org-1",
			waitForReady: noWait,
			// First observation: empty (daemon still adopting). Second: the
			// terminal has re-attached and is now listed alive.
			listLiveSessions: async () => {
				call += 1;
				return call === 1 ? [] : [{ id: "reattach", alive: true }];
			},
			isLive: () => false,
			sleep: noSleep,
		});

		expect(result.closed).toBe(0);
		expect(statusOf(db, "reattach")).toBe("active");
		expect(endedAtOf(db, "reattach")).toBeNull();
		expect(emitted).toHaveLength(0);
		// Nothing closed → deleteDefunct is not called.
		expect(deleteDefunctCalls).toBe(0);
	});

	it("does not emit or double-close when the row is no longer active at write time (concurrent transition)", async () => {
		seedSession(db, { id: "racing", status: "active", workspaceId: "ws-1" });

		// A concurrent path (a late onExit / dispose) flips the row to exited
		// after planning but before the sweep's conditional write. We simulate
		// that "in between" moment by flipping the row during the injected
		// second-observation delay — i.e. after the row snapshot is taken but
		// before the close loop runs. `isLive` always returns false so the row
		// is a genuine candidate; the `WHERE status = 'active'` guard is the only
		// thing that must prevent a duplicate event. It changes zero rows, so no
		// lifecycle event fires and endedAt is not overwritten.
		const result = await runStartupSweep({
			db,
			eventBus,
			terminalAgentPersistence: persistence,
			organizationId: "org-1",
			waitForReady: noWait,
			listLiveSessions: async () => [],
			isLive: () => false,
			sleep: async () => {
				db.update(terminalSessions)
					.set({ status: "exited", endedAt: 123 })
					.where(eq(terminalSessions.id, "racing"))
					.run();
			},
		});

		expect(result.closed).toBe(0);
		// The concurrent writer's endedAt is preserved (we did not overwrite it).
		expect(statusOf(db, "racing")).toBe("exited");
		expect(endedAtOf(db, "racing")).toBe(123);
		expect(emitted).toHaveLength(0);
		expect(deleteDefunctCalls).toBe(0);
	});

	it("closes all active rows on an empty-but-ready daemon (reboot), leaves non-active rows", async () => {
		seedSession(db, { id: "a", status: "active", workspaceId: "ws-1" });
		seedSession(db, { id: "b", status: "active", workspaceId: "ws-2" });
		seedSession(db, {
			id: "already-exited",
			status: "exited",
			workspaceId: "ws-1",
		});

		const result = await runStartupSweep({
			db,
			eventBus,
			terminalAgentPersistence: persistence,
			organizationId: "org-1",
			waitForReady: noWait,
			listLiveSessions: async () => [],
			isLive: () => false,
			sleep: noSleep,
		});

		expect(result.closed).toBe(2);
		expect(statusOf(db, "a")).toBe("exited");
		expect(statusOf(db, "b")).toBe("exited");
		expect(statusOf(db, "already-exited")).toBe("exited");
		expect(emitted.map((event) => event.terminalId).sort()).toEqual(["a", "b"]);
		// Each event carries its own row's real workspaceId, not a shared "".
		const byId = new Map(emitted.map((event) => [event.terminalId, event]));
		expect(byId.get("a")?.workspaceId).toBe("ws-1");
		expect(byId.get("b")?.workspaceId).toBe("ws-2");
		expect(deleteDefunctCalls).toBe(1);
	});

	it("emits an empty workspaceId only for a genuinely workspace-less row", async () => {
		seedSession(db, {
			id: "orphan",
			status: "active",
			workspaceId: null,
			withBinding: false,
		});

		const result = await runStartupSweep({
			db,
			eventBus,
			terminalAgentPersistence: persistence,
			organizationId: "org-1",
			waitForReady: noWait,
			listLiveSessions: async () => [],
			isLive: () => false,
			sleep: noSleep,
		});

		expect(result.closed).toBe(1);
		expect(statusOf(db, "orphan")).toBe("exited");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			workspaceId: "",
			terminalId: "orphan",
			eventType: "exit",
		});
	});

	it("spares a row the daemon still reports alive in both observations", async () => {
		seedSession(db, { id: "live", status: "active", workspaceId: "ws-1" });
		seedSession(db, { id: "dead", status: "active", workspaceId: "ws-1" });

		const result = await runStartupSweep({
			db,
			eventBus,
			terminalAgentPersistence: persistence,
			organizationId: "org-1",
			waitForReady: noWait,
			listLiveSessions: async () => [{ id: "live", alive: true }],
			isLive: () => false,
			sleep: noSleep,
		});

		expect(result.closed).toBe(1);
		expect(statusOf(db, "live")).toBe("active");
		expect(statusOf(db, "dead")).toBe("exited");
		expect(emitted.map((event) => event.terminalId)).toEqual(["dead"]);
	});
});
