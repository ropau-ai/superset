/// <reference types="bun-types" />

/**
 * Hook-level regression test for the Retry CTA (error / no-terminal states):
 * `retry()` must genuinely re-run the discovery/connection effect.
 *
 * `bun test` has no React renderer in this repo (react-native app, no
 * react-dom / react-test-renderer), so `react` is replaced via `mock.module()`
 * with a minimal hook runtime that reproduces the one semantic under test:
 * effects re-run only when their deps array changes (shallow `Object.is`
 * comparison, exactly like React). The relay + connection modules are mocked
 * so discovery restarts are observable without any network or PTY.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { TerminalStreamResult } from "./useTerminalStream";

// --- Minimal React hook runtime -------------------------------------------

type EffectCallback = () => (() => void) | undefined;

interface EffectCell {
	deps: readonly unknown[] | undefined;
	cleanup: (() => void) | undefined;
	initialized: boolean;
}

interface PendingEffect {
	index: number;
	fn: EffectCallback;
	deps: readonly unknown[] | undefined;
}

function depsChanged(
	prev: readonly unknown[] | undefined,
	next: readonly unknown[] | undefined,
): boolean {
	if (prev === undefined || next === undefined) return true;
	if (prev.length !== next.length) return true;
	return next.some((dep, index) => !Object.is(dep, prev[index]));
}

class HookHarness<Result> {
	private readonly stateCells: unknown[] = [];
	private readonly effectCells: EffectCell[] = [];
	private pendingEffects: PendingEffect[] = [];
	private stateCursor = 0;
	private effectCursor = 0;
	private dirty = false;
	private body: (() => Result) | null = null;
	result!: Result;

	useState = <T>(
		initial: T | (() => T),
	): [T, (v: T | ((p: T) => T)) => void] => {
		const index = this.stateCursor++;
		if (this.stateCells.length <= index) {
			this.stateCells[index] =
				typeof initial === "function" ? (initial as () => T)() : initial;
		}
		const setState = (value: T | ((prev: T) => T)) => {
			const prev = this.stateCells[index] as T;
			const next =
				typeof value === "function" ? (value as (p: T) => T)(prev) : value;
			if (!Object.is(prev, next)) {
				this.stateCells[index] = next;
				this.dirty = true;
			}
		};
		return [this.stateCells[index] as T, setState];
	};

	useRef = <T>(initial: T): { current: T } => {
		const index = this.stateCursor++;
		if (this.stateCells.length <= index) {
			this.stateCells[index] = { current: initial };
		}
		return this.stateCells[index] as { current: T };
	};

	useCallback = <T>(fn: T, _deps: readonly unknown[]): T => fn;

	useEffect = (fn: EffectCallback, deps?: readonly unknown[]): void => {
		this.pendingEffects.push({ index: this.effectCursor++, fn, deps });
	};

	render(body?: () => Result): Result {
		if (body) this.body = body;
		const run = this.body;
		if (!run) throw new Error("render() needs a hook body on the first call");
		this.stateCursor = 0;
		this.effectCursor = 0;
		this.pendingEffects = [];
		this.result = run();
		// Commit phase: run effects whose deps changed, React-style.
		for (const pending of this.pendingEffects) {
			let cell = this.effectCells[pending.index];
			if (!cell) {
				cell = { deps: undefined, cleanup: undefined, initialized: false };
				this.effectCells[pending.index] = cell;
			}
			if (cell.initialized && !depsChanged(cell.deps, pending.deps)) continue;
			cell.cleanup?.();
			const returned = pending.fn();
			cell.cleanup = typeof returned === "function" ? returned : undefined;
			cell.deps = pending.deps;
			cell.initialized = true;
		}
		return this.result;
	}

	/** Flush microtasks and state-driven re-renders until the hook settles. */
	async settle(): Promise<Result> {
		for (let round = 0; round < 10; round++) {
			await Promise.resolve();
			await Promise.resolve();
			if (this.dirty) {
				this.dirty = false;
				this.render();
			}
		}
		return this.result;
	}

	unmount(): void {
		for (const cell of this.effectCells) {
			cell?.cleanup?.();
			if (cell) cell.cleanup = undefined;
		}
	}
}

let currentHarness: HookHarness<TerminalStreamResult> | null = null;

function harness(): HookHarness<TerminalStreamResult> {
	if (!currentHarness) throw new Error("No active hook harness");
	return currentHarness;
}

mock.module("react", () => ({
	useState: (initial: unknown) => harness().useState(initial),
	useRef: (initial: unknown) => harness().useRef(initial),
	useCallback: (fn: unknown, deps: readonly unknown[]) =>
		harness().useCallback(fn, deps),
	useEffect: (fn: EffectCallback, deps?: readonly unknown[]) =>
		harness().useEffect(fn, deps),
}));

// --- Relay + connection mocks ---------------------------------------------

interface FakeTerminalSession {
	terminalId: string;
	workspaceId: string;
	exited: boolean;
	title: string | null;
}

type DiscoveryResult =
	| { kind: "ok"; sessions: FakeTerminalSession[] }
	| { kind: "error"; message: string };

let discoveryCalls = 0;
let discoveryQueue: DiscoveryResult[] = [];

mock.module("@/lib/relay/relay", () => ({
	listHostTerminals: (_routingKey: string, _workspaceId: string) => {
		discoveryCalls += 1;
		const next = discoveryQueue.shift() ?? {
			kind: "ok" as const,
			sessions: [],
		};
		return next.kind === "ok"
			? Promise.resolve({ sessions: next.sessions })
			: Promise.reject(new Error(next.message));
	},
}));

class FakeTerminalStreamConnection {
	static instances: FakeTerminalStreamConnection[] = [];
	started = 0;
	disposed = 0;

	constructor(
		readonly target: {
			workspaceId: string;
			terminalId: string;
			routingKey: string;
		},
		readonly handlers: unknown,
	) {
		FakeTerminalStreamConnection.instances.push(this);
	}

	start(): void {
		this.started += 1;
	}

	dispose(): void {
		this.disposed += 1;
	}
}

mock.module("./TerminalStreamConnection", () => ({
	TerminalStreamConnection: FakeTerminalStreamConnection,
}));

// Import AFTER the mocks so the hook binds to the fakes above.
const { useTerminalStream } = await import("./useTerminalStream");

// --- Tests ------------------------------------------------------------------

const ARGS = {
	routingKey: "org-1:host-1",
	workspaceId: "ws-1",
	terminalId: "term-1",
	enabled: true,
};

describe("useTerminalStream retry", () => {
	afterEach(() => {
		currentHarness?.unmount();
		currentHarness = null;
		discoveryCalls = 0;
		discoveryQueue = [];
		FakeTerminalStreamConnection.instances = [];
	});

	test("retry() after a discovery error restarts discovery and can reach streaming", async () => {
		discoveryQueue = [
			{ kind: "error", message: "relay unreachable" },
			{
				kind: "ok",
				sessions: [
					{
						terminalId: "term-1",
						workspaceId: "ws-1",
						exited: false,
						title: "claude",
					},
				],
			},
		];
		currentHarness = new HookHarness();
		currentHarness.render(() => useTerminalStream(ARGS));
		let result = await currentHarness.settle();
		expect(result.phase).toBe("error");
		expect(result.error).toBe("relay unreachable");
		expect(discoveryCalls).toBe(1);

		result.retry();
		result = await currentHarness.settle();

		// Without the retry token participating in the effect (read + deps entry)
		// discovery never re-runs: the count stays at 1 and the phase is stuck on
		// "error" — which is exactly the dead Retry CTA this guards against.
		expect(discoveryCalls).toBe(2);
		expect(result.phase).toBe("streaming");
		expect(result.terminalTitle).toBe("claude");
		expect(FakeTerminalStreamConnection.instances).toHaveLength(1);
		expect(FakeTerminalStreamConnection.instances[0]?.started).toBe(1);
	});

	test("retry() from the no-terminal state re-runs discovery", async () => {
		discoveryQueue = [
			{ kind: "ok", sessions: [] },
			{ kind: "ok", sessions: [] },
		];
		currentHarness = new HookHarness();
		currentHarness.render(() => useTerminalStream(ARGS));
		let result = await currentHarness.settle();
		expect(result.phase).toBe("no-terminal");
		expect(discoveryCalls).toBe(1);

		result.retry();
		result = await currentHarness.settle();

		expect(discoveryCalls).toBe(2);
		expect(result.phase).toBe("no-terminal");
	});

	test("retry() while disabled stays disabled and never hits the relay", async () => {
		currentHarness = new HookHarness();
		currentHarness.render(() => useTerminalStream({ ...ARGS, enabled: false }));
		let result = await currentHarness.settle();
		expect(result.phase).toBe("disabled");

		result.retry();
		result = await currentHarness.settle();

		expect(result.phase).toBe("disabled");
		expect(discoveryCalls).toBe(0);
	});
});
