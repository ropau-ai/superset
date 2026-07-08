import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import {
	ensureAgentNotificationPermission,
	ensureAndroidChannel,
} from "./notifier";

// ─────────────────────────────────────────────────────────────────────────────
// REMOTE PUSH SCAFFOLD — not wired to any backend yet.
//
// Everything else in this module is LOCAL notifications (scheduled from JS while
// the app runs), which is all we can ship without an Apple Developer account /
// APNs credentials. This function is the ready-to-go seam for the remote story:
// it acquires the device's push token so it can later be handed to the backend
// and delivered via APNs/FCM even when the app is fully backgrounded or killed.
//
// TODO(APNs remote — needs an Apple Developer account + EAS push credentials):
//   1. Configure push credentials (`eas credentials`) so `getExpoPushTokenAsync`
//      / `getDevicePushTokenAsync` return a usable token on iOS.
//   2. POST the returned token to the backend, associated with this device/user
//      (a `device.registerPushToken` mutation, alongside `device.registerDevice`).
//   3. Emit the "waiting for you" / "done" pushes from the host-service instead
//      of the on-device poll in `AgentNotificationWatcher`, reusing the same
//      `data.sessionId` deep-link payload this module already speaks.
// Until then this is intentionally never called — nothing depends on it, so an
// absent account or credential can't break the app.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acquire an Expo push token for this device. Returns `null` (never throws) when
 * running on a simulator, when permission is denied, or when no EAS project id /
 * push credentials are configured yet.
 */
export async function registerForPushNotificationsAsync(): Promise<
	string | null
> {
	// Push tokens are only issued to physical devices.
	if (!Device.isDevice) return null;

	await ensureAndroidChannel();
	const granted = await ensureAgentNotificationPermission();
	if (!granted) return null;

	try {
		const projectId =
			(Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
				?.projectId ?? undefined;
		if (!projectId) return null;

		const token = await Notifications.getExpoPushTokenAsync({ projectId });
		// TODO(APNs remote): send `token.data` to the backend here.
		return token.data;
	} catch {
		return null;
	}
}
