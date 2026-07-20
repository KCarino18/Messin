import { cents } from "@/lib/money";
import { isBlockedPage, type PageFetchResult } from "./http";

export type ParsedListing = {
  name: string;
  priceCents: number;
  url: string;
  inStock: boolean;
  isPreorder: boolean;
};

function parseMoneyToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // JSON-LD prices are in dollars (e.g. 479.97).
    return cents(value);
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    return cents(n);
  }
  return null;
}

function availabilityInStock(value: unknown): boolean {
  const s = String(value ?? "").toLowerCase();
  if (!s) return true;
  if (s.includes("outofstock") || s.includes("soldout") || s.includes("out of stock")) {
    return false;
  }
  return true;
}

function availabilityPreorder(value: unknown): boolean {
  const s = String(value ?? "").toLowerCase();
  return s.includes("preorder") || s.includes("pre-order") || s.includes("presale");
}

/** Extract Product offers from JSON-LD blocks on a product page. */
export function listingsFromJsonLd(html: string, pageUrl: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(match[1]!);
    } catch {
      continue;
    }
    const items = Array.isArray(data) ? data : [data];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const types = Array.isArray(item["@type"])
        ? item["@type"].map(String)
        : [String(item["@type"] ?? "")];
      if (!types.some((t) => /product/i.test(t))) continue;

      const name = String(item.name ?? "");
      const offers = item.offers;
      const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
      for (const offer of offerList) {
        if (!offer || typeof offer !== "object") continue;
        const o = offer as Record<string, unknown>;
        const priceCents = parseMoneyToCents(o.price ?? o.lowPrice);
        if (priceCents == null || priceCents < 500) continue;
        out.push({
          name,
          priceCents,
          url: String(o.url ?? item.url ?? pageUrl),
          inStock: availabilityInStock(o.availability),
          isPreorder: availabilityPreorder(o.availability),
        });
      }
    }
  }
  return out;
}

/** Parse product listings from an already-fetched page (avoids duplicate HTTP/browser loads). */
export function parseListingsFromPage(res: PageFetchResult): ParsedListing[] {
  if (!res.ok || res.text.length < 400) return [];
  if (res.blocked || isBlockedPage(res.url, res.text)) return [];
  const fromLd = listingsFromJsonLd(res.text, res.url);
  if (fromLd.length > 0) return fromLd;
  const og = listingFromOgMeta(res.text, res.url);
  return og ? [og] : [];
}

export function listingFromOgMeta(html: string, pageUrl: string): ParsedListing | null {
  const title =
    html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1];
  const priceRaw =
    html.match(/property=["']product:price:amount["']\s+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["']\s+property=["']product:price:amount["']/i)?.[1];
  const priceCents = parseMoneyToCents(priceRaw);
  if (!title || priceCents == null || priceCents < 500) return null;
  return {
    name: title,
    priceCents,
    url: pageUrl,
    inStock: !/out of stock|sold out/i.test(html.slice(0, 50_000)),
    isPreorder: /pre-?order|presale/i.test(html.slice(0, 50_000)),
  };
}
