import { Stack } from "expo-router";
import { WorkspaceBackButton } from "@/screens/(authenticated)/workspace/[id]/components/WorkspaceBackButton";

export default function WorkspaceChangesLayout() {
	return (
		<Stack
			screenOptions={{
				headerLeft: () => <WorkspaceBackButton />,
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "Changes" }} />
		</Stack>
	);
}
