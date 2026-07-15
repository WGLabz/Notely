const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const pngToIco = require("png-to-ico");

const size = 256;
const outDir = path.join(process.cwd(), "build");
const pngPath = path.join(outDir, "icon.png");
const icoPath = path.join(outDir, "icon.ico");
const iconSourcePath = process.env.NOTELY_ICON_SOURCE
  ? path.resolve(process.cwd(), process.env.NOTELY_ICON_SOURCE)
  : "";

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawRoundedRect(png, x, y, w, h, r, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const rx = px < x + r ? x + r - px : px > x + w - r - 1 ? px - (x + w - r - 1) : 0;
      const ry = py < y + r ? y + r - py : py > y + h - r - 1 ? py - (y + h - r - 1) : 0;
      if (rx * rx + ry * ry <= r * r) {
        const idx = (py * png.width + px) << 2;
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = color.a;
      }
    }
  }
}

function drawN(png, color) {
  const leftX = 78;
  const rightX = 154;
  const topY = 70;
  const barW = 22;
  const barH = 116;

  drawRoundedRect(png, leftX, topY, barW, barH, 8, color);
  drawRoundedRect(png, rightX, topY, barW, barH, 8, color);

  for (let i = 0; i < 110; i++) {
    const x = leftX + 10 + Math.floor((i * 78) / 110);
    const y = topY + 3 + i;
    drawRoundedRect(png, x, y, 14, 14, 5, color);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  if (iconSourcePath) {
    if (!fs.existsSync(iconSourcePath)) {
      throw new Error(`Custom icon source not found: ${path.relative(process.cwd(), iconSourcePath)}`);
    }
    fs.copyFileSync(iconSourcePath, pngPath);
    process.stdout.write(`Copied icon source ${path.relative(process.cwd(), iconSourcePath)} -> ${path.relative(process.cwd(), pngPath)}\n`);
  }

  if (!fs.existsSync(pngPath)) {
    process.stdout.write("No custom icon found. Generating fallback icon at build/icon.png\n");

    const png = new PNG({ width: size, height: size });

    for (let y = 0; y < size; y++) {
      const t = y / (size - 1);
      const r = clamp(Math.round(lerp(33, 15, t)));
      const g = clamp(Math.round(lerp(93, 69, t)));
      const b = clamp(Math.round(lerp(107, 93, t)));

      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) << 2;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }

    drawRoundedRect(png, 32, 32, 192, 192, 36, { r: 19, g: 35, b: 38, a: 220 });
    drawN(png, { r: 241, g: 234, b: 214, a: 255 });

    fs.writeFileSync(pngPath, PNG.sync.write(png));
  } else {
    process.stdout.write(`Using existing icon asset ${path.relative(process.cwd(), pngPath)}\n`);
  }

  // Build a proper multi-size ICO: Windows needs 16, 32, 48, and 256px sizes
  // for correct display in Explorer, taskbar, shortcuts, and the Start Menu.
  const src = PNG.sync.read(fs.readFileSync(pngPath));
  const sizes = [16, 32, 48, 256];
  const resizedPaths = [];

  for (const s of sizes) {
    if (s === 256 && src.width === 256 && src.height === 256) {
      resizedPaths.push(pngPath);
      continue;
    }
    const dst = new PNG({ width: s, height: s });
    const scale = src.width / s;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const sx = Math.min(Math.floor(dx * scale), src.width - 1);
        const sy = Math.min(Math.floor(dy * scale), src.height - 1);
        const si = (sy * src.width + sx) << 2;
        const di = (dy * s + dx) << 2;
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = src.data[si + 3];
      }
    }
    const tmpPath = path.join(outDir, `icon-${s}.png`);
    fs.writeFileSync(tmpPath, PNG.sync.write(dst));
    resizedPaths.push(tmpPath);
  }

  const icoBuffer = await pngToIco(resizedPaths);
  fs.writeFileSync(icoPath, icoBuffer);

  // Clean up temp sized PNGs
  for (const p of resizedPaths) {
    if (p !== pngPath) fs.unlinkSync(p);
  }

  process.stdout.write(`Created ${path.relative(process.cwd(), pngPath)} and ${path.relative(process.cwd(), icoPath)} (${sizes.join(", ")}px)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
