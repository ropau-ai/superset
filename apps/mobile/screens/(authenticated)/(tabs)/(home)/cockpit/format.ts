/**
 * Compact "8s" / "3m" / "2h" / "5d" age for dense cockpit rows, where date-fns'
 * prose ("less than a minute ago") costs too much width. `now` is injected so
 * rows re-derive on the cockpit's ticking clock.
 */
export function formatShortAge(from: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - from) / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}
