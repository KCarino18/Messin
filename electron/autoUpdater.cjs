const { app, dialog } = require("electron");

/**
 * Check GitHub Releases for a newer installer on startup.
 * Packaged builds only — never blocks or crashes app launch on failure.
 */
function setupAutoUpdater(getMainWindow) {
  if (!app.isPackaged) {
    return { checkForUpdates() {} };
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    console.error("electron-updater unavailable; skipping auto-update", error);
    return { checkForUpdates() {} };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

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
      setTimeout(() => {
        void autoUpdater.checkForUpdates().catch((error) => {
          console.error("checkForUpdates failed", error);
        });
      }, 8000);
    },
  };
}

module.exports = { setupAutoUpdater };
