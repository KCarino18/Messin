const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.MTG_BUDGET_PORT || 4310);
const HOST = "127.0.0.1";

let serverProcess = null;
let mainWindow = null;

function resourcesRoot() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, "..", ".desktop-resources");
}

function ensureUserDatabase() {
  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  const targetDb = path.join(userData, "mtg-budget.db");
  const templateDb = path.join(resourcesRoot(), "template.db");

  if (!fs.existsSync(targetDb) && fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, targetDb);
  }

  return targetDb;
}

function resolveNodeBinary() {
  const packaged = path.join(
    resourcesRoot(),
    process.platform === "win32" ? "node.exe" : "node",
  );
  if (fs.existsSync(packaged)) {
    return packaged;
  }
  return process.platform === "win32" ? "node.exe" : "node";
}

function startNextServer() {
  const root = resourcesRoot();
  const serverDir = path.join(root, "app-server");
  const serverEntry = path.join(serverDir, "server.js");
  const dbPath = ensureUserDatabase();

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Missing packaged server at ${serverEntry}`);
  }

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: HOST,
    DATABASE_URL: `file:${dbPath}`,
    PREORDER_POLL_MS: process.env.PREORDER_POLL_MS || "60000",
    TAX_RATE: process.env.TAX_RATE || "0.08",
    PRICE_MODE: process.env.PRICE_MODE || "demo",
  };

  const nodeBin = resolveNodeBinary();
  serverProcess = spawn(nodeBin, ["server.js"], {
    cwd: serverDir,
    env,
    stdio: "inherit",
    windowsHide: true,
  });

  serverProcess.on("exit", (code) => {
    if (code && code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        "MTG Budget",
        `The app server stopped unexpectedly (code ${code}).`,
      );
      app.quit();
    }
  });
}

function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(`http://${HOST}:${PORT}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Timed out waiting for MTG Budget server"));
          return;
        }
        setTimeout(ping, 300);
      });
    };
    ping();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "MTG Budget",
    backgroundColor: "#0b1210",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

async function boot() {
  try {
    startNextServer();
    await waitForServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox(
      "MTG Budget failed to start",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  }
}

app.whenReady().then(() => {
  void boot();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void boot();
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
