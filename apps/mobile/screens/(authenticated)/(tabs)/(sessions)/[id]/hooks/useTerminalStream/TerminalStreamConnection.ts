import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { getRelayAuthToken, getRelayWsBaseUrl } from "@/lib/relay/relay";

export type TerminalStreamState =
	| "connecting"
	| "connected"
	| "reconnecting"
	| "error";

type TerminalServerMessage =
	| { type: "attached"; terminalId: string }
	| { type: "title"; title: string | null }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number };

interface TerminalStreamTarget {
	workspaceId: string;
	terminalId: string;
	routingKey: string;
}

interface TerminalStreamHandlers {
	onBytes: (bytes: Uint8Array) => void;
	onControl: (message: TerminalServerMessage) => void;
	onStateChange: (state: TerminalStreamState) => void;
}

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 12;

// React Native port of the web `TerminalConnection`: owns the terminal
// WebSocket lifecycle with exponential-backoff reconnect on an unexpected
// close. Backgrounded RN apps freeze timers and drop the socket, so instead of
// the web's `visibilitychange`/`online` listeners we recover via `AppState`
// (foreground) and `expo-network` (connectivity regained). The relay keys
// sessions by terminalId and adopts/respawns the PTY on reattach, so reopening
// the same socket resumes the live stream where it left off.
export class TerminalStreamConnection {
	private readonly target: TerminalStreamTarget;
	private readonly handlers: TerminalStreamHandlers;
	private socket: WebSocket | null = null;
	private state: TerminalStreamState = "connecting";
	private generation = 0;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private hasReceivedBytes = false;
	private everAttached = false;
	private terminated = false;
	private disposed = false;
	private appStateSub: { remove: () => void } | null = null;
	private networkSub: { remove: () => void } | null = null;

	constructor(target: TerminalStreamTarget, handlers: TerminalStreamHandlers) {
		this.target = target;
		this.handlers = handlers;
	}

	start() {
		this.appStateSub = AppState.addEventListener("change", this.handleAppState);
		try {
			// Native module; guard so an unavailable/unlinked build never crashes
			// the screen — AppState alone still drives recovery in that case.
			this.networkSub = Network.addNetworkStateListener((event) => {
				if (event.isConnected !== false) this.handleResume();
			});
		} catch {
			this.networkSub = null;
		}
		void this.connect();
	}

	dispose() {
		this.disposed = true;
		this.cancelReconnect();
		this.appStateSub?.remove();
		this.appStateSub = null;
		this.networkSub?.remove();
		this.networkSub = null;
		this.teardownSocket();
	}

	private connect = async () => {
		if (this.disposed || this.terminated) return;
		this.cancelReconnect();
		this.teardownSocket();
		const generation = ++this.generation;
		this.emitState(this.everAttached ? "reconnecting" : "connecting");

		let url: string;
		try {
			url = await this.buildUrl();
		} catch {
			if (generation !== this.generation || this.disposed) return;
			this.scheduleReconnect();
			return;
		}
		if (generation !== this.generation || this.disposed || this.terminated) {
			return;
		}

		let socket: WebSocket;
		try {
			socket = new WebSocket(url);
		} catch {
			this.scheduleReconnect();
			return;
		}
		socket.binaryType = "arraybuffer";
		this.socket = socket;
		this.attachListeners(socket);
	};

	private async buildUrl(): Promise<string> {
		const base = getRelayWsBaseUrl();
		if (!base) throw new Error("Relay not configured");
		const token = await getRelayAuthToken();
		const params = new URLSearchParams({
			workspaceId: this.target.workspaceId,
			themeType: "dark",
			token,
		});
		// Once the client holds scrollback, skip the daemon ring-buffer re-dump on
		// reattach; the in-memory buffer still replays output missed offline.
		if (this.hasReceivedBytes) params.set("replay", "0");
		return `${base}/hosts/${this.target.routingKey}/terminal/${encodeURIComponent(
			this.target.terminalId,
		)}?${params.toString()}`;
	}

	private attachListeners(socket: WebSocket) {
		socket.onmessage = (event) => {
			if (this.socket !== socket) return;
			const data = (event as { data: unknown }).data;
			if (data instanceof ArrayBuffer) {
				this.hasReceivedBytes = true;
				this.emitState("connected");
				this.handlers.onBytes(new Uint8Array(data));
				return;
			}
			let message: TerminalServerMessage;
			try {
				message = JSON.parse(String(data)) as TerminalServerMessage;
			} catch {
				return;
			}
			if (message.type === "attached") {
				this.reconnectAttempt = 0;
				this.everAttached = true;
				this.emitState("connected");
			} else if (message.type === "exit" || message.type === "error") {
				this.terminated = true;
				this.cancelReconnect();
			}
			this.handlers.onControl(message);
		};

		socket.onclose = () => {
			if (this.socket !== socket) return;
			this.socket = null;
			if (this.terminated || this.disposed) return;
			this.scheduleReconnect();
		};

		socket.onerror = () => {
			if (this.socket !== socket) return;
			// `onclose` fires after `onerror`; let it drive the reconnect so the
			// attempt budget isn't consumed twice for one failure.
		};
	}

	private teardownSocket() {
		const socket = this.socket;
		this.socket = null;
		if (!socket) return;
		socket.onmessage = null;
		socket.onclose = null;
		socket.onerror = null;
		try {
			socket.close();
		} catch {
			// best-effort
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimer !== null) return;
		if (this.terminated || this.disposed) return;
		if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
			this.emitState("error");
			return;
		}
		this.emitState("reconnecting");
		// Backgrounded apps don't run timers; the AppState listener reconnects on
		// foreground instead of burning the attempt budget on a timer that won't
		// fire.
		if (AppState.currentState !== "active") return;

		const delay = Math.min(
			BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
			MAX_RECONNECT_DELAY_MS,
		);
		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, delay);
	}

	private cancelReconnect() {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private handleAppState = (status: AppStateStatus) => {
		if (status === "active") this.handleResume();
	};

	private handleResume = () => {
		if (this.disposed || this.terminated) return;
		if (AppState.currentState !== "active") return;
		this.reconnectAttempt = 0;
		const socket = this.socket;
		if (
			socket &&
			(socket.readyState === WebSocket.OPEN ||
				socket.readyState === WebSocket.CONNECTING)
		) {
			return;
		}
		this.cancelReconnect();
		void this.connect();
	};

	private emitState(state: TerminalStreamState) {
		if (this.state === state) return;
		this.state = state;
		this.handlers.onStateChange(state);
	}
}
