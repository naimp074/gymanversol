const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x *= 2;
  if (x & 256) x ^= 285;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

const VERSIONS = {
  1: { total: 26, ec: 10, g1: 1, n1: 16, g2: 0, n2: 0, align: [] },
  2: { total: 44, ec: 16, g1: 1, n1: 28, g2: 0, n2: 0, align: [18] },
  3: { total: 70, ec: 26, g1: 1, n1: 44, g2: 0, n2: 0, align: [22] },
  4: { total: 100, ec: 18, g1: 2, n1: 32, g2: 0, n2: 0, align: [26] },
  5: { total: 134, ec: 24, g1: 2, n1: 43, g2: 0, n2: 0, align: [30] },
  6: { total: 172, ec: 16, g1: 4, n1: 27, g2: 0, n2: 0, align: [34] },
  7: { total: 196, ec: 18, g1: 4, n1: 31, g2: 0, n2: 0, align: [22, 38] },
  8: { total: 242, ec: 22, g1: 2, n1: 38, g2: 2, n2: 39, align: [24, 42] },
  9: { total: 292, ec: 22, g1: 3, n1: 36, g2: 2, n2: 37, align: [26, 46] },
  10: { total: 346, ec: 26, g1: 4, n1: 43, g2: 1, n2: 44, align: [28, 50] }
};

function rsPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const a = EXP[i];
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], a);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, degree) {
  const poly = rsPoly(degree);
  const res = data.concat(new Array(degree).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (!factor) continue;
    for (let j = 0; j < poly.length; j++) res[i + j] ^= mul(poly[j], factor);
  }
  return res.slice(data.length);
}

function bitsToBytes(bits) {
  while (bits.length % 8) bits.push(0);
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
    bytes.push(value);
  }
  return bytes;
}

function encodeData(text, version) {
  const spec = VERSIONS[version];
  const capacity = spec.g1 * spec.n1 + spec.g2 * spec.n2;
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [0, 1, 0, 0];
  const lengthBits = version <= 9 ? 8 : 16;
  for (let i = lengthBits - 1; i >= 0; i--) bits.push((bytes.length >> i) & 1);
  for (const value of bytes) for (let i = 7; i >= 0; i--) bits.push((value >> i) & 1);
  const limit = capacity * 8;
  for (let i = 0; i < 4 && bits.length < limit; i++) bits.push(0);
  const data = bitsToBytes(bits);
  const pads = [236, 17];
  let pad = 0;
  while (data.length < capacity) data.push(pads[pad++ % 2]);
  if (data.length > capacity) data.length = capacity;
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < spec.g1; i++) {
    const chunk = data.slice(offset, offset + spec.n1);
    blocks.push({ data: chunk, ec: rsEncode(chunk, spec.ec) });
    offset += spec.n1;
  }
  for (let i = 0; i < spec.g2; i++) {
    const chunk = data.slice(offset, offset + spec.n2);
    blocks.push({ data: chunk, ec: rsEncode(chunk, spec.ec) });
    offset += spec.n2;
  }
  const interleaved = [];
  const maxData = Math.max(spec.n1, spec.n2);
  for (let i = 0; i < maxData; i++) for (const block of blocks) if (i < block.data.length) interleaved.push(block.data[i]);
  for (let i = 0; i < spec.ec; i++) for (const block of blocks) interleaved.push(block.ec[i]);
  return interleaved;
}

function setFinder(grid, size, x, y) {
  for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
    const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
    const ring = inPattern && (dx === 0 || dx === 6 || dy === 0 || dy === 6);
    const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
    grid[yy][xx] = { reserved: true, dark: inPattern && (ring || core) };
  }
}

function setAlignment(grid, size, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = cx + dx, yy = cy + dy;
    if (grid[yy][xx].reserved) return;
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = cx + dx, yy = cy + dy;
    grid[yy][xx] = { reserved: true, dark: Math.max(Math.abs(dx), Math.abs(dy)) !== 1 };
  }
}

function bchFormat(data) {
  let value = data << 10;
  const poly = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (value >> i & 1) value ^= poly << (i - 10);
  return (data << 10 | value) ^ 0b101010000010010;
}

function applyMask(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
  }
}

function penalty(grid, size) {
  let score = 0;
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x <= size; x++) {
      if (x < size && grid[y][x].dark === grid[y][x - 1].dark) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y <= size; y++) {
      if (y < size && grid[y][x].dark === grid[y - 1][x].dark) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const v = grid[y][x].dark;
    if (v === grid[y][x + 1].dark && v === grid[y + 1][x].dark && v === grid[y + 1][x + 1].dark) score += 3;
  }
  const finder = /1011101/;
  const line = arr => arr.map(c => c.dark ? '1' : '0').join('');
  for (let y = 0; y < size; y++) {
    const row = line(grid[y]);
    const col = line(grid.map(r => r[y]));
    for (const text of [row, col]) {
      let idx = text.indexOf('1011101');
      while (idx !== -1) { score += 40; idx = text.indexOf('1011101', idx + 1); }
      void finder;
    }
  }
  let dark = 0;
  for (const row of grid) for (const cell of row) if (cell.dark) dark++;
  score += Math.abs(Math.floor(dark * 100 / (size * size) / 5) - 10) * 10;
  return score;
}

function buildMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= 10) {
    const spec = VERSIONS[version];
    const capacity = spec.g1 * spec.n1 + spec.g2 * spec.n2;
    const header = version <= 9 ? 4 + 8 : 4 + 16;
    if (bytes.length + Math.ceil(header / 8) + 1 <= capacity) break;
    version++;
  }
  if (version > 10) throw new Error('El código QR es demasiado largo.');
  const data = encodeData(text, version);
  const size = 17 + 4 * version;
  const template = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ reserved: false, dark: false })));
  setFinder(template, size, 0, 0);
  setFinder(template, size, size - 7, 0);
  setFinder(template, size, 0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    template[6][i] = { reserved: true, dark: i % 2 === 0 };
    template[i][6] = { reserved: true, dark: i % 2 === 0 };
  }
  const align = [6, ...VERSIONS[version].align];
  for (const y of align) for (const x of align) {
    if ((x === 6 && y === 6) || (x === 6 && y === size - 7) || (y === 6 && x === size - 7)) continue;
    setAlignment(template, size, x, y);
  }
  if (version >= 7) {
    let vbits = version;
    for (let i = 0; i < 12; i++) vbits = vbits << 1 ^ ((vbits >> 11) & 1) * 0x1f25;
    const packed = version << 12 | vbits;
    let bit = 0;
    for (let i = 0; i < 18; i++) {
      const dark = (packed >> i) & 1;
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      template[b][a] = { reserved: true, dark };
      template[a][b] = { reserved: true, dark };
      bit++;
    }
    void bit;
  }
  for (let i = 0; i < 9; i++) {
    if (!template[8][i] || !template[8][i].reserved) template[8][i] = { reserved: true, dark: false };
    if (!template[i][8] || !template[i][8].reserved) template[i][8] = { reserved: true, dark: false };
  }
  for (let i = 0; i < 8; i++) {
    template[8][size - 1 - i] = { reserved: true, dark: false };
    template[size - 1 - i][8] = { reserved: true, dark: false };
  }
  template[size - 8][8] = { reserved: true, dark: true };

  function place(mask) {
    const grid = template.map(row => row.map(cell => ({ ...cell })));
    const bits = [];
    for (const value of data) for (let i = 7; i >= 0; i--) bits.push((value >> i) & 1);
    let bit = 0, up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const y = up ? size - 1 - i : i;
        for (const x of [col, col - 1]) {
          if (grid[y][x].reserved) continue;
          const dark = bit < bits.length ? !!bits[bit++] : false;
          grid[y][x] = { reserved: false, dark: dark ^ applyMask(mask, x, y) };
        }
      }
      up = !up;
    }
    const format = bchFormat((0b00 << 3) | mask);
    const positions = [
      [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
      [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]
    ];
    const other = [
      [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4], [8, size - 5], [8, size - 6], [8, size - 7],
      [size - 8, 8], [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8], [size - 3, 8], [size - 2, 8], [size - 1, 8]
    ];
    for (let i = 0; i < 15; i++) {
      const dark = !!((format >> i) & 1);
      grid[positions[i][1]][positions[i][0]] = { reserved: true, dark };
      grid[other[i][1]][other[i][0]] = { reserved: true, dark };
    }
    grid[size - 8][8] = { reserved: true, dark: true };
    return grid;
  }

  let best = place(0), bestScore = penalty(best, size);
  for (let mask = 1; mask < 8; mask++) {
    const grid = place(mask);
    const score = penalty(grid, size);
    if (score < bestScore) { best = grid; bestScore = score; }
  }
  return best;
}

export function qrSvg(text, size = 168) {
  const grid = buildMatrix(String(text || ''));
  const n = grid.length;
  const quiet = 4;
  const dim = n + quiet * 2;
  let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (grid[y][x].dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" role="img" aria-label="Código QR"><rect width="${dim}" height="${dim}" fill="#fff"/><path fill="#1c1916" d="${path}"/></svg>`;
}
