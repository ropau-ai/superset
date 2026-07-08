import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { sessionDeepLinkPath, sessionIdFromNotificationData } from "./deepLink";

/**
 * Route to the Live Session screen when the user taps an agent notification —
 * both while the app is running (response listener) and when a tap cold-starts
 * the app (`getLastNotificationResponse`). Uses the global `router` singleton so
 * it works from the app root without a navigation-context hook.
 */
export function useNotificationResponder(): void {
	useEffect(() => {
		const navigateFromResponse = (
			response: Notifications.NotificationResponse | null,
		) => {
			const sessionId = sessionIdFromNotificationData(
				response?.notification.request.content.data,
			);
			if (!sessionId) return;
			// Defer a tick so the root navigator is mounted on a cold start.
			setTimeout(() => {
				try {
					router.push(sessionDeepLinkPath(sessionId));
				} catch {
					// Navigator not ready / route unavailable — drop the deep link.
				}
			}, 0);
		};

		let subscription: Notifications.EventSubscription | undefined;
		try {
			subscription =
				Notifications.addNotificationResponseReceivedListener(
					navigateFromResponse,
				);
			navigateFromResponse(Notifications.getLastNotificationResponse());
		} catch {
			// Native module unavailable (e.g. JS-only runtime) — deep-linking off.
		}

		return () => {
			try {
				subscription?.remove();
			} catch {
				// ignore
			}
		};
	}, []);
}
