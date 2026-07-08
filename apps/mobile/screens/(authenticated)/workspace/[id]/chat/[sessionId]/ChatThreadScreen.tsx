import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/lib/auth/client";
import {
	buildHostRoutingKey,
	isRelayConfigured,
	sendSessionMessage,
} from "@/lib/relay/relay";
import { ActivityFeed } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/components/ActivityFeed";
import { useSessionActivity } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/hooks/useSessionActivity";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { ChatComposer } from "./components/ChatComposer";

/**
 * The live chat with a session's agent (the Emilien dialogue, and any other
 * session). Messages are polled from the host `chat.listMessages` over the relay
 * and rendered with the shared activity timeline (user bubbles + assistant text
 * and rich tool cards); the composer sends via `chat.sendMessage`, and the reply
 * streams in on the next poll. Degrades cleanly when the relay/host is
 * unreachable — the transcript shows why and the composer blocks send.
 */
export function ChatThreadScreen() {
	const { id: workspaceId, sessionId } = useLocalSearchParams<{
		id: string;
		sessionId: string;
	}>();
	const insets = useSafeAreaInsets();
	const collections = useCollections();
	const { data: authData } = useSession();
	const organizationId = authData?.session?.activeOrganizationId ?? null;

	const { data: sessions } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);
	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const session =
		(sessions ?? []).find((item) => item.id === sessionId) ?? null;
	const workspace =
		(workspaces ?? []).find((item) => item.id === workspaceId) ?? null;
	const host = workspace
		? ((hosts ?? []).find((item) => item.machineId === workspace.hostId) ??
			null)
		: null;

	const hostOnline = host ? host.isOnline : null;
	const relayConfigured = isRelayConfigured();
	const routingKey =
		organizationId && workspace
			? buildHostRoutingKey(organizationId, workspace.hostId)
			: null;
	const relayReady =
		relayConfigured && hostOnline === true && !!routingKey && !!workspace;

	const activity = useSessionActivity({
		routingKey,
		sessionId: sessionId ?? null,
		workspaceId: workspace?.id ?? null,
		enabled: relayReady,
	});

	const [draft, setDraft] = useState("");
	const [sending, setSending] = useState(false);
	const scrollRef = useRef<ScrollView>(null);

	// Keep the newest message in view as the transcript grows.
	useEffect(() => {
		if (activity.messages.length === 0) return;
		const timer = setTimeout(
			() => scrollRef.current?.scrollToEnd({ animated: true }),
			50,
		);
		return () => clearTimeout(timer);
	}, [activity.messages.length]);

	const send = useCallback(async () => {
		const content = draft.trim();
		if (!content || sending || !routingKey || !workspace || !sessionId) return;
		setSending(true);
		setDraft("");
		try {
			await sendSessionMessage(routingKey, sessionId, workspace.id, content);
		} catch {
			setDraft(content);
			Alert.alert(
				"Message not sent",
				"Couldn't reach Emilien's host. Check the connection and try again.",
			);
		} finally {
			setSending(false);
		}
	}, [draft, sending, routingKey, workspace, sessionId]);

	const composerDisabled = !relayReady;
	const disabledHint = !relayConfigured
		? "This build isn't pointed at a relay yet."
		: hostOnline === false
			? "Emilien's host is offline — it'll send when it reconnects."
			: "Connecting to the host…";

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			className="flex-1 bg-background"
			keyboardVerticalOffset={insets.top + 44}
			style={{ flex: 1 }}
		>
			<Stack.Screen options={{ title: session?.title ?? "Emilien" }} />
			<ScrollView
				className="flex-1"
				contentContainerClassName="gap-4 p-4"
				keyboardDismissMode="interactive"
				ref={scrollRef}
			>
				<ActivityFeed
					error={activity.error}
					hostOnline={hostOnline}
					messages={activity.messages}
					phase={activity.phase}
					relayConfigured={relayConfigured}
				/>
			</ScrollView>
			<ChatComposer
				disabled={composerDisabled}
				disabledHint={disabledHint}
				onChangeText={setDraft}
				onSend={send}
				sending={sending}
				value={draft}
			/>
		</KeyboardAvoidingView>
	);
}
