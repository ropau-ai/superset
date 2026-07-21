import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

interface HostTerminalSession {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
}

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_list",
		description:
			"List the terminal sessions of a workspace. Resolves the host that owns the workspace, then enumerates its live PTYs — including sessions whose command has already exited but whose pane is still open (status `exited`). Use this to find a terminalId for terminals_delete, or to check whether a command is still running.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID whose terminals should be listed."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const workspace = await caller.v2Workspace.getFromHost({
				organizationId: ctx.organizationId,
				id: input.workspaceId,
			});
			if (!workspace) {
				throw new Error(`Workspace not found: ${input.workspaceId}`);
			}

			const { sessions } = await hostServiceCall<{
				sessions: HostTerminalSession[];
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.listSessions",
				"query",
				{ workspaceId: input.workspaceId, includeExited: true },
			);

			return {
				terminals: sessions.map((session) => ({
					id: session.terminalId,
					label: session.title,
					status: session.exited ? ("exited" as const) : ("running" as const),
					exitCode: session.exited ? session.exitCode : null,
					attached: session.attached,
					createdAt: session.createdAt,
				})),
			};
		},
	});
}
