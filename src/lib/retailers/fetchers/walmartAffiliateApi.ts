import { createSign } from "node:crypto";
import { retailerName } from "../allowlist";
import { getApiCredentials } from "../../settings/apiCredentials";
import { collectWalmartItemIds } from "../productIds";
import { searchQueriesForProduct, titleMatchesProduct } from "../productMatch";
import type { ProductSeed, RawOffer } from "../types";

const BASE = "https://developer.api.walmart.com/api-proxy/service/affil/product/v2";

function walmartAuthHeaders(creds: {
  consumerId: string;
  privateKeyPem: string;
  keyVersion: string;
}) {
  const timestamp = Date.now().toString();
  const stringToSign = `${creds.consumerId}\n${timestamp}\n${creds.keyVersion}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(stringToSign);
  signer.end();
  const signature = signer.sign(creds.privateKeyPem, "base64");
  return {
    "WM_SEC.AUTH_SIGNATURE": signature,
    "WM_CONSUMER.INTIMESTAMP": timestamp,
    "WM_CONSUMER.ID": creds.consumerId,
    "WM_SEC.KEY_VERSION": creds.keyVersion,
    Accept: "application/json",
  };
}

function moneyToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100);
  }
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

function itemToOffer(item: Record<string, unknown>, product: ProductSeed): RawOffer | null {
  const name = String(item.name ?? item.productName ?? "");
  if (name && !titleMatchesProduct(name, product)) return null;

  const priceCents =
    moneyToCents(item.salePrice) ??
    moneyToCents(item.msrp) ??
    moneyToCents(item.price);
  if (priceCents == null || priceCents < 500) return null;

  const itemId = String(item.itemId ?? item.usItemId ?? "");
  const stock = String(item.stock ?? item.availabilityStatus ?? "").toLowerCase();
  const availableOnline = item.availableOnline !== false;
  const isPreorder = /preorder|pre-order|presale|pre sale/i.test(stock);
  const inStock =
    availableOnline &&
    (!/out of stock|not available|unavailable/i.test(stock) || isPreorder);

  const url =
    String(item.productTrackingUrl ?? item.productUrl ?? "") ||
    (itemId ? `https://www.walmart.com/ip/${itemId}` : "");

  if (!url.startsWith("http")) return null;

  return {
    retailerId: "walmart",
    sellerName: retailerName("walmart"),
    itemPriceCents: priceCents,
    shippingCents: 0,
    url,
    inStock,
    isPreorder,
    isDemo: false,
    soldByWalmart: true,
  };
}

async function walmartFetchJson(path: string, creds: {
  consumerId: string;
  privateKeyPem: string;
  keyVersion: string;
  publisherId: string;
}) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}publisherId=${encodeURIComponent(creds.publisherId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: walmartAuthHeaders(creds),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("Walmart affiliate API error", res.status, text.slice(0, 400));
      return null;
    }
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    console.error("Walmart affiliate API fetch failed", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWalmartAffiliateOffers(product: ProductSeed): Promise<RawOffer[]> {
  const creds = getApiCredentials().walmart;
  if (!creds) return [];

  const itemIds = collectWalmartItemIds(product.listingUrls);
  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  for (const itemId of itemIds) {
    const data = await walmartFetchJson(`/items/${encodeURIComponent(itemId)}`, creds);
    const items = (data?.items as Array<Record<string, unknown>> | undefined) ?? [];
    const single = data?.itemId ? [data as Record<string, unknown>] : items;
    for (const item of single) {
      const offer = itemToOffer(item, product);
      if (!offer) continue;
      const key = `${offer.url}|${offer.itemPriceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(offer);
    }
  }

  if (offers.length === 0) {
    const query = searchQueriesForProduct(product)[0];
    if (query) {
      const data = await walmartFetchJson(
        `/search?query=${encodeURIComponent(query)}&numItems=5`,
        creds,
      );
      const items = (data?.items as Array<Record<string, unknown>> | undefined) ?? [];
      for (const item of items.slice(0, 5)) {
        const offer = itemToOffer(item, product);
        if (!offer) continue;
        const key = `${offer.url}|${offer.itemPriceCents}`;
        if (seen.has(key)) continue;
        seen.add(key);
        offers.push(offer);
      }
    }
  }

  return offers;
}
