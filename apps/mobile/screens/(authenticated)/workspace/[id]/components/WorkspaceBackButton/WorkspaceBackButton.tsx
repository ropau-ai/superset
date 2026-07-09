import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";

/**
 * The single, consistent "get me out of this workspace" affordance. It's wired
 * into every workspace screen's native header as the left item via the stack's
 * `screenOptions.headerLeft` (chat list, chat thread, changes) — so no pushed
 * workspace screen can end up without a way back, which is exactly how the
 * Emilien chat used to trap you. Pops to wherever you came from (the cockpit,
 * the fleet, the chat list) when there's history, and falls back to Home when
 * the screen was opened cold via a deep link.
 */
export function WorkspaceBackButton() {
	const router = useRouter();
	const theme = useTheme();

	const exitWorkspace = () => {
		if (router.canGoBack()) {
			router.back();
			return;
		}
		router.replace("/(authenticated)/(tabs)/(home)");
	};

	return (
		<Pressable
			accessibilityLabel="Back"
			accessibilityRole="button"
			className="-ml-1.5 size-11 items-center justify-center rounded-full active:opacity-60"
			hitSlop={8}
			onPress={exitWorkspace}
		>
			<ChevronLeft color={theme.foreground} size={26} strokeWidth={2.25} />
		</Pressable>
	);
}
