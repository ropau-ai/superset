import { ActivityIndicator, Text, View } from "react-native";
import { EmilienLogo } from "@/components/EmilienLogo";
import { EMBER, THEME } from "@/lib/theme";

export interface BrandedLoaderProps {
	/** Optional line under the mark, e.g. "Waking Emilien…". */
	label?: string;
}

/**
 * A full-bleed, on-brand holding screen for the moments before the app can show
 * anything real — the auth session resolving, an active org hydrating. Uses only
 * primitives + inline colors so it's safe to render *above* the theme/query
 * providers (RootLayout renders it before they mount), never a blank dark void.
 */
export function BrandedLoader({ label }: BrandedLoaderProps) {
	return (
		<View
			style={{
				flex: 1,
				alignItems: "center",
				justifyContent: "center",
				gap: 20,
				backgroundColor: THEME.dark.background,
			}}
		>
			<EmilienLogo size={64} />
			<ActivityIndicator color={EMBER} />
			{label ? (
				<Text
					style={{
						color: THEME.dark.mutedForeground,
						fontSize: 13,
						letterSpacing: 0.2,
					}}
				>
					{label}
				</Text>
			) : null}
		</View>
	);
}
