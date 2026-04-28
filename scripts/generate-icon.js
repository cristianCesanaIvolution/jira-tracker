// Genera tray-icon.png (32x32) e tray-icon@2x.png (64x64) — un timer stilizzato.
// Nessuna dipendenza esterna: PNG encoder minimale via zlib+crc32 built-in.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function drawTimer(size) {
  const buf = Buffer.alloc(size * size * 4); // initialized to 0 = transparent
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2 + size * 0.04;
  const r = size * 0.42;
  const ringThickness = Math.max(1, size * 0.10);

  const setPx = (x, y, r8, g8, b8, a8) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (Math.floor(y) * size + Math.floor(x)) * 4;
    // simple alpha-over (over white-transparent bg = transparent)
    const a = a8 / 255;
    const ia = 1 - a;
    buf[i]     = Math.round(buf[i]     * ia + r8 * a);
    buf[i + 1] = Math.round(buf[i + 1] * ia + g8 * a);
    buf[i + 2] = Math.round(buf[i + 2] * ia + b8 * a);
    buf[i + 3] = Math.min(255, buf[i + 3] + a8);
  };

  // colors
  const BLUE = [38, 132, 255];   // #2684ff
  const DARK = [9, 30, 66];      // #091e42
  const WHITE = [255, 255, 255];

  // filled circle (blue) + button on top
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r) {
        // anti-alias edge
        const edge = r - d;
        const a = edge >= 1 ? 255 : Math.max(0, Math.round(edge * 255));
        setPx(x, y, BLUE[0], BLUE[1], BLUE[2], a);
      }
    }
  }

  // top "stem" (small rectangle above circle)
  const stemW = Math.max(1, Math.round(size * 0.18));
  const stemH = Math.max(1, Math.round(size * 0.10));
  for (let y = 0; y < stemH; y++) {
    for (let x = 0; x < stemW; x++) {
      setPx(Math.round(cx) - Math.floor(stemW / 2) + x, Math.round(cy - r - stemH) + y, BLUE[0], BLUE[1], BLUE[2], 255);
    }
  }

  // clock hands (white): hour hand vertical short, minute hand to ~2 o'clock
  const drawLine = (x0, y0, x1, y1, color, width) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const w = Math.max(1, width);
      for (let oy = -Math.floor(w / 2); oy <= Math.floor(w / 2); oy++) {
        for (let ox = -Math.floor(w / 2); ox <= Math.floor(w / 2); ox++) {
          setPx(Math.round(x + ox), Math.round(y + oy), color[0], color[1], color[2], 255);
        }
      }
    }
  };

  // hour hand (up)
  drawLine(cx, cy, cx, cy - r * 0.55, WHITE, Math.max(1, Math.round(size * 0.08)));
  // minute hand (to ~2 o'clock)
  drawLine(cx, cy, cx + r * 0.55, cy - r * 0.30, WHITE, Math.max(1, Math.round(size * 0.07)));

  // center dot
  const dotR = Math.max(1, size * 0.06);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= dotR * dotR) setPx(x, y, WHITE[0], WHITE[1], WHITE[2], 255);
    }
  }

  return buf;
}

function writeIcon(size, outPath) {
  const rgba = drawTimer(size);
  const png = encodePng(size, size, rgba);
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${size}x${size}, ${png.length} bytes)`);
}

const outDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

writeIcon(16, path.join(outDir, 'tray-icon.png'));
writeIcon(32, path.join(outDir, 'tray-icon@2x.png'));
writeIcon(256, path.join(outDir, 'app-icon.png'));
