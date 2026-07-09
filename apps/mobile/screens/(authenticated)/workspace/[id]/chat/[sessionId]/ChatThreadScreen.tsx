import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
import { Volume2, VolumeX } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import type { ChatActivityMessage } from "@/lib/relay/relay";
import {
	buildHostRoutingKey,
	HostRequestError,
	isRelayConfigured,
	listHostTerminals,
	sendSessionMessage,
	writeTerminalInput,
} from "@/lib/relay/relay";
import { deterministicSessionId } from "@/lib/relay/terminalSessionId";
import { speakableText } from "@/lib/speech/speakableText";
import { EMBER } from "@/lib/theme";
import { ActivityFeed } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/components/ActivityFeed";
import { LiveTerminal } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/components/LiveTerminal";
import { useSessionActivity } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/hooks/useSessionActivity";
import { useTerminalStream } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/hooks/useTerminalStream";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { ChatComposer } from "./components/ChatComposer";
import { useTerminalAgentTarget } from "./hooks/useTerminalAgentTarget";

/**
 * The live conversation with a session's agent. Two shapes share one screen:
 *
 * - **Terminal agents** (Emilien, `claude`, any PTY agent) have no mastra chat
 *   thread, so `chat.sendMessage` can't reach them. We stream their PTY as the
 *   conversation and the composer types the user's text straight into stdin via
 *   `terminal.writeInput` — exactly as if typed at the keyboard.
 * - **Chat agents** poll `chat.listMessages` and send via `chat.sendMessage`,
 *   rendering the rich activity timeline (user bubbles + assistant tool cards).
 *
 * Which one a session is is resolved from its id (see `useTerminalAgentTarget`).
 * Degrades cleanly when the relay/host is unreachable — the transcript shows why
 * and the composer blocks send.
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

	// Is this a terminal agent (talk over the PTY) or a chat agent (mastra
	// thread)? Resolved from the workspace's live terminals.
	const target = useTerminalAgentTarget({
		routingKey,
		workspaceId: workspace?.id ?? null,
		sessionId: sessionId ?? null,
		enabled: relayReady,
	});
	const isTerminal = target.status === "terminal";

	// Chat-agent transcript — paused entirely for a terminal agent (it has no
	// thread, so the poll would only 500).
	const activity = useSessionActivity({
		routingKey,
		sessionId: sessionId ?? null,
		workspaceId: workspace?.id ?? null,
		enabled: relayReady && !isTerminal,
	});

	// Terminal-agent PTY stream — the conversation surface for terminal agents.
	const stream = useTerminalStream({
		routingKey,
		workspaceId: workspace?.id ?? null,
		enabled: relayReady && isTerminal,
		terminalId: isTerminal ? target.terminalId : null,
	});

	const [draft, setDraft] = useState("");
	const [sending, setSending] = useState(false);

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

		// Write the user's line straight into the agent's stdin. Enter is a
		// carriage return in a PTY, so the trailing `\r` submits the line.
		const writeToPty = async (terminalId: string) => {
			await writeTerminalInput(
				routingKey,
				workspace.id,
				terminalId,
				`${content}\r`,
			);
		};

		try {
			if (isTerminal) {
				await writeToPty(target.terminalId);
			} else {
				await sendSessionMessage(routingKey, sessionId, workspace.id, content);
			}
		} catch (err) {
			// The chat path 500s for a terminal agent that hadn't been classified as
			// one yet (e.g. sent during resolution). Recover by resolving the
			// session's terminal and writing into it — a reachable terminal session
			// must never fail to send.
			const reachedHost = err instanceof HostRequestError;
			if (reachedHost && !isTerminal) {
				try {
					const { sessions: liveTerminals } = await listHostTerminals(
						routingKey,
						workspace.id,
					);
					const match = liveTerminals.find(
						(terminal) =>
							deterministicSessionId(terminal.terminalId) === sessionId,
					);
					if (match) {
						await writeToPty(match.terminalId);
						setSending(false);
						return;
					}
				} catch {
					// fall through to the error below
				}
			}
			setDraft(content);
			Alert.alert(
				"Message not sent",
				reachedHost
					? "The agent couldn't take that message right now. Give it a moment and try again."
					: "Couldn't reach the agent's host. Check your connection and try again.",
			);
		} finally {
			setSending(false);
		}
	}, [draft, sending, routingKey, workspace, sessionId, isTerminal, target]);

	const composerDisabled = !relayReady;
	const disabledHint = !relayConfigured
		? "This build isn't pointed at a relay yet."
		: hostOnline === false
			? "The agent's host is offline — it'll send when it reconnects."
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
					// Auto-speak toggle — only for chat agents (terminal agents have no
					// assistant prose to read), and hidden when the native TTS engine
					// isn't in this build, so there's never a dead control.
					headerRight:
						ttsAvailable && !isTerminal
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
			{isTerminal ? (
				<LiveTerminal
					className="mx-3 mt-3 mb-1 flex-1"
					relayConfigured={relayConfigured}
					stream={stream}
				/>
			) : (
				<ActivityFeed
					hostOnline={hostOnline}
					messages={activity.messages}
					onToggleSpeak={ttsAvailable ? handleToggleSpeak : undefined}
					phase={activity.phase}
					relayConfigured={relayConfigured}
					scrollable
					speakingId={speakingId}
					variant="chat"
				/>
			)}
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
