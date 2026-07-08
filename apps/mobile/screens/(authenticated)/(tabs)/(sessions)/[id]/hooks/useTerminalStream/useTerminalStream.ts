import { useCallback, useEffect, useRef, useState } from "react";
import { listHostTerminals } from "@/lib/relay/relay";
import {
	TerminalStreamConnection,
	type TerminalStreamState,
} from "./TerminalStreamConnection";
import { appendTerminalChunk, createUtf8Decoder } from "./terminalOutput";

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

	const retry = useCallback(() => setRetryToken((n) => n + 1), []);

	useEffect(() => {
		if (!enabled || !routingKey || !workspaceId) {
			setPhase("disabled");
			return;
		}

		let disposed = false;
		let connection: TerminalStreamConnection | null = null;
		const decoder = createUtf8Decoder();
		linesRef.current = [];
		setLines([]);
		setTerminalTitle(null);
		setError(null);
		setConnectionState(null);
		setPhase("discovering");

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
				const target = sessions.find((s) => !s.exited) ?? sessions[0] ?? null;
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
							const text = decoder.decode(bytes);
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
	}, [routingKey, workspaceId, enabled]);

	return { lines, phase, connectionState, terminalTitle, error, retry };
}
