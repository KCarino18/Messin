import { fetchText } from "../http";
import { listingsFromJsonLd, listingFromOgMeta } from "../parsePrice";
import {
  searchQueriesForProduct,
  titleMatchesProduct,
} from "../productMatch";
import type { RetailerId } from "../allowlist";
import type { ProductSeed, RawOffer } from "../types";

const SITE_TO_RETAILER: Array<{ site: string; retailerId: RetailerId }> = [
  { site: "cardkingdom.com", retailerId: "card_kingdom" },
  { site: "coolstuffinc.com", retailerId: "coolstuffinc" },
  { site: "gamenerdz.com", retailerId: "gamenerdz" },
  { site: "starcitygames.com", retailerId: "starcitygames" },
  { site: "channelfireball.com", retailerId: "channel_fireball" },
  { site: "amazon.com", retailerId: "amazon" },
  { site: "target.com", retailerId: "target" },
  { site: "walmart.com", retailerId: "walmart" },
  { site: "tcgplayer.com", retailerId: "tcgplayer" },
];

const cache = new Map<string, { at: number; urls: string[] }>();
const CACHE_TTL = 30 * 60 * 1000;

function retailerForUrl(url: string): RetailerId | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const hit = SITE_TO_RETAILER.find((s) => host.endsWith(s.site));
    return hit?.retailerId ?? null;
  } catch {
    return null;
  }
}

function shippingFor(retailerId: RetailerId, itemCents: number): number {
  if (
    retailerId === "amazon" ||
    retailerId === "target" ||
    retailerId === "walmart"
  ) {
    return 0;
  }
  return itemCents >= 5000 ? 0 : 399;
}

/** DuckDuckGo HTML search restricted to an allowlisted retailer domain. */
export async function searchRetailerUrls(
  query: string,
  site: string,
): Promise<string[]> {
  const key = `${site}|${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.urls;

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query} site:${site}`)}`;
  const res = await fetchText(url);
  if (!res.ok) return [];

  const urls: string[] = [];
  for (const match of res.text.matchAll(/uddg=([^&"]+)/g)) {
    try {
      const decoded = decodeURIComponent(match[1]!);
      if (!decoded.startsWith("http")) continue;
      if (!decoded.includes(site)) continue;
      // Skip non-product noise
      if (/\/search\?|\/browse\/|\/c\/|\/catalog\/search/i.test(decoded)) continue;
      if (!urls.includes(decoded)) urls.push(decoded);
    } catch {
      // ignore bad encoding
    }
  }

  cache.set(key, { at: Date.now(), urls });
  return urls;
}

function gamenerdzCandidateUrls(product: ProductSeed): string[] {
  const slug = product.setName
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = "https://www.gamenerdz.com/magic-the-gathering";
  switch (product.sealedType) {
    case "play_booster_box":
      return [`${base}-${slug}-play-booster-box`, `${base}-${slug}-play-booster-display`];
    case "collector_booster_display":
      return [
        `${base}-${slug}-collector-booster-box`,
        `${base}-${slug}-collector-booster-display`,
      ];
    case "bundle":
      return [`${base}-${slug}-bundle`];
    default:
      return [];
  }
}

async function listingsFromPage(pageUrl: string) {
  const res = await fetchText(pageUrl);
  if (!res.ok || res.text.length < 400) return [];
  if (/\/blocked|captcha|access denied/i.test(res.url + res.text.slice(0, 2000))) {
    return [];
  }
  const fromLd = listingsFromJsonLd(res.text, res.url);
  if (fromLd.length > 0) return fromLd;
  const og = listingFromOgMeta(res.text, res.url);
  return og ? [og] : [];
}

/**
 * Surf allowlisted retailer sites (via search + known URL patterns),
 * open real product pages, and read prices from the page markup.
 */
export async function fetchWebRetailerOffers(
  product: ProductSeed,
): Promise<RawOffer[]> {
  const queries = searchQueriesForProduct(product);
  const urlCandidates = new Set<string>();

  for (const u of gamenerdzCandidateUrls(product)) urlCandidates.add(u);

  // Search high-signal stores (DuckDuckGo HTML). Keep the fan-out bounded.
  const searchSites = [
    "gamenerdz.com",
    "coolstuffinc.com",
    "starcitygames.com",
    "target.com",
    "amazon.com",
  ];

  await Promise.all(
    searchSites.map(async (site) => {
      const q = queries[0];
      if (!q) return;
      try {
        const found = await searchRetailerUrls(q, site);
        for (const u of found.slice(0, 2)) urlCandidates.add(u);
      } catch {
        // ignore one site failure
      }
    }),
  );

  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  const pages = [...urlCandidates].slice(0, 12);
  const results = await Promise.allSettled(pages.map((u) => listingsFromPage(u)));

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status !== "fulfilled") continue;
    const pageUrl = pages[i]!;
    const retailerId = retailerForUrl(pageUrl);
    if (!retailerId) continue;

    for (const listing of result.value) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      // Prefer in-stock; still keep preorder/OOS if it's the only signal? keep all in-stock + preorder
      const key = `${retailerId}|${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);

      offers.push({
        retailerId,
        sellerName:
          retailerId === "amazon"
            ? "Amazon.com"
            : retailerId === "target"
              ? "Target"
              : retailerId === "walmart"
                ? "Walmart"
                : retailerId === "tcgplayer"
                  ? "TCGPlayer"
                  : retailerId === "card_kingdom"
                    ? "Card Kingdom"
                    : retailerId === "gamenerdz"
                      ? "GameNerdz"
                      : retailerId === "coolstuffinc"
                        ? "CoolStuffInc"
                        : retailerId === "starcitygames"
                          ? "StarCityGames"
                          : "Channel Fireball",
        itemPriceCents: listing.priceCents,
        shippingCents: shippingFor(retailerId, listing.priceCents),
        url: listing.url,
        inStock: listing.inStock,
        isPreorder: listing.isPreorder,
        isDemo: false,
        soldByAmazon: retailerId === "amazon" ? true : undefined,
        soldByTarget: retailerId === "target" ? true : undefined,
        soldByWalmart: retailerId === "walmart" ? true : undefined,
        tcgSellerRating: retailerId === "tcgplayer" ? 99 : undefined,
        tcgFeedbackCount: retailerId === "tcgplayer" ? 10_000 : undefined,
        shipsFromUs: retailerId === "tcgplayer" ? true : undefined,
      });
    }
  }

  return offers;
}
