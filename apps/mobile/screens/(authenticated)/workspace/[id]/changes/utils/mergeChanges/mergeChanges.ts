import type {
	GitChangedFile,
	GitDiffCategory,
	GitStatusSnapshot,
} from "@/lib/relay/relay";

/** A changed file plus the diff category to fetch its per-file diff with. */
export interface ChangeEntry extends GitChangedFile {
	/** Which comparison `git.getDiff` should use for this file. */
	category: GitDiffCategory;
}

export interface MergedChanges {
	entries: ChangeEntry[];
	fileCount: number;
	additions: number;
	deletions: number;
}

/**
 * Flatten a git status snapshot into a single, de-duplicated, sorted list.
 *
 * `againstBase` (the branch's 3-dot diff vs its base) is the canonical set — it
 * is what desktop's Changes view shows and what "the changes in this workspace"
 * means. Working-tree files (staged, then unstaged) that aren't already covered
 * by `againstBase` are appended so brand-new uncommitted files still surface.
 * The chosen set decides the diff `category`, so each row fetches the diff that
 * matches the counts it shows. Sorted by path for a stable order.
 */
export function mergeChanges(snapshot: GitStatusSnapshot): MergedChanges {
	const byPath = new Map<string, ChangeEntry>();

	const absorb = (files: GitChangedFile[], category: GitDiffCategory) => {
		for (const file of files) {
			// First writer wins: againstBase runs first, so a committed file keeps
			// its against-base diff even if it also has working-tree edits.
			if (byPath.has(file.path)) continue;
			byPath.set(file.path, { ...file, category });
		}
	};

	absorb(snapshot.againstBase ?? [], "against-base");
	absorb(snapshot.staged ?? [], "staged");
	absorb(snapshot.unstaged ?? [], "unstaged");

	const entries = Array.from(byPath.values()).sort((a, b) =>
		a.path.localeCompare(b.path),
	);

	let additions = 0;
	let deletions = 0;
	for (const entry of entries) {
		additions += entry.additions;
		deletions += entry.deletions;
	}

	return {
		entries,
		fileCount: entries.length,
		additions,
		deletions,
	};
}
