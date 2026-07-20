const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

/**
 * Check GitHub Releases for a newer installer on startup.
 * Packaged builds only — dev mode skips updates.
 */
function setupAutoUpdater(getMainWindow) {
  if (!app.isPackaged) {
    return { checkForUpdates() {} };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;

  const send = (payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("updater:event", payload);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    send({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send({ status: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send({ status: "idle" });
  });

  autoUpdater.on("download-progress", (progress) => {
    send({
      status: "downloading",
      version: progress.version,
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send({ status: "ready", version: info.version });
    const win = getMainWindow();
    void dialog
      .showMessageBox(win ?? undefined, {
        type: "info",
        title: "Update ready",
        message: `MTG Budget ${info.version} downloaded.`,
        detail: "Restart now to install the update.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
      });
  });

  autoUpdater.on("error", (error) => {
    console.error("Auto-update error", error);
    send({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  });

  return {
    checkForUpdates() {
      // Defer slightly so the window can paint before the network call.
      setTimeout(() => {
        void autoUpdater.checkForUpdates().catch((error) => {
          console.error("checkForUpdates failed", error);
        });
      }, 2500);
    },
  };
}

module.exports = { setupAutoUpdater };
