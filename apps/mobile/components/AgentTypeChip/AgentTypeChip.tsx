import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { agentTypeLabelFromDefinition } from "@/lib/agentTypes";
import { cn } from "@/lib/utils";

export interface AgentTypeChipProps {
	/** The binding's `definitionId` (e.g. "claude", "codex:gpt-5"). */
	definitionId?: string | null;
	className?: string;
}

/**
 * A small monospace chip naming the agent runtime (claude / codex / gemini …),
 * derived from a live binding's `definitionId`. Renders nothing when there's no
 * definition to show, so it never leaves an empty pill.
 */
export function AgentTypeChip({ definitionId, className }: AgentTypeChipProps) {
	const label = agentTypeLabelFromDefinition(definitionId);
	if (!label) return null;
	return (
		<View
			className={cn(
				"self-start rounded-md border border-border bg-muted px-1.5 py-0.5",
				className,
			)}
		>
			<Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
				{label}
			</Text>
		</View>
	);
}
