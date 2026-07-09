import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

/**
 * The signed-in user's account avatar for the cockpit header. Mirrors
 * OrganizationAvatar but is keyed off the better-auth session user (image →
 * initial fallback), so the header's right slot reads as "you" (the account),
 * distinct from the org gem on the left.
 */
export function UserAvatar({
	name,
	image,
	size,
}: {
	name?: string | null;
	image?: string | null;
	size: number;
}) {
	const theme = useTheme();

	if (image) {
		return (
			<Image
				source={{ uri: image }}
				style={{ width: size, height: size, borderRadius: size / 2 }}
			/>
		);
	}

	const initial = (name ?? "").trim().charAt(0).toUpperCase() || "U";
	return (
		<View
			className="items-center justify-center"
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: theme.muted,
			}}
		>
			<Text
				className="font-bold"
				style={{ fontSize: size * 0.45, color: theme.mutedForeground }}
			>
				{initial}
			</Text>
		</View>
	);
}
