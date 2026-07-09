import { formatDistanceToNow } from "date-fns";
import { Bot, Users } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { AgentTypeChip } from "@/components/AgentTypeChip";
import { TokenBadge } from "@/components/TokenBadge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import type { AgentTokens } from "@/hooks/useAgentTokens";
import type { TerminalAgentBinding } from "@/lib/relay/relay";
import { cn } from "@/lib/utils";
import { type LiveAgentStatusKind, statusForBinding } from "../../agentStatus";
import type { AgentActivityPhase } from "../../hooks/useAgentActivity";
import { AgentStatusBadge } from "../AgentStatusBadge";

/**
 * Avatar tint per status, mirroring `AgentStatusBadge`'s palette so the fleet is
 * parseable at a glance without reading each pill.
 */
const AVATAR_TINT: Record<
	LiveAgentStatusKind,
	{ container: string; text: string }
> = {
	working: {
		container: "border-emerald-500/30 bg-emerald-500/10",
		text: "text-emerald-500",
	},
	waiting: {
		container: "border-amber-500/30 bg-amber-500/10",
		text: "text-amber-500",
	},
	idle: { container: "border-border bg-muted", text: "text-muted-foreground" },
	ended: { container: "border-border bg-muted", text: "text-muted-foreground" },
	unknown: {
		container: "border-border bg-muted",
		text: "text-muted-foreground",
	},
};

/**
 * Human label for a binding: prefer the agent definition, fall back to a short
 * agent id (rendered mono so it reads as an identifier, not a name).
 */
function resolveName(binding: TerminalAgentBinding): {
	label: string;
	mono: boolean;
} {
	const def = binding.definitionId?.trim();
	if (def) return { label: def, mono: false };
	const id = binding.agentId ?? "";
	const short = id.length > 10 ? `${id.slice(0, 8)}…` : id;
	return { label: short || "agent", mono: true };
}

function SubAgentRow({
	binding,
	now,
}: {
	binding: TerminalAgentBinding;
	now: number;
}) {
	const status = statusForBinding(binding, now);
	const tint = AVATAR_TINT[status.kind];
	const name = resolveName(binding);
	const lastActive =
		typeof binding.lastEventAt === "number"
			? formatDistanceToNow(new Date(binding.lastEventAt), { addSuffix: true })
			: null;

	return (
		<View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
			<View
				className={cn(
					"size-9 items-center justify-center rounded-lg border",
					tint.container,
				)}
			>
				<Icon as={Bot} className={cn("size-4", tint.text)} strokeWidth={1.75} />
			</View>

			<View className="flex-1 gap-0.5">
				<View className="flex-row items-center gap-2">
					<Text
						className={cn(
							"shrink font-medium",
							name.mono && "font-mono text-sm",
						)}
						numberOfLines={1}
					>
						{name.label}
					</Text>
					<AgentTypeChip definitionId={binding.definitionId} />
				</View>
				<View className="flex-row items-center gap-2">
					{lastActive ? (
						<Text className="text-muted-foreground text-xs" numberOfLines={1}>
							active {lastActive}
						</Text>
					) : null}
					{lastActive ? (
						<Text className="text-muted-foreground text-xs">·</Text>
					) : null}
					{/* No clean per-terminal-agent usage source (interactive PTY, hook
					    events carry none) → honest "—", never a fabricated number. */}
					<TokenBadge tokens={null} />
				</View>
			</View>

			<AgentStatusBadge kind={status.kind} label={status.label} />
		</View>
	);
}

function PanelHeader({
	count,
	tokens,
}: {
	count: number | null;
	tokens: AgentTokens | null;
}) {
	return (
		<View className="flex-row items-center justify-between">
			<View className="flex-row items-center gap-2">
				<Icon
					as={Users}
					className="size-4 text-muted-foreground"
					strokeWidth={1.75}
				/>
				<Text className="font-semibold">Agents</Text>
			</View>
			<View className="flex-row items-center gap-2.5">
				<TokenBadge tokens={tokens} />
				{count != null ? (
					<Text className="text-muted-foreground text-xs">
						{count} {count === 1 ? "agent" : "agents"}
					</Text>
				) : null}
			</View>
		</View>
	);
}

function SkeletonRow() {
	return (
		<View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
			<Skeleton className="size-9 rounded-lg" />
			<View className="flex-1 gap-1.5">
				<Skeleton className="h-3.5 w-24" />
				<Skeleton className="h-3 w-16" />
			</View>
			<Skeleton className="h-6 w-20 rounded-full" />
		</View>
	);
}

export interface SubAgentsPanelProps {
	/** Every live agent bound to the workspace's terminals. */
	bindings: readonly TerminalAgentBinding[];
	/** Ticking clock (epoch ms) so per-agent staleness + "active X ago" re-derive. */
	now: number;
	/** Relay poll phase; drives the discreet loading skeleton. */
	phase?: AgentActivityPhase;
	/** Real session-total usage for the panel header (from the screen's poll). */
	sessionTokens?: AgentTokens | null;
	className?: string;
}

/**
 * The sub-agent fleet panel for the Live Session: renders one card per live
 * agent — name, per-agent status pill, and last-active time — so the cockpit
 * shows the whole fleet under the main conversation instead of collapsing it to
 * a single header badge. Purely a read view over `useAgentActivity.bindings`.
 *
 * Defensive by design: while the first poll is in flight it shows a skeleton;
 * once there are zero agents it renders nothing (the session simply has no
 * fleet), and it never assumes optional binding fields are present.
 */
export function SubAgentsPanel({
	bindings,
	now,
	phase,
	sessionTokens = null,
	className,
}: SubAgentsPanelProps) {
	const sorted = useMemo(() => {
		const list = bindings ?? [];
		return [...list].sort(
			(a, b) => (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0),
		);
	}, [bindings]);

	// Cache-first: if we already have agents, show them even while re-polling.
	if (sorted.length === 0) {
		if (phase === "loading") {
			return (
				<View className={cn("gap-3", className)}>
					<PanelHeader count={null} tokens={sessionTokens} />
					<SkeletonRow />
					<SkeletonRow />
				</View>
			);
		}
		return null;
	}

	return (
		<View className={cn("gap-3", className)}>
			<PanelHeader count={sorted.length} tokens={sessionTokens} />
			<View className="gap-2">
				{sorted.map((binding) => (
					<SubAgentRow
						binding={binding}
						key={`${binding.terminalId}:${binding.agentId}`}
						now={now}
					/>
				))}
			</View>
		</View>
	);
}
