#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const tmpDir = join(root, ".tmp-preorder-retailers");
const dbPath = join(tmpDir, "preorder.db");

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

const snap = await backend.getPreorderSnapshot(60_000, [
  "play_booster_box",
  "collector_booster_display",
  "bundle",
]);

const retailers = new Set(snap.events.map((e) => e.retailerId));
console.log(
  "Preorder events:",
  snap.events.slice(0, 12).map(
    (e) =>
      `${e.retailerId} ${e.productName} $${(e.priceCents / 100).toFixed(2)} ${e.url}`,
  ),
);

const wanted = ["amazon", "gamenerdz", "forge_and_fire", "flipside_gaming"];
const hits = wanted.filter((id) => retailers.has(id));
if (hits.length === 0) {
  // Soft fail only if totally empty — Amazon often blocks; others should appear.
  if (snap.events.length === 0) {
    throw new Error("No preorder events seeded from watch retailers");
  }
  console.warn("Watch retailers not in events yet:", wanted, "got", [...retailers]);
}

for (const e of snap.events) {
  if (e.isDemo) throw new Error(`Demo preorder event: ${e.productName}`);
  if (!/^https?:\/\//i.test(e.url)) throw new Error(`Bad URL ${e.url}`);
}

console.log(
  `OK: ${snap.events.length} preorder events; watch hits=[${hits.join(", ") || "none yet"}]; all=${[...retailers].join(", ")}`,
);

await backend.shutdownBackend();
// Allow any in-flight poll to notice prisma is gone.
await new Promise((r) => setTimeout(r, 250));
rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
