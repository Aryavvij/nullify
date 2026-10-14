// Draws the Nullify icon (a "null" sign: white ring, coral slash, dark rounded square)
// and writes PNGs at the sizes Chrome wants. No image libraries: rasterized with
// 4x4 supersampling and encoded by hand.
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const BG = [18, 20, 26];
const RING = [255, 255, 255];
const SLASH = [251, 113, 133];
const SS = 4;

/** Distance from point p to segment ab. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

/** Colour of the icon at unit coordinates (x, y), or null for transparent. */
function shade(x, y, size) {
  if (!insideRoundedSquare(x, y, 0.22)) return null;
  const stroke = size <= 16 ? 0.11 : size <= 32 ? 0.09 : 0.075; // thicker lines stay legible when small
  if (segDist(x, y, 0.27, 0.73, 0.73, 0.27) <= stroke * 0.6) return SLASH;
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d <= 0.3 && d >= 0.3 - stroke) return RING;
  return BG;
}

/**
 * `pad` is transparent margin in pixels on each side. The Chrome Web Store wants
 * the 128 px icon as 96 px of artwork with 16 px of padding; toolbar sizes stay full-bleed.
 */
function render(size, pad = 0) {
  const px = Buffer.alloc(size * size * 4);
  const art = size - 2 * pad;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x - pad + (sx + 0.5) / SS) / art;
          const v = (y - pad + (sy + 0.5) / SS) / art;
          const c = u < 0 || u > 1 || v < 0 || v > 1 ? null : shade(u, v, art);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((255 * a) / (SS * SS));
    }
  }
  return png(size, size, px);
}

// ---- minimal PNG encoder (RGBA, no filtering) ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function makeIcons(outDir) {
  await mkdir(outDir, { recursive: true });
  for (const size of [16, 32, 48]) await writeFile(`${outDir}/icon-${size}.png`, render(size));
  await writeFile(`${outDir}/icon-128.png`, render(128, 16));
}
