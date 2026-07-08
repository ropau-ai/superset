import type {
	SelectChatSession,
	SelectV2Host,
	SelectV2Project,
	SelectV2Workspace,
} from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

// The orchestrator lives in the "Zuno-Emilien" project's main workspace. We
// match the project by name (exact, then case-insensitive) and pick its `main`
// workspace (by type, then by branch === "main", then most-recently-touched).
const EMILIEN_PROJECT_NAME = "Zuno-Emilien";

export interface EmilienContext {
	project: SelectV2Project | null;
	workspace: SelectV2Workspace | null;
	/** Most-recently-active chat session on Emilien's main workspace. */
	session: SelectChatSession | null;
	host: SelectV2Host | null;
	/** True once the projects + sessions collections have hydrated at least once. */
	ready: boolean;
}

function activeMs(session: SelectChatSession): number {
	return (
		session.lastActiveAt ?? session.updatedAt ?? session.createdAt
	).getTime();
}

/**
 * Resolves the pinned Emilien session for the cockpit Home. Cache-first: it
 * derives from whatever the Electric collections already hold and simply returns
 * `null` fields until the match materializes — the Emilien card always renders
 * (in a "veille" state when unresolved), never blanks.
 */
export function useEmilienSession(): EmilienContext {
	const collections = useCollections();

	const { data: projects, isReady: projectsReady } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);
	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: sessions, isReady: sessionsReady } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	return useMemo<EmilienContext>(() => {
		const allProjects = projects ?? [];
		const project =
			allProjects.find((p) => p.name === EMILIEN_PROJECT_NAME) ??
			allProjects.find(
				(p) => p.name.toLowerCase() === EMILIEN_PROJECT_NAME.toLowerCase(),
			) ??
			null;

		let workspace: SelectV2Workspace | null = null;
		if (project) {
			const projectWorkspaces = (workspaces ?? []).filter(
				(w) => w.projectId === project.id,
			);
			workspace =
				projectWorkspaces.find((w) => w.type === "main") ??
				projectWorkspaces.find((w) => w.branch === "main") ??
				[...projectWorkspaces].sort(
					(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
				)[0] ??
				null;
		}

		let session: SelectChatSession | null = null;
		if (workspace) {
			const workspaceSessions = (sessions ?? []).filter(
				(s) => s.v2WorkspaceId === workspace.id,
			);
			session =
				[...workspaceSessions].sort((a, b) => activeMs(b) - activeMs(a))[0] ??
				null;
		}

		const host = workspace
			? ((hosts ?? []).find((h) => h.machineId === workspace.hostId) ?? null)
			: null;

		return {
			project,
			workspace,
			session,
			host,
			ready: projectsReady && sessionsReady,
		};
	}, [projects, workspaces, sessions, hosts, projectsReady, sessionsReady]);
}
