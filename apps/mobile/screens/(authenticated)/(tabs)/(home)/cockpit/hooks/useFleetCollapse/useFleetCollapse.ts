import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "cockpit.fleet.collapsed.v1";

/**
 * Which fleet project groups are collapsed, keyed by group key. Held at module
 * scope so the state survives the cockpit tab unmounting/remounting within a
 * session, and rehydrated once from disk so a collapsed group stays collapsed
 * across cold starts. Absence = expanded (the default).
 */
let collapsed = new Set<string>();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	// Hydrate from disk exactly once, on the first subscriber.
	if (!hydrated) {
		hydrated = true;
		void AsyncStorage.getItem(STORAGE_KEY)
			.then((raw) => {
				if (!raw) return;
				const keys = JSON.parse(raw) as string[];
				if (Array.isArray(keys)) {
					collapsed = new Set(keys);
					emit();
				}
			})
			.catch(() => {
				// A missing/corrupt cache just means "start expanded" — never fatal.
			});
	}
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): Set<string> {
	return collapsed;
}

export interface FleetCollapse {
	isCollapsed: (key: string) => boolean;
	toggle: (key: string) => void;
}

/**
 * Per-group collapse state for the fleet, persisted in-session (and best-effort
 * across restarts via AsyncStorage). Every consumer shares one store, so the
 * chevrons stay in sync and a toggle re-renders all subscribers.
 */
export function useFleetCollapse(): FleetCollapse {
	const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	const toggle = useCallback((key: string) => {
		const next = new Set(collapsed);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsed = next;
		emit();
		void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(
			() => {
				// Persistence is a bonus; in-session state already updated above.
			},
		);
	}, []);

	const isCollapsed = useCallback((key: string) => state.has(key), [state]);

	return { isCollapsed, toggle };
}
