// Mobile port of the desktop ToolCallBlock's tool-name normalization + result
// extraction (apps/desktop/.../ChatInterface/utils/tool-helpers.ts and
// getExecuteCommandViewModel). Kept dependency-free and read-only so the same
// raw agent message parts render identically to the desktop, minus the
// pane/editor affordances the phone doesn't have.

export type ActivityToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type UnknownRecord = Record<string, unknown>;

const TOOL_NAME_ALIASES: Record<string, string> = {
	execute_command: "mastra_workspace_execute_command",
	run_command: "mastra_workspace_execute_command",
	run_terminal_cmd: "mastra_workspace_execute_command",
	write_file: "mastra_workspace_write_file",
	string_replace_lsp: "mastra_workspace_edit_file",
	edit_file: "mastra_workspace_edit_file",
	read_file: "mastra_workspace_read_file",
	view: "mastra_workspace_read_file",
	list_files: "mastra_workspace_list_files",
	find_files: "mastra_workspace_list_files",
	file_stat: "mastra_workspace_file_stat",
	search: "mastra_workspace_search",
	search_content: "mastra_workspace_search",
	index: "mastra_workspace_index",
	mkdir: "mastra_workspace_mkdir",
	delete: "mastra_workspace_delete",
	web_extract: "web_fetch",
	ask_user: "ask_user_question",
	ast_smart_edit: "ast_smart_edit",
	request_access: "request_access",
	request_sandbox_access: "request_access",
	web_search: "web_search",
	web_fetch: "web_fetch",
};

export const READ_ONLY_TOOLS = new Set([
	"mastra_workspace_read_file",
	"mastra_workspace_list_files",
	"mastra_workspace_file_stat",
	"mastra_workspace_search",
	"mastra_workspace_index",
]);

export function normalizeToolName(toolName: string): string {
	const directAlias = TOOL_NAME_ALIASES[toolName];
	if (directAlias) return directAlias;
	const unnamespaced = toolName.startsWith("superset_")
		? toolName.slice("superset_".length)
		: toolName;
	return TOOL_NAME_ALIASES[unnamespaced] ?? unnamespaced;
}

/** A completed tool call is either an error, a success, or still in flight. */
export function toActivityToolState(
	hasResult: boolean,
	isError: boolean,
): ActivityToolState {
	if (isError) return "output-error";
	if (hasResult) return "output-available";
	return "input-available";
}

export function toRecord(value: unknown): UnknownRecord | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as UnknownRecord;
	}
	return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function safeJsonStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return undefined;
	}
}

/** Flatten Mastra's `{ content: [{ type: "text", text }] }` envelope to text. */
export function toText(
	value: unknown,
	seen = new WeakSet<object>(),
): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		const parts = value
			.map((item) => toText(item, seen))
			.filter((item): item is string =>
				Boolean(item && item.trim().length > 0),
			);
		return parts.length > 0 ? parts.join("\n") : undefined;
	}
	if (typeof value === "object" && value !== null) {
		if (seen.has(value)) return undefined;
		seen.add(value);
		const record = value as UnknownRecord;

		const content = record.content;
		if (Array.isArray(content)) {
			const text = content
				.map((part) =>
					typeof part === "string"
						? part
						: typeof (part as UnknownRecord)?.text === "string"
							? ((part as UnknownRecord).text as string)
							: "",
				)
				.filter((part) => part.trim().length > 0)
				.join("\n");
			if (text.trim().length > 0) return text;
		}

		for (const key of [
			"text",
			"output",
			"result",
			"error",
			"message",
			"output_text",
			"outputText",
		]) {
			const text = toText(record[key], seen);
			if (text && text.trim().length > 0) return text;
		}
	}
	return undefined;
}

export function firstText(...values: unknown[]): string | undefined {
	for (const value of values) {
		const text = toText(value);
		if (text && text.trim().length > 0) return text;
	}
	return undefined;
}

const COMMAND_KEYS = ["command", "cmd", "command_line", "commandLine", "raw"];
const STDOUT_KEYS = [
	"content",
	"stdout",
	"stdout_text",
	"stdoutText",
	"output_text",
	"outputText",
	"text",
	"output",
	"result",
	"combined_output",
	"combinedOutput",
];
const STDERR_KEYS = [
	"stderr",
	"stderr_text",
	"stderrText",
	"error",
	"error_text",
	"errorText",
];
const EXIT_CODE_KEYS = ["exitCode", "exit_code", "code", "status_code"];
const TRAVERSAL_KEYS = ["output", "result"];

export interface ExecuteCommandViewModel {
	command: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
}

function collectRecordGraph(root: UnknownRecord): UnknownRecord[] {
	const queue: UnknownRecord[] = [root];
	const seen = new Set<UnknownRecord>();
	const records: UnknownRecord[] = [];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		records.push(current);
		for (const key of TRAVERSAL_KEYS) {
			const nested = toRecord(current[key]);
			if (nested && !seen.has(nested)) queue.push(nested);
		}
	}
	return records;
}

function collectValues(records: UnknownRecord[], keys: string[]): unknown[] {
	const values: unknown[] = [];
	for (const record of records) {
		for (const key of keys) values.push(record[key]);
	}
	return values;
}

/** Derive command + stdout/stderr/exit from an execute_command tool result. */
export function getExecuteCommandViewModel({
	args,
	result,
}: {
	args: UnknownRecord;
	result: UnknownRecord;
}): ExecuteCommandViewModel {
	const resultRecords = collectRecordGraph(result);

	const command =
		firstText(...collectValues([args, ...resultRecords], COMMAND_KEYS)) ?? "";

	let stdout = firstText(...collectValues(resultRecords, STDOUT_KEYS), result);
	if (!stdout) {
		const fallbackObject = toRecord(result.output) ?? toRecord(result.result);
		stdout = fallbackObject ? safeJsonStringify(fallbackObject) : undefined;
	}

	const stderr = firstText(...collectValues(resultRecords, STDERR_KEYS));
	const exitCode = collectValues(resultRecords, EXIT_CODE_KEYS)
		.map(toFiniteNumber)
		.find((value): value is number => value !== undefined);

	return { command, stdout, stderr, exitCode };
}

/** Resolve a file path from the many arg spellings the agents use. */
export function getFilePath(args: UnknownRecord): string {
	const editArgs = toRecord(args.edit);
	return (
		firstText(
			args.path,
			args.filePath,
			args.file_path,
			args.relative_workspace_path,
			args.relativePath,
			args.file,
			args.filename,
			args.file_name,
			args.target_file,
			args.target_path,
			args.targetPath,
			editArgs?.path,
			editArgs?.filePath,
			editArgs?.file_path,
			toRecord(args.target)?.path,
		) ?? ""
	);
}

/** Resolve old/new strings for an edit tool from args or the result envelope. */
export function extractEditStrings({
	args,
	result,
}: {
	args: UnknownRecord;
	result: UnknownRecord;
}): { oldString: string; newString: string } {
	const editArgs = toRecord(args.edit);
	const output = toRecord(result.output);
	const nested = toRecord(result.result);
	const oldString =
		firstText(
			args.oldString,
			args.old_string,
			args.old_str,
			args.oldText,
			args.old_text,
			args.before,
			args.find,
			args.search,
			args.original,
			args.from,
			editArgs?.oldString,
			editArgs?.old_string,
			output?.oldString,
			output?.old_string,
			nested?.oldString,
			nested?.old_string,
		) ?? "";
	const newString =
		firstText(
			args.newString,
			args.new_string,
			args.new_str,
			args.newText,
			args.new_text,
			args.after,
			args.replace,
			args.replacement,
			args.updated,
			args.to,
			editArgs?.newString,
			editArgs?.new_string,
			output?.newString,
			output?.new_string,
			nested?.newString,
			nested?.new_string,
		) ?? "";
	return { oldString, newString };
}

/** Pull a structured patch (list of hunks) from any nesting depth. */
export function extractStructuredPatch(
	result: UnknownRecord,
): Array<{ lines: string[] }> | undefined {
	const output = toRecord(result.output);
	const nested = toRecord(result.result);
	const candidates = [
		result.structuredPatch,
		output?.structuredPatch,
		nested?.structuredPatch,
		result.structured_patch,
		output?.structured_patch,
		nested?.structured_patch,
	];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			const hunks = candidate.filter((hunk): hunk is { lines: string[] } =>
				Boolean(
					typeof hunk === "object" &&
						hunk !== null &&
						Array.isArray((hunk as { lines?: unknown }).lines),
				),
			);
			if (hunks.length > 0) return hunks;
		}
	}
	return undefined;
}
