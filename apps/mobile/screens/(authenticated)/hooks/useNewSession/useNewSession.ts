import type { SelectV2Workspace } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { compareDesc } from "date-fns";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, useWindowDimensions } from "react-native";
import { useSession } from "@/lib/auth/client";
import {
	buildHostRoutingKey,
	type HostAgentConfigSummary,
	HostRequestError,
	isRelayConfigured,
	listHostAgentConfigs,
	runWorkspaceAgent,
} from "@/lib/relay/relay";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

/**
 * State of the agent-runtime list for the selected workspace's host.
 * `offline` = host unreachable (no launch possible), `error` = host online but
 * the config read failed (retryable).
 */
export type NewSessionAgentsPhase = "offline" | "loading" | "ready" | "error";

export interface NewSessionSheetProps {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	workspaces: SelectV2Workspace[];
	selectedWorkspaceId: string | null;
	onSelectWorkspace: (workspaceId: string) => void;
	/**
	 * Agent runtimes ACTUALLY installed on the selected workspace's host — the
	 * picker never offers an agent the host can't launch.
	 */
	agents: HostAgentConfigSummary[];
	agentsPhase: NewSessionAgentsPhase;
	onRetryAgents: () => void;
	selectedAgentId: string | null;
	onSelectAgent: (agentConfigId: string) => void;
	prompt: string;
	onChangePrompt: (value: string) => void;
	onLaunch: () => void;
	isLaunching: boolean;
	width: number;
}

/**
 * The "new session" flow: pick a workspace, pick an agent runtime installed on
 * its host, write the initial prompt, and REALLY launch the agent — the host's
 * `agents.run` builds the CLI command, spawns the PTY and pre-creates the
 * mirrored cloud session, whose id we navigate to. No more empty
 * `chat_sessions` rows pretending to be running agents.
 */
export function useNewSession(): {
	open: () => void;
	sheetProps: NewSessionSheetProps;
} {
	const router = useRouter();
	const collections = useCollections();
	const { width } = useWindowDimensions();
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;

	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
		null,
	);
	const [agents, setAgents] = useState<HostAgentConfigSummary[]>([]);
	const [agentsPhase, setAgentsPhase] =
		useState<NewSessionAgentsPhase>("loading");
	const [agentsRetryToken, setAgentsRetryToken] = useState(0);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const [isLaunching, setIsLaunching] = useState(false);

	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const sortedWorkspaces = useMemo<SelectV2Workspace[]>(
		() =>
			[...(workspaces ?? [])].sort((a, b) =>
				compareDesc(a.updatedAt, b.updatedAt),
			),
		[workspaces],
	);

	const selectedWorkspace =
		sortedWorkspaces.find((item) => item.id === selectedWorkspaceId) ?? null;
	const selectedHost = selectedWorkspace
		? ((hosts ?? []).find(
				(item) => item.machineId === selectedWorkspace.hostId,
			) ?? null)
		: null;
	const routingKey =
		organizationId && selectedWorkspace
			? buildHostRoutingKey(organizationId, selectedWorkspace.hostId)
			: null;
	const hostReady =
		isRelayConfigured() && selectedHost?.isOnline === true && !!routingKey;

	// Load the installed agent runtimes whenever the sheet targets a (reachable)
	// host. The selection survives workspace switches when both hosts have the
	// same agent installed; otherwise it snaps to Claude, then the host's first.
	useEffect(() => {
		// Referenced so bumping the token re-runs this effect (the Retry button).
		void agentsRetryToken;
		if (!sheetOpen) return;
		if (!hostReady || !routingKey) {
			setAgents([]);
			setAgentsPhase("offline");
			return;
		}
		let disposed = false;
		setAgentsPhase("loading");
		(async () => {
			try {
				const configs = await listHostAgentConfigs(routingKey);
				if (disposed) return;
				const ordered = [...configs].sort((a, b) => a.order - b.order);
				setAgents(ordered);
				setAgentsPhase("ready");
				setSelectedAgentId((current) => {
					if (current && ordered.some((config) => config.id === current)) {
						return current;
					}
					const claude = ordered.find((config) => config.presetId === "claude");
					return (claude ?? ordered[0])?.id ?? null;
				});
			} catch {
				if (disposed) return;
				setAgents([]);
				setAgentsPhase("error");
			}
		})();
		return () => {
			disposed = true;
		};
	}, [sheetOpen, hostReady, routingKey, agentsRetryToken]);

	const retryAgents = useCallback(() => setAgentsRetryToken((n) => n + 1), []);

	const launch = useCallback(async () => {
		const trimmedPrompt = prompt.trim();
		const agentConfig =
			agents.find((config) => config.id === selectedAgentId) ?? null;
		if (
			isLaunching ||
			!routingKey ||
			!selectedWorkspace ||
			!agentConfig ||
			trimmedPrompt.length === 0
		) {
			return;
		}
		setIsLaunching(true);
		try {
			const result = await runWorkspaceAgent(routingKey, {
				workspaceId: selectedWorkspace.id,
				agent: agentConfig.id,
				prompt: trimmedPrompt,
			});
			setSheetOpen(false);
			setPrompt("");
			router.push(
				`/(authenticated)/(tabs)/(sessions)/${result.cloudSessionId}`,
			);
		} catch (err) {
			const reachedHost = err instanceof HostRequestError;
			Alert.alert(
				"Couldn't launch agent",
				reachedHost
					? `The host couldn't start ${agentConfig.label}. Check the agent is installed on that machine and try again.`
					: "Couldn't reach the workspace's host. Check your connection and try again.",
			);
		} finally {
			setIsLaunching(false);
		}
	}, [
		prompt,
		agents,
		selectedAgentId,
		isLaunching,
		routingKey,
		selectedWorkspace,
		router,
	]);

	const open = useCallback(() => {
		if (isLaunching) return;
		if (sortedWorkspaces.length === 0) {
			Alert.alert(
				"No workspaces",
				"Create a workspace from the desktop app first.",
			);
			return;
		}
		// Always show the sheet — even with one workspace the launch needs an
		// agent choice and an initial prompt.
		setSelectedWorkspaceId(
			(current) =>
				(current && sortedWorkspaces.some((item) => item.id === current)
					? current
					: sortedWorkspaces[0]?.id) ?? null,
		);
		setSheetOpen(true);
	}, [sortedWorkspaces, isLaunching]);

	return {
		open,
		sheetProps: {
			isPresented: sheetOpen,
			onIsPresentedChange: setSheetOpen,
			workspaces: sortedWorkspaces,
			selectedWorkspaceId,
			onSelectWorkspace: setSelectedWorkspaceId,
			agents,
			agentsPhase,
			onRetryAgents: retryAgents,
			selectedAgentId,
			onSelectAgent: setSelectedAgentId,
			prompt,
			onChangePrompt: setPrompt,
			onLaunch: () => void launch(),
			isLaunching,
			width,
		},
	};
}
