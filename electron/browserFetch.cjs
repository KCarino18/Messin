const { BrowserWindow } = require("electron");

/** @type {import('electron').BrowserWindow | null} */
let hiddenWin = null;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
const domainCooldown = new Map();
const COOLDOWN_MS = 2500;

function isBlocked(url, text) {
  return /\/blocked|captcha|access denied|robot check|attention required|unusual traffic|automated access/i.test(
    (url + text).slice(0, 5000),
  );
}

function getWindow() {
  if (hiddenWin && !hiddenWin.isDestroyed()) return hiddenWin;
  hiddenWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  return hiddenWin;
}

/**
 * Load a retailer product page in hidden Chromium and return rendered HTML.
 * Serialized + rate-limited per hostname to reduce bot triggers.
 */
async function fetchPageWithBrowser(url) {
  let host = "unknown";
  try {
    host = new URL(url).hostname;
  } catch {
    return {
      ok: false,
      status: 400,
      url,
      text: "",
      blocked: true,
      blockedReason: "invalid-url",
      viaBrowser: true,
    };
  }

  const last = domainCooldown.get(host) ?? 0;
  const wait = Math.max(0, COOLDOWN_MS - (Date.now() - last));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  domainCooldown.set(host, Date.now());

  return new Promise((resolve) => {
    const win = getWindow();
    const wc = win.webContents;
    const timeoutMs = 28_000;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wc.removeListener("did-finish-load", onLoad);
      wc.removeListener("did-fail-load", onFail);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        status: 408,
        url,
        text: "",
        blocked: true,
        blockedReason: "timeout",
        viaBrowser: true,
      });
    }, timeoutMs);

    const onFail = (_event, code, desc, validatedURL) => {
      finish({
        ok: false,
        status: code,
        url: validatedURL || url,
        text: "",
        blocked: true,
        blockedReason: desc || "load-failed",
        viaBrowser: true,
      });
    };

    const onLoad = async () => {
      try {
        const finalUrl = wc.getURL();
        const html = await wc.executeJavaScript(
          "document.documentElement ? document.documentElement.outerHTML : ''",
        );
        const blocked = isBlocked(finalUrl, html);
        finish({
          ok: !blocked && html.length > 400,
          status: blocked ? 403 : 200,
          url: finalUrl,
          text: html,
          blocked,
          blockedReason: blocked ? "bot-wall" : undefined,
          viaBrowser: true,
        });
      } catch (err) {
        finish({
          ok: false,
          status: 500,
          url,
          text: "",
          blocked: true,
          blockedReason: err instanceof Error ? err.message : String(err),
          viaBrowser: true,
        });
      }
    };

    wc.once("did-finish-load", onLoad);
    wc.once("did-fail-load", onFail);
    wc.loadURL(url).catch((err) => {
      finish({
        ok: false,
        status: 0,
        url,
        text: "",
        blocked: true,
        blockedReason: String(err),
        viaBrowser: true,
      });
    });
  });
}

function fetchPageQueued(url) {
  const run = queue.then(() => fetchPageWithBrowser(url));
  queue = run.catch(() => {});
  return run;
}

module.exports = { fetchPageWithBrowser: fetchPageQueued, isBlocked };
