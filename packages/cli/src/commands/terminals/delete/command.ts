import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findHostWorkspace } from "../../../lib/host-workspaces";

// `terminal.killSession` throws NOT_FOUND with one of these messages when the
// terminal (or its workspace) is already gone. Treat that as idempotent
// success, mirroring `workspaces delete`'s alreadyGone.
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

export default command({
	description: "Delete (kill) a terminal session by id",
	args: [positional("id").required().desc("Terminal session id")],
	options: {
		workspace: string().required().desc("Workspace ID that owns the terminal"),
	},
	run: async ({ ctx, args, options }) => {
		const terminalId = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		// Workspace records are host-owned: resolve the id across the org's
		// reachable hosts.
		const { workspace, warnings } = await findHostWorkspace(
			{ api: ctx.api, organizationId, userJwt: ctx.bearer },
			options.workspace,
		);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}
		if (!workspace) {
			// Workspace gone → its terminals went with it. Idempotent success.
			return {
				data: { terminalId, alreadyGone: true, status: "already_gone" },
				message: `Terminal ${terminalId} already gone`,
			};
		}

		const target = resolveHostTarget({
			requestedHostId: workspace.hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		try {
			const result = await target.client.terminal.killSession.mutate({
				terminalId,
				workspaceId: options.workspace,
			});
			return {
				data: { ...result, alreadyGone: false },
				message: `Deleted terminal ${terminalId}`,
			};
		} catch (error) {
			if (isTerminalGoneError(error)) {
				return {
					data: { terminalId, alreadyGone: true, status: "already_gone" },
					message: `Terminal ${terminalId} already gone`,
				};
			}
			throw error;
		}
	},
});
