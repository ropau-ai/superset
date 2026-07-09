import * as Clipboard from "expo-clipboard";
import { Check, Copy, RotateCw, TerminalIcon } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Pressable, ScrollView, View } from "react-native";
import { BrailleSpinner } from "@/components/ai-elements/braille-spinner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type {
	TerminalStreamPhase,
	TerminalStreamResult,
} from "../../hooks/useTerminalStream";

// How many trailing lines to actually render (the buffer retains more). One
// joined <Text> is far cheaper than thousands of Text nodes and scrolls smoothly.
const RENDER_LINES = 800;
const AT_BOTTOM_THRESHOLD = 40;

type ConnState = TerminalStreamResult["connectionState"];

function ConnectionPill({
	phase,
	connectionState,
}: {
	phase: TerminalStreamPhase;
	connectionState: ConnState;
}) {
	if (phase === "streaming" && connectionState === "connected") {
		return (
			<View className="flex-row items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
				<View className="size-1.5 rounded-full bg-emerald-400" />
				<Text className="font-medium font-mono text-[10px] text-emerald-400 uppercase tracking-widest">
					Live
				</Text>
			</View>
		);
	}
	if (connectionState === "reconnecting" || phase === "discovering") {
		return (
			<View className="flex-row items-center gap-1.5">
				<BrailleSpinner className="text-xs" />
				<Text className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">
					{phase === "discovering" ? "Connecting" : "Reconnecting"}
				</Text>
			</View>
		);
	}
	if (connectionState === "error" || phase === "error") {
		return (
			<View className="flex-row items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5">
				<View className="size-1.5 rounded-full bg-rose-400" />
				<Text className="font-mono text-[10px] text-rose-400 uppercase tracking-widest">
					Offline
				</Text>
			</View>
		);
	}
	return null;
}

function TerminalBody({ lines }: { lines: string[] }) {
	const scrollRef = useRef<ScrollView>(null);
	const atBottom = useRef(true);

	const text = useMemo(() => {
		const slice =
			lines.length > RENDER_LINES
				? lines.slice(lines.length - RENDER_LINES)
				: lines;
		return slice.join("\n");
	}, [lines]);

	const handleScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const { contentOffset, contentSize, layoutMeasurement } =
				event.nativeEvent;
			atBottom.current =
				contentSize.height - layoutMeasurement.height - contentOffset.y <
				AT_BOTTOM_THRESHOLD;
		},
		[],
	);

	const handleContentSizeChange = useCallback(() => {
		if (atBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
	}, []);

	return (
		<ScrollView
			className="flex-1"
			contentContainerClassName="p-3"
			onContentSizeChange={handleContentSizeChange}
			onScroll={handleScroll}
			ref={scrollRef}
			scrollEventThrottle={64}
		>
			<Text
				className="font-mono text-[11px] text-neutral-100 leading-4"
				selectable
			>
				{text}
			</Text>
		</ScrollView>
	);
}

/** Copies the full retained buffer, with a brief check-mark confirmation. */
function CopyButton({ getText }: { getText: () => string }) {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const onPress = useCallback(async () => {
		try {
			await Clipboard.setStringAsync(getText());
			setCopied(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard unavailable — no-op rather than throw.
		}
	}, [getText]);

	return (
		<Pressable
			accessibilityLabel="Copy terminal output"
			accessibilityRole="button"
			className="size-8 items-center justify-center rounded-md active:bg-neutral-800"
			hitSlop={6}
			onPress={onPress}
		>
			<Icon
				as={copied ? Check : Copy}
				className={cn(
					"size-3.5",
					copied ? "text-emerald-400" : "text-neutral-400",
				)}
				strokeWidth={2}
			/>
		</Pressable>
	);
}

function TerminalNotice({
	title,
	description,
	spinner,
	onRetry,
}: {
	title: string;
	description: string;
	spinner?: boolean;
	onRetry?: () => void;
}) {
	return (
		<View className="flex-1 items-center justify-center gap-3 p-6">
			{spinner ? <BrailleSpinner className="text-xl" /> : null}
			<View className="items-center gap-1">
				<Text className="text-center font-medium text-neutral-200 text-sm">
					{title}
				</Text>
				<Text className="max-w-xs text-center text-neutral-500 text-sm">
					{description}
				</Text>
			</View>
			{onRetry ? (
				<Button
					className="mt-1 border-neutral-700"
					onPress={onRetry}
					size="sm"
					variant="outline"
				>
					<Icon as={RotateCw} className="size-4 text-neutral-200" />
					<Text className="text-neutral-200">Retry</Text>
				</Button>
			) : null}
		</View>
	);
}

export interface LiveTerminalProps {
	stream: TerminalStreamResult;
	relayConfigured: boolean;
	className?: string;
}

/**
 * The hero panel: a live, auto-scrolling view of the agent's terminal output,
 * streamed over the relay WebSocket. Always dark (a terminal is a terminal),
 * with clear connecting / offline / not-configured states so it never renders
 * a broken void when a data source is missing. Owns its vertical space — the
 * caller sizes it (e.g. `flex-1`), and the single inner scroll is the terminal's
 * own, so there's no same-axis nested scroll fighting the page gesture.
 */
export function LiveTerminal({
	stream,
	relayConfigured,
	className,
}: LiveTerminalProps) {
	const { lines, phase, connectionState, terminalTitle, error, retry } = stream;
	const hasOutput = lines.length > 0;

	const body = (() => {
		if (phase === "disabled") {
			return (
				<TerminalNotice
					description={
						!relayConfigured
							? "This build isn't pointed at a terminal relay yet."
							: "The workspace host is offline. The stream resumes when it reconnects."
					}
					title={!relayConfigured ? "Relay not configured" : "Host offline"}
				/>
			);
		}
		if (phase === "no-terminal") {
			return (
				<TerminalNotice
					description="This workspace has no running terminal to attach to right now."
					onRetry={retry}
					title="No live terminal"
				/>
			);
		}
		if (phase === "error") {
			return (
				<TerminalNotice
					description={error ?? "Lost connection to the host terminal."}
					onRetry={retry}
					title="Disconnected"
				/>
			);
		}
		if (
			phase === "discovering" ||
			(phase === "streaming" && lines.length === 0)
		) {
			return (
				<TerminalNotice
					description="Attaching to the live terminal session…"
					spinner
					title="Connecting…"
				/>
			);
		}
		return <TerminalBody lines={lines} />;
	})();

	return (
		<View
			className={cn(
				"overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950",
				className,
			)}
		>
			<View className="flex-row items-center gap-2 border-neutral-800 border-b bg-neutral-900/60 px-3 py-2">
				<Icon
					as={TerminalIcon}
					className="size-3.5 text-neutral-400"
					strokeWidth={2}
				/>
				<Text
					className="min-w-0 flex-1 font-mono text-neutral-300 text-xs"
					numberOfLines={1}
				>
					{terminalTitle?.trim() || "terminal"}
				</Text>
				{hasOutput ? <CopyButton getText={() => lines.join("\n")} /> : null}
				<ConnectionPill connectionState={connectionState} phase={phase} />
			</View>
			<View className="flex-1">{body}</View>
		</View>
	);
}
