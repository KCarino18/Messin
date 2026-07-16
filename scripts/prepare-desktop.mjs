#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, chmodSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import * as tar from "tar";

const root = process.cwd();
const out = join(root, ".desktop-resources");
const platform = process.env.DESKTOP_PLATFORM || process.platform;
const arch = process.env.DESKTOP_ARCH || process.arch;

function nodeDist() {
  const version = "v22.14.0";
  if (platform === "win32") {
    return {
      version,
      url: `https://nodejs.org/dist/${version}/node-${version}-win-x64.zip`,
      kind: "zip",
      binaryRel: `node-${version}-win-x64/node.exe`,
      outName: "node.exe",
    };
  }
  if (platform === "darwin") {
    const a = arch === "arm64" ? "arm64" : "x64";
    return {
      version,
      url: `https://nodejs.org/dist/${version}/node-${version}-darwin-${a}.tar.gz`,
      kind: "targz",
      binaryRel: `node-${version}-darwin-${a}/bin/node`,
      outName: "node",
    };
  }
  const a = arch === "arm64" ? "arm64" : "x64";
  return {
    version,
    url: `https://nodejs.org/dist/${version}/node-${version}-linux-${a}.tar.gz`,
    kind: "targz",
    binaryRel: `node-${version}-linux-${a}/bin/node`,
    outName: "node",
  };
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function extractNode(dist, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const archive = join(cacheDir, dist.kind === "zip" ? "node.zip" : "node.tar.gz");
  if (!existsSync(archive)) {
    console.log(`Downloading Node ${dist.version} for ${platform}/${arch}...`);
    await download(dist.url, archive);
  }

  const extractDir = join(cacheDir, "extract");
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  if (dist.kind === "zip") {
    execSync(`unzip -q "${archive}" -d "${extractDir}"`, { stdio: "inherit" });
  } else {
    await tar.x({ file: archive, cwd: extractDir });
  }

  const binary = join(extractDir, dist.binaryRel);
  if (!existsSync(binary)) {
    throw new Error(`Node binary missing after extract: ${binary}`);
  }
  return binary;
}

function prepareStandalone() {
  const standalone = join(root, ".next", "standalone");
  if (!existsSync(standalone)) {
    throw new Error("Missing .next/standalone — run next build first");
  }

  const serverDir = join(out, "app-server");
  rmSync(serverDir, { recursive: true, force: true });
  mkdirSync(serverDir, { recursive: true });
  cpSync(standalone, serverDir, { recursive: true });

  const staticSrc = join(root, ".next", "static");
  const staticDest = join(serverDir, ".next", "static");
  mkdirSync(join(serverDir, ".next"), { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });

  const publicSrc = join(root, "public");
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, join(serverDir, "public"), { recursive: true });
  }

  // Ensure Prisma generated client is present for runtime
  const generated = join(root, "src", "generated");
  if (existsSync(generated)) {
    mkdirSync(join(serverDir, "src"), { recursive: true });
    cpSync(generated, join(serverDir, "src", "generated"), { recursive: true });
  }
}

async function main() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  console.log("Preparing Next standalone payload...");
  prepareStandalone();

  const templateDb = join(root, "prisma", "dev.db");
  if (!existsSync(templateDb)) {
    console.log("Creating seeded template database...");
    execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: root });
    execSync("npm run db:seed", { stdio: "inherit", cwd: root });
  }
  copyFileSync(join(root, "prisma", "dev.db"), join(out, "template.db"));

  const dist = nodeDist();
  const cacheDir = join(root, ".cache", "node", `${platform}-${arch}-${dist.version}`);
  const nodeBinary = await extractNode(dist, cacheDir);
  const nodeOut = join(out, dist.outName);
  copyFileSync(nodeBinary, nodeOut);
  if (platform !== "win32") {
    chmodSync(nodeOut, 0o755);
  }

  console.log(`Desktop resources ready in ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
