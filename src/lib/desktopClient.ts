export type DesktopApi = {
  getBudget: () => Promise<{ amountCents: number }>;
  setBudget: (amountCents: number) => Promise<{ amountCents: number }>;
  getDeals: (budgetCents: number) => Promise<{
    budgetCents: number;
    deals: unknown[];
    mode: string;
  }>;
  searchProducts: (q: string) => Promise<{ products: unknown[] }>;
  getOffers: (productId: string) => Promise<unknown>;
  getPreorders: () => Promise<unknown>;
  onPreorder: (callback: (payload: unknown) => void) => () => void;
  openExternal: (url: string) => Promise<boolean>;
};

declare global {
  interface Window {
    mtgDesktop?: DesktopApi;
  }
}

export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.mtgDesktop);
}

export function desktop(): DesktopApi {
  if (!window.mtgDesktop) {
    throw new Error("MTG Budget desktop bridge is not available");
  }
  return window.mtgDesktop;
}

export async function openProductLink(url: string) {
  if (isDesktopApp()) {
    await desktop().openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
