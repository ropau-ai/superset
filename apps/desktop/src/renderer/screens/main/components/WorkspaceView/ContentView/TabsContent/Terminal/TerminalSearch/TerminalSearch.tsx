import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";
import { useTheme } from "renderer/stores/theme";
import type { UIColors } from "shared/themes/types";

interface TerminalSearchProps {
	searchAddon: SearchAddon | null;
	isOpen: boolean;
	onClose: () => void;
}

/** Fallback find colors when no theme is resolved (VS Code palette). */
const DEFAULT_SEARCH_DECORATIONS: ISearchOptions["decorations"] = {
	matchBackground: "#515c6a",
	matchBorder: "#74879f",
	matchOverviewRuler: "#d186167e",
	activeMatchBackground: "#515c6a",
	activeMatchBorder: "#ffd33d",
	activeMatchColorOverviewRuler: "#ffd33d",
};

/** Append an alpha byte to a `#rrggbb` hex; leave other color formats intact. */
function withAlpha(color: string, alpha: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alpha}` : color;
}

/**
 * Derive xterm find-decoration colors from the active theme's concrete colors so
 * search highlights follow the current theme. These are painted on the xterm
 * canvas (overview ruler) and cannot be CSS `var(--token)`, so we source the
 * theme's resolved hex values and add alpha where a translucent wash is wanted.
 */
function buildSearchDecorations(
	ui: UIColors | undefined,
): ISearchOptions["decorations"] {
	if (!ui) return DEFAULT_SEARCH_DECORATIONS;
	return {
		matchBackground: withAlpha(ui.accent, "66"),
		matchBorder: ui.accent,
		matchOverviewRuler: withAlpha(ui.accent, "7e"),
		activeMatchBackground: withAlpha(ui.accent, "99"),
		activeMatchBorder: ui.primary,
		activeMatchColorOverviewRuler: ui.primary,
	};
}

export function TerminalSearch({
	searchAddon,
	isOpen,
	onClose,
}: TerminalSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [matchCount, setMatchCount] = useState<number | null>(null);
	const [caseSensitive, setCaseSensitive] = useState(false);
	const theme = useTheme();

	const decorations = useMemo(
		() => buildSearchDecorations(theme?.ui),
		[theme?.ui],
	);

	const searchOptions: ISearchOptions = useMemo(
		() => ({
			caseSensitive,
			regex: false,
			decorations,
		}),
		[caseSensitive, decorations],
	);

	// Focus input when search opens
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isOpen]);

	// Clear search highlighting when closing
	useEffect(() => {
		if (!isOpen && searchAddon) {
			searchAddon.clearDecorations();
		}
	}, [isOpen, searchAddon]);

	const handleSearch = useCallback(
		(direction: "next" | "previous") => {
			if (!searchAddon || !query) return;

			const found =
				direction === "next"
					? searchAddon.findNext(query, searchOptions)
					: searchAddon.findPrevious(query, searchOptions);

			// xterm search addon doesn't provide match count directly
			// We just indicate if there are matches or not
			setMatchCount(found ? 1 : 0);
		},
		[searchAddon, query, searchOptions],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newQuery = e.target.value;
		setQuery(newQuery);

		if (searchAddon && newQuery) {
			const found = searchAddon.findNext(newQuery, searchOptions);
			setMatchCount(found ? 1 : 0);
		} else {
			setMatchCount(null);
			searchAddon?.clearDecorations();
		}
	};

	const toggleCaseSensitive = () => {
		setCaseSensitive((prev) => !prev);
	};

	// Re-run search when case sensitivity changes
	useEffect(() => {
		if (searchAddon && query) {
			const found = searchAddon.findNext(query, searchOptions);
			setMatchCount(found ? 1 : 0);
		}
	}, [searchAddon, query, searchOptions]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				handleSearch("previous");
			} else {
				handleSearch("next");
			}
		}
	};

	const handleClose = () => {
		setQuery("");
		setMatchCount(null);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="absolute top-1 right-1 z-10 flex items-center max-w-[calc(100%-0.5rem)] rounded bg-popover/95 pl-2 pr-0.5 shadow-lg ring-1 ring-border/40 backdrop-blur">
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				placeholder="Find"
				className="h-6 min-w-0 w-28 flex-shrink bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			{matchCount === 0 && query && (
				<span className="text-xs text-muted-foreground whitespace-nowrap px-1">
					No results
				</span>
			)}
			<div className="flex items-center shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={toggleCaseSensitive}
							className={`rounded p-1 transition-colors ${
								caseSensitive
									? "bg-primary/20 text-foreground"
									: "text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
							}`}
						>
							<PiTextAa className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Match case</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSearch("previous")}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiChevronUp className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Previous (Shift+Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSearch("next")}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiChevronDown className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Next (Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClose}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiMiniXMark className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Close (Esc)</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
