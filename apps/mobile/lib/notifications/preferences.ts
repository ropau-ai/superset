import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

// Persisted "Agent notifications" toggle. Backed by `expo-secure-store` (same
// store the app already uses for the device id + auth session) with an in-memory
// cache + tiny pub/sub so the Settings switch and the root watcher stay in sync
// without a context provider. Defaults OFF so we never prompt for the OS
// permission at a cold start — the user opts in explicitly from Settings.

const STORAGE_KEY = "superset-agent-notifications-enabled";

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();
let cached: boolean | null = null;

export async function getAgentNotificationsEnabled(): Promise<boolean> {
	if (cached !== null) return cached;
	try {
		cached = (await SecureStore.getItemAsync(STORAGE_KEY)) === "true";
	} catch {
		cached = false;
	}
	return cached;
}

export async function setAgentNotificationsEnabled(
	enabled: boolean,
): Promise<void> {
	cached = enabled;
	try {
		await SecureStore.setItemAsync(STORAGE_KEY, enabled ? "true" : "false");
	} catch {
		// Persisting is best-effort; the in-memory value still drives this session.
	}
	for (const listener of listeners) listener(enabled);
}

export interface AgentNotificationsPreference {
	enabled: boolean;
	/** `true` until the stored value has been read at least once. */
	loading: boolean;
	setEnabled: (enabled: boolean) => Promise<void>;
}

/** Subscribe a component to the persisted toggle. */
export function useAgentNotificationsEnabled(): AgentNotificationsPreference {
	const [enabled, setEnabled] = useState<boolean | null>(cached);

	useEffect(() => {
		let active = true;
		void getAgentNotificationsEnabled().then((value) => {
			if (active) setEnabled(value);
		});
		const listener: Listener = (value) => setEnabled(value);
		listeners.add(listener);
		return () => {
			active = false;
			listeners.delete(listener);
		};
	}, []);

	return {
		enabled: enabled ?? false,
		loading: enabled === null,
		setEnabled: setAgentNotificationsEnabled,
	};
}

// --- Notification scope (granularity) -------------------------------------
//
// How much of the fleet earns a notification: just Emilien (the orchestrator),
// or every sub-agent. Same SecureStore + pub/sub shape as the enabled toggle.
// Defaults to the whole fleet (today's behavior).
//
// TODO(watcher): AgentNotificationWatcher does not yet read this scope — wire it
// so `emilien` suppresses sub-agent notifications. Persisted + surfaced now so
// the preference is real and ready.

const SCOPE_STORAGE_KEY = "superset-agent-notifications-scope";

export type NotificationScope = "emilien" | "fleet";

const scopeListeners = new Set<(scope: NotificationScope) => void>();
let cachedScope: NotificationScope | null = null;

export async function getNotificationScope(): Promise<NotificationScope> {
	if (cachedScope !== null) return cachedScope;
	try {
		cachedScope =
			(await SecureStore.getItemAsync(SCOPE_STORAGE_KEY)) === "emilien"
				? "emilien"
				: "fleet";
	} catch {
		cachedScope = "fleet";
	}
	return cachedScope;
}

export async function setNotificationScope(
	scope: NotificationScope,
): Promise<void> {
	cachedScope = scope;
	try {
		await SecureStore.setItemAsync(SCOPE_STORAGE_KEY, scope);
	} catch {
		// Best-effort persistence; the in-memory value still drives this session.
	}
	for (const listener of scopeListeners) listener(scope);
}

export interface NotificationScopePreference {
	scope: NotificationScope;
	loading: boolean;
	setScope: (scope: NotificationScope) => Promise<void>;
}

/** Subscribe a component to the persisted notification scope. */
export function useNotificationScope(): NotificationScopePreference {
	const [scope, setScope] = useState<NotificationScope | null>(cachedScope);

	useEffect(() => {
		let active = true;
		void getNotificationScope().then((value) => {
			if (active) setScope(value);
		});
		const listener = (value: NotificationScope) => setScope(value);
		scopeListeners.add(listener);
		return () => {
			active = false;
			scopeListeners.delete(listener);
		};
	}, []);

	return {
		scope: scope ?? "fleet",
		loading: scope === null,
		setScope: setNotificationScope,
	};
}
