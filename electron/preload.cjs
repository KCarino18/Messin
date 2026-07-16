const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mtgDesktop", {
  getBudget: () => ipcRenderer.invoke("budget:get"),
  setBudget: (amountCents) => ipcRenderer.invoke("budget:set", amountCents),
  getDeals: (budgetCents, sealedTypes = []) =>
    ipcRenderer.invoke("deals:list", budgetCents, sealedTypes),
  searchProducts: (q) => ipcRenderer.invoke("products:search", q),
  getOffers: (productId) => ipcRenderer.invoke("products:offers", productId),
  getProductRoi: (productId) => ipcRenderer.invoke("products:roi", productId),
  getPreorders: (sealedTypes = []) => ipcRenderer.invoke("preorders:snapshot", sealedTypes),
  onPreorder: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("preorders:event", handler);
    return () => ipcRenderer.removeListener("preorders:event", handler);
  },
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
});
