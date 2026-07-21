import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

// The host-service `terminal.killSession` throws NOT_FOUND with one of these
// messages when the terminal (or its workspace) is already gone. We treat that
// as idempotent success, mirroring workspaces_delete's `alreadyGone`.
const TERMINAL_GONE_MARKERS = [
	"Terminal session not found",
	"Terminal session has exited",
	"Terminal session does not belong to this workspace",
	"Workspace not found",
];

function isTerminalGoneError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return TERMINAL_GONE_MARKERS.some((marker) => message.includes(marker));
}

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_delete",
		description:
			"Delete a terminal session by id: cleanly kill its PTY (SIGTERM, then SIGKILL after a grace period), remove its pane from the UI, and clean up backend state. Idempotent — succeeds with alreadyGone:true if the terminal or its workspace is already gone. Also works on a terminal whose command already exited (a frozen pane).",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID that owns the terminal."),
			terminalId: z
				.string()
				.min(1)
				.describe("Terminal session id to delete (from terminals_list)."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const workspace = await caller.v2Workspace.getFromHost({
				organizationId: ctx.organizationId,
				id: input.workspaceId,
			});
			if (!workspace) {
				// Workspace gone → its terminals went with it. Idempotent success.
				return {
					success: true,
					alreadyGone: true,
					terminalId: input.terminalId,
					status: "already_gone" as const,
				};
			}

			try {
				const result = await hostServiceCall<{
					terminalId: string;
					status: string;
				}>(
					{
						relayUrl: ctx.relayUrl,
						organizationId: ctx.organizationId,
						hostId: workspace.hostId,
						jwt: ctx.bearerToken,
					},
					"terminal.killSession",
					"mutation",
					{ terminalId: input.terminalId, workspaceId: input.workspaceId },
				);
				return { success: true, alreadyGone: false, ...result };
			} catch (error) {
				if (isTerminalGoneError(error)) {
					return {
						success: true,
						alreadyGone: true,
						terminalId: input.terminalId,
						status: "already_gone" as const,
					};
				}
				throw error;
			}
		},
	});
}
