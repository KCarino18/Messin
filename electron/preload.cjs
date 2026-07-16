const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mtgDesktop", {
  getBudget: () => ipcRenderer.invoke("budget:get"),
  setBudget: (amountCents) => ipcRenderer.invoke("budget:set", amountCents),
  getDeals: (budgetCents) => ipcRenderer.invoke("deals:list", budgetCents),
  searchProducts: (q) => ipcRenderer.invoke("products:search", q),
  getOffers: (productId) => ipcRenderer.invoke("products:offers", productId),
  getPreorders: () => ipcRenderer.invoke("preorders:snapshot"),
  onPreorder: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("preorders:event", handler);
    return () => ipcRenderer.removeListener("preorders:event", handler);
  },
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
});
