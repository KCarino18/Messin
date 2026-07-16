import { cents } from "@/lib/money";

const BASE = "https://tcgcsv.com/tcgplayer";
const CACHE_TTL_MS = 30 * 60 * 1000;

type TcgPriceRow = {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string | null;
};

type TcgProductRow = {
  productId: number;
  name: string;
  url: string;
  groupId: number;
  extendedData?: Array<{ name?: string; value?: string }>;
};

export type TcgSinglesCard = {
  productId: number;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "mythic";
  marketPriceCents: number;
  lowPriceCents: number | null;
  foilMarketPriceCents: number | null;
  url: string;
};

type CacheEntry<T> = { at: number; value: T };

const priceCache = new Map<number, CacheEntry<TcgPriceRow | null>>();
const productCache = new Map<number, CacheEntry<TcgProductRow | null>>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MTG-Budget/0.3" },
  });
  if (!res.ok) {
    throw new Error(`TCGCSV ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function pickNormalPrice(rows: TcgPriceRow[]): TcgPriceRow | null {
  if (rows.length === 0) return null;
  return (
    rows.find((r) => (r.subTypeName ?? "Normal") === "Normal") ??
    rows.find((r) => r.marketPrice != null || r.lowPrice != null) ??
    rows[0]
  );
}

/** Resolve a product's TCGPlayer market/low via tcgcsv.com (daily TCGPlayer dump). */
export async function fetchTcgPlayerPriceInGroup(
  groupId: number,
  productId: number,
): Promise<{
  productId: number;
  name: string;
  url: string;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
  midPriceCents: number | null;
} | null> {
  const now = Date.now();
  const cacheKey = productId;
  const hit = priceCache.get(cacheKey);
  const prodHit = productCache.get(cacheKey);
  if (hit && prodHit && now - hit.at < CACHE_TTL_MS && now - prodHit.at < CACHE_TTL_MS) {
    if (!hit.value || !prodHit.value) return null;
    return {
      productId,
      name: prodHit.value.name,
      url: prodHit.value.url,
      marketPriceCents: hit.value.marketPrice != null ? cents(hit.value.marketPrice) : null,
      lowPriceCents: hit.value.lowPrice != null ? cents(hit.value.lowPrice) : null,
      midPriceCents: hit.value.midPrice != null ? cents(hit.value.midPrice) : null,
    };
  }

  const [productsBody, pricesBody] = await Promise.all([
    fetchJson<{ results: TcgProductRow[] }>(`${BASE}/1/${groupId}/products`),
    fetchJson<{ results: TcgPriceRow[] }>(`${BASE}/1/${groupId}/prices`),
  ]);

  const productById = new Map(productsBody.results.map((p) => [p.productId, p]));
  const pricesById = new Map<number, TcgPriceRow[]>();
  for (const row of pricesBody.results) {
    const list = pricesById.get(row.productId) ?? [];
    list.push(row);
    pricesById.set(row.productId, list);
  }

  // Warm cache for the whole group (sealed catalogs reuse the same groups).
  for (const [id, prod] of productById) {
    productCache.set(id, { at: now, value: prod });
    const picked = pickNormalPrice(pricesById.get(id) ?? []);
    priceCache.set(id, { at: now, value: picked });
  }

  const product = productById.get(productId) ?? null;
  const price = pickNormalPrice(pricesById.get(productId) ?? []);
  if (!product || !price) {
    productCache.set(productId, { at: now, value: product });
    priceCache.set(productId, { at: now, value: price });
    return null;
  }

  return {
    productId,
    name: product.name,
    url: product.url,
    marketPriceCents: price.marketPrice != null ? cents(price.marketPrice) : null,
    lowPriceCents: price.lowPrice != null ? cents(price.lowPrice) : null,
    midPriceCents: price.midPrice != null ? cents(price.midPrice) : null,
  };
}

/** Shipping estimate for TCGPlayer sealed (many listings are free over ~$50). */
export function estimateTcgShippingCents(itemPriceCents: number): number {
  return itemPriceCents >= 5000 ? 0 : 399;
}

function rarityFromExtended(
  extended: TcgProductRow["extendedData"],
): TcgSinglesCard["rarity"] | null {
  const raw = extended?.find((e) => e.name === "Rarity")?.value?.trim().toUpperCase();
  if (!raw) return null;
  if (raw === "C" || raw === "COMMON") return "common";
  if (raw === "U" || raw === "UNCOMMON") return "uncommon";
  if (raw === "R" || raw === "RARE") return "rare";
  if (raw === "M" || raw === "MYTHIC" || raw === "MYTHIC RARE") return "mythic";
  return null;
}

function isSealedOrAccessoryName(name: string): boolean {
  return /booster|bundle|display|case|deck display|commander deck|scene box|jumpstart|beginner box|pack$|pack\b/i.test(
    name,
  );
}

const groupSinglesCache = new Map<number, CacheEntry<TcgSinglesCard[]>>();

/**
 * Load TCGPlayer singles (Normal + Foil market) for a set/group.
 * Uses tcgcsv.com daily TCGPlayer dump — same live pricing feed as sealed.
 */
export async function fetchTcgPlayerSinglesForGroup(
  groupId: number,
): Promise<TcgSinglesCard[]> {
  const now = Date.now();
  const hit = groupSinglesCache.get(groupId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  const [productsBody, pricesBody] = await Promise.all([
    fetchJson<{ results: TcgProductRow[] }>(`${BASE}/1/${groupId}/products`),
    fetchJson<{ results: TcgPriceRow[] }>(`${BASE}/1/${groupId}/prices`),
  ]);

  const pricesById = new Map<number, TcgPriceRow[]>();
  for (const row of pricesBody.results) {
    const list = pricesById.get(row.productId) ?? [];
    list.push(row);
    pricesById.set(row.productId, list);
  }

  const singles: TcgSinglesCard[] = [];
  for (const product of productsBody.results) {
    if (isSealedOrAccessoryName(product.name)) continue;
    const rarity = rarityFromExtended(product.extendedData);
    if (!rarity) continue;

    const rows = pricesById.get(product.productId) ?? [];
    const normal =
      rows.find((r) => (r.subTypeName ?? "Normal") === "Normal") ?? null;
    const foil = rows.find((r) => r.subTypeName === "Foil") ?? null;
    const market = normal?.marketPrice ?? normal?.midPrice ?? normal?.lowPrice;
    if (market == null || market <= 0) continue;

    singles.push({
      productId: product.productId,
      name: product.name,
      rarity,
      marketPriceCents: cents(market),
      lowPriceCents: normal?.lowPrice != null ? cents(normal.lowPrice) : null,
      foilMarketPriceCents:
        foil?.marketPrice != null
          ? cents(foil.marketPrice)
          : foil?.lowPrice != null
            ? cents(foil.lowPrice)
            : null,
      url: product.url,
    });

    // Keep sealed-price caches warm for this group too.
    productCache.set(product.productId, { at: now, value: product });
    priceCache.set(product.productId, {
      at: now,
      value: pickNormalPrice(rows),
    });
  }

  // Deduplicate by card name: keep strongest Normal + strongest Foil quotes.
  const byName = new Map<string, TcgSinglesCard>();
  for (const card of singles) {
    const key = card.name.replace(/\s*\(.*?\)\s*$/g, "").trim();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...card, name: key });
      continue;
    }
    byName.set(key, {
      ...existing,
      name: key,
      marketPriceCents: Math.max(existing.marketPriceCents, card.marketPriceCents),
      lowPriceCents:
        existing.lowPriceCents != null && card.lowPriceCents != null
          ? Math.min(existing.lowPriceCents, card.lowPriceCents)
          : (existing.lowPriceCents ?? card.lowPriceCents),
      foilMarketPriceCents: Math.max(
        existing.foilMarketPriceCents ?? 0,
        card.foilMarketPriceCents ?? 0,
      ) || null,
    });
  }

  const value = [...byName.values()];
  groupSinglesCache.set(groupId, { at: now, value });
  return value;
}
