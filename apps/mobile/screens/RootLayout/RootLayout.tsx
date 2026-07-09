import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import { BrandedLoader } from "@/components/BrandedLoader";
import { useSession } from "@/lib/auth/client";
import { NotificationsProvider } from "@/lib/notifications";
import { NAV_THEME } from "@/lib/theme";

Uniwind.setTheme("dark");

import { ErrorBoundary } from "./components/ErrorBoundary";
import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { PostHogProvider } from "./providers/PostHogProvider";

const queryClient = new QueryClient();

export function RootLayout() {
	const { data: session, isPending } = useSession();

	// The Expo splash covers the very first frames, but the session fetch can
	// outlast it — a branded holding screen beats a blank flash in that gap.
	if (isPending) return <BrandedLoader />;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<QueryClientProvider client={queryClient}>
				<PostHogProvider>
					<ThemeProvider value={NAV_THEME.dark}>
						<StatusBar style="light" />
						<ErrorBoundary scope="root">
							<NotificationsProvider>
								<Stack screenOptions={{ headerShown: false }}>
									<Stack.Protected guard={!!session}>
										<Stack.Screen name="(authenticated)" />
									</Stack.Protected>
									<Stack.Protected guard={!session}>
										<Stack.Screen name="(auth)" />
									</Stack.Protected>
								</Stack>
							</NotificationsProvider>
						</ErrorBoundary>
						<PostHogUserIdentifier />
						<PortalHost />
					</ThemeProvider>
				</PostHogProvider>
			</QueryClientProvider>
		</GestureHandlerRootView>
	);
}
