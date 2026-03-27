/**
 * Minimal QR code generator — produces a plain matrix (2D boolean array).
 * Supports alphanumeric + byte mode, error correction level M.
 *
 * Usage:
 *   const { generateQR } = require('./qr')
 *   const matrix = generateQR('https://example.com')   // boolean[][]
 *
 * Limitations: URLs up to ~200 chars work fine. No Kanji.
 *
 * Based on the ISO 18004 spec, simplified for our URL use-case.
 */

'use strict';

// ── Reed-Solomon GF(256) with primitive polynomial x^8+x^4+x^3+x^2+1 ─────────
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function buildGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const factor = [1, GF_EXP[i]];
    const ng = new Array(g.length + factor.length - 1).fill(0);
    for (let j = 0; j < g.length; j++)
      for (let k = 0; k < factor.length; k++)
        ng[j + k] ^= gfMul(g[j], factor[k]);
    g = ng;
  }
  return g;
}

function rsEncode(data, ecCount) {
  const gen = rsGenerator(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef === 0) continue;
    for (let j = 1; j < gen.length; j++) {
      msg[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return msg.slice(data.length);
}

// ── Version/capacity table (versions 1-7, EC level M) ───────────────────────
// [dataCodewords, ecCodewords, blocks]
const VERSION_INFO = [
  null,
  [16,  10, 1],  // 1
  [28,  16, 1],  // 2
  [44,  26, 1],  // 3 — handles ~28 chars alphanumeric, ~17 bytes
  [64,  36, 2],  // 4
  [86,  48, 2],  // 5 — handles ~64 bytes
  [108, 64, 4],  // 6
  [124, 72, 4],  // 7 — handles ~93 bytes
];

// Byte capacity at EC-M for versions 1-7
const BYTE_CAPACITY = [0, 9, 16, 26, 40, 57, 76, 93];

function chooseVersion(byteLen) {
  for (let v = 1; v <= 7; v++) {
    if (byteLen <= BYTE_CAPACITY[v]) return v;
  }
  throw new Error(`URL too long for QR (max ${BYTE_CAPACITY[7]} bytes for this generator)`);
}

// ── Bit stream helpers ────────────────────────────────────────────────────────
class BitBuffer {
  constructor() { this.buf = []; this.len = 0; }
  put(val, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.buf.push(Boolean((val >> i) & 1));
    }
    this.len += length;
  }
  getBytes() {
    const out = [];
    for (let i = 0; i < this.buf.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8 && i + j < this.buf.length; j++) {
        if (this.buf[i + j]) b |= 1 << (7 - j);
      }
      out.push(b);
    }
    return out;
  }
}

// ── Matrix helpers ────────────────────────────────────────────────────────────
function makeMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function setDark(m, row, col, dark) {
  if (row >= 0 && row < m.length && col >= 0 && col < m[0].length) m[row][col] = dark;
}

// Finder pattern (7x7 with separator)
function placeFinder(m, r, c) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const row = r + dr, col = c + dc;
      if (row < 0 || row >= m.length || col < 0 || col >= m[0].length) continue;
      const inOuter = dr >= 0 && dr <= 6 && (dc === 0 || dc === 6);
      const inTop   = dr === 0 && dc >= 0 && dc <= 6;
      const inBot   = dr === 6 && dc >= 0 && dc <= 6;
      const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      const inLeft  = dc === 0 && dr >= 0 && dr <= 6;
      const inRight = dc === 6 && dr >= 0 && dr <= 6;
      setDark(m, row, col, inOuter || inTop || inBot || inLeft || inRight || inInner);
    }
  }
}

// Alignment pattern (5x5)
function placeAlignment(m, r, c) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dark = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
      setDark(m, r + dr, c + dc, dark);
    }
  }
}

// Alignment pattern centers for versions 2-7
const ALIGN_POSITIONS = [
  [], [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38],
];

function isFunction(m, r, c) { return m[r][c] !== null; }

function reserveFormatInfo(m, size) {
  // Reserve format info areas (will be filled after masking)
  const positions = [];
  for (let i = 0; i < 6; i++) positions.push([8, i], [i, 8]);
  positions.push([8, 7], [7, 8], [8, 8]);
  for (let i = size - 7; i < size; i++) positions.push([8, i], [i, 8]);
  for (const [r, c] of positions) {
    if (m[r][c] === null) m[r][c] = false;
  }
  // Dark module
  m[size - 8][8] = true;
}

// ── Format info (EC level M = 0b01, mask pattern) ────────────────────────────
const FORMAT_INFO_EC_M = 0b01;
const FORMAT_MASK_PATTERN = [
  [0b101010000010010, 0b101010000010010],  // handled inline
];

function getFormatBits(mask) {
  // EC level M (01) combined with mask pattern, then XOR 101010000010010
  const data = (FORMAT_INFO_EC_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) ? 0x537 : 0);
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function placeFormatInfo(m, size, mask) {
  const bits = getFormatBits(mask);
  // Around top-left finder
  const pos1 = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  ];
  // Top-right and bottom-left
  const pos2r = [[8,size-1],[8,size-2],[8,size-3],[8,size-4],[8,size-5],[8,size-6],[8,size-7]];
  const pos2c = [[size-7,8],[size-6,8],[size-5,8],[size-4,8],[size-3,8],[size-2,8],[size-1,8]];
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> (14 - i)) & 1;
    if (i < pos1.length) { const [r,c] = pos1[i]; m[r][c] = !!bit; }
  }
  for (let i = 0; i < 7; i++) {
    const bit = (bits >> (14 - i)) & 1;
    const [r1,c1] = pos2r[i]; m[r1][c1] = !!bit;
  }
  for (let i = 0; i < 7; i++) {
    const bit = (bits >> (6 - i)) & 1;
    const [r2,c2] = pos2c[i]; m[r2][c2] = !!bit;
  }
}

// ── Timing patterns ───────────────────────────────────────────────────────────
function placeTiming(m, size) {
  for (let i = 8; i < size - 8; i++) {
    const dark = (i % 2 === 0);
    if (m[6][i] === null) m[6][i] = dark;
    if (m[i][6] === null) m[i][6] = dark;
  }
}

// ── Data placement ────────────────────────────────────────────────────────────
function applyMask(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function placeData(m, size, data, mask) {
  let bitIdx = 0;
  const totalBits = data.length * 8;

  // Zigzag upward columns from right to left, skipping col 6 (timing)
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip timing column
    for (let vert = 0; vert < size; vert++) {
      const row = up ? size - 1 - vert : vert;
      for (let lr = 0; lr < 2; lr++) {
        const col = right - lr;
        if (m[row][col] !== null) continue;
        let bit = false;
        if (bitIdx < totalBits) {
          bit = !!(data[Math.floor(bitIdx / 8)] & (1 << (7 - bitIdx % 8)));
          bitIdx++;
        }
        m[row][col] = bit !== applyMask(mask, row, col);
      }
    }
    up = !up;
  }
}

// ── Penalty scoring ───────────────────────────────────────────────────────────
function penalty(m, size) {
  let p = 0;
  // Rule 1: 5+ consecutive same color in row/col
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c-1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
      else run = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r-1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
      else run = 1;
    }
  }
  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++)
      if (m[r][c] === m[r+1][c] && m[r][c] === m[r][c+1] && m[r][c] === m[r+1][c+1]) p += 3;
  return p;
}

// ── Main entry point ─────────────────────────────────────────────────────────
function generateQR(text) {
  const bytes = Buffer.from(text, 'utf8');
  const byteLen = bytes.length;
  const version = chooseVersion(byteLen);
  const size = version * 4 + 17;
  const [dataWords, ecWords, blocks] = VERSION_INFO[version];

  // Build bit stream
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // byte mode
  bb.put(byteLen, version < 10 ? 8 : 16);
  for (const b of bytes) bb.put(b, 8);
  bb.put(0, 4); // terminator

  // Pad to byte boundary
  while (bb.len % 8 !== 0) bb.put(0, 1);

  // Pad to capacity
  const dataBytes = bb.getBytes();
  const padPatterns = [0xEC, 0x11];
  let pi = 0;
  while (dataBytes.length < dataWords) { dataBytes.push(padPatterns[pi % 2]); pi++; }

  // RS encode
  const ecWordsPerBlock = ecWords / blocks;
  const dataWordsPerBlock = Math.floor(dataWords / blocks);
  const extraBlocks = dataWords % blocks;
  const allData = [], allEC = [];

  let offset = 0;
  for (let b = 0; b < blocks; b++) {
    const bLen = b < blocks - extraBlocks ? dataWordsPerBlock : dataWordsPerBlock + 1;
    const blockData = dataBytes.slice(offset, offset + bLen);
    offset += bLen;
    allData.push(blockData);
    allEC.push(rsEncode(blockData, ecWordsPerBlock));
  }

  // Interleave data
  const finalData = [];
  const maxData = Math.max(...allData.map(b => b.length));
  for (let i = 0; i < maxData; i++) for (const b of allData) if (i < b.length) finalData.push(b[i]);
  for (let i = 0; i < ecWordsPerBlock; i++) for (const b of allEC) finalData.push(b[i]);

  // Try all 8 mask patterns, pick lowest penalty
  let bestMatrix = null, bestPenalty = Infinity, bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const m = makeMatrix(size);

    // Finders
    placeFinder(m, 0, 0);
    placeFinder(m, 0, size - 7);
    placeFinder(m, size - 7, 0);
    placeTiming(m, size);

    // Alignment (versions >= 2)
    if (version >= 2) {
      const ap = ALIGN_POSITIONS[version];
      for (let ai = 0; ai < ap.length; ai++) {
        for (let aj = 0; aj < ap.length; aj++) {
          const r = ap[ai], c = ap[aj];
          // Skip if overlapping finders
          if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 8) || (r >= size - 8 && c <= 8)) continue;
          placeAlignment(m, r, c);
        }
      }
    }

    reserveFormatInfo(m, size);
    placeData(m, size, finalData, mask);
    placeFormatInfo(m, size, mask);

    const p = penalty(m, size);
    if (p < bestPenalty) { bestPenalty = p; bestMatrix = m; bestMask = mask; }
  }

  return bestMatrix;
}

/**
 * Convert a QR matrix to an SVG string.
 * @param {boolean[][]} matrix
 * @param {object} opts
 * @param {number} [opts.size=256] SVG width/height in px
 * @param {string} [opts.dark='#000000']
 * @param {string} [opts.light='#ffffff']
 * @param {number} [opts.quiet=1] quiet zone in modules
 */
function matrixToSVG(matrix, opts = {}) {
  const { size = 256, dark = '#13161f', light = '#ffffff', quiet = 2 } = opts;
  const n = matrix.length + quiet * 2;
  const moduleSize = size / n;

  let rects = '';
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        const x = (c + quiet) * moduleSize;
        const y = (r + quiet) * moduleSize;
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" fill="${dark}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${light}"/>
  ${rects}
</svg>`;
}

module.exports = { generateQR, matrixToSVG };
