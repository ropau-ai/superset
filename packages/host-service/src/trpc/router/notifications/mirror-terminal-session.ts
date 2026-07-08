import { createHash } from "node:crypto";
import {
	BUILTIN_AGENT_LABELS,
	isBuiltinAgentId,
} from "@superset/shared/agent-catalog";
import type { TerminalAgentId } from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";

/**
 * Fixed RFC-4122 namespace used to derive a stable `chat_sessions.id` from a
 * `terminalId`. Deriving the id (rather than minting a random one) is what
 * makes the mirror idempotent across repeated lifecycle events *and* across
 * host-service restarts: the same terminal always maps to the same synced row,
 * so `chat.createSession`'s `onConflictDoNothing` is a genuine no-op the second
 * time around.
 */
const TERMINAL_SESSION_NAMESPACE = "9e5a3f8c-1b2d-4c6e-8a7f-0d1e2f3a4b5c";

/**
 * Terminals already mirrored during this host-service process lifetime. Purely
 * a network-call optimizer: `Start` fires on every prompt/tool-use, and we
 * don't want a cloud round-trip each time. DB-level idempotency is guaranteed
 * independently by the deterministic id + `onConflictDoNothing`, so a cold set
 * (after a restart) at worst re-sends one harmless upsert per live terminal.
 */
const mirrored = new Set<string>();

/** Deterministic UUIDv5(namespace, terminalId) — always a valid `z.uuid()`. */
export function deterministicSessionId(terminalId: string): string {
	const namespaceBytes = Buffer.from(
		TERMINAL_SESSION_NAMESPACE.replace(/-/g, ""),
		"hex",
	);
	const bytes = createHash("sha1")
		.update(namespaceBytes)
		.update(Buffer.from(terminalId, "utf8"))
		.digest()
		.subarray(0, 16);
	// Stamp version (5) and the RFC-4122 variant into the derived bytes.
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function resolveTitle(
	agentId: TerminalAgentId | undefined,
): string | undefined {
	if (!agentId) return undefined;
	return isBuiltinAgentId(agentId) ? BUILTIN_AGENT_LABELS[agentId] : agentId;
}

/**
 * Drop the dedupe marker so a later lifecycle event re-mirrors the terminal.
 * Called when a terminal's agent binding disappears (Detached / exit).
 */
export function forgetMirroredTerminal(terminalId: string): void {
	mirrored.delete(terminalId);
}

/**
 * Mirror a live terminal/CLI agent into the synced `chat_sessions` table so it
 * surfaces in the mobile Sessions list. The chat-agent path (`runChatAgent`)
 * already writes this row; terminal agents never did, so a `claude` CLI session
 * — whether launched via `agents.run` or typed into a workspace terminal by
 * hand — was invisible on mobile. This is the single choke point both funnel
 * through (the notification hook), so one write here covers every case.
 *
 * Fire-and-forget and best-effort: a failed cloud write must never break the
 * hook, which also drives the local chime + working indicator. On failure the
 * dedupe marker is cleared so the next lifecycle event retries.
 */
export function mirrorTerminalSessionToCloud(
	ctx: HostServiceContext,
	input: {
		terminalId: string;
		workspaceId: string;
		agentId?: TerminalAgentId;
	},
): void {
	if (mirrored.has(input.terminalId)) return;
	mirrored.add(input.terminalId);

	const sessionId = deterministicSessionId(input.terminalId);
	const title = resolveTitle(input.agentId);

	void (async () => {
		try {
			await ctx.api.chat.createSession.mutate({
				sessionId,
				v2WorkspaceId: input.workspaceId,
			});
			if (title) {
				await ctx.api.chat.updateSession.mutate({ sessionId, title });
			}
		} catch (error) {
			mirrored.delete(input.terminalId);
			console.error(
				`[mirrorTerminalSession] failed to mirror terminal ${input.terminalId}:`,
				error,
			);
		}
	})();
}
