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

  const icoBuffer = await pngToIco([pngPath]);
  fs.writeFileSync(icoPath, icoBuffer);

  process.stdout.write(`Created ${path.relative(process.cwd(), pngPath)} and ${path.relative(process.cwd(), icoPath)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
