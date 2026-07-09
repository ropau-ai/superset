import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { SESSION_ID_DATA_KEY, sessionDeepLinkPath } from "./deepLink";

// Thin, defensive wrappers around `expo-notifications`. Everything here is
// wrapped in try/catch and returns instead of throwing: a device with the
// permission denied, or a JS-only runtime where the native module isn't linked
// yet, must degrade quietly rather than crash the app root.

/** Android notification channel for agent lifecycle alerts (heads-up + sound). */
const ANDROID_CHANNEL_ID = "agent-activity";

let handlerConfigured = false;

/**
 * Tell the OS to actually surface our notifications while the app is running.
 * Without a handler, foreground notifications are silently dropped — which is
 * exactly the "agent needs you" moment we care about. Idempotent.
 */
export function configureNotificationHandler(): void {
	if (handlerConfigured) return;
	handlerConfigured = true;
	try {
		Notifications.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowBanner: true,
				shouldShowList: true,
				shouldPlaySound: true,
				shouldSetBadge: false,
			}),
		});
	} catch {
		handlerConfigured = false;
	}
}

/** Create the Android channel. No-op on iOS and safe to call repeatedly. */
export async function ensureAndroidChannel(): Promise<void> {
	if (Platform.OS !== "android") return;
	try {
		await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
			name: "Agent activity",
			importance: Notifications.AndroidImportance.HIGH,
			lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
			vibrationPattern: [0, 250, 250, 250],
			enableVibrate: true,
		});
	} catch {
		// Channel setup is best-effort; delivery still works on the default channel.
	}
}

/**
 * Ensure the app is allowed to post notifications, prompting once if the status
 * is still undetermined. Intended to be called from an explicit user action
 * (enabling the Settings toggle) — never at cold start. Returns whether we ended
 * up with permission.
 */
export async function ensureAgentNotificationPermission(): Promise<boolean> {
	try {
		const current = await Notifications.getPermissionsAsync();
		if (current.granted) return true;
		if (current.canAskAgain === false) return false;
		const requested = await Notifications.requestPermissionsAsync({
			ios: { allowAlert: true, allowBadge: false, allowSound: true },
		});
		return requested.granted;
	} catch {
		return false;
	}
}

/** Non-prompting permission check — used before presenting from the watcher. */
export async function hasAgentNotificationPermission(): Promise<boolean> {
	try {
		return (await Notifications.getPermissionsAsync()).granted;
	} catch {
		return false;
	}
}

export interface AgentNotificationContent {
	title: string;
	body: string;
	/** Session to deep-link to when the notification is tapped. */
	sessionId: string;
}

/**
 * Present a local notification immediately. `data` carries both the raw session
 * id (used by the in-app responder) and a canonical deep-link URL built with
 * `expo-linking` — the latter is what a future remote/APNs payload would ride on.
 */
export async function presentAgentNotification(
	content: AgentNotificationContent,
): Promise<void> {
	try {
		const url = Linking.createURL(sessionDeepLinkPath(content.sessionId));
		await Notifications.scheduleNotificationAsync({
			content: {
				title: content.title,
				body: content.body,
				sound: "default",
				data: { [SESSION_ID_DATA_KEY]: content.sessionId, url },
			},
			// `null` → deliver now (iOS); on Android route through our channel so it
			// inherits the heads-up importance configured above.
			trigger:
				Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : null,
		});
	} catch {
		// Presenting is best-effort — a denied permission or unlinked module no-ops.
	}
}
