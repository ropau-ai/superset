import type { SelectV2Project, SelectV2Workspace } from "@superset/db/schema";

// Canonical resolution of "which project/workspace is Emilien". The orchestrator
// lives in the "Zuno-Emilien" project's main workspace. Kept as pure functions
// (no React) so both the cockpit's `useEmilienSession` hook and the root
// `AgentNotificationWatcher` derive the same answer and can never disagree about
// what counts as "Emilien" vs. "the fleet".

export const EMILIEN_PROJECT_NAME = "Zuno-Emilien";

/** Match the Emilien project by name (exact, then case-insensitive). */
export function resolveEmilienProject(
	projects: readonly SelectV2Project[],
): SelectV2Project | null {
	return (
		projects.find((p) => p.name === EMILIEN_PROJECT_NAME) ??
		projects.find(
			(p) => p.name.toLowerCase() === EMILIEN_PROJECT_NAME.toLowerCase(),
		) ??
		null
	);
}

/**
 * Emilien's main workspace: the project's `main`-typed workspace, else its
 * `main` branch, else the most-recently-touched one. `null` until the project
 * has hydrated.
 */
export function resolveEmilienWorkspace(
	projects: readonly SelectV2Project[],
	workspaces: readonly SelectV2Workspace[],
): SelectV2Workspace | null {
	const project = resolveEmilienProject(projects);
	if (!project) return null;
	const projectWorkspaces = workspaces.filter(
		(w) => w.projectId === project.id,
	);
	return (
		projectWorkspaces.find((w) => w.type === "main") ??
		projectWorkspaces.find((w) => w.branch === "main") ??
		[...projectWorkspaces].sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		)[0] ??
		null
	);
}
