#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const out = join(root, ".desktop-resources");

function main() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const templateDb = join(root, "prisma", "dev.db");
  if (!existsSync(templateDb)) {
    console.log("Creating seeded template database...");
    execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: root });
    execSync("npm run db:seed", { stdio: "inherit", cwd: root });
  }
  copyFileSync(templateDb, join(out, "template.db"));

  // Ensure generated Prisma client exists for Electron runtime
  execSync("npx prisma generate", { stdio: "inherit", cwd: root });
  execSync("node scripts/bundle-electron-backend.mjs", { stdio: "inherit", cwd: root });
  execSync("npx vite build", { stdio: "inherit", cwd: root });

  console.log(`Desktop resources ready in ${out}`);
}

main();
