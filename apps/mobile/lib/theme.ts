import {
	DarkTheme,
	DefaultTheme,
	type Theme,
} from "expo-router/react-navigation";

/**
 * Emilien / Ropau signature accent — one warm orange, used for the live pulse,
 * the brand mark, and status accents. Kept as an exact hex constant so brand
 * elements render the precise color inline (SVG fills, animated dots), while the
 * `--color-ember` CSS token (see global.css) backs the `text-ember` / `bg-ember`
 * utility classes for tints. One accent only — no chromatic carnival.
 */
export const EMBER = "#F0653A";
export const EMBER_FOREGROUND = "#FFFFFF";

/**
 * Semantic status palette — the single source of truth for every live-status
 * accent (pulses, dots, badges, avatars) so greens/ambers can never drift into
 * three near-identical shades again. Semantics read the way a cockpit expects:
 * green = healthy / working / live, amber = wants your attention, sky = a
 * neutral "connecting", and a muted grey for dormant. Consumed inline (SVG
 * fills, Reanimated dots) and via `withAlpha` for translucent chrome.
 */
export const STATUS_COLORS = {
	/** Working / healthy / live. */
	live: "#34D399",
	/** Waiting for you / needs attention. */
	waiting: "#FBBF24",
	/** Connecting / informational. */
	info: "#38BDF8",
	/** Idle / dormant. */
	idle: "#71717A",
} as const;

/**
 * GitHub-style diff-stat colors (additions / deletions). A deliberately separate
 * domain from `STATUS_COLORS` — a "+12 −4" stat is a diff convention, not a live
 * agent status, so its green must not track the working/live green.
 */
export const DIFF_COLORS = {
	addition: "#3FB950",
	deletion: "#F85149",
} as const;

/** Translucent variant of a hex color — for status washes and hairline borders. */
export function withAlpha(hex: string, alpha: number): string {
	const h = hex.replace("#", "");
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const THEME = {
	light: {
		background: "hsl(0 0% 100%)",
		foreground: "hsl(0 0% 3.9%)",
		card: "hsl(0 0% 100%)",
		cardForeground: "hsl(0 0% 3.9%)",
		popover: "hsl(0 0% 100%)",
		popoverForeground: "hsl(0 0% 3.9%)",
		primary: "hsl(0 0% 9%)",
		primaryForeground: "hsl(0 0% 98%)",
		secondary: "hsl(0 0% 96.1%)",
		secondaryForeground: "hsl(0 0% 9%)",
		muted: "hsl(0 0% 96.1%)",
		mutedForeground: "hsl(0 0% 45.1%)",
		accent: "hsl(0 0% 96.1%)",
		accentForeground: "hsl(0 0% 9%)",
		destructive: "hsl(0 84.2% 60.2%)",
		ember: "hsl(14 86% 58%)",
		emberForeground: "hsl(0 0% 100%)",
		border: "hsl(0 0% 89.8%)",
		input: "hsl(0 0% 89.8%)",
		ring: "hsl(0 0% 63%)",
		radius: "0.625rem",
		chart1: "hsl(12 76% 61%)",
		chart2: "hsl(173 58% 39%)",
		chart3: "hsl(197 37% 24%)",
		chart4: "hsl(43 74% 66%)",
		chart5: "hsl(27 87% 67%)",
	},
	dark: {
		background: "hsl(0 0% 3.9%)",
		foreground: "hsl(0 0% 98%)",
		// Lifted off `background` (was also 3.9%) so `bg-card` surfaces read as a
		// real elevation in the dark, not a 1px-border trick.
		card: "hsl(0 0% 7%)",
		cardForeground: "hsl(0 0% 98%)",
		popover: "hsl(0 0% 3.9%)",
		popoverForeground: "hsl(0 0% 98%)",
		primary: "hsl(0 0% 98%)",
		primaryForeground: "hsl(0 0% 9%)",
		secondary: "hsl(0 0% 14.9%)",
		secondaryForeground: "hsl(0 0% 98%)",
		muted: "hsl(0 0% 14.9%)",
		mutedForeground: "hsl(0 0% 63.9%)",
		accent: "hsl(0 0% 14.9%)",
		accentForeground: "hsl(0 0% 98%)",
		destructive: "hsl(0 70.9% 59.4%)",
		ember: "hsl(14 86% 58%)",
		emberForeground: "hsl(0 0% 100%)",
		border: "hsl(0 0% 14.9%)",
		input: "hsl(0 0% 14.9%)",
		ring: "hsl(300 0% 45%)",
		radius: "0.625rem",
		chart1: "hsl(220 70% 50%)",
		chart2: "hsl(160 60% 45%)",
		chart3: "hsl(30 80% 55%)",
		chart4: "hsl(280 65% 60%)",
		chart5: "hsl(340 75% 55%)",
	},
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
	light: {
		...DefaultTheme,
		colors: {
			...DefaultTheme.colors,
			background: THEME.light.background,
			border: THEME.light.border,
			card: THEME.light.card,
			notification: THEME.light.destructive,
			primary: THEME.light.primary,
			text: THEME.light.foreground,
		},
	},
	dark: {
		...DarkTheme,
		colors: {
			...DarkTheme.colors,
			background: THEME.dark.background,
			border: THEME.dark.border,
			card: THEME.dark.card,
			notification: THEME.dark.destructive,
			primary: THEME.dark.primary,
			text: THEME.dark.foreground,
		},
	},
};
