import { WrenchIcon } from "lucide-react-native";
import { View } from "react-native";
import { BashTool } from "@/components/ai-elements/bash-tool";
import { FileDiffTool } from "@/components/ai-elements/file-diff-tool";
import { ReadFileTool } from "@/components/ai-elements/read-file-tool";
import { ToolCallRow } from "@/components/ai-elements/tool-call-row";
import { WebFetchTool } from "@/components/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@/components/ai-elements/web-search-tool";
import { Text } from "@/components/ui/text";
import {
	extractEditStrings,
	extractStructuredPatch,
	firstText,
	getExecuteCommandViewModel,
	getFilePath,
	normalizeToolName,
	READ_ONLY_TOOLS,
	toActivityToolState,
	toRecord,
} from "../../utils/toolActivity";

export interface ActivityToolCallProps {
	name: string;
	args: Record<string, unknown>;
	/** Raw `tool_result.result` for the paired result, if it has arrived. */
	result?: unknown;
	hasResult: boolean;
	isError: boolean;
}

function basename(filePath: string): string {
	return filePath.split("/").pop() || filePath;
}

interface WebSearchResult {
	title: string;
	url: string;
}

function extractWebSearchResults(result: Record<string, unknown>): {
	query?: string;
	results: WebSearchResult[];
} {
	const output = toRecord(result.output);
	const nested = toRecord(result.result);
	const rawResults =
		result.results ?? output?.results ?? nested?.results ?? result.output;
	const results: WebSearchResult[] = Array.isArray(rawResults)
		? rawResults.flatMap((item) => {
				const record = toRecord(item);
				const url = firstText(record?.url, record?.link);
				if (!url) return [];
				const title = firstText(record?.title, record?.name) ?? url;
				return [{ title, url }];
			})
		: [];
	const query = firstText(result.query, output?.query, nested?.query);
	return { query, results };
}

/**
 * Maps a single agent tool call (+ its result) to the richest matching
 * ai-element, mirroring apps/desktop's ToolCallBlock. Anything without a
 * dedicated component degrades to a generic collapsible row instead of vanishing.
 */
export function ActivityToolCall({
	name,
	args,
	result,
	hasResult,
	isError,
}: ActivityToolCallProps) {
	const toolName = normalizeToolName(name);
	const state = toActivityToolState(hasResult, isError);
	// Coerce the raw result into a record so the extractors can traverse it; a
	// bare string result is wrapped so `result`-keyed lookups still find it.
	const resultRecord = toRecord(result) ?? (result != null ? { result } : {});

	if (toolName === "mastra_workspace_execute_command") {
		const { command, stdout, stderr, exitCode } = getExecuteCommandViewModel({
			args,
			result: resultRecord,
		});
		return (
			<BashTool
				command={command}
				exitCode={exitCode}
				state={state}
				stderr={stderr}
				stdout={stdout}
			/>
		);
	}

	if (toolName === "mastra_workspace_write_file") {
		const filePath = getFilePath(args);
		const content = String(args.content ?? args.data ?? "");
		return (
			<FileDiffTool
				content={content}
				filePath={filePath}
				isWriteMode
				state={state}
			/>
		);
	}

	if (
		toolName === "mastra_workspace_edit_file" ||
		toolName === "ast_smart_edit"
	) {
		const filePath = getFilePath(args);
		const { oldString, newString } = extractEditStrings({
			args,
			result: resultRecord,
		});
		const structuredPatch = extractStructuredPatch(resultRecord);
		return (
			<FileDiffTool
				filePath={filePath}
				newString={newString}
				oldString={oldString}
				state={state}
				structuredPatch={structuredPatch}
			/>
		);
	}

	if (toolName === "web_search" || toolName.includes("web_search")) {
		const { query, results } = extractWebSearchResults(resultRecord);
		if (results.length > 0) {
			return <WebSearchTool query={query} results={results} state={state} />;
		}
		return (
			<ToolCallRow
				description={query || undefined}
				icon={WrenchIcon}
				isError={isError}
				isPending={!hasResult}
				title="Web Search"
			/>
		);
	}

	if (toolName === "web_fetch") {
		const url = String(args.url ?? "");
		const content = firstText(
			resultRecord.content,
			resultRecord.output,
			resultRecord.result,
		);
		const bytes =
			typeof resultRecord.bytes === "number" ? resultRecord.bytes : undefined;
		const statusCode =
			typeof resultRecord.status_code === "number"
				? resultRecord.status_code
				: typeof resultRecord.statusCode === "number"
					? resultRecord.statusCode
					: undefined;
		return (
			<WebFetchTool
				bytes={bytes}
				content={content}
				state={state}
				statusCode={statusCode}
				url={url}
			/>
		);
	}

	if (READ_ONLY_TOOLS.has(toolName)) {
		const filePath = getFilePath(args);
		const content = firstText(resultRecord) ?? "";
		const label = filePath
			? basename(filePath)
			: toolName.replace(/^mastra_workspace_/, "").replaceAll("_", " ");
		return (
			<ReadFileTool
				content={content}
				filename={label}
				isError={isError}
				isPending={!hasResult}
			/>
		);
	}

	// Fallback: a generic collapsible row with whatever text the result carries.
	const toolDisplayName = toolName
		.replace("mastra_workspace_", "")
		.replaceAll("_", " ");
	const resultText = hasResult ? firstText(resultRecord) : undefined;
	return (
		<ToolCallRow
			description={getFilePath(args) || undefined}
			icon={WrenchIcon}
			isError={isError}
			isPending={!hasResult}
			title={toolDisplayName || "Tool"}
		>
			{resultText ? (
				<View className="py-1.5 pl-2">
					<Text className="font-mono text-muted-foreground text-xs">
						{resultText}
					</Text>
				</View>
			) : undefined}
		</ToolCallRow>
	);
}
