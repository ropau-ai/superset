import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import type { NewSessionSheetProps } from "@/screens/(authenticated)/hooks/useNewSession";

export function NewSessionSheet({
	isPresented,
	onIsPresentedChange,
	workspaces,
	onSelectWorkspace,
	isCreating,
	width,
}: NewSessionSheetProps) {
	const theme = useTheme();

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
				fitToContents
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDragIndicator("visible"),
						background(theme.background),
					]}
				>
					<RNHostView matchContents>
						<View className="px-5 pb-3 pt-6">
							<View className="mb-2 flex-row items-center gap-2">
								<Text
									className="text-sm font-semibold"
									style={{ color: theme.mutedForeground }}
								>
									New session
								</Text>
								{isCreating ? (
									<ActivityIndicator
										size="small"
										color={theme.mutedForeground}
									/>
								) : null}
							</View>

							<Text
								className="mb-1.5 text-xs font-medium uppercase tracking-wide"
								style={{ color: theme.mutedForeground }}
							>
								Workspace
							</Text>

							<ScrollView
								style={{ maxHeight: 280 }}
								contentContainerStyle={{ paddingBottom: 8 }}
							>
								{workspaces.map((workspace) => (
									<Pressable
										key={workspace.id}
										onPress={() => onSelectWorkspace(workspace.id)}
										disabled={isCreating}
										hitSlop={6}
										className="flex-row items-center gap-2.5 py-3"
										style={{ opacity: isCreating ? 0.5 : 1 }}
									>
										<View className="flex-1">
											<Text
												className="text-sm font-medium"
												style={{ color: theme.foreground }}
												numberOfLines={1}
											>
												{workspace.name}
											</Text>
											<Text
												className="font-mono text-xs"
												style={{ color: theme.mutedForeground }}
												numberOfLines={1}
											>
												{workspace.branch}
											</Text>
										</View>
									</Pressable>
								))}
							</ScrollView>
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
