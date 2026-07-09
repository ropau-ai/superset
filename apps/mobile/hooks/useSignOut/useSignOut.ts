import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { signOut } from "@/lib/auth/client";

export function useSignOut() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleSignOut = useCallback(async () => {
		setIsSigningOut(true);
		try {
			await signOut();
			queryClient.clear();
			router.replace("/(auth)/sign-in");
		} catch (error) {
			console.error("[auth/signOut] Failed to sign out:", error);
			Alert.alert(
				"Couldn't log out",
				"Something went wrong signing you out. Please try again.",
			);
		} finally {
			setIsSigningOut(false);
		}
	}, [router, queryClient]);

	// Guarded sign-out: signing back in means the full OAuth round-trip, so a
	// mis-tap on a destructive action shouldn't drop the session outright.
	const confirmSignOut = useCallback(() => {
		Alert.alert(
			"Log out of Emilien?",
			"You'll need to sign in again to get back to the cockpit.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Log out",
					style: "destructive",
					onPress: () => {
						void handleSignOut();
					},
				},
			],
		);
	}, [handleSignOut]);

	return { signOut: handleSignOut, confirmSignOut, isSigningOut };
}
