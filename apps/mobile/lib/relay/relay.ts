import SuperJSON from "superjson";
import { authClient, getJwt, setJwt } from "../auth/client";
import { env } from "../env";

// Mobile port of the web `host-client.ts` + `relay-url`/`auth-token` helpers.
// Direct app → relay → host-service tRPC calls over the same path the desktop
// and web use. Host inputs/outputs are hand-typed at the boundary (rather than
// importing `@superset/host-service`, which drags node-only modules into the
// mobile bundle) — the cloud's `relay-client.ts` and web's `host-client.ts` do
// the same.

/**
 * A host tRPC call that reached the relay and the host, but whose procedure
 * returned a non-2xx status. `status` lets callers tell "host is unreachable"
 * (a thrown fetch / no status) apart from "host answered, but this procedure
 * failed" — e.g. a terminal agent like Emilien has no mastra chat thread, so
 * `chat.listMessages` 500s even though the host is perfectly online. Callers use
 * that distinction to degrade to a calm empty state instead of a scary error,
 * and never render this raw message to the user.
 */
export class HostRequestError extends Error {
	readonly status: number;
	readonly procedure: string;
	constructor(procedure: string, status: number) {
		super(`host ${procedure} failed (${status})`);
		this.name = "HostRequestError";
		this.status = status;
		this.procedure = procedure;
	}
}

/** One live terminal PTY session on a host, as returned by the relay. */
export interface HostTerminalSession {
	terminalId: string;
	workspaceId: string;
	exited: boolean;
	title: string | null;
}

/**
 * One live agent process bound to a terminal. `lastEventType` is the normalized
 * agent-lifecycle event (`Attached` | `Start` | `Stop` | `PermissionRequest` |
 * `Detached`) from the host-service; timestamps are epoch ms.
 */
export interface TerminalAgentBinding {
	terminalId: string;
	workspaceId: string;
	agentId: string;
	agentSessionId?: string;
	definitionId?: string;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
}

/** Relay base URL for HTTP calls, or `null` when the app isn't configured. */
export function getRelayHttpBaseUrl(): string | null {
	const url = env.EXPO_PUBLIC_RELAY_URL;
	if (!url) return null;
	return url.replace(/\/$/, "");
}

/** Relay base URL rewritten to the `ws`/`wss` scheme for WebSocket use. */
export function getRelayWsBaseUrl(): string | null {
	const base = getRelayHttpBaseUrl();
	if (!base) return null;
	return base.replace(/^http/, "ws");
}

/** Whether the relay is configured for this build at all. */
export function isRelayConfigured(): boolean {
	return getRelayHttpBaseUrl() !== null;
}

/**
 * Routing key the relay uses to identify a host-service tunnel. The same
 * machine can host in multiple orgs, so `machineId` alone isn't unique on the
 * relay's tunnel map — scope it by org. Mirrors `@superset/shared`'s
 * `buildHostRoutingKey` (inlined to avoid pulling a new workspace dep into the
 * mobile bundle).
 */
export function buildHostRoutingKey(
	organizationId: string,
	machineId: string,
): string {
	return `${organizationId}:${machineId}`;
}

// Better-auth user JWT the relay verifies via JWKS. The mobile auth client
// caches the token in memory (refreshed from `set-auth-jwt` response headers);
// fall back to an explicit `authClient.token()` fetch when it isn't primed yet.
export async function getRelayAuthToken(): Promise<string> {
	const existing = getJwt();
	if (existing) return existing;
	const result = await authClient.token();
	const token = result.data?.token;
	if (!token) throw new Error("Unable to obtain relay auth token");
	setJwt(token);
	return token;
}

async function hostTrpcCall<TOutput>(
	routingKey: string,
	procedure: string,
	input: unknown,
	method: "GET" | "POST",
): Promise<TOutput> {
	const base = getRelayHttpBaseUrl();
	if (!base) throw new Error("Relay not configured");
	const token = await getRelayAuthToken();
	const endpoint = `${base}/hosts/${routingKey}/trpc/${procedure}`;
	const encoded = input === undefined ? undefined : SuperJSON.serialize(input);
	const url =
		method === "GET" && encoded !== undefined
			? `${endpoint}?input=${encodeURIComponent(JSON.stringify(encoded))}`
			: endpoint;

	const response = await fetch(url, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			...(method === "POST" ? { "content-type": "application/json" } : {}),
		},
		body:
			method === "POST" && encoded !== undefined
				? JSON.stringify(encoded)
				: undefined,
	});
	if (!response.ok) {
		throw new HostRequestError(procedure, response.status);
	}

	const parsed = (await response.json()) as { result?: { data?: unknown } };
	if (!parsed.result || parsed.result.data === undefined) {
		throw new Error(`host ${procedure}: malformed relay response`);
	}
	return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
}

/** List the live terminal PTYs for a workspace on its host. */
export function listHostTerminals(routingKey: string, workspaceId: string) {
	return hostTrpcCall<{ sessions: HostTerminalSession[] }>(
		routingKey,
		"terminal.listSessions",
		{ workspaceId },
		"GET",
	);
}

/** List the agent bindings (with live lifecycle state) for a workspace. */
export function listWorkspaceAgents(routingKey: string, workspaceId: string) {
	return hostTrpcCall<TerminalAgentBinding[]>(
		routingKey,
		"terminalAgents.listByWorkspace",
		{ workspaceId },
		"GET",
	);
}

// --- Rich agent activity (chat runtime messages) --------------------------
//
// The agent's real per-tool activity (bash commands, file diffs, commits,
// tool-use) is NOT a synced DB table — it lives in the host's mastracode
// harness thread, exposed by the host-service `chat.listMessages` tRPC
// procedure and reachable over the SAME relay path as the terminal + agent
// calls above. `agent_commands` (the one Electric table that sounds right) is a
// device command-dispatch queue with no session link, so it can't feed a
// per-session timeline. Hence: relay poll, not Electric. Parts are hand-typed
// at the boundary (mirroring apps/desktop's AssistantMessage) rather than
// importing host-service types, which drag node-only modules into the bundle.

/** One content part of an agent message. `type` discriminates the renderer. */
export type ChatMessagePart =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string }
	| {
			type: "image";
			data?: string;
			image?: string;
			mimeType?: string;
			mediaType?: string;
			filename?: string;
	  }
	| {
			type: "file";
			data?: string;
			filename?: string;
			mediaType?: string;
			mimeType?: string;
	  }
	| {
			type: "tool_call";
			id: string;
			name: string;
			args?: Record<string, unknown>;
	  }
	| {
			type: "tool_result";
			id: string;
			name?: string;
			result?: unknown;
			isError?: boolean;
	  }
	// `om_*` and any future part types fall through to a tolerant catch-all so
	// an unknown shape degrades to a fallback row instead of crashing.
	| { type: string; [key: string]: unknown };

/** One agent message, as returned by the host `chat.listMessages`. */
export interface ChatActivityMessage {
	id: string;
	role: "user" | "assistant" | string;
	content: ChatMessagePart[];
	createdAt?: Date | string;
	stopReason?: string;
	errorMessage?: string;
}

/**
 * List the rich agent activity (assistant + user messages, each with its tool
 * parts) for a live session on its host. `sessionId` is the `chat_sessions.id`
 * (the route param) and `workspaceId` is the session's `v2WorkspaceId` — the
 * same workspace id the terminal/agent relay calls already use. The host lazily
 * (re)creates the runtime to read its persisted thread, so this can throw when
 * the host has no model credentials or the session has never started; callers
 * surface that as an error state rather than crashing.
 */
export function listSessionMessages(
	routingKey: string,
	sessionId: string,
	workspaceId: string,
) {
	return hostTrpcCall<ChatActivityMessage[]>(
		routingKey,
		"chat.listMessages",
		{ sessionId, workspaceId },
		"GET",
	);
}

/**
 * Cumulative token usage for a session, as returned by the host
 * `chat.getTokenUsage`. `null` when the host has no live runtime for the session
 * (nothing to sum yet) — the UI renders "—" rather than a fabricated count.
 * `input`/`output` are `null` when the model omits that breakdown.
 */
export interface SessionTokenUsage {
	total: number;
	input: number | null;
	output: number | null;
}

/**
 * Read the real cumulative token usage for a live session on its host. Mirrors
 * `listSessionMessages`'s relay path and args (`sessionId` = `chat_sessions.id`,
 * `workspaceId` = the session's `v2WorkspaceId`). The host reads its live
 * mastracode harness counter and returns `null` when no runtime is currently
 * attached to the session, so callers surface "—" instead of a guessed number.
 */
export function getSessionTokenUsage(
	routingKey: string,
	sessionId: string,
	workspaceId: string,
) {
	return hostTrpcCall<SessionTokenUsage | null>(
		routingKey,
		"chat.getTokenUsage",
		{ sessionId, workspaceId },
		"GET",
	);
}

/**
 * Send a user message to a live session's agent via the host `chat.sendMessage`
 * mutation over the relay — the same path the desktop/web composer uses. The
 * host queues the turn and updates the cloud `lastActiveAt`; the reply streams
 * into the thread and is picked up by the next `listSessionMessages` poll (so we
 * don't need the mutation's return value beyond success). Throws when the relay
 * or host can't be reached, which the composer surfaces to the user.
 */
export function sendSessionMessage(
	routingKey: string,
	sessionId: string,
	workspaceId: string,
	content: string,
) {
	return hostTrpcCall<unknown>(
		routingKey,
		"chat.sendMessage",
		{ sessionId, workspaceId, payload: { content } },
		"POST",
	);
}

/**
 * Write raw bytes into a live terminal's PTY via the host `terminal.writeInput`
 * mutation over the relay — the same primitive the desktop/web terminals and the
 * host's own agent launcher use to type into a session. This is how the mobile
 * composer talks to a TERMINAL agent (Emilien, `claude`, any PTY agent): those
 * sessions never open a mastra chat thread, so `chat.sendMessage` 500s for them;
 * writing the user's text plus a carriage return straight into stdin lands it in
 * the agent exactly as if typed, and the reply streams back through the terminal.
 * `terminalId` is resolved from the session id (see `terminalSessionId`). Throws
 * `HostRequestError` when the host is reached but the terminal is gone.
 */
export function writeTerminalInput(
	routingKey: string,
	workspaceId: string,
	terminalId: string,
	data: string,
) {
	return hostTrpcCall<{ success: true }>(
		routingKey,
		"terminal.writeInput",
		{ terminalId, workspaceId, data },
		"POST",
	);
}

// --- Git changes (the Changes tab diff viewer) ----------------------------
//
// The workspace's real git state — changed files + per-file diffs — lives in
// the host's worktree, exposed by the host-service `git.getStatus` /
// `git.getDiff` tRPC procedures and reachable over the SAME relay path the
// terminal/agent/chat calls above use. This is what desktop's DiffPane and
// web's SessionDiff read; mobile mirrors it. Types are hand-typed at the
// boundary (rather than importing `@superset/host-service`, which drags
// node-only modules into the mobile bundle) — the same convention the rest of
// this file follows.

/**
 * A changed file's status, mirroring the host-service `FileStatus`
 * (GitHub's `PatchStatus` + `"untracked"` for the working tree). Widened with a
 * tolerant `(string & {})` so an unknown status from an out-of-date host
 * degrades to a neutral badge instead of a type/runtime error.
 */
export type GitFileStatus =
	| "added"
	| "copied"
	| "changed"
	| "deleted"
	| "modified"
	| "renamed"
	| "untracked"
	// Open union: an unknown status from an out-of-date host still parses and the
	// UI maps it to a neutral fallback badge.
	| (string & {});

/** One changed file in the worktree, as returned by the host `git.getStatus`. */
export interface GitChangedFile {
	path: string;
	oldPath?: string;
	status: GitFileStatus;
	additions: number;
	deletions: number;
	isBinary?: boolean;
}

/** One branch summary in the git status snapshot (only `name` is read here). */
export interface GitBranch {
	name: string;
	isHead: boolean;
}

/**
 * The worktree's git status, as returned by the host `git.getStatus`.
 * `againstBase` is the 3-dot diff vs the base branch (what this workspace's
 * branch changed); `staged`/`unstaged` are the working-tree index/tree. The
 * host also returns richer `Branch` objects and `ignoredPaths`, but the Changes
 * tab only needs these fields, so the extras are left off the boundary type.
 */
export interface GitStatusSnapshot {
	currentBranch: GitBranch;
	defaultBranch: GitBranch;
	againstBase: GitChangedFile[];
	staged: GitChangedFile[];
	unstaged: GitChangedFile[];
}

/** Which comparison a per-file diff is against — mirrors `git.getDiff`'s `category`. */
export type GitDiffCategory = "against-base" | "staged" | "unstaged" | "commit";

/**
 * A single file's before/after contents, as returned by the host `git.getDiff`.
 * The host returns raw file contents (not a unified patch); the client computes
 * the line diff locally (see `computeLineDiff`). Either side is `""` when the
 * file is added (no `oldFile`) or deleted (no `newFile`).
 */
export interface GitFileDiff {
	oldFile: { name: string; contents: string };
	newFile: { name: string; contents: string };
}

/**
 * Read the worktree's git status (changed-files list) for a workspace on its
 * host. `workspaceId` is the `v2Workspaces.id` route param — the same id the
 * terminal/chat relay calls use. `baseBranch` is left to the host to resolve
 * (its `resolveBaseComparison`) when omitted, matching desktop's default. Throws
 * `HostRequestError` when the host is reached but the procedure fails (e.g. an
 * out-of-date host without git procedures), which the caller degrades to a calm
 * empty state rather than a raw error.
 */
export function getWorkspaceGitStatus(
	routingKey: string,
	workspaceId: string,
	baseBranch?: string,
) {
	return hostTrpcCall<GitStatusSnapshot>(
		routingKey,
		"git.getStatus",
		{ workspaceId, baseBranch, priority: "foreground" },
		"GET",
	);
}

/**
 * Read one file's before/after contents for a workspace on its host. `category`
 * selects the comparison (`against-base` for committed branch changes,
 * `staged`/`unstaged` for the working tree). The caller turns the returned
 * contents into a line diff. Throws `HostRequestError` on a host-side failure.
 */
export function getWorkspaceFileDiff(
	routingKey: string,
	workspaceId: string,
	args: { path: string; category: GitDiffCategory; baseBranch?: string },
) {
	return hostTrpcCall<GitFileDiff>(
		routingKey,
		"git.getDiff",
		{
			workspaceId,
			path: args.path,
			category: args.category,
			baseBranch: args.baseBranch,
		},
		"GET",
	);
}
