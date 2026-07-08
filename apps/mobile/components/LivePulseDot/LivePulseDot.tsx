import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

export interface LivePulseDotProps {
	/** Dot color (defaults to a live emerald). */
	color?: string;
	/** Animate when `true`; a steady dot when `false`. */
	active?: boolean;
	/** Diameter in px. */
	size?: number;
}

/**
 * A softly breathing status dot — the "live" heartbeat of the Emilien card and
 * fleet rows. Green-when-active by convention; pass a color to override. Pure
 * Reanimated, no layout side effects.
 */
export function LivePulseDot({
	color = "#34d399",
	active = true,
	size = 8,
}: LivePulseDotProps) {
	const progress = useSharedValue(0);

	useEffect(() => {
		if (active) {
			progress.value = withRepeat(
				withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
				-1,
				true,
			);
		} else {
			cancelAnimation(progress);
			progress.value = 0;
		}
		return () => cancelAnimation(progress);
	}, [active, progress]);

	const style = useAnimatedStyle(() => ({
		opacity: 0.45 + progress.value * 0.55,
		transform: [{ scale: 0.82 + progress.value * 0.42 }],
	}));

	return (
		<View
			style={{
				width: size,
				height: size,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Animated.View
				style={[
					{
						width: size,
						height: size,
						borderRadius: size / 2,
						backgroundColor: color,
					},
					active ? style : undefined,
				]}
			/>
		</View>
	);
}
