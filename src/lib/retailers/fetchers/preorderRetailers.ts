import {
  PREORDER_WATCH_RETAILERS,
  RETAILER_BY_ID,
  retailerName,
  type RetailerId,
} from "../allowlist";
import { fetchCardKingdomOffers } from "./cardKingdom";
import { blockedRetailer, type BlockedRetailer } from "../blocked";
import { fetchPage, fetchText } from "../http";
import { parseListingsFromPage } from "../parsePrice";
import type { PageFetchResult } from "../http";
import {
  searchQueriesForProduct,
  setSlug,
  titleMatchesProduct,
} from "../productMatch";
import { searchRetailerUrls } from "./webListings";
import type { ProductSeed, RawOffer } from "../types";

const FREE_SHIP: RetailerId[] = [
  "amazon",
  "target",
  "walmart",
  "best_buy",
  "game_stop",
  "barnes_and_noble",
];

function shippingFor(retailerId: RetailerId, itemCents: number): number {
  if (FREE_SHIP.includes(retailerId)) return 0;
  return itemCents >= 5000 ? 0 : 399;
}

function toOffer(
  retailerId: RetailerId,
  listing: {
    name: string;
    priceCents: number;
    url: string;
    inStock: boolean;
    isPreorder: boolean;
  },
  extras: Partial<RawOffer> = {},
): RawOffer {
  return {
    retailerId,
    sellerName: retailerName(retailerId),
    itemPriceCents: listing.priceCents,
    shippingCents: shippingFor(retailerId, listing.priceCents),
    url: listing.url,
    inStock: listing.inStock || listing.isPreorder,
    isPreorder: listing.isPreorder,
    isDemo: false,
    ...extras,
  };
}

async function listingsFromProductPage(
  pageUrl: string,
  prefetched?: PageFetchResult,
) {
  const res = prefetched ?? (await fetchPage(pageUrl));
  return parseListingsFromPage(res);
}

function scrapeHtmlPriceFromPage(res: PageFetchResult, product: ProductSeed) {
  if (!res.ok || res.text.length < 400) return null;
  const title =
    res.text.match(/property="og:title" content="([^"]+)"/i)?.[1]?.trim() ??
    res.text.match(/<h1[^>]*>\s*([^<]+?)\s*</i)?.[1]?.trim() ??
    res.text.match(/<title>([^|<]+)/i)?.[1]?.trim();
  if (!title || !titleMatchesProduct(title, product)) return null;

  const priceMatch =
    res.text.match(/property="product:price:amount" content="([^"]+)"/i) ??
    res.text.match(/"price"\s*:\s*"?([0-9]+\.[0-9]{2})"?/) ??
    res.text.match(/data-product-price="([0-9.]+)"/i) ??
    res.text.match(/\$([0-9]{2,3}\.[0-9]{2})/);
  if (!priceMatch) return null;
  const priceCents = Math.round(Number(String(priceMatch[1]).replace(/,/g, "")) * 100);
  if (!Number.isFinite(priceCents) || priceCents < 500) return null;

  return {
    name: title,
    priceCents,
    url: res.url,
    inStock: !/out of stock|sold out/i.test(res.text.slice(0, 20_000)),
    isPreorder: /pre-?order|preorder/i.test(res.text.slice(0, 40_000)),
  };
}

function sealedSlugVariants(product: ProductSeed): string[] {
  const slug = setSlug(product.setName);
  switch (product.sealedType) {
    case "play_booster_box":
      return [`${slug}-play-booster-box`, `${slug}-play-booster-display`];
    case "collector_booster_display":
      return [`${slug}-collector-booster-box`, `${slug}-collector-booster-display`];
    case "collector_booster_omega":
      return [
        `${slug}-collector-booster-omega`,
        `${slug}-collector-booster-omega-pack`,
        `mtg-${slug}-collector-booster-omega`,
      ];
    case "bundle":
      return [`${slug}-bundle`];
    case "gift_bundle":
      return [`${slug}-gift-bundle`];
    case "specialty_bundle":
    case "scene_box":
      return [setSlug(product.name), `mtg-${setSlug(product.name)}`];
    default:
      return [setSlug(product.name)];
  }
}

async function fetchGameNerdz(product: ProductSeed): Promise<RawOffer[]> {
  const urls = sealedSlugVariants(product).flatMap((s) => [
    `https://www.gamenerdz.com/magic-the-gathering-${s}`,
    `https://www.gamenerdz.com/${s}`,
  ]);

  // GameNerdz search is JS-rendered; still try DDG for a real product URL.
  for (const q of searchQueriesForProduct(product).slice(0, 1)) {
    try {
      const found = await searchRetailerUrls(q, "gamenerdz.com");
      urls.push(...found.slice(0, 4));
    } catch {
      // ignore
    }
  }

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  for (const url of [...new Set(urls)].slice(0, 8)) {
    let listings = await listingsFromProductPage(url);
    if (listings.length === 0) {
      const fallback = await scrapeHtmlPrice(url, product);
      if (fallback) listings = [fallback];
    }
    for (const listing of listings) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(toOffer("gamenerdz", listing));
    }
  }
  return offers;
}

async function fetchForgeAndFire(product: ProductSeed): Promise<RawOffer[]> {
  // Forge often uses "display" instead of "box" in the path.
  const urls = sealedSlugVariants(product).flatMap((s) => [
    `https://forgeandfiregaming.com/magic-the-gathering/${s}/`,
    `https://forgeandfiregaming.com/magic-the-gathering/${s.replace(/-box$/, "-display")}/`,
  ]);

  for (const q of searchQueriesForProduct(product).slice(0, 1)) {
    try {
      const found = await searchRetailerUrls(q, "forgeandfiregaming.com");
      urls.push(...found.slice(0, 3));
    } catch {
      // ignore
    }
  }

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  for (const url of [...new Set(urls)].slice(0, 8)) {
    let listings = await listingsFromProductPage(url);
    if (listings.length === 0) {
      const fallback = await scrapeHtmlPrice(url, product);
      if (fallback) listings = [fallback];
    }
    for (const listing of listings) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(toOffer("forge_and_fire", listing));
    }
  }
  return offers;
}

async function fetchFlipside(product: ProductSeed): Promise<RawOffer[]> {
  const handles = sealedSlugVariants(product).flatMap((s) => [`mtg-${s}`, s]);
  const urls = handles.map((h) => `https://flipsidegaming.com/products/${h}`);

  for (const q of searchQueriesForProduct(product).slice(0, 1)) {
    try {
      const res = await fetchText(
        `https://flipsidegaming.com/search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) continue;
      for (const match of res.text.matchAll(/href="(\/products\/[^"?]+)/g)) {
        urls.push(`https://flipsidegaming.com${match[1]}`);
      }
    } catch {
      // ignore
    }
  }

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  for (const url of [...new Set(urls)].slice(0, 10)) {
    for (const listing of await listingsFromProductPage(url)) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(toOffer("flipside_gaming", listing));
    }
  }
  return offers;
}

/** Pull product hrefs from a retailer's own search HTML (avoids DuckDuckGo). */
async function urlsFromSiteSearch(
  searchUrl: string,
  hostIncludes: string,
): Promise<string[]> {
  const res = await fetchText(searchUrl);
  if (!res.ok) return [];
  const urls: string[] = [];
  for (const match of res.text.matchAll(/href=["']([^"']+)["']/gi)) {
    let href = match[1]!;
    if (href.startsWith("//")) href = `https:${href}`;
    if (href.startsWith("/")) {
      try {
        href = new URL(href, res.url).toString();
      } catch {
        continue;
      }
    }
    if (!/^https?:\/\//i.test(href)) continue;
    try {
      const host = new URL(href).hostname;
      if (!host.includes(hostIncludes)) continue;
    } catch {
      continue;
    }
    if (/\/search|\/catalogsearch\/result|\/browse|\/cart|\/account/i.test(href)) {
      continue;
    }
    if (!/product|mtg|magic|booster|bundle|sealed|\/p\/|\/dp\//i.test(href)) {
      // Keep Magento/Shopify style product paths even without those words.
      if (!/\/[a-z0-9-]{8,}\.html|\/products\//i.test(href)) continue;
    }
    const clean = href.split("#")[0]!.split("?")[0]!;
    if (!urls.includes(clean)) urls.push(clean);
  }
  return urls.slice(0, 8);
}

function onSiteSearchUrls(product: ProductSeed, retailerId: RetailerId): string[] {
  const q = encodeURIComponent(searchQueriesForProduct(product)[0] ?? product.name);
  switch (retailerId) {
    case "miniature_market":
      return [`https://www.miniaturemarket.com/catalogsearch/result/?q=${q}`];
    case "gamenerdz":
      return [
        `https://www.gamenerdz.com/search.php?section=product&search_query=${q}`,
      ];
    case "starcitygames":
      return [`https://starcitygames.com/search/?search_query=${q}`];
    case "coolstuffinc":
      return [
        `https://www.coolstuffinc.com/main_search.php?Pa=searchOnName&page=1&resultsPerPage=25&q=${q}`,
      ];
    case "cardhaus":
      return [`https://www.cardhaus.com/search?q=${q}`];
    case "troll_and_toad":
      return [
        `https://www.trollandtoad.com/category.php?selected-cat=0&search-words=${q}`,
      ];
    case "mox_boarding_house":
      return [`https://www.moxboardinghouse.com/search?q=${q}`];
    case "abu_games":
      return [`https://abugames.com/search?q=${q}`];
    case "face_to_face":
      return [`https://www.facetofacegames.com/search?q=${q}`];
    case "game_stop":
      return [`https://www.gamestop.com/search/?q=${q}&lang=default`];
    case "best_buy":
      return [`https://www.bestbuy.com/site/searchpage.jsp?st=${q}`];
    case "target":
      return [`https://www.target.com/s?searchTerm=${q}`];
    case "walmart":
      return [`https://www.walmart.com/search?q=${q}`];
    case "barnes_and_noble":
      return [`https://www.barnesandnoble.com/s/${q}`];
    default:
      return [];
  }
}

/** Generic allowlisted-store discovery via on-site search, then DDG fallback. */
async function fetchGenericRetailer(
  product: ProductSeed,
  retailerId: RetailerId,
): Promise<RawOffer[]> {
  const cfg = RETAILER_BY_ID[retailerId];
  if (!cfg) return [];
  const site = cfg.domain.replace(/^www\./, "").replace(/^store\./, "");
  const urls: string[] = [];

  // 1) Prefer the store's own search page (more reliable than DuckDuckGo).
  for (const searchUrl of onSiteSearchUrls(product, retailerId)) {
    try {
      urls.push(...(await urlsFromSiteSearch(searchUrl, site.split(".").slice(-2).join("."))));
    } catch {
      // ignore
    }
  }

  // 2) DuckDuckGo fallback only if on-site search found nothing (skip for big-box).
  const bigBox = new Set([
    "amazon.com",
    "target.com",
    "walmart.com",
    "bestbuy.com",
    "gamestop.com",
    "barnesandnoble.com",
  ]);
  if (urls.length === 0 && !bigBox.has(site.replace(/^www\./, ""))) {
    for (const q of searchQueriesForProduct(product).slice(0, 1)) {
      try {
        const found = await searchRetailerUrls(q, cfg.domain.replace(/^www\./, ""));
        for (const u of found.slice(0, 3)) urls.push(u.split("#")[0]!);
      } catch {
        // ignore
      }
    }
  }

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  for (const url of [...new Set(urls)].slice(0, 6)) {
    let listings = await listingsFromProductPage(url);
    if (listings.length === 0) {
      const htmlFallback = await scrapeHtmlPrice(url, product);
      if (htmlFallback) listings = [htmlFallback];
    }
    for (const listing of listings) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(
        toOffer(retailerId, listing, {
          soldByAmazon: retailerId === "amazon" ? true : undefined,
          soldByTarget: retailerId === "target" ? true : undefined,
          soldByWalmart: retailerId === "walmart" ? true : undefined,
        }),
      );
    }
  }
  return offers;
}

async function scrapeHtmlPrice(
  pageUrl: string,
  product: ProductSeed,
  prefetched?: PageFetchResult,
) {
  const res = prefetched ?? (await fetchPage(pageUrl));
  return scrapeHtmlPriceFromPage(res, product);
}

async function fetchAmazon(product: ProductSeed): Promise<RawOffer[]> {
  const urls: string[] = [];
  const curated = product.listingUrls?.amazon;
  if (curated) urls.push(curated.split("?")[0]!);

  for (const q of searchQueriesForProduct(product).slice(0, 2)) {
    try {
      const found = await searchRetailerUrls(q, "amazon.com");
      for (const u of found) {
        if (/\/dp\/|\/gp\/product\//i.test(u)) urls.push(u.split("?")[0]!);
      }
    } catch {
      // ignore
    }
  }

  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  for (const url of [...new Set(urls)].slice(0, 4)) {
    const pageRes = await fetchPage(url);
    const listings = await listingsFromProductPage(url, pageRes);
    for (const listing of listings) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(toOffer("amazon", listing, { soldByAmazon: true }));
    }

    if (listings.length === 0) {
      const fallback = scrapeHtmlPriceFromPage(pageRes, product);
      if (!fallback) continue;
      const key = `${fallback.url}|${fallback.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(toOffer("amazon", fallback, { soldByAmazon: true }));
    }
  }
  return offers;
}

async function fetchBigBox(
  product: ProductSeed,
  retailerId: "target" | "walmart" | "best_buy" | "game_stop" | "barnes_and_noble",
): Promise<RawOffer[]> {
  // Same discovery path as specialty shops: on-site search first, then DDG.
  // Big-box storefronts often still return empty because pages are bot-blocked
  // or JS shells — curated listingUrls are the reliable fallback.
  return fetchGenericRetailer(product, retailerId);
}

async function fetchKnownListingUrls(
  product: ProductSeed,
  retailerId: RetailerId,
  blocked?: BlockedRetailer[],
): Promise<RawOffer[]> {
  const direct = product.listingUrls?.[retailerId];
  if (!direct) return [];
  const offers: RawOffer[] = [];
  const pageRes = await fetchPage(direct);
  let listings = await listingsFromProductPage(direct, pageRes);
  if (listings.length === 0) {
    const fallback = scrapeHtmlPriceFromPage(pageRes, product);
    if (fallback) listings = [fallback];
  }
  for (const listing of listings) {
    if (!titleMatchesProduct(listing.name, product)) continue;
    offers.push(
      toOffer(retailerId, listing, {
        soldByAmazon: retailerId === "amazon" ? true : undefined,
        soldByTarget: retailerId === "target" ? true : undefined,
        soldByWalmart: retailerId === "walmart" ? true : undefined,
      }),
    );
  }
  if (offers.length === 0 && pageRes.blocked && blocked) {
    blocked.push(
      blockedRetailer(retailerId, direct, pageRes.blockedReason ?? "bot-wall"),
    );
  }
  return offers;
}

async function fetchForRetailer(
  product: ProductSeed,
  retailerId: RetailerId,
  blocked?: BlockedRetailer[],
): Promise<RawOffer[]> {
  // Always try curated direct URLs first (beats broken search/JS storefronts).
  const known = await fetchKnownListingUrls(product, retailerId, blocked);

  let discovered: RawOffer[] = [];
  switch (retailerId) {
    case "amazon":
      discovered = await fetchAmazon(product);
      break;
    case "gamenerdz":
      discovered = await fetchGameNerdz(product);
      break;
    case "forge_and_fire":
      discovered = await fetchForgeAndFire(product);
      break;
    case "flipside_gaming":
      discovered = await fetchFlipside(product);
      break;
    case "card_kingdom":
      discovered = await fetchCardKingdomOffers(product);
      break;
    case "target":
    case "walmart":
    case "best_buy":
    case "game_stop":
    case "barnes_and_noble":
      discovered = await fetchBigBox(product, retailerId);
      break;
    default:
      discovered = await fetchGenericRetailer(product, retailerId);
      break;
  }

  const merged = [...known, ...discovered];
  const seen = new Set<string>();
  return merged.filter((o) => {
    const key = `${o.retailerId}|${o.url}|${o.itemPriceCents}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Live listings from the Preorder Radar watch list (every watched retailer). */
export async function fetchPreorderWatchOffers(
  product: ProductSeed,
  retailerId?: RetailerId,
  blocked?: BlockedRetailer[],
): Promise<RawOffer[]> {
  const targets = retailerId ? [retailerId] : PREORDER_WATCH_RETAILERS;
  const out: RawOffer[] = [];

  // Batch to avoid stampeding DuckDuckGo / store search endpoints.
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchForRetailer(product, id, blocked)),
    );
    for (const result of settled) {
      if (result.status === "fulfilled") out.push(...result.value);
    }
  }
  return out;
}

export { PREORDER_WATCH_RETAILERS };
