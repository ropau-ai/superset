// A dependency-free, LCS-based line diff. The host's `git.getDiff` returns raw
// before/after file contents (not a unified patch), so the client turns them
// into hunks itself. Output matches the `structuredPatch` shape the shared
// file-diff renderer expects — an array of hunks whose `lines` are prefixed
// with `+` (added), `-` (removed), or ` ` (context) — so the renderer stays a
// thin, dumb view over this.

/** One unified-diff hunk: a contiguous run of prefixed lines. */
export interface DiffHunk {
	/** `@@ -oldStart,oldLines +newStart,newLines @@` style header. */
	header: string;
	/** Lines prefixed with `+`, `-`, or ` ` (context). */
	lines: string[];
}

export interface LineDiff {
	hunks: DiffHunk[];
	additions: number;
	deletions: number;
	/** True when the file was too large for an exact diff and was approximated. */
	truncated: boolean;
	/** True when both sides are identical (no changes to show). */
	isEmpty: boolean;
}

/** Lines of context kept around each changed region in a hunk. */
const CONTEXT_LINES = 3;

// Above this the O(n·m) LCS table gets expensive on a phone, so we fall back to
// a bounded "all removed then all added" approximation. 1500×1500 ≈ 2.25M cells
// — comfortably fast, and real source files rarely exceed it.
const MAX_LCS_CELLS = 1500 * 1500;

type Op =
	| { type: "context"; text: string }
	| { type: "add"; text: string }
	| { type: "del"; text: string };

/**
 * Split file contents into lines. A single trailing newline is dropped so a
 * file ending in "\n" doesn't render a spurious final blank line; interior and
 * intentional trailing blank lines are preserved.
 */
function toLines(contents: string): string[] {
	if (contents === "") return [];
	const lines = contents.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

/** Longest-common-subsequence backtrack into an ordered edit script. */
function diffOps(oldLines: string[], newLines: string[]): Op[] {
	const n = oldLines.length;
	const m = newLines.length;

	// Trim the common prefix/suffix first — cheap, and it shrinks the LCS table
	// dramatically for the common "edit a few lines in a big file" case.
	let start = 0;
	while (start < n && start < m && oldLines[start] === newLines[start]) start++;
	let endOld = n;
	let endNew = m;
	while (
		endOld > start &&
		endNew > start &&
		oldLines[endOld - 1] === newLines[endNew - 1]
	) {
		endOld--;
		endNew--;
	}

	const midOld = oldLines.slice(start, endOld);
	const midNew = newLines.slice(start, endNew);

	const ops: Op[] = [];
	for (let i = 0; i < start; i++)
		ops.push({ type: "context", text: oldLines[i] });

	if (midOld.length * midNew.length > MAX_LCS_CELLS) {
		// Bounded fallback: represent the whole differing middle as a delete then
		// an add. Correct (if coarse) and O(n+m).
		for (const text of midOld) ops.push({ type: "del", text });
		for (const text of midNew) ops.push({ type: "add", text });
	} else {
		const a = midOld.length;
		const b = midNew.length;
		// LCS DP table.
		const dp: number[][] = Array.from({ length: a + 1 }, () =>
			new Array<number>(b + 1).fill(0),
		);
		for (let i = a - 1; i >= 0; i--) {
			for (let j = b - 1; j >= 0; j--) {
				dp[i][j] =
					midOld[i] === midNew[j]
						? dp[i + 1][j + 1] + 1
						: Math.max(dp[i + 1][j], dp[i][j + 1]);
			}
		}
		let i = 0;
		let j = 0;
		while (i < a && j < b) {
			if (midOld[i] === midNew[j]) {
				ops.push({ type: "context", text: midOld[i] });
				i++;
				j++;
			} else if (dp[i + 1][j] >= dp[i][j + 1]) {
				ops.push({ type: "del", text: midOld[i] });
				i++;
			} else {
				ops.push({ type: "add", text: midNew[j] });
				j++;
			}
		}
		while (i < a) ops.push({ type: "del", text: midOld[i++] });
		while (j < b) ops.push({ type: "add", text: midNew[j++] });
	}

	for (let i = endOld; i < n; i++)
		ops.push({ type: "context", text: oldLines[i] });
	return ops;
}

/** Group an edit script into hunks, keeping CONTEXT_LINES of context per side. */
function opsToHunks(ops: Op[]): DiffHunk[] {
	const changedIdx = ops
		.map((op, i) => (op.type === "context" ? -1 : i))
		.filter((i) => i >= 0);
	if (changedIdx.length === 0) return [];

	// Merge changed indices whose gaps are small enough that their context
	// windows would overlap, into single hunk ranges.
	const ranges: Array<{ from: number; to: number }> = [];
	for (const idx of changedIdx) {
		const from = Math.max(0, idx - CONTEXT_LINES);
		const to = Math.min(ops.length - 1, idx + CONTEXT_LINES);
		const last = ranges[ranges.length - 1];
		if (last && from <= last.to + 1) {
			last.to = Math.max(last.to, to);
		} else {
			ranges.push({ from, to });
		}
	}

	// Track 1-based line numbers to synthesize hunk headers.
	let oldLine = 1;
	let newLine = 1;
	const lineStarts: Array<{ old: number; new: number }> = [];
	for (const op of ops) {
		lineStarts.push({ old: oldLine, new: newLine });
		if (op.type === "context") {
			oldLine++;
			newLine++;
		} else if (op.type === "del") {
			oldLine++;
		} else {
			newLine++;
		}
	}

	return ranges.map(({ from, to }) => {
		const lines: string[] = [];
		let oldCount = 0;
		let newCount = 0;
		for (let i = from; i <= to; i++) {
			const op = ops[i];
			if (op.type === "context") {
				lines.push(` ${op.text}`);
				oldCount++;
				newCount++;
			} else if (op.type === "del") {
				lines.push(`-${op.text}`);
				oldCount++;
			} else {
				lines.push(`+${op.text}`);
				newCount++;
			}
		}
		const oldStart = lineStarts[from].old;
		const newStart = lineStarts[from].new;
		return {
			header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
			lines,
		};
	});
}

/**
 * Compute a unified line diff between two file versions. Empty `oldContents`
 * means an added file (all additions); empty `newContents` means a deleted file
 * (all removals).
 */
export function computeLineDiff(
	oldContents: string,
	newContents: string,
): LineDiff {
	if (oldContents === newContents) {
		return {
			hunks: [],
			additions: 0,
			deletions: 0,
			truncated: false,
			isEmpty: true,
		};
	}

	const oldLines = toLines(oldContents);
	const newLines = toLines(newContents);
	const truncated = oldLines.length * newLines.length > MAX_LCS_CELLS;

	const ops = diffOps(oldLines, newLines);
	const hunks = opsToHunks(ops);

	let additions = 0;
	let deletions = 0;
	for (const op of ops) {
		if (op.type === "add") additions++;
		else if (op.type === "del") deletions++;
	}

	return {
		hunks,
		additions,
		deletions,
		truncated,
		isEmpty: hunks.length === 0,
	};
}
