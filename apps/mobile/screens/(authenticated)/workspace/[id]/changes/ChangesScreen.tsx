import { GitCompare } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function ChangesScreen() {
	return (
		<View className="bg-background flex-1 items-center justify-center gap-3 p-8">
			<Icon
				as={GitCompare}
				className="size-7 text-muted-foreground"
				strokeWidth={1.5}
			/>
			<View className="items-center gap-1">
				<Text className="font-medium">No changes yet</Text>
				<Text className="max-w-xs text-center text-muted-foreground text-sm">
					File edits the agent makes in this workspace will show up here.
				</Text>
			</View>
		</View>
	);
}
