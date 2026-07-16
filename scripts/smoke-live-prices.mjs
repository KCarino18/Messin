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

const detail = await backend.getOffers("msh-collector-booster-display");
if (!detail) throw new Error("Missing Marvel collector product");
if (detail.mode !== "live") throw new Error(`Expected live mode, got ${detail.mode}`);
if (!detail.offers?.length) throw new Error("No live offers for Marvel collector display");

const retailers = new Set(detail.offers.map((o) => o.retailerId));
console.log(
  "Marvel collector offers:",
  detail.offers.map(
    (o) =>
      `${o.retailerId} $${(o.itemPriceCents / 100).toFixed(2)} ${o.url.slice(0, 70)}`,
  ),
);

if (!retailers.has("tcgplayer") && !retailers.has("card_kingdom") && !retailers.has("gamenerdz")) {
  throw new Error(`Expected a real retailer, got ${[...retailers]}`);
}

for (const offer of detail.offers) {
  if (offer.isDemo) throw new Error("Demo offer leaked into live mode");
  if (!/^https?:\/\//i.test(offer.url)) throw new Error(`Bad offer URL ${offer.url}`);
  if (offer.url.includes("example.com") || offer.url.includes("scam-example")) {
    throw new Error(`Fake URL in live offers: ${offer.url}`);
  }
  // Street collector displays are expensive — reject leftover MSRP-jitter nonsense under $200
  if (offer.itemPriceCents < 20000) {
    throw new Error(
      `Suspiciously low collector price from ${offer.retailerId}: ${offer.itemPriceCents}`,
    );
  }
}

const deals = await backend.getDeals(1_000_000, [
  "play_booster_box",
  "collector_booster_display",
]);
if (deals.mode !== "live") throw new Error("deals not live");
if (!deals.deals.length) throw new Error("no deals");

console.log(
  `OK: ${detail.offers.length} live Marvel collector listings from [${[...retailers].join(", ")}]; ${deals.deals.length} deals under $10k`,
);

await backend.shutdownBackend();
rmSync(tmpDir, { recursive: true, force: true });
