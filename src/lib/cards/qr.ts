/* ─────────────────────────────────────────────────────────────
   QR codes for the business cards, with no dependency.

   A compact port of Project Nayuki's QR Code generator (MIT,
   https://www.nayuki.io/page/qr-code-generator-library), cut down
   to what the cards need: UTF-8 text in byte mode, versions 1–40,
   the error-correction level raised as far as the version allows,
   and the mask with the lowest penalty. Runs anywhere (server,
   browser, scripts): the Studio preview draws the same code the
   downloads do.
   ───────────────────────────────────────────────────────────── */

export type QrLevel = "L" | "M" | "Q" | "H";

/** Rows of modules, top to bottom; true = dark. */
export type QrMatrix = boolean[][];

const LEVELS: QrLevel[] = ["L", "M", "Q", "H"];
/** Format bits per level (ISO/IEC 18004 table 12). */
const FORMAT_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

const bitAt = (value: number, i: number) => ((value >>> i) & 1) !== 0;

/* ── Capacity ─────────────────────────────────────────────── */

/** Data + error-correction modules in a version, after the function patterns. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number, level: QrLevel): number {
  const l = LEVELS.indexOf(level);
  return Math.floor(rawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[l][version] * NUM_ERROR_CORRECTION_BLOCKS[l][version];
}

/* ── Reed–Solomon over GF(2^8), polynomial 0x11D ──────────── */

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The error-correction codewords for one block (exported for tests). */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

/* ── The symbol ───────────────────────────────────────────── */

class QrSymbol {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    readonly version: number,
    readonly level: QrLevel,
    data: number[],
  ) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));

    this.drawFunctionPatterns();
    this.drawCodewords(this.addEccAndInterleave(data));

    let best = 0;
    let lowest = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask);
      this.drawFormatBits(mask);
      const penalty = this.penalty();
      if (penalty < lowest) {
        best = mask;
        lowest = penalty;
      }
      this.applyMask(mask); // XOR again: undone
    }
    this.applyMask(best);
    this.drawFormatBits(best);
  }

  private set(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);

    const positions = this.alignmentPositions();
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const corner = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
        if (!corner) this.drawAlignment(positions[i], positions[j]);
      }
    }
    this.drawFormatBits(0); // placeholder, so the modules are reserved
    this.drawVersion();
  }

  private drawFormatBits(mask: number) {
    const { size } = this;
    const data = (FORMAT_BITS[this.level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.set(8, i, bitAt(bits, i));
    this.set(8, 7, bitAt(bits, 6));
    this.set(8, 8, bitAt(bits, 7));
    this.set(7, 8, bitAt(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bitAt(bits, i));

    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bitAt(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bitAt(bits, i));
    this.set(8, size - 8, true); // always dark
  }

  private drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = bitAt(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  private drawFinder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.set(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return [];
    const n = Math.floor(this.version / 7) + 2;
    const step = Math.floor((this.version * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  private addEccAndInterleave(data: number[]): number[] {
    const l = LEVELS.indexOf(this.level);
    const blocksCount = NUM_ERROR_CORRECTION_BLOCKS[l][this.version];
    const eccLength = ECC_CODEWORDS_PER_BLOCK[l][this.version];
    const raw = Math.floor(rawDataModules(this.version) / 8);
    const shortBlocks = blocksCount - (raw % blocksCount);
    const shortLength = Math.floor(raw / blocksCount);

    const blocks: number[][] = [];
    for (let i = 0, k = 0; i < blocksCount; i++) {
      const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
      k += block.length;
      const ecc = rsRemainder(block, eccLength);
      if (i < shortBlocks) block.push(0);
      blocks.push(block.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        // Short blocks carry a padding byte at the end of their data: skip it.
        if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]);
      });
    }
    return result;
  }

  private drawCodewords(data: number[]) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // the vertical timing column
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = bitAt(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /* Penalty rules from the standard: lower reads better. */
  private penalty(): number {
    const { size, modules } = this;
    let result = 0;

    const line = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let color = false;
        let run = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          if (get(a, b) === color) {
            run++;
            if (run === 5) result += PENALTY_N1;
            else if (run > 5) result++;
          } else {
            this.addHistory(run, history);
            if (!color) result += this.countFinderLike(history) * PENALTY_N3;
            color = get(a, b);
            run = 1;
          }
        }
        result += this.terminateAndCount(color, run, history) * PENALTY_N3;
      }
    };
    line((y, x) => modules[y][x]);
    line((x, y) => modules[y][x]);

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += PENALTY_N2;
      }
    }

    let dark = 0;
    for (const row of modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return result + k * PENALTY_N4;
  }

  private countFinderLike(history: number[]): number {
    const n = history[1];
    const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  }

  private terminateAndCount(color: boolean, run: number, history: number[]): number {
    if (color) {
      this.addHistory(run, history);
      run = 0;
    }
    run += this.size;
    this.addHistory(run, history);
    return this.countFinderLike(history);
  }

  private addHistory(run: number, history: number[]) {
    if (history[0] === 0) run += this.size; // the light border before the line
    history.pop();
    history.unshift(run);
  }
}

/* ── Public API ───────────────────────────────────────────── */

/**
 * Encode text (UTF-8, byte mode) as a QR code. `minLevel` is raised to the
 * strongest level that still fits the same version. Throws when the text is
 * too long for version 40 (about 2,300 bytes at level M).
 */
export function encodeQr(text: string, minLevel: QrLevel = "M"): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  const minIndex = LEVELS.indexOf(minLevel);

  let version = 1;
  let usedBits = 0;
  for (; version <= 40; version++) {
    const countBits = version < 10 ? 8 : 16;
    usedBits = 4 + countBits + bytes.length * 8;
    if (bytes.length < 1 << countBits && usedBits <= dataCodewords(version, minLevel) * 8) break;
  }
  if (version > 40) throw new RangeError("Text too long for a QR code");

  let level = minLevel;
  for (let i = minIndex + 1; i < LEVELS.length; i++) {
    if (usedBits <= dataCodewords(version, LEVELS[i]) * 8) level = LEVELS[i];
  }

  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0x4, 4); // byte mode
  append(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) append(byte, 8);

  const capacity = dataCodewords(version, level) * 8;
  append(0, Math.min(4, capacity - bits.length)); // terminator
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

  return new QrSymbol(version, level, data).modules;
}

/**
 * The dark modules as one SVG path in module units (1 module = 1 unit), one
 * horizontal run per segment: few nodes, crisp at any size.
 */
export function qrPath(matrix: QrMatrix): string {
  let d = "";
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}
