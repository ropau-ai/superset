import { Stack } from "expo-router";
import { titledScreenOptions } from "@/lib/navigation";

// Seed the Fleet list beneath a deep-linked `[id]`. Without this, opening a
// session straight from the cockpit Fleet tap or right after creating one lands
// on a single-screen stack with no native back — you'd be stranded on the
// detail with no way back to the list. Anchoring `index` restores the chevron.
export const unstable_settings = { initialRouteName: "index" };

export default function SessionsLayout() {
	return (
		<Stack screenOptions={titledScreenOptions}>
			<Stack.Screen name="index" options={{ title: "Fleet" }} />
			<Stack.Screen name="[id]" options={{ title: "Session" }} />
		</Stack>
	);
}
