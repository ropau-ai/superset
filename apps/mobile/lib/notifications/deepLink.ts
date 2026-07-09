// Deep-link glue between an agent notification and the Live Session screen.
// Kept free of native (`expo-*`) imports so the path/parse logic stays pure and
// trivially reusable — the actual `Linking.createURL` lives in `notifier.ts`.

/** Key under a notification's `content.data` that carries the target session. */
export const SESSION_ID_DATA_KEY = "sessionId";

/**
 * In-app route for a session's Live Session view. Mirrors the href the Sessions
 * list pushes (`SessionsScreen`), so tapping a notification lands on the exact
 * same screen.
 */
export function sessionDeepLinkPath(sessionId: string): string {
	return `/(authenticated)/(tabs)/(sessions)/${sessionId}`;
}

/**
 * Pull the target session id back out of a notification's `content.data`.
 * Returns `null` for any malformed payload so callers can degrade instead of
 * throwing on a tapped notification.
 */
export function sessionIdFromNotificationData(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const value = (data as Record<string, unknown>)[SESSION_ID_DATA_KEY];
	return typeof value === "string" && value.length > 0 ? value : null;
}
