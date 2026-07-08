import SuperJSON from "superjson";
import { authClient, getJwt, setJwt } from "../auth/client";
import { env } from "../env";

// Mobile port of the web `host-client.ts` + `relay-url`/`auth-token` helpers.
// Direct app → relay → host-service tRPC calls over the same path the desktop
// and web use. Host inputs/outputs are hand-typed at the boundary (rather than
// importing `@superset/host-service`, which drags node-only modules into the
// mobile bundle) — the cloud's `relay-client.ts` and web's `host-client.ts` do
// the same.

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
		throw new Error(`host ${procedure} failed (${response.status})`);
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
