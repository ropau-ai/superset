import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import {
	ensureAgentNotificationPermission,
	useAgentNotificationsEnabled,
} from "@/lib/notifications";

export function SettingsScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { enabled, setEnabled } = useAgentNotificationsEnabled();
	const [permissionBlocked, setPermissionBlocked] = useState(false);

	const handleToggleAgentNotifications = async (value: boolean) => {
		await setEnabled(value);
		if (value) {
			// Ask for the OS permission at this explicit opt-in — not at cold start.
			setPermissionBlocked(!(await ensureAgentNotificationPermission()));
		} else {
			setPermissionBlocked(false);
		}
	};

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top }}
		>
			<View className="p-6 gap-4">
				<View className="flex-row items-center gap-2">
					<Pressable onPress={() => router.back()} className="p-1">
						<Icon as={ChevronLeft} className="text-foreground size-6" />
					</Pressable>
					<Text className="text-2xl font-bold">Settings</Text>
				</View>

				<Card>
					<CardHeader>
						<CardTitle>Account</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Account settings will appear here
						</Text>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Appearance</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Theme and display settings will appear here
						</Text>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Notifications</CardTitle>
					</CardHeader>
					<CardContent className="gap-3">
						<View className="flex-row items-center justify-between gap-4">
							<View className="flex-1">
								<Text className="text-base">Agent notifications</Text>
								<Text className="text-sm text-muted-foreground">
									Get a heads-up when an agent needs your approval or finishes.
								</Text>
							</View>
							<Switch
								checked={enabled}
								onCheckedChange={handleToggleAgentNotifications}
							/>
						</View>
						{enabled && permissionBlocked ? (
							<Text className="text-sm text-muted-foreground">
								Allow notifications for Superset in system settings to receive
								these.
							</Text>
						) : null}
					</CardContent>
				</Card>
			</View>
		</ScrollView>
	);
}
