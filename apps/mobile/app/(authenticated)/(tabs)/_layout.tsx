import { NativeTabs } from "expo-router/unstable-native-tabs";
import { THEME } from "@/lib/theme";

export default function TabsLayout() {
	return (
		<NativeTabs
			tintColor={THEME.dark.foreground}
			iconColor={THEME.dark.mutedForeground}
			blurEffect="systemThickMaterialDark"
			minimizeBehavior="never"
		>
			<NativeTabs.Trigger name="(home)">
				<NativeTabs.Trigger.Icon
					sf={{ default: "circle.circle", selected: "circle.circle.fill" }}
				/>
				<NativeTabs.Trigger.Label>Emilien</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="(sessions)">
				<NativeTabs.Trigger.Icon
					sf={{
						default: "rectangle.stack",
						selected: "rectangle.stack.fill",
					}}
				/>
				<NativeTabs.Trigger.Label>Fleet</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="(search)" role="search">
				<NativeTabs.Trigger.Icon sf="magnifyingglass" />
				<NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="(more)">
				<NativeTabs.Trigger.Icon sf="ellipsis" />
				<NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
