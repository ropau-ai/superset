// Generates the Emilien brand icons (app icon, Android adaptive foreground,
// splash mark, web favicon) as PNGs — the raster twin of `EmilienLogo`.
//
// Runs with zero third-party deps (no `sharp`/`rsvg`): it rasterizes the
// "orbital point" mark analytically (anti-aliased signed-distance coverage) into
// an RGBA buffer and encodes a valid PNG with `node:zlib`. Re-run after tweaking
// the mark:  `node apps/mobile/scripts/generate-icons.mjs`
//
// Keep the geometry in sync with components/EmilienLogo/EmilienLogo.tsx.

import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const EMBER = { r: 240, g: 101, b: 58 }; // #F0653A
const DARK = { r: 11, g: 11, b: 15 }; // #0B0B0F

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

// --- tiny RGBA canvas with analytic anti-aliasing -------------------------

function createCanvas(w, h) {
	return { w, h, data: new Float64Array(w * h * 4) }; // straight alpha, 0..1
}

function fill(canvas, { r, g, b }) {
	const { data } = canvas;
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r / 255;
		data[i + 1] = g / 255;
		data[i + 2] = b / 255;
		data[i + 3] = 1;
	}
}

/** Composite `color` at `coverage` (0..1) over the existing pixel (source-over). */
function blend(canvas, x, y, { r, g, b }, coverage) {
	if (coverage <= 0) return;
	const i = (y * canvas.w + x) * 4;
	const d = canvas.data;
	const sa = coverage;
	const ea = d[i + 3];
	const oa = sa + ea * (1 - sa);
	if (oa <= 0) return;
	d[i] = (r / 255) * sa + d[i] * ea * (1 - sa);
	d[i + 1] = (g / 255) * sa + d[i + 1] * ea * (1 - sa);
	d[i + 2] = (b / 255) * sa + d[i + 2] * ea * (1 - sa);
	// The channels above are premultiplied by their own alpha share; normalize.
	d[i] /= oa;
	d[i + 1] /= oa;
	d[i + 2] /= oa;
	d[i + 3] = oa;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function disc(canvas, cx, cy, radius, color) {
	const x0 = Math.max(0, Math.floor(cx - radius - 1));
	const x1 = Math.min(canvas.w - 1, Math.ceil(cx + radius + 1));
	const y0 = Math.max(0, Math.floor(cy - radius - 1));
	const y1 = Math.min(canvas.h - 1, Math.ceil(cy + radius + 1));
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
			blend(canvas, x, y, color, clamp01(radius + 0.5 - d));
		}
	}
}

function ring(canvas, cx, cy, radius, halfWidth, color, alpha = 1) {
	const outer = radius + halfWidth;
	const x0 = Math.max(0, Math.floor(cx - outer - 1));
	const x1 = Math.min(canvas.w - 1, Math.ceil(cx + outer + 1));
	const y0 = Math.max(0, Math.floor(cy - outer - 1));
	const y1 = Math.min(canvas.h - 1, Math.ceil(cy + outer + 1));
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
			const cov = clamp01(halfWidth - Math.abs(d - radius) + 0.5) * alpha;
			blend(canvas, x, y, color, cov);
		}
	}
}

/** Paints the orbital mark centered in the canvas; `R` is the orbit radius. */
function drawMark(canvas, R, moat) {
	const cx = canvas.w / 2;
	const cy = canvas.h / 2;
	const satX = cx + R * Math.SQRT1_2;
	const satY = cy - R * Math.SQRT1_2;
	const satR = R * 0.165;

	ring(canvas, cx, cy, R, R * 0.075, EMBER, 0.5);
	disc(canvas, cx, cy, R * 0.4, EMBER);
	if (moat) disc(canvas, satX, satY, satR + R * 0.05, moat);
	disc(canvas, satX, satY, satR, EMBER);
}

// --- PNG encode (truecolor + alpha, 8-bit) --------------------------------

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(canvas) {
	const { w, h, data } = canvas;
	// Filter byte (0 = none) per scanline, then 8-bit RGBA samples.
	const raw = Buffer.alloc(h * (1 + w * 4));
	let p = 0;
	for (let y = 0; y < h; y++) {
		raw[p++] = 0;
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			raw[p++] = Math.round(clamp01(data[i]) * 255);
			raw[p++] = Math.round(clamp01(data[i + 1]) * 255);
			raw[p++] = Math.round(clamp01(data[i + 2]) * 255);
			raw[p++] = Math.round(clamp01(data[i + 3]) * 255);
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: truecolor + alpha
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// --- render the four assets ----------------------------------------------

function render(size, { R, background, moat }) {
	const canvas = createCanvas(size, size);
	if (background) fill(canvas, background);
	drawMark(canvas, (size / 1024) * R, moat ?? null);
	return encodePNG(canvas);
}

const targets = [
	// Full-bleed springboard icon on brand dark.
	["icon.png", 1024, { R: 300, background: DARK, moat: DARK }],
	// Android adaptive foreground: transparent, mark inside the ~66% safe zone.
	["adaptive-icon.png", 1024, { R: 235, background: null, moat: null }],
	// Splash mark: transparent + extra padding for `resizeMode: contain`.
	["splash-icon.png", 1024, { R: 205, background: null, moat: null }],
	// Web favicon.
	["favicon.png", 256, { R: 300, background: DARK, moat: DARK }],
];

for (const [name, size, opts] of targets) {
	const png = render(size, opts);
	writeFileSync(join(ASSETS, name), png);
	console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
