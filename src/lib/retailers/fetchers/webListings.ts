import {
  DEEP_SEARCH_RETAILERS,
  RETAILER_BY_ID,
  retailerName,
  type RetailerId,
} from "../allowlist";
import { fetchText } from "../http";
import { listingsFromJsonLd, listingFromOgMeta } from "../parsePrice";
import {
  searchQueriesForProduct,
  titleMatchesProduct,
} from "../productMatch";
import type { ProductSeed, RawOffer } from "../types";

const cache = new Map<string, { at: number; urls: string[] }>();
const CACHE_TTL = 30 * 60 * 1000;

/** Cap concurrent DuckDuckGo site searches per product load. */
const MAX_SEARCH_SITES = 18;
/** Cap product pages opened per product load. */
const MAX_PRODUCT_PAGES = 24;

function retailerForUrl(url: string): RetailerId | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const retailer of DEEP_SEARCH_RETAILERS) {
      const domain = retailer.domain.replace(/^www\./, "");
      if (host === domain || host.endsWith(`.${domain}`) || host.endsWith(domain)) {
        return retailer.id;
      }
    }
    // Also match allowlisted domains that may not be deepSearch-flagged.
    for (const retailer of Object.values(RETAILER_BY_ID)) {
      const domain = retailer.domain.replace(/^www\./, "");
      if (host === domain || host.endsWith(`.${domain}`) || host.endsWith(domain)) {
        return retailer.id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function shippingFor(retailerId: RetailerId, itemCents: number): number {
  if (
    retailerId === "amazon" ||
    retailerId === "target" ||
    retailerId === "walmart" ||
    retailerId === "best_buy" ||
    retailerId === "game_stop" ||
    retailerId === "barnes_and_noble"
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
      if (!decoded.includes(site.replace(/^www\./, ""))) continue;
      // Skip non-product noise
      if (/\/search\?|\/browse\/|\/c\/|\/catalog\/search|\/search\/\?/i.test(decoded)) {
        continue;
      }
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
    case "gift_bundle":
      return [`${base}-${slug}-gift-bundle`];
    case "specialty_bundle":
      return [
        `${base}-${slug}-beam-me-up-bundle`,
        `${base}-${slug}-codex-bundle`,
        `${base}-${slug}-pizza-bundle`,
      ];
    case "collector_booster_omega":
      return [`${base}-${slug}-collector-booster-omega`];
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

function searchSitePriority(domain: string): number {
  const hot = [
    "gamenerdz.com",
    "forgeandfiregaming.com",
    "flipsidegaming.com",
    "miniaturemarket.com",
    "trollandtoad.com",
    "moxboardinghouse.com",
    "cardhaus.com",
    "starcitygames.com",
    "coolstuffinc.com",
    "abugames.com",
    "facetofacegames.com",
    "amazon.com",
    "cardkingdom.com",
  ];
  const idx = hot.indexOf(domain.replace(/^www\./, ""));
  return idx === -1 ? 100 : idx;
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

  const searchSites = [...DEEP_SEARCH_RETAILERS]
    .sort((a, b) => searchSitePriority(a.domain) - searchSitePriority(b.domain))
    .slice(0, MAX_SEARCH_SITES)
    .map((r) => r.domain.replace(/^www\./, ""));

  const q = queries[0];
  if (q) {
    // Batch site searches to avoid stampeding DuckDuckGo.
    for (let i = 0; i < searchSites.length; i += 6) {
      const batch = searchSites.slice(i, i + 6);
      await Promise.all(
        batch.map(async (site) => {
          try {
            const found = await searchRetailerUrls(q, site);
            for (const u of found.slice(0, 2)) urlCandidates.add(u);
          } catch {
            // ignore one site failure
          }
        }),
      );
    }
  }

  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  const pages = [...urlCandidates].slice(0, MAX_PRODUCT_PAGES);
  const results = await Promise.allSettled(pages.map((u) => listingsFromPage(u)));

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status !== "fulfilled") continue;
    const pageUrl = pages[i]!;
    const retailerId = retailerForUrl(pageUrl);
    if (!retailerId) continue;

    for (const listing of result.value) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${retailerId}|${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);

      offers.push({
        retailerId,
        sellerName: retailerName(retailerId),
        itemPriceCents: listing.priceCents,
        shippingCents: shippingFor(retailerId, listing.priceCents),
        url: listing.url,
        inStock: listing.inStock || listing.isPreorder,
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
