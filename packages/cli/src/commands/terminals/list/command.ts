import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findHostWorkspace } from "../../../lib/host-workspaces";

export default command({
	description: "List the terminal sessions of a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["id", "label", "status", "createdAt"],
			["ID", "LABEL", "STATUS", "CREATED"],
			[36, 30, 8, 24],
		),
	run: async ({ ctx, options }) => {
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
			throw new CLIError(
				`Workspace not found on any reachable host: ${options.workspace}`,
			);
		}

		const target = resolveHostTarget({
			requestedHostId: workspace.hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const { sessions } = await target.client.terminal.listSessions.query({
			workspaceId: options.workspace,
			includeExited: true,
		});

		return sessions.map((session) => ({
			id: session.terminalId,
			label: session.title ?? "",
			status: session.exited ? "exited" : "running",
			exitCode: session.exited ? session.exitCode : null,
			attached: session.attached,
			createdAt: new Date(session.createdAt).toISOString(),
		}));
	},
});
