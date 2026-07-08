import { ArrowUp, Mic } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Animated,
	Pressable,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTheme } from "@/hooks/useTheme";
import { EMBER } from "@/lib/theme";

export interface ChatComposerProps {
	value: string;
	onChangeText: (value: string) => void;
	onSend: () => void;
	sending: boolean;
	/** Relay/host unreachable — input stays usable but send is blocked. */
	disabled: boolean;
	/** Reason shown under the composer when disabled. */
	disabledHint?: string;
}

/**
 * The Emilien chat composer: a growing text field, the primary send action in
 * the brand ember, and a mic that dictates speech into the draft. Dictation
 * appends to whatever is already typed and reflects a live listening pulse;
 * sending still waits on the relay, so you can dictate a draft even while the
 * host is offline. Sits pinned above the keyboard.
 */
export function ChatComposer({
	value,
	onChangeText,
	onSend,
	sending,
	disabled,
	disabledHint,
}: ChatComposerProps) {
	const insets = useSafeAreaInsets();
	const theme = useTheme();
	const canSend = value.trim().length > 0 && !sending && !disabled;

	// The draft as it stood when dictation started — transcripts append to it.
	const baseRef = useRef("");
	const [unavailableHint, setUnavailableHint] = useState(false);

	const { status, listening, available, start, stop } = useSpeechRecognition({
		onTranscript: (text) => {
			const base = baseRef.current;
			onChangeText(base ? `${base} ${text}` : text);
		},
	});

	const handleMic = useCallback(async () => {
		if (listening) {
			stop();
			return;
		}
		if (!available) {
			setUnavailableHint(true);
			return;
		}
		baseRef.current = value.trim();
		await start();
	}, [available, listening, start, stop, value]);

	// A soft radar pulse around the mic while it's listening.
	const pulse = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		if (!listening) {
			pulse.setValue(0);
			return;
		}
		const loop = Animated.loop(
			Animated.timing(pulse, {
				toValue: 1,
				duration: 1200,
				useNativeDriver: true,
			}),
		);
		loop.start();
		return () => loop.stop();
	}, [listening, pulse]);

	const micTint = listening
		? "#FFFFFF"
		: status === "denied"
			? theme.destructive
			: theme.mutedForeground;
	const micBackground = listening ? EMBER : theme.muted;
	const micLabel = listening
		? "Stop dictation"
		: status === "denied"
			? "Voice input needs microphone permission"
			: available
				? "Dictate a message"
				: "Voice input unavailable";

	const voiceHint =
		status === "denied"
			? "Autorise le micro dans les Réglages pour dicter."
			: status === "unavailable" && unavailableHint
				? "La dictée vocale nécessite une build native (expo run:ios)."
				: null;

	return (
		<View
			className="border-border border-t bg-background px-3 pt-2"
			style={{ paddingBottom: Math.max(insets.bottom, 8) }}
		>
			<View className="flex-row items-end gap-2">
				{/* Mic — dictates speech into the draft; ember pulse while listening. */}
				<Pressable
					accessibilityLabel={micLabel}
					accessibilityRole="button"
					accessibilityState={{ selected: listening }}
					className="size-10 items-center justify-center rounded-full"
					onPress={handleMic}
					style={{
						backgroundColor: micBackground,
						opacity: available || listening ? 1 : 0.45,
					}}
				>
					{listening ? (
						<Animated.View
							pointerEvents="none"
							style={{
								position: "absolute",
								height: 40,
								width: 40,
								borderRadius: 20,
								borderWidth: 2,
								borderColor: EMBER,
								opacity: pulse.interpolate({
									inputRange: [0, 1],
									outputRange: [0.6, 0],
								}),
								transform: [
									{
										scale: pulse.interpolate({
											inputRange: [0, 1],
											outputRange: [1, 1.7],
										}),
									},
								],
							}}
						/>
					) : null}
					<Mic color={micTint} size={20} strokeWidth={1.75} />
				</Pressable>

				<View className="border-input bg-card min-h-10 flex-1 justify-center rounded-2xl border px-3">
					<TextInput
						className="max-h-32 py-2 text-base text-foreground"
						multiline
						onChangeText={onChangeText}
						placeholder={listening ? "Listening…" : "Message Emilien…"}
						placeholderTextColor={theme.mutedForeground}
						value={value}
					/>
				</View>

				<Pressable
					accessibilityLabel="Send message"
					className="size-10 items-center justify-center rounded-full"
					disabled={!canSend}
					onPress={onSend}
					style={{
						backgroundColor: canSend ? EMBER : theme.muted,
						opacity: canSend ? 1 : 0.6,
					}}
				>
					{sending ? (
						<ActivityIndicator color={theme.mutedForeground} size="small" />
					) : (
						<ArrowUp
							color={canSend ? "#FFFFFF" : theme.mutedForeground}
							size={20}
							strokeWidth={2.25}
						/>
					)}
				</Pressable>
			</View>

			{voiceHint ? (
				<Text className="px-2 pt-1.5 text-muted-foreground text-xs">
					{voiceHint}
				</Text>
			) : null}

			{disabled && disabledHint ? (
				<Text className="px-2 pt-1.5 text-muted-foreground text-xs">
					{disabledHint}
				</Text>
			) : null}
		</View>
	);
}
