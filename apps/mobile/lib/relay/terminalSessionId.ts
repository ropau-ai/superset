// Recompute the host's `deterministicSessionId` on-device, without `node:crypto`
// (Hermes/React Native doesn't expose it). When a terminal/CLI agent — Emilien,
// `claude`, any PTY agent — goes live, the host mirrors it into the synced
// `chat_sessions` table with a *derived* id: `UUIDv5(NAMESPACE, terminalId)`
// (see packages/host-service/.../mirror-terminal-session.ts). A real chat agent
// gets a random id instead. So recomputing that id forward from a live
// `terminalId` is exactly how the mobile client tells a terminal-agent session
// apart from a chat-agent one — and, crucially, how it resolves the `terminalId`
// to write PTY input into (`terminal.writeInput`) when the composer sends.
//
// Must stay byte-for-byte identical to the host helper; a co-located test pins
// the vectors (verified against Node's `crypto` UUIDv5).

// The fixed RFC-4122 namespace the host derives terminal session ids under.
const TERMINAL_SESSION_NAMESPACE = "9e5a3f8c-1b2d-4c6e-8a7f-0d1e2f3a4b5c";

/** Hex string → byte array (two hex chars per byte). */
function hexToBytes(hex: string): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < hex.length; i += 2) {
		bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
	}
	return bytes;
}

/** UTF-8 encode a string to a byte array (terminal ids are ASCII UUIDs). */
function utf8Bytes(str: string): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < str.length; i++) {
		let code = str.charCodeAt(i);
		if (code < 0x80) {
			bytes.push(code);
		} else if (code < 0x800) {
			bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
		} else if (code >= 0xd800 && code <= 0xdbff) {
			// Surrogate pair → single code point.
			const next = str.charCodeAt(i + 1);
			code = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);
			i++;
			bytes.push(
				0xf0 | (code >> 18),
				0x80 | ((code >> 12) & 0x3f),
				0x80 | ((code >> 6) & 0x3f),
				0x80 | (code & 0x3f),
			);
		} else {
			bytes.push(
				0xe0 | (code >> 12),
				0x80 | ((code >> 6) & 0x3f),
				0x80 | (code & 0x3f),
			);
		}
	}
	return bytes;
}

function rotl(value: number, shift: number): number {
	return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** Pure-JS SHA-1 over a byte array → 20-byte digest. */
function sha1(bytes: number[]): number[] {
	const message = bytes.slice();
	const bitLength = message.length * 8;
	message.push(0x80);
	while (message.length % 64 !== 56) message.push(0);
	// 64-bit big-endian length; our inputs are far under 2^32 bits, so the high
	// word is always zero.
	message.push(
		0,
		0,
		0,
		0,
		(bitLength >>> 24) & 0xff,
		(bitLength >>> 16) & 0xff,
		(bitLength >>> 8) & 0xff,
		bitLength & 0xff,
	);

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;

	const w = new Array<number>(80);
	for (let chunk = 0; chunk < message.length; chunk += 64) {
		for (let i = 0; i < 16; i++) {
			const j = chunk + i * 4;
			w[i] =
				((message[j] << 24) |
					(message[j + 1] << 16) |
					(message[j + 2] << 8) |
					message[j + 3]) >>>
				0;
		}
		for (let i = 16; i < 80; i++) {
			w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;

		for (let i = 0; i < 80; i++) {
			let f: number;
			let k: number;
			if (i < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (i < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (i < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8f1bbcdc;
			} else {
				f = b ^ c ^ d;
				k = 0xca62c1d6;
			}
			const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
			e = d;
			d = c;
			c = rotl(b, 30);
			b = a;
			a = temp;
		}

		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
	}

	const out: number[] = [];
	for (const h of [h0, h1, h2, h3, h4]) {
		out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
	}
	return out;
}

/**
 * Deterministic `UUIDv5(TERMINAL_SESSION_NAMESPACE, terminalId)` — the exact id
 * the host stamps on a mirrored terminal-agent `chat_sessions` row. Given a live
 * `terminalId`, this reproduces the session id the mobile Sessions list shows,
 * so the two can be matched without reversing the hash.
 */
export function deterministicSessionId(terminalId: string): string {
	const namespace = hexToBytes(TERMINAL_SESSION_NAMESPACE.replace(/-/g, ""));
	const digest = sha1(namespace.concat(utf8Bytes(terminalId))).slice(0, 16);
	// Stamp version (5) and the RFC-4122 variant, matching the host.
	digest[6] = (digest[6] & 0x0f) | 0x50;
	digest[8] = (digest[8] & 0x3f) | 0x80;
	const hex = digest.map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
