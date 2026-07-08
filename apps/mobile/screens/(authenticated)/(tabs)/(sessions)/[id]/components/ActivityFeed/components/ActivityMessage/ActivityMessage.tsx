import { ImageIcon, PaperclipIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { ChatActivityMessage, ChatMessagePart } from "@/lib/relay/relay";
import { ActivityToolCall } from "../ActivityToolCall";

function asRecord(part: ChatMessagePart): Record<string, unknown> {
	return part as unknown as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Find the tool_result part matching a tool_call id, searching forward. */
function findResult(
	content: ChatMessagePart[],
	id: string,
	startAt: number,
): { index: number; part: Record<string, unknown> } | null {
	for (let i = startAt; i < content.length; i++) {
		const record = asRecord(content[i]);
		if (record.type === "tool_result" && record.id === id) {
			return { index: i, part: record };
		}
	}
	return null;
}

/**
 * Renders one agent message as a timeline entry: assistant text (markdown),
 * reasoning, and each tool call mapped to its rich ai-element; user messages
 * render as a compact prompt bubble for context. Mirrors apps/desktop's
 * AssistantMessage part loop, minus the editor-pane affordances.
 */
export function ActivityMessage({ message }: { message: ChatActivityMessage }) {
	const isUser = message.role === "user";
	const content = Array.isArray(message.content) ? message.content : [];

	if (isUser) {
		const text = content
			.map((part) => str(asRecord(part).text))
			.filter((value): value is string => Boolean(value))
			.join("\n");
		const attachments = content.filter((part) => {
			const type = asRecord(part).type;
			return type === "image" || type === "file";
		}).length;
		if (!text && attachments === 0) return null;
		return (
			<View className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5">
				{text ? (
					<Text className="text-secondary-foreground text-sm">{text}</Text>
				) : null}
				{attachments > 0 ? (
					<View className="mt-1 flex-row items-center gap-1">
						<Icon as={PaperclipIcon} className="size-3 text-muted-foreground" />
						<Text className="text-muted-foreground text-xs">
							{attachments} attachment{attachments > 1 ? "s" : ""}
						</Text>
					</View>
				) : null}
			</View>
		);
	}

	const nodes: ReactNode[] = [];
	const rendered = new Set<string>();

	for (let index = 0; index < content.length; index++) {
		const part = content[index];
		const record = asRecord(part);
		const type = record.type;

		if (type === "text") {
			const text = str(record.text);
			if (text) {
				nodes.push(
					<MessageResponse key={`t-${index}`}>{text}</MessageResponse>,
				);
			}
			continue;
		}

		if (type === "thinking") {
			const thinking = str(record.thinking);
			if (thinking) {
				nodes.push(
					<Reasoning defaultOpen={false} key={`r-${index}`}>
						<ReasoningTrigger />
						<ReasoningContent>{thinking}</ReasoningContent>
					</Reasoning>,
				);
			}
			continue;
		}

		if (type === "tool_call") {
			const id = str(record.id) ?? `call-${index}`;
			if (rendered.has(id)) continue;
			rendered.add(id);
			const match = findResult(content, id, index + 1);
			if (match) rendered.add(id);
			const resultPart = match?.part;
			const isError = resultPart?.isError === true;
			nodes.push(
				<ActivityToolCall
					args={(record.args as Record<string, unknown>) ?? {}}
					hasResult={Boolean(resultPart)}
					isError={isError}
					key={`c-${id}`}
					name={str(record.name) ?? "tool"}
					result={resultPart?.result}
				/>,
			);
			continue;
		}

		if (type === "tool_result") {
			const id = str(record.id) ?? `result-${index}`;
			if (rendered.has(id)) continue;
			rendered.add(id);
			nodes.push(
				<ActivityToolCall
					args={{}}
					hasResult
					isError={record.isError === true}
					key={`c-${id}`}
					name={str(record.name) ?? "tool"}
					result={record.result}
				/>,
			);
			continue;
		}

		if (type === "image" || type === "file") {
			const filename = str(record.filename);
			nodes.push(
				<View
					className="flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5"
					key={`f-${index}`}
				>
					<Icon
						as={type === "image" ? ImageIcon : PaperclipIcon}
						className="size-3.5 text-muted-foreground"
					/>
					<Text
						className="min-w-0 shrink text-muted-foreground text-xs"
						numberOfLines={1}
					>
						{filename ?? (type === "image" ? "Image" : "Attachment")}
					</Text>
				</View>,
			);
			continue;
		}

		// Unknown / `om_*` part: surface it quietly rather than dropping silently.
		if (typeof type === "string" && type.length > 0) {
			nodes.push(
				<Text className="text-muted-foreground text-xs" key={`u-${index}`}>
					{type.replaceAll("_", " ")}
				</Text>,
			);
		}
	}

	if (nodes.length === 0) return null;
	return <View className="gap-2">{nodes}</View>;
}
