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
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { LiveAgentStatusKind } from "../../agentStatus";

interface StatusStyle {
	container: string;
	dot: string;
	text: string;
	pulse: boolean;
}

// Cockpit-intuitive semantics: green = working / live / healthy, amber = wants
// your attention, muted grey = idle / ended. (Previously working read as amber
// "caution" and idle as green "good" — inverted.) Amber is reserved for
// waiting, so a glance never mistakes "working" for a warning.
const STATUS_STYLES: Record<LiveAgentStatusKind, StatusStyle> = {
	working: {
		container: "border-emerald-500/30 bg-emerald-500/10",
		dot: "bg-emerald-400",
		text: "text-emerald-600 dark:text-emerald-400",
		pulse: true,
	},
	waiting: {
		container: "border-amber-500/30 bg-amber-500/10",
		dot: "bg-amber-400",
		text: "text-amber-600 dark:text-amber-400",
		pulse: true,
	},
	idle: {
		container: "border-border bg-muted",
		dot: "bg-muted-foreground/60",
		text: "text-muted-foreground",
		pulse: false,
	},
	ended: {
		container: "border-border bg-muted",
		dot: "bg-muted-foreground/60",
		text: "text-muted-foreground",
		pulse: false,
	},
	unknown: {
		container: "border-border bg-muted",
		dot: "bg-muted-foreground",
		text: "text-muted-foreground",
		pulse: true,
	},
};

function PulsingDot({
	className,
	active,
}: {
	className: string;
	active: boolean;
}) {
	const progress = useSharedValue(0);
	// Respect iOS "Reduce Motion": a steady dot still conveys the status color.
	const reduceMotion = useReducedMotion();
	const shouldAnimate = active && !reduceMotion;

	useEffect(() => {
		if (shouldAnimate) {
			progress.value = withRepeat(
				withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
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
		opacity: 0.4 + progress.value * 0.6,
		transform: [{ scale: 0.85 + progress.value * 0.4 }],
	}));

	return (
		<View className="size-2 items-center justify-center">
			<Animated.View
				className={cn("size-2 rounded-full", className)}
				style={shouldAnimate ? style : undefined}
			/>
		</View>
	);
}

export interface AgentStatusBadgeProps {
	kind: LiveAgentStatusKind;
	label: string;
	className?: string;
}

export function AgentStatusBadge({
	kind,
	label,
	className,
}: AgentStatusBadgeProps) {
	const style = STATUS_STYLES[kind];
	return (
		<View
			className={cn(
				"flex-row items-center gap-2 self-start rounded-full border px-3 py-1.5",
				style.container,
				className,
			)}
		>
			<PulsingDot active={style.pulse} className={style.dot} />
			<Text className={cn("text-sm font-medium", style.text)}>{label}</Text>
		</View>
	);
}
