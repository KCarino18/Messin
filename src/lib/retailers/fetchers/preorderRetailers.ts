import { PREORDER_WATCH_RETAILERS, type RetailerId } from "../allowlist";
import { fetchText } from "../http";
import { listingsFromJsonLd, listingFromOgMeta } from "../parsePrice";
import {
  searchQueriesForProduct,
  setSlug,
  titleMatchesProduct,
} from "../productMatch";
import { searchRetailerUrls } from "./webListings";
import type { ProductSeed, RawOffer } from "../types";

function shippingFor(retailerId: RetailerId, itemCents: number): number {
  if (retailerId === "amazon") return 0;
  return itemCents >= 5000 ? 0 : 399;
}

function toOffer(
  retailerId: RetailerId,
  sellerName: string,
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
    sellerName,
    itemPriceCents: listing.priceCents,
    shippingCents: shippingFor(retailerId, listing.priceCents),
    url: listing.url,
    inStock: listing.inStock || listing.isPreorder,
    isPreorder: listing.isPreorder,
    isDemo: false,
    ...extras,
  };
}

async function listingsFromProductPage(pageUrl: string) {
  const res = await fetchText(pageUrl);
  if (!res.ok || res.text.length < 400) return [];
  if (/\/blocked|captcha|access denied|robot check/i.test(res.url + res.text.slice(0, 2500))) {
    return [];
  }
  const fromLd = listingsFromJsonLd(res.text, res.url);
  if (fromLd.length > 0) return fromLd;
  const og = listingFromOgMeta(res.text, res.url);
  return og ? [og] : [];
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
  const urls = sealedSlugVariants(product).map(
    (s) => `https://www.gamenerdz.com/magic-the-gathering-${s}`,
  );
  const offers: RawOffer[] = [];
  for (const url of urls) {
    for (const listing of await listingsFromProductPage(url)) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      offers.push(toOffer("gamenerdz", "GameNerdz", listing));
    }
  }
  return offers;
}

async function fetchForgeAndFire(product: ProductSeed): Promise<RawOffer[]> {
  const urls = [
    ...sealedSlugVariants(product).map(
      (s) => `https://forgeandfiregaming.com/magic-the-gathering/${s}/`,
    ),
    ...searchQueriesForProduct(product).slice(0, 1).flatMap(() => []),
  ];

  // Also discover via search engine + their site search pages are weak; DDG helps.
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
  for (const url of [...new Set(urls)]) {
    for (const listing of await listingsFromProductPage(url)) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(toOffer("forge_and_fire", "Forge & Fire Gaming", listing));
    }
  }
  return offers;
}

async function fetchFlipside(product: ProductSeed): Promise<RawOffer[]> {
  const handles = sealedSlugVariants(product).flatMap((s) => [
    `mtg-${s}`,
    s,
  ]);
  const urls = handles.map((h) => `https://flipsidegaming.com/products/${h}`);

  // Shopify search HTML embeds product options with handle + price (cents).
  for (const q of searchQueriesForProduct(product).slice(0, 1)) {
    try {
      const res = await fetchText(
        `https://flipsidegaming.com/search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) continue;
      for (const match of res.text.matchAll(
        /data-product-options='(\{.*?\})'/g,
      )) {
        try {
          const opt = JSON.parse(match[1]!) as {
            handle?: string;
            price?: number;
            available?: boolean;
            isPreoder?: boolean;
          };
          if (!opt.handle || !opt.price || opt.price < 500) continue;
          const pageUrl = `https://flipsidegaming.com/products/${opt.handle}`;
          // Title comes from handle; refine via product page when it matches sealed shape.
          urls.push(pageUrl);
        } catch {
          // ignore bad option blob
        }
      }
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
      offers.push(toOffer("flipside_gaming", "Flipside Gaming", listing));
    }
  }
  return offers;
}

async function fetchAmazon(product: ProductSeed): Promise<RawOffer[]> {
  const urls: string[] = [];
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
    const listings = await listingsFromProductPage(url);
    for (const listing of listings) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(
        toOffer("amazon", "Amazon.com", listing, { soldByAmazon: true }),
      );
    }

    // Amazon often hides JSON-LD; try a couple common price markers.
    if (listings.length === 0) {
      const res = await fetchText(url);
      if (!res.ok) continue;
      const title =
        res.text.match(/<span id="productTitle"[^>]*>\s*([^<]+?)\s*</i)?.[1]?.trim() ??
        res.text.match(/property="og:title" content="([^"]+)"/i)?.[1];
      const priceMatch =
        res.text.match(/id="priceblock_ourprice"[^>]*>\s*\$([0-9.,]+)/i) ??
        res.text.match(/class="a-price"[^>]*>[\s\S]{0,80}?a-offscreen">\$([0-9.,]+)/i) ??
        res.text.match(/"priceAmount"\s*:\s*([0-9.]+)/);
      if (!title || !priceMatch || !titleMatchesProduct(title, product)) continue;
      const priceCents = Math.round(Number(priceMatch[1]!.replace(/,/g, "")) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 500) continue;
      const key = `${res.url}|${priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(
        toOffer(
          "amazon",
          "Amazon.com",
          {
            name: title,
            priceCents,
            url: res.url,
            inStock: true,
            isPreorder: /pre-?order/i.test(res.text.slice(0, 80_000)),
          },
          { soldByAmazon: true },
        ),
      );
    }
  }
  return offers;
}

/** Live listings from the Preorder Radar watch list only. */
export async function fetchPreorderWatchOffers(
  product: ProductSeed,
  retailerId?: RetailerId,
): Promise<RawOffer[]> {
  const targets = retailerId
    ? [retailerId]
    : PREORDER_WATCH_RETAILERS;

  const tasks = targets.map(async (id) => {
    switch (id) {
      case "amazon":
        return fetchAmazon(product);
      case "gamenerdz":
        return fetchGameNerdz(product);
      case "forge_and_fire":
        return fetchForgeAndFire(product);
      case "flipside_gaming":
        return fetchFlipside(product);
      default:
        return [] as RawOffer[];
    }
  });

  const settled = await Promise.allSettled(tasks);
  const out: RawOffer[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") out.push(...result.value);
  }
  return out;
}

export { PREORDER_WATCH_RETAILERS };
