import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { STATUS_COLORS } from "@/lib/theme";

export interface LivePulseDotProps {
	/** Dot color (defaults to the live status green). */
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
	color = STATUS_COLORS.live,
	active = true,
	size = 8,
}: LivePulseDotProps) {
	const progress = useSharedValue(0);
	// Honor the iOS "Reduce Motion" accessibility setting — the dot still reads as
	// live (steady, full color), it just stops breathing.
	const reduceMotion = useReducedMotion();
	const shouldAnimate = active && !reduceMotion;

	useEffect(() => {
		if (shouldAnimate) {
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
	}, [shouldAnimate, progress]);

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
					shouldAnimate ? style : undefined,
				]}
			/>
		</View>
	);
}
