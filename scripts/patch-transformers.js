const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../node_modules/@huggingface/transformers/dist/transformers.node.mjs');
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

let code = fs.readFileSync(filePath, 'utf8');

const targetLF = '    const blob = new Blob([code], { type: "text/javascript" });\n    return URL.createObjectURL(blob);';
const targetCRLF = '    const blob = new Blob([code], { type: "text/javascript" });\r\n    return URL.createObjectURL(blob);';

const replacement = `    const fsMod = await import("fs");
    const pathMod = await import("path");
    const osMod = await import("os");
    const urlMod = await import("url");
    const tempDir = pathMod.join(osMod.tmpdir() || ".", "notely-wasm");
    if (!fsMod.existsSync(tempDir)) {
      fsMod.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = pathMod.join(tempDir, pathMod.basename(libURL));
    fsMod.writeFileSync(tempPath, code, "utf8");
    return urlMod.pathToFileURL(tempPath).toString();`;

if (code.includes(targetLF)) {
  code = code.replace(targetLF, replacement);
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Successfully patched loadWasmFactory in transformers.node.mjs (LF)!');
} else if (code.includes(targetCRLF)) {
  code = code.replace(targetCRLF, replacement);
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Successfully patched loadWasmFactory in transformers.node.mjs (CRLF)!');
} else {
  console.log('Target block not found. Already patched?');
}
