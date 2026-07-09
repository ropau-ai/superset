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
import Svg, { Circle } from "react-native-svg";
import { EMBER, STATUS_COLORS, withAlpha } from "@/lib/theme";
import type { LiveAgentStatusKind } from "@/screens/(authenticated)/(tabs)/(sessions)/[id]/agentStatus";

export interface EmilienLoaderProps {
	/** Emilien's live lifecycle status. */
	status: LiveAgentStatusKind;
	/** Whether the underlying host is reachable. */
	online: boolean;
	/** Rendered square edge in px. */
	size?: number;
}

// Ring geometry in a 40×40 viewBox — matches the old brand mark's footprint so
// the loader drops into the same avatar tile without a layout shift.
const VIEWBOX = 40;
const CENTER = VIEWBOX / 2;
const RADIUS = 15;
const STROKE = 3;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// A quarter-turn ember sweep is enough to read as a spinner without looking busy.
const ARC = CIRCUMFERENCE * 0.25;

/**
 * Emilien's presence, distilled to a single loader — no face, no persona, just a
 * ring that mirrors his live status. When he's working it spins in ember; when
 * idle it rests as a dim, still ring; offline or ended it fades to muted grey.
 * Deliberately minimal and one-accent, it replaces the orbital brand mark in the
 * cockpit's Emilien avatar tile. Honors "Reduce Motion" (holds a steady ember
 * ring instead of spinning).
 */
export function EmilienLoader({
	status,
	online,
	size = 32,
}: EmilienLoaderProps) {
	const working = online && status === "working";
	const dormant = !online || status === "ended";
	const accent = working ? EMBER : STATUS_COLORS.idle;

	const rotation = useSharedValue(0);
	// Match LivePulseDot: keep the ring readable under "Reduce Motion" but stop it
	// spinning.
	const reduceMotion = useReducedMotion();
	const shouldAnimate = working && !reduceMotion;

	useEffect(() => {
		if (shouldAnimate) {
			rotation.value = withRepeat(
				withTiming(360, { duration: 900, easing: Easing.linear }),
				-1,
				false,
			);
		} else {
			cancelAnimation(rotation);
			rotation.value = 0;
		}
		return () => cancelAnimation(rotation);
	}, [shouldAnimate, rotation]);

	const spinStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value}deg` }],
	}));

	// Working: bright ember sweep on a faint ember track. Idle/ended/offline: a
	// calm, dimmed ring — a paused loader, not a heartbeat.
	const trackOpacity = working ? 0.2 : 0.12;
	const arcOpacity = working ? 1 : dormant ? 0.3 : 0.55;

	return (
		<View style={{ width: size, height: size }}>
			<Animated.View style={[{ width: size, height: size }, spinStyle]}>
				<Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
					<Circle
						cx={CENTER}
						cy={CENTER}
						r={RADIUS}
						stroke={withAlpha(accent, trackOpacity)}
						strokeWidth={STROKE}
						fill="none"
					/>
					<Circle
						cx={CENTER}
						cy={CENTER}
						r={RADIUS}
						stroke={accent}
						strokeOpacity={arcOpacity}
						strokeWidth={STROKE}
						strokeLinecap="round"
						strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
						fill="none"
						// Start the sweep at 12 o'clock so the rest position reads cleanly.
						transform={`rotate(-90 ${CENTER} ${CENTER})`}
					/>
				</Svg>
			</Animated.View>
		</View>
	);
}
