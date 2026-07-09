import { Stack } from "expo-router";
import { WorkspaceBackButton } from "@/screens/(authenticated)/workspace/[id]/components/WorkspaceBackButton";

export default function WorkspaceChatLayout() {
	return (
		<Stack
			screenOptions={{
				// Every workspace chat screen — the list AND a deep-linked thread —
				// gets the same reliable back item, so tapping the Emilien card can
				// never strand you without a way home.
				headerLeft: () => <WorkspaceBackButton />,
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "Chats" }} />
			<Stack.Screen name="[sessionId]" options={{ title: "" }} />
		</Stack>
	);
}
