import { Coins } from "lucide-react-native";
import { Alert, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { type AgentTokens, formatTokenCount } from "@/hooks/useAgentTokens";
import { cn } from "@/lib/utils";

export interface TokenBadgeProps {
	/** Usage to display; `null` renders a clean em-dash (no fake numbers). */
	tokens: AgentTokens | null;
	/** Hide the leading coin glyph for the tightest inline rows. */
	iconless?: boolean;
	className?: string;
}

/** In/out breakdown alert — only offered when the source actually split them. */
function showBreakdown(tokens: AgentTokens): void {
	const fmt = (n: number | null) => (n == null ? "—" : formatTokenCount(n));
	Alert.alert(
		"Token usage",
		`Input\t${fmt(tokens.input)}\nOutput\t${fmt(tokens.output)}\nTotal\t${fmt(tokens.total)}`,
	);
}

/**
 * Compact token-consumption chip (`12.4k tok`, or `— tok` when no usage source
 * is available). Deliberately discreet — muted, monospace — so it reads as
 * telemetry, not a headline. Backed by `useAgentTokens`, which returns `null`
 * until the backend emits real usage; this component never fabricates a count.
 * When the source breaks usage into input/output, the chip becomes tappable and
 * reveals the breakdown (per the cockpit spec).
 */
export function TokenBadge({ tokens, iconless, className }: TokenBadgeProps) {
	const label = tokens ? `${formatTokenCount(tokens.total)} tok` : "— tok";
	const canBreakDown =
		tokens != null && (tokens.input != null || tokens.output != null);

	const content = (
		<>
			{iconless ? null : (
				<Icon
					as={Coins}
					className="size-3 text-muted-foreground"
					strokeWidth={1.75}
				/>
			)}
			<Text className="font-mono text-[11px] text-muted-foreground">
				{label}
			</Text>
		</>
	);

	if (canBreakDown && tokens) {
		return (
			<Pressable
				accessibilityLabel="Token usage breakdown"
				accessibilityRole="button"
				className={cn("flex-row items-center gap-1", className)}
				hitSlop={8}
				onPress={() => showBreakdown(tokens)}
			>
				{content}
			</Pressable>
		);
	}

	return (
		<View className={cn("flex-row items-center gap-1", className)}>
			{content}
		</View>
	);
}
