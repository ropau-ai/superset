import { describe, expect, it, mock } from "bun:test";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import type { AgentLifecycleEventType } from "../../../events";
import { TerminalAgentStore } from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";
import {
	deterministicSessionId,
	forgetMirroredTerminal,
} from "./mirror-terminal-session";
import { notificationsRouter } from "./notifications";

// Flush the fire-and-forget mirror IIFE (createSession → updateSession).
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

interface BroadcastedAgentLifecycleEvent {
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	agent?: AgentIdentity;
	occurredAt: number;
}

function createContext(originWorkspaceId: string | null): {
	ctx: HostServiceContext;
	broadcastAgentLifecycle: ReturnType<
		typeof mock<(event: BroadcastedAgentLifecycleEvent) => void>
	>;
	findFirst: ReturnType<typeof mock>;
	terminalAgentStore: TerminalAgentStore;
	createSession: ReturnType<typeof mock>;
	updateSession: ReturnType<typeof mock>;
} {
	const broadcastAgentLifecycle = mock(
		(_event: BroadcastedAgentLifecycleEvent) => {},
	);
	const findFirst = mock(() => ({
		sync: () =>
			originWorkspaceId === null
				? null
				: {
						originWorkspaceId,
					},
	}));
	const terminalAgentStore = new TerminalAgentStore();
	const createSession = mock(async () => ({ sessionId: "x", txid: null }));
	const updateSession = mock(async () => ({ updated: true }));

	const ctx = {
		db: {
			query: {
				terminalSessions: {
					findFirst,
				},
			},
		},
		eventBus: {
			broadcastAgentLifecycle,
		},
		terminalAgentStore,
		api: {
			chat: {
				createSession: { mutate: createSession },
				updateSession: { mutate: updateSession },
			},
		},
	} as unknown as HostServiceContext;

	return {
		ctx,
		broadcastAgentLifecycle,
		findFirst,
		terminalAgentStore,
		createSession,
		updateSession,
	};
}

describe("notificationsRouter.hook", () => {
	it("derives workspaceId from terminalId before broadcasting", async () => {
		const { ctx, broadcastAgentLifecycle, findFirst } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "task_complete",
		});

		expect(result).toEqual({ success: true, ignored: false });
		expect(findFirst).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			eventType: "Stop",
			terminalId: "terminal-1",
		});
		expect(typeof broadcastAgentLifecycle.mock.calls[0]?.[0].occurredAt).toBe(
			"number",
		);
	});

	it("ignores missing or unknown terminal ids", async () => {
		const missingTerminal = createContext("workspace-1");
		const missingResult = await notificationsRouter
			.createCaller(missingTerminal.ctx)
			.hook({ eventType: "Stop" });

		expect(missingResult).toEqual({ success: true, ignored: true });
		expect(missingTerminal.findFirst).not.toHaveBeenCalled();
		expect(missingTerminal.broadcastAgentLifecycle).not.toHaveBeenCalled();

		const unknownTerminal = createContext(null);
		const unknownResult = await notificationsRouter
			.createCaller(unknownTerminal.ctx)
			.hook({ terminalId: "terminal-missing", eventType: "Stop" });

		expect(unknownResult).toEqual({ success: true, ignored: true });
		expect(unknownTerminal.findFirst).toHaveBeenCalledTimes(1);
		expect(unknownTerminal.broadcastAgentLifecycle).not.toHaveBeenCalled();
	});

	it("ignores unknown event types before looking up the terminal", async () => {
		const { ctx, broadcastAgentLifecycle, findFirst } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "unknown-event",
		});

		expect(result).toEqual({ success: true, ignored: true });
		expect(findFirst).not.toHaveBeenCalled();
		expect(broadcastAgentLifecycle).not.toHaveBeenCalled();
	});

	it("forwards agent identity when the hook stamps it", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
	});

	it("normalizes empty-string identity fields to undefined", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "" },
		});

		const broadcast = broadcastAgentLifecycle.mock.calls[0]?.[0];
		expect(broadcast?.agent).toEqual({ agentId: "claude" });
	});

	it("records the event onto the terminal agent store", async () => {
		const { ctx, terminalAgentStore } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "SessionStart",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		const binding = terminalAgentStore.get("terminal-1");
		expect(binding?.agentId).toBe("claude");
		expect(binding?.agentSessionId).toBe("session-abc");
		expect(binding?.workspaceId).toBe("workspace-1");
		expect(binding?.lastEventType).toBe("Attached");
	});

	it("drops agent identity entirely when agentId is missing", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "" },
		});

		const broadcast = broadcastAgentLifecycle.mock.calls[0]?.[0];
		expect(broadcast?.agent).toBeUndefined();
	});

	it("mirrors a live terminal agent into chat_sessions (id, workspace, title)", async () => {
		const terminalId = "term-mirror-a";
		forgetMirroredTerminal(terminalId);
		const { ctx, createSession, updateSession } = createContext("workspace-9");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId,
			eventType: "SessionStart",
			agent: { agentId: "claude", sessionId: "cli-session-1" },
		});

		expect(createSession).toHaveBeenCalledTimes(1);
		expect(createSession.mock.calls[0]?.[0]).toEqual({
			sessionId: deterministicSessionId(terminalId),
			v2WorkspaceId: "workspace-9",
			terminalId,
		});

		await flush();
		expect(updateSession).toHaveBeenCalledTimes(1);
		expect(updateSession.mock.calls[0]?.[0]).toEqual({
			sessionId: deterministicSessionId(terminalId),
			title: "Claude",
		});
	});

	it("does not create a duplicate row on repeated Start events", async () => {
		const terminalId = "term-mirror-b";
		forgetMirroredTerminal(terminalId);
		const { ctx, createSession } = createContext("workspace-9");
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({
			terminalId,
			eventType: "SessionStart",
			agent: { agentId: "claude" },
		});
		await caller.hook({
			terminalId,
			eventType: "UserPromptSubmit",
			agent: { agentId: "claude" },
		});
		await caller.hook({
			terminalId,
			eventType: "Stop",
			agent: { agentId: "claude" },
		});
		await flush();

		expect(createSession).toHaveBeenCalledTimes(1);
	});

	it("does not mirror when no agent is bound to the terminal", async () => {
		const terminalId = "term-mirror-c";
		forgetMirroredTerminal(terminalId);
		const { ctx, createSession } = createContext("workspace-9");

		// No agentId and no prior binding → the store records nothing, so there
		// is no live agent to mirror.
		await notificationsRouter.createCaller(ctx).hook({
			terminalId,
			eventType: "Stop",
		});
		await flush();

		expect(createSession).not.toHaveBeenCalled();
	});

	it("closes the mirrored session when the agent binding disappears", async () => {
		const terminalId = "term-mirror-e";
		forgetMirroredTerminal(terminalId);
		const { ctx, updateSession } = createContext("workspace-9");
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({
			terminalId,
			eventType: "SessionStart",
			agent: { agentId: "claude" },
		});
		await flush();
		const callsAfterMirror = updateSession.mock.calls.length;

		await caller.hook({ terminalId, eventType: "SessionEnd" }); // Detached → binding gone
		await flush();

		const closeCall = updateSession.mock.calls[callsAfterMirror]?.[0] as
			| { sessionId: string; endedAt?: Date }
			| undefined;
		expect(closeCall?.sessionId).toBe(deterministicSessionId(terminalId));
		expect(closeCall?.endedAt).toBeInstanceOf(Date);
	});

	it("re-mirrors after the terminal detaches and a new agent attaches", async () => {
		const terminalId = "term-mirror-d";
		forgetMirroredTerminal(terminalId);
		const { ctx, createSession } = createContext("workspace-9");
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({
			terminalId,
			eventType: "SessionStart",
			agent: { agentId: "claude" },
		});
		await caller.hook({ terminalId, eventType: "SessionEnd" }); // Detached → binding gone
		await caller.hook({
			terminalId,
			eventType: "SessionStart",
			agent: { agentId: "claude" },
		});
		await flush();

		expect(createSession).toHaveBeenCalledTimes(2);
	});
});
