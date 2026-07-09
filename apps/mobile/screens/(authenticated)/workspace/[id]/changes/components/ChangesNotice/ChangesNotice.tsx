import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { BrailleSpinner } from "@/components/ai-elements/braille-spinner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface ChangesNoticeProps {
	title: string;
	description: string;
	icon?: LucideIcon;
	spinner?: boolean;
}

/**
 * The centered full-tab notice for the Changes screen's non-list states
 * (loading, empty, host offline, unreachable). Mirrors the Activity tab's
 * FeedNotice so the two tabs read as one product.
 */
export function ChangesNotice({
	title,
	description,
	icon,
	spinner,
}: ChangesNoticeProps) {
	return (
		<View className="flex-1 items-center justify-center gap-3 px-8 py-12">
			{spinner ? (
				<BrailleSpinner className="text-xl" />
			) : icon ? (
				<Icon
					as={icon}
					className="size-7 text-muted-foreground"
					strokeWidth={1.5}
				/>
			) : null}
			<View className="items-center gap-1">
				<Text className="text-center font-medium">{title}</Text>
				<Text className="max-w-xs text-center text-muted-foreground text-sm">
					{description}
				</Text>
			</View>
		</View>
	);
}
