// Read-only terminal-output helpers for the live stream viewer. We don't run a
// full terminal emulator (no xterm on RN); instead we decode the relay's raw
// PTY bytes to text, drop ANSI control sequences, and fold carriage returns so
// progress spinners render as a single settled line rather than a wall of
// half-drawn frames.

/** Cap on retained scrollback lines so long-running sessions stay bounded. */
export const MAX_TERMINAL_LINES = 2_000;

interface Utf8Decoder {
	decode: (bytes: Uint8Array) => string;
}

/**
 * Streaming UTF-8 decoder that survives multi-byte characters split across
 * WebSocket frames. Prefers the platform `TextDecoder` when Hermes exposes it,
 * otherwise falls back to a hand-rolled decoder that buffers an incomplete
 * trailing sequence until the next chunk completes it.
 */
export function createUtf8Decoder(): Utf8Decoder {
	const TextDecoderCtor = (
		globalThis as {
			TextDecoder?: new (
				label?: string,
				options?: { fatal?: boolean },
			) => {
				decode: (input?: Uint8Array, options?: { stream?: boolean }) => string;
			};
		}
	).TextDecoder;
	if (TextDecoderCtor) {
		const decoder = new TextDecoderCtor("utf-8");
		return { decode: (bytes) => decoder.decode(bytes, { stream: true }) };
	}

	let pending: number[] = [];
	return {
		decode(bytes) {
			const buf = pending.length ? [...pending, ...bytes] : Array.from(bytes);
			pending = [];
			let out = "";
			let i = 0;
			while (i < buf.length) {
				const byte = buf[i];
				let codePoint: number;
				let size: number;
				if (byte < 0x80) {
					codePoint = byte;
					size = 1;
				} else if (byte >= 0xc0 && byte < 0xe0) {
					codePoint = byte & 0x1f;
					size = 2;
				} else if (byte >= 0xe0 && byte < 0xf0) {
					codePoint = byte & 0x0f;
					size = 3;
				} else if (byte >= 0xf0) {
					codePoint = byte & 0x07;
					size = 4;
				} else {
					// Stray continuation byte — emit replacement char and move on.
					out += "�";
					i += 1;
					continue;
				}
				if (i + size > buf.length) {
					pending = buf.slice(i);
					break;
				}
				for (let j = 1; j < size; j++) {
					codePoint = (codePoint << 6) | (buf[i + j] & 0x3f);
				}
				out += String.fromCodePoint(codePoint);
				i += size;
			}
			return out;
		},
	};
}

const ESC = String.fromCharCode(0x1b);
const CSI = String.fromCharCode(0x9b);
const BEL = String.fromCharCode(0x07);

// Canonical `ansi-regex` matcher, assembled from char codes so the source holds
// no literal control bytes: CSI color/cursor sequences plus OSC window-title
// writes all disappear from the rendered text.
const ANSI_PATTERN = new RegExp(
	`[${ESC}${CSI}][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?${BEL})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))`,
	"g",
);

/** Drop non-printable C0/C1 control bytes, keeping tab. */
function stripControls(line: string): string {
	let out = "";
	for (const ch of line) {
		const code = ch.charCodeAt(0);
		if (
			code === 0x09 ||
			(code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f))
		) {
			out += ch;
		}
	}
	return out;
}

function cleanLine(line: string): string {
	// Fold carriage returns: a `\r` returns the cursor to column 0, so the text
	// after the final `\r` is what the user actually sees.
	const folded = line.includes("\r") ? (line.split("\r").pop() ?? "") : line;
	return stripControls(folded);
}

/**
 * Append a freshly received chunk to the retained line buffer. The final entry
 * of `lines` is the in-progress line (no trailing newline); it is combined with
 * the chunk so writes that don't end in a newline keep building the same line.
 */
export function appendTerminalChunk(
	lines: string[],
	rawChunk: string,
): string[] {
	// Strip ANSI, then normalize CRLF to LF so `\r\n` line endings become real
	// line breaks — only a *lone* `\r` (progress-bar redraw) is folded below.
	const chunk = rawChunk.replace(ANSI_PATTERN, "").replace(/\r\n/g, "\n");
	if (!chunk) return lines;

	const next = lines.length ? lines.slice(0, -1) : [];
	const current = lines.length ? lines[lines.length - 1] : "";
	const parts = (current + chunk).split("\n");
	for (let i = 0; i < parts.length; i++) {
		next.push(cleanLine(parts[i]));
	}

	if (next.length > MAX_TERMINAL_LINES) {
		return next.slice(next.length - MAX_TERMINAL_LINES);
	}
	return next;
}
