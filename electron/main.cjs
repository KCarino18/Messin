const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow = null;
let backend = null;
let unsubscribePreorders = null;

function resourcePath(...parts) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(__dirname, "..", ...parts);
}

function loadBackend() {
  // Keep backend inside app.asar so Node can resolve unpacked native deps
  // from app.asar/node_modules (resources/backend.dist.cjs cannot).
  const candidate = path.join(__dirname, "backend.dist.cjs");
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(candidate);
}

async function initBackend() {
  backend = loadBackend();
  const { fetchPageWithBrowser } = require("./browserFetch.cjs");
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "mtg-budget.db");
  const templateDbPath = resourcePath("template.db");
  await backend.initBackend({
    dbPath,
    templateDbPath,
    pollMs: Number(process.env.PREORDER_POLL_MS || 60_000),
    browserFetch: fetchPageWithBrowser,
  });

  unsubscribePreorders = backend.subscribePreorders((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("preorders:event", payload);
    }
  });
}

function registerIpc() {
  ipcMain.handle("budget:get", async () => backend.getBudget());
  ipcMain.handle("budget:set", async (_e, amountCents) => backend.setBudget(amountCents));
  ipcMain.handle("deals:list", async (_e, budgetCents, sealedTypes = []) =>
    backend.getDeals(budgetCents, sealedTypes),
  );
  ipcMain.handle("products:search", async (_e, q) => backend.searchProducts(q));
  ipcMain.handle("products:offers", async (_e, productId) => backend.getOffers(productId));
  ipcMain.handle("products:roi", async (_e, productId) => backend.getProductRoi(productId));
  ipcMain.handle("preorders:snapshot", async (_e, sealedTypes = []) =>
    backend.getPreorderSnapshot(undefined, sealedTypes),
  );
  ipcMain.handle("shell:openExternal", async (_e, url) => {
    try {
      if (typeof url !== "string") return false;
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      await shell.openExternal(parsed.toString(), { activate: true });
      return true;
    } catch (error) {
      console.error("openExternal failed", url, error);
      return false;
    }
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
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  } else {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
    mainWindow.loadURL(devUrl);
  }
}

async function boot() {
  try {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.mtgbudget.app");
    }
    await initBackend();
    registerIpc();
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
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  unsubscribePreorders?.();
  if (backend?.shutdownBackend) {
    void backend.shutdownBackend();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Keep reference for packaging tools that expect template copy helper
if (!fs.existsSync(path.join(__dirname, "preload.cjs"))) {
  throw new Error("Missing electron preload");
}
