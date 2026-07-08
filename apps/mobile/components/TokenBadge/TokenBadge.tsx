import { Coins } from "lucide-react-native";
import { View } from "react-native";
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

/**
 * Compact token-consumption chip (`12.4k tok`, or `— tok` when no usage source
 * is available). Deliberately discreet — muted, monospace — so it reads as
 * telemetry, not a headline. Backed by `useAgentTokens`, which returns `null`
 * until the backend emits real usage; this component never fabricates a count.
 */
export function TokenBadge({ tokens, iconless, className }: TokenBadgeProps) {
	const label = tokens ? `${formatTokenCount(tokens.total)} tok` : "— tok";
	return (
		<View className={cn("flex-row items-center gap-1", className)}>
			{iconless ? null : (
				<Icon
					as={Coins}
					className="size-3 text-muted-foreground"
					strokeWidth={1.75}
				/>
			)}
			<Text className="font-mono text-[11px] text-muted-foreground">{label}</Text>
		</View>
	);
}
