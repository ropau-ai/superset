import type { ReactNode } from "react";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { isRelayConfigured } from "@/lib/relay/relay";
import { AgentNotificationWatcher } from "./AgentNotificationWatcher";
import { configureNotificationHandler, ensureAndroidChannel } from "./notifier";
import { useAgentNotificationsEnabled } from "./preferences";
import { useNotificationResponder } from "./useNotificationResponder";

/**
 * App-root wiring for agent notifications. Mount once near the root of the tree.
 *
 * Always-on (cheap, idempotent, no permission prompt): the foreground handler,
 * the Android channel, and the tap → Live Session deep-link responder.
 *
 * The agent-state watcher is mounted only when it can actually do something —
 * the user is signed in with an active org, the "Agent notifications" toggle is
 * on, and a relay is configured — so signed-out and disabled states cost nothing.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;
	const { enabled } = useAgentNotificationsEnabled();

	useEffect(() => {
		configureNotificationHandler();
		void ensureAndroidChannel();
	}, []);

	useNotificationResponder();

	const shouldWatch = !!organizationId && enabled && isRelayConfigured();

	return (
		<>
			{shouldWatch ? (
				<AgentNotificationWatcher organizationId={organizationId} />
			) : null}
			{children}
		</>
	);
}
