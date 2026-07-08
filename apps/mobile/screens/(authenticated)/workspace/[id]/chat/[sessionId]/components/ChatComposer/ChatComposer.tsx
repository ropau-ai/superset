import { ArrowUp, Mic } from "lucide-react-native";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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
 * the brand ember, and a placeholder mic button reserved for the voice / TTS
 * iteration (rendered, deliberately inert). Sits pinned above the keyboard.
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

	return (
		<View
			className="border-border border-t bg-background px-3 pt-2"
			style={{ paddingBottom: Math.max(insets.bottom, 8) }}
		>
			<View className="flex-row items-end gap-2">
				{/* Voice / TTS — placeholder for the next iteration (non-wired). */}
				<Pressable
					accessibilityLabel="Voice input (coming soon)"
					className="size-10 items-center justify-center rounded-full bg-muted opacity-45"
					disabled
				>
					<Icon
						as={Mic}
						className="size-5 text-muted-foreground"
						strokeWidth={1.75}
					/>
				</Pressable>

				<View className="border-input bg-card min-h-10 flex-1 justify-center rounded-2xl border px-3">
					<TextInput
						className="max-h-32 py-2 text-base text-foreground"
						multiline
						onChangeText={onChangeText}
						placeholder="Message Emilien…"
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

			{disabled && disabledHint ? (
				<Text className="px-2 pt-1.5 text-muted-foreground text-xs">
					{disabledHint}
				</Text>
			) : null}
		</View>
	);
}
