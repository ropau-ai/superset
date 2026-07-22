import { and, eq } from "drizzle-orm";
import { waitForDaemonReady } from "../../daemon/index.ts";
import type { HostDb } from "../../db/index.ts";
import { terminalSessions } from "../../db/schema.ts";
import type {
	EventBus,
	TerminalLifecycleEvent,
} from "../../events/event-bus.ts";
import type { SqliteTerminalAgentBindingPersistence } from "../../terminal-agents/persistence.ts";
import { getDaemonClient } from "../daemon-client-singleton.ts";
import { isLiveTerminalSession } from "../terminal.ts";

/**
 * Delay between the two `daemon.list()` observations. A just-adopted daemon can
 * transiently report an empty or incomplete session list right after startup
 * (see the comments in reaper.ts on the two-pass rowless-orphan clock and the
 * port-scan warm-up). A single observation could therefore mistake a terminal
 * that is mid-reattach for a dead one and close its session out from under it.
 * Observing twice with a gap lets any re-attaching terminal appear in at least
 * one list. Injectable so tests don't wait real seconds.
 */
export const STARTUP_SWEEP_OBSERVATION_GAP_MS = 3_000;

/**
 * A `terminal_sessions` row as observed for the sweep — id, current status, and
 * the owning workspace (nullable: some rows are genuinely workspace-less). The
 * workspace is carried so the emitted lifecycle event matches the pty onExit
 * event exactly, including the real `workspaceId` renderer WS clients filter on.
 */
export interface StartupSweepRow {
	id: string;
	status: string;
	originWorkspaceId: string | null;
}

/**
 * Decide which terminals the startup sweep should close, given two independent
 * daemon observations, a snapshot of the session rows taken alongside them, and
 * the in-memory liveness check. Pure so the reconciliation policy is unit
 * testable without a daemon, database, or event bus — mirrors the
 * pure-planner/effectful-shell split of {@link planPortScanSync} in reaper.ts.
 *
 * A row is a candidate to close iff ALL hold:
 * - it was `active` in the row snapshot (taken alongside the observations, so
 *   rows created after the first observation are never candidates);
 * - its terminal id is absent from BOTH observation id sets (a terminal that
 *   re-attached during the observation gap appears in the second list and is
 *   spared — the anti-adoption-race guard);
 * - no live in-memory session owns it (`isLive`) — a renderer re-created it on
 *   this host since the sweep started.
 *
 * An empty-but-ready daemon list twice in a row is a valid input, NOT a
 * short-circuit: that is precisely the reboot case (a fresh daemon knows none
 * of the ptys that died during downtime), where every `active` row is genuinely
 * dead and must be closed. This is the opposite policy from the reaper, which
 * short-circuits on an empty list because it only heals sessions the daemon
 * still knows about.
 *
 * Returns the full candidate rows (not just ids) so the effectful shell can emit
 * each row's real `originWorkspaceId` on the lifecycle event, faithful to the
 * pty onExit event.
 */
export function planStartupSweep({
	firstObservation,
	secondObservation,
	rowSnapshot,
	isLive,
}: {
	firstObservation: string[];
	secondObservation: string[];
	rowSnapshot: StartupSweepRow[];
	isLive: (terminalId: string) => boolean;
}): StartupSweepRow[] {
	const seen = new Set(firstObservation);
	for (const id of secondObservation) seen.add(id);

	const candidates: StartupSweepRow[] = [];
	for (const row of rowSnapshot) {
		if (row.status !== "active") continue;
		if (seen.has(row.id)) continue;
		if (isLive(row.id)) continue;
		candidates.push(row);
	}
	return candidates;
}

/** Live daemon session ids from a single `daemon.list()` observation. */
async function observeDaemonSessionIds(
	listLiveSessions: () => Promise<{ id: string; alive: boolean }[]>,
): Promise<string[]> {
	const sessions = await listLiveSessions();
	return sessions
		.filter((session) => session.alive)
		.map((session) => session.id);
}

export interface StartupSweepDeps {
	db: HostDb;
	eventBus: EventBus;
	terminalAgentPersistence: Pick<
		SqliteTerminalAgentBindingPersistence,
		"deleteDefunct"
	>;
	organizationId: string;
	/** Injected in tests to avoid a real daemon; defaults to the singleton. */
	waitForReady?: (organizationId: string) => Promise<void>;
	/** Injected in tests; defaults to the daemon-client singleton's `list`. */
	listLiveSessions?: () => Promise<{ id: string; alive: boolean }[]>;
	/** Injected in tests; defaults to the in-memory session check. */
	isLive?: (terminalId: string) => boolean;
	/** Injected in tests; defaults to {@link STARTUP_SWEEP_OBSERVATION_GAP_MS}. */
	sleep?: (ms: number) => Promise<void>;
	observationGapMs?: number;
}

interface StartupSweepResult {
	closed: number;
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		// Never keep the process alive just for the sweep's own delay.
		timer.unref?.();
	});
}

/**
 * Reconcile daemon ↔ SQLite ↔ cloud mirror once at host-service startup.
 *
 * The in-process death path (pty `onExit` in terminal.ts) sets a row to
 * `exited`, stamps `endedAt`, and broadcasts a `terminal:lifecycle` exit event
 * that app.ts turns into `closeMirroredTerminalSession`. When a pty dies while
 * host-service is DOWN (crash, reboot, daemon death during downtime) none of
 * that runs, so the row stays `active` forever and the cloud mirror never gets
 * `endedAt`. The reaper does not cover this: it only iterates the daemon's live
 * sessions and short-circuits when that list is empty, so a fresh daemon that
 * knows none of the dead ptys reconciles nothing.
 *
 * This sweep reproduces the exact in-process death path for every stranded row:
 * conditional `active → exited` update + the SAME lifecycle exit event through
 * the event bus (so the existing app.ts hook is the single choke point for
 * closing the cloud mirror), then re-runs `deleteDefunct` once so freed bindings
 * are pruned. Reads already hide non-active rows via the live join, so the write
 * is what actually flips mobile's falsely-live session to history.
 */
export async function runStartupSweep(
	deps: StartupSweepDeps,
): Promise<StartupSweepResult> {
	const {
		db,
		eventBus,
		terminalAgentPersistence,
		organizationId,
		waitForReady = waitForDaemonReady,
		listLiveSessions = async () => (await getDaemonClient()).list(),
		isLive = isLiveTerminalSession,
		sleep = defaultSleep,
		observationGapMs = STARTUP_SWEEP_OBSERVATION_GAP_MS,
	} = deps;

	// Guard 1: only observe a daemon that has finished spawn-or-adopt. Observing
	// mid-bootstrap could see an empty list before adoption completes and close
	// live sessions. Reuse the same readiness gate the terminal request handlers
	// use before addressing the supervisor's socket.
	await waitForReady(organizationId);

	// Guard 2: two stable observations separated by a gap. Only ids absent from
	// BOTH are candidates, so a terminal that re-attaches during the gap is
	// spared. The row snapshot is taken between the observations so that rows
	// created after the first observation are never candidates (guard 4).
	const firstObservation = await observeDaemonSessionIds(listLiveSessions);
	const rowSnapshot: StartupSweepRow[] = db
		.select({
			id: terminalSessions.id,
			status: terminalSessions.status,
			originWorkspaceId: terminalSessions.originWorkspaceId,
		})
		.from(terminalSessions)
		.all();
	await sleep(observationGapMs);
	const secondObservation = await observeDaemonSessionIds(listLiveSessions);

	const candidates = planStartupSweep({
		firstObservation,
		secondObservation,
		rowSnapshot,
		isLive,
	});

	let closed = 0;
	for (const row of candidates) {
		const terminalId = row.id;
		// Guard 3a: a renderer may have re-created the session in-memory during
		// the observation gap or the close loop — never close a live session.
		if (isLive(terminalId)) continue;

		const occurredAt = Date.now();
		// Guard 3b: conditional close. If some other path (a late onExit, the
		// reaper, a dispose route) already transitioned the row, `.returning()`
		// reports zero changed rows and we skip the event + mirror close so the
		// cloud row isn't double-closed and no duplicate lifecycle event fires.
		const changed = db
			.update(terminalSessions)
			.set({ status: "exited", endedAt: occurredAt })
			.where(
				and(
					eq(terminalSessions.id, terminalId),
					eq(terminalSessions.status, "active"),
				),
			)
			.returning({ id: terminalSessions.id })
			.all();
		if (changed.length === 0) continue;

		// Emit the SAME lifecycle exit event the pty onExit path emits, so the
		// app.ts `onTerminalLifecycle` hook closes the cloud mirror — the single
		// choke point. Carry the row's real `originWorkspaceId` (as onExit does)
		// because `broadcastTerminalLifecycle` also fans out to renderer WS
		// clients, which filter agent-hook status by `workspaceId`. Empty string
		// is used only for genuinely workspace-less rows; the cloud close is keyed
		// on terminalId, so closeMirroredTerminalSession ignores the field anyway.
		const event: TerminalLifecycleEvent = {
			workspaceId: row.originWorkspaceId ?? "",
			terminalId,
			eventType: "exit",
			exitCode: 0,
			signal: 0,
			occurredAt,
		};
		eventBus.broadcastTerminalLifecycle(event);
		closed += 1;
	}

	// Free agent bindings for the rows we just closed. Reads already hide them
	// via the live join, so this is hygiene only — run it once, after the sweep,
	// and only if we actually closed something.
	if (closed > 0) {
		try {
			terminalAgentPersistence.deleteDefunct();
		} catch (error) {
			console.warn("[host-service] startup sweep: deleteDefunct failed", error);
		}
	}

	return { closed };
}
