import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("node_modules/mermaid")) return "vendor-mermaid";
          if (id.includes("node_modules/@xyflow") || id.includes("node_modules/cytoscape")) return "vendor-graph";
          if (id.includes("node_modules/pdfjs-dist")) return "vendor-pdf";
          if (id.includes("node_modules/@xterm") || id.includes("node_modules/xterm")) return "vendor-terminal";
          if (id.includes("node_modules/@uiw/react-codemirror") || id.includes("node_modules/@codemirror")) return "vendor-editor";
          if (id.includes("node_modules/katex")) return "vendor-katex";
          if (id.includes("node_modules/remark") || id.includes("node_modules/unist") || id.includes("node_modules/mdast")) return "vendor-markdown-tools";
        }
      }
    }
  }
});
