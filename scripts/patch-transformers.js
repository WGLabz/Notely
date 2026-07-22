const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../node_modules/@huggingface/transformers/dist/transformers.node.mjs');
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

let code = fs.readFileSync(filePath, 'utf8');

const targetLF = '    const blob = new Blob([code], { type: "text/javascript" });\n    return URL.createObjectURL(blob);';

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
} else {
  console.log('Target block not found. Already patched?');
}

// Patch onnxruntime-node require in transformers.node.cjs
const cjsFilePath = path.resolve(__dirname, '../node_modules/@huggingface/transformers/dist/transformers.node.cjs');
if (fs.existsSync(cjsFilePath)) {
  let cjsCode = fs.readFileSync(cjsFilePath, 'utf8');
  if (cjsCode.includes('require("onnxruntime-node")')) {
    cjsCode = cjsCode.replace('require("onnxruntime-node")', 'require("onnxruntime-web")');
    fs.writeFileSync(cjsFilePath, cjsCode, 'utf8');
    console.log('Successfully patched onnxruntime-node require in transformers.node.cjs!');
  }
}
