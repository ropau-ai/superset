import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
import { Volume2, VolumeX } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import type { ChatActivityMessage } from "@/lib/relay/relay";
import {
	buildHostRoutingKey,
	isRelayConfigured,
	sendSessionMessage,
} from "@/lib/relay/relay";
import { speakableText } from "@/lib/speech/speakableText";
import { EMBER } from "@/lib/theme";
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
	const theme = useTheme();
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

	const {
		available: ttsAvailable,
		speakingId,
		speak,
		stop: stopSpeaking,
	} = useTextToSpeech();
	const [autoSpeak, setAutoSpeak] = useState(false);
	const spokenRef = useRef<Set<string>>(new Set());
	const initializedRef = useRef(false);

	// Auto-speak only genuinely new assistant messages. On the first real load we
	// seed the existing backlog as "already seen" so switching auto-speak on later
	// never replays the whole history.
	useEffect(() => {
		const assistantMessages = activity.messages.filter(
			(message) => message.role === "assistant",
		);
		if (!initializedRef.current) {
			if (activity.phase !== "ready") return;
			for (const message of assistantMessages) {
				spokenRef.current.add(message.id);
			}
			initializedRef.current = true;
			return;
		}
		const fresh = assistantMessages.filter(
			(message) => !spokenRef.current.has(message.id),
		);
		for (const message of fresh) spokenRef.current.add(message.id);
		if (!autoSpeak || fresh.length === 0) return;
		const newest = fresh[fresh.length - 1];
		const text = speakableText(newest);
		if (text) speak(newest.id, text);
	}, [activity.messages, activity.phase, autoSpeak, speak]);

	const toggleAutoSpeak = useCallback(() => {
		setAutoSpeak((previous) => {
			if (previous) stopSpeaking();
			return !previous;
		});
	}, [stopSpeaking]);

	const handleToggleSpeak = useCallback(
		(message: ChatActivityMessage) => {
			if (speakingId === message.id) {
				stopSpeaking();
				return;
			}
			const text = speakableText(message);
			if (text) speak(message.id, text);
		},
		[speakingId, speak, stopSpeaking],
	);

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
			<Stack.Screen
				options={{
					title: session?.title ?? "Emilien",
					// Auto-speak toggle — hidden entirely when the native TTS engine
					// isn't in this build, so there's never a dead control.
					headerRight: ttsAvailable
						? () => (
								<Pressable
									accessibilityLabel={
										autoSpeak
											? "Turn off speaking replies aloud"
											: "Speak new replies aloud"
									}
									accessibilityRole="switch"
									accessibilityState={{ checked: autoSpeak }}
									className="size-9 items-center justify-center rounded-full"
									onPress={toggleAutoSpeak}
									style={
										autoSpeak ? { backgroundColor: `${EMBER}1f` } : undefined
									}
								>
									{autoSpeak ? (
										<Volume2 color={EMBER} size={20} strokeWidth={1.9} />
									) : (
										<VolumeX
											color={theme.mutedForeground}
											size={20}
											strokeWidth={1.9}
										/>
									)}
								</Pressable>
							)
						: undefined,
				}}
			/>
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
					onToggleSpeak={ttsAvailable ? handleToggleSpeak : undefined}
					phase={activity.phase}
					relayConfigured={relayConfigured}
					speakingId={speakingId}
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
