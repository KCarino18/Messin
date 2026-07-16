#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const tmpDir = join(root, ".tmp-live-price-smoke");
const dbPath = join(tmpDir, "live.db");

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

const deals = await backend.getDeals(1_000_000, [
  "play_booster_box",
  "collector_booster_display",
  "bundle",
]);

if (deals.mode !== "live") {
  throw new Error(`Expected live mode, got ${deals.mode}`);
}
if (!deals.deals.length) {
  throw new Error("No deals returned");
}

const mshCollector = deals.deals.find((d) =>
  d.product.id.includes("msh-collector"),
);
const fdnPlay = deals.deals.find((d) => d.product.id === "fdn-play-booster-box");

if (!mshCollector) throw new Error("Missing Marvel collector display deal");
if (!fdnPlay) throw new Error("Missing Foundations play box deal");

const mshItem = mshCollector.offer.itemPriceCents;
const fdnItem = fdnPlay.offer.itemPriceCents;

// Street prices should be nowhere near the old fake ~$250 collector / MSRP jitter.
if (mshItem < 30000) {
  throw new Error(`Marvel collector price too low to be real market: ${mshItem}`);
}
if (fdnItem < 10000 || fdnItem > 25000) {
  throw new Error(`Foundations play price looks wrong: ${fdnItem}`);
}

const hasBoxType = deals.deals.some(
  (d) => d.product.sealedType === "collector_booster_box",
);
if (hasBoxType) {
  throw new Error("collector_booster_box should be gone");
}

console.log(
  `OK live prices: Foundations play $${(fdnItem / 100).toFixed(2)}, Marvel collector $${(mshItem / 100).toFixed(2)}, ${deals.deals.length} deals`,
);

await backend.shutdownBackend();
rmSync(tmpDir, { recursive: true, force: true });
