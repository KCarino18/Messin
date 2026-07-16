#!/usr/bin/env node
import * as esbuild from "esbuild";
import path from "node:path";

const root = process.cwd();

await esbuild.build({
  entryPoints: [path.join(root, "electron/backend/entry.ts")],
  outfile: path.join(root, "electron/backend.dist.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  banner: {
    js: "const __import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__import_meta_url",
  },
  external: [
    "electron",
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
  ],
  alias: {
    "@": path.join(root, "src"),
  },
  logLevel: "info",
});

console.log("Bundled electron/backend.dist.cjs");
