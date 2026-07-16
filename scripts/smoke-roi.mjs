#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const tmpDir = join(root, ".tmp-roi-smoke");
const dbPath = join(tmpDir, "roi.db");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execSync("npx prisma generate", { stdio: "inherit", cwd: root });
execSync("node scripts/bundle-electron-backend.mjs", { stdio: "inherit", cwd: root });

const backend = await import(join(root, "electron/backend.dist.cjs"));
await backend.initBackend({
  dbPath,
  templateDbPath: join(tmpDir, "missing.db"),
  pollMs: 60 * 60 * 1000,
});

const roi = await backend.getProductRoi("msh-collector-booster-display");
if (!roi) throw new Error("No ROI payload");
if (!roi.message) throw new Error("Missing ROI message");
if (!roi.roi) throw new Error(`ROI model failed: ${roi.message}`);
if (roi.priceSource !== "tcgplayer") {
  throw new Error(`Expected tcgplayer price source, got ${roi.priceSource}`);
}
if (roi.buyPriceCents < 20000) {
  throw new Error(`Buy price too low to be a collector display: ${roi.buyPriceCents}`);
}
if (roi.roi.breakEvenChancePercent < 0 || roi.roi.breakEvenChancePercent > 100) {
  throw new Error("Break-even % out of range");
}
if (roi.cardCount < 50) {
  throw new Error(`Too few TCGPlayer singles loaded: ${roi.cardCount}`);
}

console.log(roi.message);
console.log(
  `OK ROI (TCGPlayer singles): buy $${(roi.buyPriceCents / 100).toFixed(2)} · EV net $${(roi.roi.expectedNetCents / 100).toFixed(2)} · break-even ${roi.roi.breakEvenChancePercent}% · cards=${roi.cardCount}`,
);

await backend.shutdownBackend();
await new Promise((r) => setTimeout(r, 250));
rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
