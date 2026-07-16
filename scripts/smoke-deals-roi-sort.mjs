#!/usr/bin/env node
/**
 * Smoke: under-budget deals are ranked by rip ROI (highest first).
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const tmpDir = join(root, ".tmp-deals-roi-smoke");
const dbPath = join(tmpDir, "deals.db");

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

const { deals } = await backend.getDeals(500_00, [
  "play_booster_box",
  "collector_booster_display",
  "bundle",
]);

if (!Array.isArray(deals) || deals.length === 0) {
  throw new Error("Expected at least one under-budget deal");
}

const withRoi = deals.filter((d) => d.roiPercent != null);
if (withRoi.length === 0) {
  throw new Error("Expected ROI on rippable sealed deals with full set pricing");
}

for (let i = 1; i < withRoi.length; i++) {
  const prev = withRoi[i - 1].roiPercent;
  const cur = withRoi[i].roiPercent;
  if (cur > prev) {
    throw new Error(
      `Deals not sorted by ROI desc: #${i - 1}=${prev}% then #${i}=${cur}%`,
    );
  }
}

// Sparse / unsupported SKUs must sit after ROI-ranked ones.
const firstNull = deals.findIndex((d) => d.roiPercent == null);
const lastRoi = deals.findLastIndex((d) => d.roiPercent != null);
if (firstNull !== -1 && lastRoi !== -1 && firstNull < lastRoi) {
  throw new Error("Null-ROI deals should sort after ROI deals");
}

// Preorder spoiler dumps must not invent top ROI ranks.
const sparseTop = withRoi.find((d) =>
  /hobbit|star trek|reality fracture/i.test(d.product.setName),
);
if (sparseTop) {
  throw new Error(
    `Sparse upcoming set should not have ROI yet: ${sparseTop.product.name}`,
  );
}

console.log(
  `OK deals ROI sort: ${deals.length} deals, top ${withRoi[0].product.name} @ ${withRoi[0].roiPercent}% ROI`,
);
for (const d of deals.slice(0, 5)) {
  console.log(
    `  ${d.roiPercent ?? "n/a"}% · ${d.product.name} · $${(d.offer.totalCents / 100).toFixed(2)}`,
  );
}

await backend.shutdownBackend();
await new Promise((r) => setTimeout(r, 250));
rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
