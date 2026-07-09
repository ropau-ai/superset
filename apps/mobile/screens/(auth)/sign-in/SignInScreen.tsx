import { useState } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmilienLogo } from "@/components/EmilienLogo";
import { Text } from "@/components/ui/text";
import { signIn } from "@/lib/auth/client";
import { EMBER, withAlpha } from "@/lib/theme";

import { DevSignInButton } from "./components/DevSignInButton";
import type { SocialProvider } from "./components/SocialButton";
import { SocialButton } from "./components/SocialButton";

const TERMS_URL = "https://superset.sh/terms";
const PRIVACY_URL = "https://superset.sh/privacy";

export function SignInScreen() {
	const insets = useSafeAreaInsets();
	const [error, setError] = useState<string | null>(null);
	const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(
		null,
	);

	const handleSignIn = async (provider: SocialProvider) => {
		setError(null);
		setLoadingProvider(provider);
		try {
			await signIn.social({
				provider,
				callbackURL: "/",
			});
			// On success the session lands and RootLayout redirects (this screen
			// unmounts), so the spinner rides through the OAuth round-trip.
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Something went wrong";
			console.error("[sign-in] Error:", err);
			setError(message);
			setLoadingProvider(null);
		}
	};

	return (
		<View
			className="flex-1 items-center justify-center gap-8 bg-background px-6"
			style={{
				paddingTop: insets.top + 24,
				paddingBottom: insets.bottom + 24,
			}}
		>
			<View className="items-center gap-5">
				<View
					className="size-20 items-center justify-center rounded-3xl border"
					style={{
						borderColor: withAlpha(EMBER, 0.4),
						backgroundColor: withAlpha(EMBER, 0.1),
					}}
				>
					<EmilienLogo size={48} />
				</View>

				<View className="items-center gap-2">
					<Text className="text-2xl font-semibold text-foreground">
						Welcome to Emilien
					</Text>
					<Text className="text-base text-muted-foreground">
						Sign in to open the cockpit
					</Text>
				</View>
			</View>

			<View className="w-full items-center gap-3">
				<SocialButton
					provider="github"
					onPress={() => handleSignIn("github")}
					loading={loadingProvider === "github"}
					disabled={loadingProvider !== null}
					className="w-4/5"
				/>
				<SocialButton
					provider="google"
					onPress={() => handleSignIn("google")}
					loading={loadingProvider === "google"}
					disabled={loadingProvider !== null}
					className="w-4/5"
				/>
				{__DEV__ && <DevSignInButton />}
			</View>

			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}

			<Text className="text-center text-xs text-muted-foreground/70">
				By signing in, you agree to our{"\n"}
				<Text
					className="text-xs text-muted-foreground underline"
					onPress={() => Linking.openURL(TERMS_URL)}
				>
					Terms of Service
				</Text>{" "}
				and{" "}
				<Text
					className="text-xs text-muted-foreground underline"
					onPress={() => Linking.openURL(PRIVACY_URL)}
				>
					Privacy Policy
				</Text>
			</Text>
		</View>
	);
}
