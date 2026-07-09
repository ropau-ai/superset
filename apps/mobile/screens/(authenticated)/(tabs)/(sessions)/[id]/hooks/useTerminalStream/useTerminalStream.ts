import { useCallback, useEffect, useRef, useState } from "react";
import { listHostTerminals } from "@/lib/relay/relay";
import {
	TerminalStreamConnection,
	type TerminalStreamState,
} from "./TerminalStreamConnection";
import {
	appendTerminalChunk,
	createAnsiStripper,
	createUtf8Decoder,
} from "./terminalOutput";

const FLUSH_INTERVAL_MS = 60;

export type TerminalStreamPhase =
	| "disabled"
	| "discovering"
	| "no-terminal"
	| "streaming"
	| "error";

export interface TerminalStreamResult {
	lines: string[];
	phase: TerminalStreamPhase;
	connectionState: TerminalStreamState | null;
	terminalTitle: string | null;
	error: string | null;
	/** Force re-discovery + reconnect (used by the retry button). */
	retry: () => void;
}

interface UseTerminalStreamArgs {
	routingKey: string | null;
	workspaceId: string | null;
	/** Relay reachable (configured + host online) AND the panel is open. */
	enabled: boolean;
	/**
	 * Attach to this exact terminal instead of auto-picking the first live one.
	 * Used when the caller already resolved the session's terminal (e.g. the chat
	 * screen streaming a specific terminal agent). When omitted, discovery falls
	 * back to the first non-exited terminal in the workspace.
	 */
	terminalId?: string | null;
}

/**
 * Discovers a live terminal for the workspace over the relay, then streams its
 * PTY output through {@link TerminalStreamConnection}. Output bytes are decoded,
 * ANSI-stripped, and coalesced into a bounded line buffer that's flushed to
 * React state on a short timer to keep re-renders cheap during bursty output.
 */
export function useTerminalStream({
	routingKey,
	workspaceId,
	enabled,
	terminalId,
}: UseTerminalStreamArgs): TerminalStreamResult {
	const [lines, setLines] = useState<string[]>([]);
	const [phase, setPhase] = useState<TerminalStreamPhase>("disabled");
	const [connectionState, setConnectionState] =
		useState<TerminalStreamState | null>(null);
	const [terminalTitle, setTerminalTitle] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [_retryToken, setRetryToken] = useState(0);

	const linesRef = useRef<string[]>([]);
	const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// The last live terminal target we attached to, so a mere tab toggle (which
	// flips `enabled`) can be told apart from a genuinely new terminal — the
	// former keeps its scrollback, the latter starts clean.
	const lastTargetRef = useRef<string | null>(null);

	const retry = useCallback(() => setRetryToken((n) => n + 1), []);

	useEffect(() => {
		if (!enabled || !routingKey || !workspaceId) {
			setPhase("disabled");
			return;
		}

		let disposed = false;
		let connection: TerminalStreamConnection | null = null;
		const decoder = createUtf8Decoder();
		// Strips ANSI even when a sequence is split across frames — a per-chunk
		// regex alone leaks the fragments as garble (see createAnsiStripper).
		const ansi = createAnsiStripper();

		// Re-entering the *same* live terminal (typically flipping back from the
		// Activity tab) keeps the cached scrollback on screen while we re-attach
		// transparently. The reconnect replays the full buffer, so we drop the
		// internal buffer now and let the replay rebuild it — the visible lines
		// only swap once fresh output flushes, so there's no "Connecting…" flash
		// or wiped history. A genuinely new target starts clean.
		const targetKey = `${routingKey}::${workspaceId}::${terminalId ?? ""}`;
		const resumingSameTarget =
			targetKey === lastTargetRef.current && linesRef.current.length > 0;
		lastTargetRef.current = targetKey;

		linesRef.current = [];
		setError(null);
		setConnectionState(null);
		if (resumingSameTarget) {
			setPhase("streaming");
		} else {
			setLines([]);
			setTerminalTitle(null);
			setPhase("discovering");
		}

		const scheduleFlush = () => {
			if (flushTimer.current !== null) return;
			flushTimer.current = setTimeout(() => {
				flushTimer.current = null;
				setLines(linesRef.current);
			}, FLUSH_INTERVAL_MS);
		};

		(async () => {
			try {
				const { sessions } = await listHostTerminals(routingKey, workspaceId);
				if (disposed) return;
				// A caller-supplied terminalId pins the exact session (the chat screen
				// streaming one terminal agent); otherwise fall back to the first live
				// terminal in the workspace.
				const target = terminalId
					? (sessions.find((s) => s.terminalId === terminalId) ?? null)
					: (sessions.find((s) => !s.exited) ?? sessions[0] ?? null);
				if (!target) {
					setPhase("no-terminal");
					return;
				}
				setTerminalTitle(target.title);
				setPhase("streaming");

				connection = new TerminalStreamConnection(
					{
						workspaceId,
						terminalId: target.terminalId,
						routingKey,
					},
					{
						onBytes: (bytes) => {
							const text = ansi.strip(decoder.decode(bytes));
							if (!text) return;
							linesRef.current = appendTerminalChunk(linesRef.current, text);
							scheduleFlush();
						},
						onControl: (message) => {
							if (disposed) return;
							if (message.type === "title") {
								setTerminalTitle(message.title);
							} else if (message.type === "error") {
								setError(message.message);
							}
						},
						onStateChange: (state) => {
							if (!disposed) setConnectionState(state);
						},
					},
				);
				connection.start();
			} catch (err) {
				if (disposed) return;
				setError(err instanceof Error ? err.message : "Failed to reach host");
				setPhase("error");
			}
		})();

		return () => {
			disposed = true;
			connection?.dispose();
			if (flushTimer.current !== null) {
				clearTimeout(flushTimer.current);
				flushTimer.current = null;
			}
		};
	}, [routingKey, workspaceId, enabled, terminalId]);

	return { lines, phase, connectionState, terminalTitle, error, retry };
}
