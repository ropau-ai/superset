import { describe, expect, it } from "bun:test";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";
import type { GitWatcher } from "./git-watcher";

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

describe("EventBus port events", () => {
	it("broadcasts port changes from the shared port manager and removes listeners on close", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		const port: DetectedPort = {
			port: 5173,
			pid: 123,
			processName: "vite",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			detectedAt: 1_700_000_000_000,
			address: "127.0.0.1",
		};

		eventBus.handleOpen(socket);
		eventBus.start();
		eventBus.start();
		portManager.emit("port:add", port);

		expect(sentMessages).toHaveLength(1);
		const message = JSON.parse(sentMessages[0] ?? "{}");
		expect(message).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "add",
			port,
			label: null,
		});
		expect(typeof message.occurredAt).toBe("number");

		portManager.emit("port:remove", port);
		expect(sentMessages).toHaveLength(2);
		expect(JSON.parse(sentMessages[1] ?? "{}")).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "remove",
			port,
			label: null,
		});

		eventBus.close();
		portManager.emit("port:add", port);
		expect(sentMessages).toHaveLength(2);
	});
});

describe("EventBus terminal lifecycle listeners", () => {
	it("notifies in-process listeners on broadcast and stops after dispose", () => {
		const eventBus = createEventBus();
		const received: string[] = [];
		const dispose = eventBus.onTerminalLifecycle((event) => {
			received.push(event.terminalId);
		});

		const event = {
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			eventType: "exit" as const,
			exitCode: 0,
			signal: 0,
			occurredAt: 1_700_000_000_000,
		};
		eventBus.broadcastTerminalLifecycle(event);
		expect(received).toEqual(["terminal-1"]);

		dispose();
		eventBus.broadcastTerminalLifecycle(event);
		expect(received).toEqual(["terminal-1"]);
	});

	it("keeps broadcasting to WS clients when a listener throws", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		eventBus.handleOpen(socket);
		eventBus.onTerminalLifecycle(() => {
			throw new Error("listener boom");
		});

		eventBus.broadcastTerminalLifecycle({
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			eventType: "exit",
			exitCode: 1,
			signal: 0,
			occurredAt: 1_700_000_000_000,
		});

		expect(sentMessages).toHaveLength(1);
		expect(JSON.parse(sentMessages[0] ?? "{}")).toMatchObject({
			type: "terminal:lifecycle",
			terminalId: "terminal-1",
			eventType: "exit",
		});
	});
});
