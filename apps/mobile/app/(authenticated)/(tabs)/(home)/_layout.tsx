import { Stack } from "expo-router";

export default function HomeLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			{/* The Emilien cockpit renders its own header. */}
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="workspaces" options={{ title: "Workspaces" }} />
		</Stack>
	);
}
