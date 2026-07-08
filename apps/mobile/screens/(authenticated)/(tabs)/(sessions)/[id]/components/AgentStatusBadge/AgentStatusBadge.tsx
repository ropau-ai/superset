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
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { LiveAgentStatusKind } from "../../agentStatus";

interface StatusStyle {
	container: string;
	dot: string;
	text: string;
	pulse: boolean;
}

const STATUS_STYLES: Record<LiveAgentStatusKind, StatusStyle> = {
	working: {
		container: "border-amber-500/30 bg-amber-500/10",
		dot: "bg-amber-400",
		text: "text-amber-600 dark:text-amber-400",
		pulse: true,
	},
	waiting: {
		container: "border-sky-500/30 bg-sky-500/10",
		dot: "bg-sky-400",
		text: "text-sky-600 dark:text-sky-400",
		pulse: true,
	},
	idle: {
		container: "border-emerald-500/30 bg-emerald-500/10",
		dot: "bg-emerald-400",
		text: "text-emerald-600 dark:text-emerald-400",
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

	useEffect(() => {
		if (active) {
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
	}, [active, progress]);

	const style = useAnimatedStyle(() => ({
		opacity: 0.4 + progress.value * 0.6,
		transform: [{ scale: 0.85 + progress.value * 0.4 }],
	}));

	return (
		<View className="size-2 items-center justify-center">
			<Animated.View
				className={cn("size-2 rounded-full", className)}
				style={active ? style : undefined}
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
