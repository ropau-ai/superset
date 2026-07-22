import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { Check } from "lucide-react-native";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	TextInput,
	View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { EMBER, withAlpha } from "@/lib/theme";
import type { NewSessionSheetProps } from "@/screens/(authenticated)/hooks/useNewSession";

const EMBER_TINT = withAlpha(EMBER, 0.12);

export function NewSessionSheet({
	isPresented,
	onIsPresentedChange,
	workspaces,
	selectedWorkspaceId,
	onSelectWorkspace,
	agents,
	agentsPhase,
	onRetryAgents,
	selectedAgentId,
	onSelectAgent,
	prompt,
	onChangePrompt,
	onLaunch,
	isLaunching,
	width,
}: NewSessionSheetProps) {
	const theme = useTheme();

	const selectedAgent =
		agents.find((config) => config.id === selectedAgentId) ?? null;
	const canLaunch =
		!isLaunching &&
		agentsPhase === "ready" &&
		!!selectedAgent &&
		!!selectedWorkspaceId &&
		prompt.trim().length > 0;

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
						<View className="px-5 pb-4 pt-6">
							<Text
								className="mb-3 text-sm font-semibold"
								style={{ color: theme.mutedForeground }}
							>
								New session
							</Text>

							<Text
								className="mb-1.5 text-xs font-medium uppercase tracking-wide"
								style={{ color: theme.mutedForeground }}
							>
								Workspace
							</Text>
							<ScrollView
								style={{ maxHeight: 176 }}
								contentContainerStyle={{ paddingBottom: 8 }}
							>
								{workspaces.map((workspace) => {
									const active = workspace.id === selectedWorkspaceId;
									return (
										<Pressable
											key={workspace.id}
											onPress={() => onSelectWorkspace(workspace.id)}
											disabled={isLaunching}
											hitSlop={6}
											accessibilityRole="button"
											accessibilityState={{ selected: active }}
											className="flex-row items-center gap-2.5 py-2.5"
											style={{ opacity: isLaunching ? 0.5 : 1 }}
										>
											<View className="flex-1">
												<Text
													className="text-sm font-medium"
													style={{
														color: active ? EMBER : theme.foreground,
													}}
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
											{active ? (
												<Check color={EMBER} size={16} strokeWidth={2.5} />
											) : null}
										</Pressable>
									);
								})}
							</ScrollView>

							{/* Only agents ACTUALLY installed on the selected host — an
							    unlaunchable runtime never appears, so the UI can't lie. */}
							<Text
								className="mb-1.5 mt-1 text-xs font-medium uppercase tracking-wide"
								style={{ color: theme.mutedForeground }}
							>
								Agent
							</Text>
							{agentsPhase === "ready" ? (
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
								>
									{agents.map((config) => {
										const active = config.id === selectedAgentId;
										return (
											<Pressable
												key={config.id}
												onPress={() => onSelectAgent(config.id)}
												disabled={isLaunching}
												hitSlop={10}
												accessibilityRole="button"
												accessibilityState={{ selected: active }}
												className="rounded-full border px-3.5 py-2.5"
												style={{
													borderColor: active ? EMBER : theme.border,
													backgroundColor: active ? EMBER_TINT : "transparent",
												}}
											>
												<Text
													className="text-sm font-medium"
													style={{
														color: active ? EMBER : theme.foreground,
													}}
												>
													{config.label}
												</Text>
											</Pressable>
										);
									})}
								</ScrollView>
							) : (
								<View className="flex-row items-center gap-2 pb-3">
									{agentsPhase === "loading" ? (
										<>
											<ActivityIndicator
												size="small"
												color={theme.mutedForeground}
											/>
											<Text
												className="text-sm"
												style={{ color: theme.mutedForeground }}
											>
												Reading agents on the host…
											</Text>
										</>
									) : agentsPhase === "offline" ? (
										<Text
											className="text-sm"
											style={{ color: theme.mutedForeground }}
										>
											This workspace's host is offline — agents can't launch.
										</Text>
									) : (
										<>
											<Text
												className="text-sm"
												style={{ color: theme.mutedForeground }}
											>
												Couldn't read the host's agents.
											</Text>
											<Pressable
												onPress={onRetryAgents}
												hitSlop={8}
												accessibilityRole="button"
											>
												<Text
													className="text-sm font-medium"
													style={{ color: EMBER }}
												>
													Retry
												</Text>
											</Pressable>
										</>
									)}
								</View>
							)}

							<Text
								className="mb-1.5 mt-1 text-xs font-medium uppercase tracking-wide"
								style={{ color: theme.mutedForeground }}
							>
								Prompt
							</Text>
							<View
								className="mb-4 min-h-12 justify-center rounded-2xl border px-3"
								style={{
									borderColor: theme.border,
									backgroundColor: theme.card,
								}}
							>
								<TextInput
									className="max-h-28 py-2.5 text-base"
									style={{ color: theme.foreground }}
									multiline
									editable={!isLaunching}
									onChangeText={onChangePrompt}
									placeholder="What should the agent do?"
									placeholderTextColor={theme.mutedForeground}
									value={prompt}
								/>
							</View>

							<Pressable
								accessibilityLabel="Launch agent"
								accessibilityRole="button"
								disabled={!canLaunch}
								onPress={onLaunch}
								className="h-12 flex-row items-center justify-center gap-2 rounded-2xl"
								style={{
									backgroundColor: canLaunch ? EMBER : theme.muted,
									opacity: canLaunch || isLaunching ? 1 : 0.6,
								}}
							>
								{isLaunching ? (
									<>
										<ActivityIndicator size="small" color="#FFFFFF" />
										<Text className="text-base font-semibold text-white">
											Starting {selectedAgent?.label ?? "agent"}…
										</Text>
									</>
								) : (
									<Text
										className="text-base font-semibold"
										style={{
											color: canLaunch ? "#FFFFFF" : theme.mutedForeground,
										}}
									>
										Launch {selectedAgent?.label ?? "agent"}
									</Text>
								)}
							</Pressable>
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
