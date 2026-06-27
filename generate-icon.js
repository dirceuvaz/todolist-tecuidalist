const fs = require('fs');
const zlib = require('zlib');

const SIZES = [256, 128, 64, 48, 32, 24, 16];
const BG = [0x00, 0x33, 0x99, 0xFF];
const FG = [0xFF, 0xFF, 0xFF, 0xFF];

function makeRaw(size) {
  const raw = Buffer.alloc(size * size * 4, 0);

  function px(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const off = (y * size + x) * 4;
    raw[off] = b; raw[off+1] = g; raw[off+2] = r; raw[off+3] = a;
  }

  function rect(x1, y1, x2, y2, r, g, b, a) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        px(x, y, r, g, b, a);
  }

  function chr(pixels, ox, oy, s, r, g, b, a) {
    for (let row = 0; row < pixels.length; row++)
      for (let col = 0; col < pixels[row].length; col++)
        if (pixels[row][col])
          rect(ox + col*s, oy + row*s, ox + col*s + s-1, oy + row*s + s-1, r, g, b, a);
  }

  rect(0, 0, size-1, size-1, BG[0], BG[1], BG[2], BG[3]);

  const glyphs = [
    {
      data: [
        [1,1,1,1,1,1,1],
        [0,1,1,1,1,1,0],
        [0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0]
      ]
    },
    {
      data: [
        [0,1,1,1,1,1,0],
        [1,1,1,1,1,1,1],
        [1,1,0,0,0,0,1],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,1],
        [1,1,1,1,1,1,1],
        [0,1,1,1,1,1,0]
      ]
    },
    {
      data: [
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0],
        [1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1]
      ]
    }
  ];

  const s = Math.max(1, Math.floor(size / (glyphs[0].data[0].length * 4 + 18)));
  const cw = glyphs[0].data[0].length * s;
  const sp = Math.max(4, Math.floor(size * 0.09));
  const tw = cw * 3 + sp * 2;
  const sx = Math.floor((size - tw) / 2);
  const sy = Math.floor((size - glyphs[0].data.length * s) / 2);

  glyphs.forEach((g, i) => chr(g.data, sx + (cw + sp) * i, sy, s, FG[0], FG[1], FG[2], FG[3]));

  const bmp = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    raw.slice(y * size * 4, (y + 1) * size * 4).copy(bmp, (size - 1 - y) * size * 4);
  return bmp;
}

function makeBmp(size, pixels) {
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0);
  hdr.writeUInt32LE(size, 4);
  hdr.writeUInt32LE(size * 2, 8);
  hdr.writeUInt16LE(1, 12);
  hdr.writeUInt16LE(32, 14);
  hdr.writeUInt32LE(0, 16);
  hdr.writeUInt32LE(size * size * 4, 20);
  hdr.writeUInt32LE(0, 24);
  hdr.writeUInt32LE(0, 28);
  hdr.writeUInt32LE(0, 32);
  hdr.writeUInt32LE(0, 36);
  return Buffer.concat([hdr, pixels]);
}

function makePng(size, pixels) {
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rows[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const so = (y * size + x) * 4;
      const do_ = y * (1 + size * 4) + 1 + x * 4;
      rows[do_] = pixels[so + 2];
      rows[do_+1] = pixels[so + 1];
      rows[do_+2] = pixels[so];
      rows[do_+3] = pixels[so + 3];
    }
  }
  const comp = zlib.deflateSync(rows);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const tb = Buffer.from(t, 'ascii'); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([tb, d]))); return Buffer.concat([l, tb, d, cc]); };
  return Buffer.concat([sig, ch('IHDR', ihdr), ch('IDAT', comp), ch('IEND', Buffer.alloc(0))]);
}

const entries = [];
const data = [];
let offset = 6 + SIZES.length * 16;

for (const size of SIZES) {
  const raw = makeRaw(size);
  const img = size <= 32 ? makeBmp(size, raw) : makePng(size, raw);
  const e = Buffer.alloc(16);
  e[0] = size >= 256 ? 0 : size;
  e[1] = size >= 256 ? 0 : size;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  data.push(img);
  offset += img.length;
}

const hdr = Buffer.alloc(6);
hdr.writeUInt16LE(0, 0);
hdr.writeUInt16LE(1, 2);
hdr.writeUInt16LE(SIZES.length, 4);

fs.writeFileSync('icon.ico', Buffer.concat([hdr, ...entries, ...data]));
console.log('icon.ico: ' + SIZES.join(', ') + ' (' + offset + ' bytes)');

fs.writeFileSync('icon.png', makePng(256, makeRaw(256)));
console.log('icon.png: 256x256');
