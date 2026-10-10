/**
 * Minimal grayscale PNG encoding for scanned pages, so they can be sent to a
 * vision model without a native image library. Input pixels come from pdf.js.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export interface GrayImage {
  width: number;
  height: number;
  /** One byte per pixel, 0 = black, 255 = white. */
  pixels: Uint8Array;
}

/**
 * Convert pdf.js image data (1-bit packed, gray, RGB or RGBA) to 8-bit gray.
 * Returns null for layouts we do not recognise.
 */
export function toGray(data: Uint8Array | Uint8ClampedArray, width: number, height: number): GrayImage | null {
  const n = width * height;
  if (!n) return null;
  const out = new Uint8Array(n);
  const channels = data.length / n;
  if (channels === 1) out.set(data);
  else if (channels === 3 || channels === 4) {
    for (let i = 0, j = 0; i < n; i++, j += channels) out[i] = (data[j]! * 299 + data[j + 1]! * 587 + data[j + 2]! * 114) / 1000;
  } else if (data.length === Math.ceil(width / 8) * height) {
    const stride = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = data[y * stride + (x >> 3)]! & (0x80 >> (x & 7)) ? 255 : 0;
  } else return null;
  // Scans are mostly paper. A mostly-dark result means the mask polarity was inverted.
  let sum = 0;
  for (let i = 0; i < n; i += 97) sum += out[i]!;
  if (sum / Math.ceil(n / 97) < 100) for (let i = 0; i < n; i++) out[i] = 255 - out[i]!;
  return { width, height, pixels: out };
}

/** Area-average downscale so the longest side is at most `max` pixels. */
export function downscale(img: GrayImage, max: number): GrayImage {
  const scale = Math.max(img.width, img.height) / max;
  if (scale <= 1) return img;
  const w = Math.max(1, Math.round(img.width / scale));
  const h = Math.max(1, Math.round(img.height / scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * scale), y1 = Math.min(img.height, Math.ceil((y + 1) * scale));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * scale), x1 = Math.min(img.width, Math.ceil((x + 1) * scale));
      let sum = 0, count = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += img.pixels[yy * img.width + xx]!; count++; }
      out[y * w + x] = count ? sum / count : 255;
    }
  }
  return { width: w, height: h, pixels: out };
}

export function encodeGrayPng(img: GrayImage): Buffer {
  const raw = Buffer.alloc((img.width + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width + 1)] = 0; // filter: none
    raw.set(img.pixels.subarray(y * img.width, (y + 1) * img.width), y * (img.width + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}
