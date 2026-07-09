import { Stack } from "expo-router";
import { titledScreenOptions } from "@/lib/navigation";

export default function SessionsLayout() {
	return (
		<Stack screenOptions={titledScreenOptions}>
			<Stack.Screen name="index" options={{ title: "Fleet" }} />
			<Stack.Screen name="[id]" options={{ title: "Session" }} />
		</Stack>
	);
}
