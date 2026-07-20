import { fetchPage } from "../http";
import { setSlug, titleMatchesProduct } from "../productMatch";
import type { ProductSeed, RawOffer } from "../types";
import type { ParsedListing } from "../parsePrice";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Parse sealed products from a Card Kingdom set sealed listing page. */
export function parseCardKingdomSealedHtml(
  html: string,
  pageUrl: string,
): ParsedListing[] {
  const listings: ParsedListing[] = [];
  const formRe =
    /name="name"\s+value="([^"]+)"[\s\S]{0,400}?name="price"\s+value="([\d.]+)"[\s\S]{0,200}?name="slug"\s+value="([^"]+)"/gi;

  for (const match of html.matchAll(formRe)) {
    const name = decodeEntities(match[1] ?? "");
    const price = Number(match[2]);
    const slug = match[3] ?? "";
    if (!name || !Number.isFinite(price) || price < 5) continue;

    const path = slug.includes("/")
      ? `/mtg-sealed/${slug.split("/").pop()}`
      : `/mtg-sealed/${slug}`;
    const url = new URL(path, "https://www.cardkingdom.com").toString();

    // Stock: nearby "Out of stock" / Add To Cart in surrounding window
    const idx = match.index ?? 0;
    const window = html.slice(Math.max(0, idx - 200), idx + 800);
    const outOfStock = /out of stock/i.test(window);
    const isPreorder = /pre-?order|presale/i.test(window);

    listings.push({
      name,
      priceCents: Math.round(price * 100),
      url: url.includes("mtg-sealed") ? url : pageUrl,
      inStock: !outOfStock,
      isPreorder,
    });
  }

  // Also catch productTitle links with itemPrice (backup)
  const cardRe =
    /productTitle[\s\S]{0,120}?href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]{0,400}?itemPrice[^>]*>\s*\$([\d.]+)/gi;
  for (const match of html.matchAll(cardRe)) {
    const href = match[1] ?? "";
    const name = decodeEntities((match[2] ?? "").trim());
    const price = Number(match[3]);
    if (!name || !Number.isFinite(price)) continue;
    const url = href.startsWith("http")
      ? href
      : new URL(href, "https://www.cardkingdom.com").toString();
    if (listings.some((l) => l.name === name && l.priceCents === Math.round(price * 100))) {
      continue;
    }
    listings.push({
      name,
      priceCents: Math.round(price * 100),
      url,
      inStock: true,
      isPreorder: false,
    });
  }

  return listings;
}

const sealedPageCache = new Map<string, { at: number; html: string; url: string }>();
const SEALED_CACHE_TTL = 30 * 60 * 1000;

async function loadCardKingdomSealedPage(setName: string) {
  const slug = setSlug(setName);
  const cacheKey = slug;
  const hit = sealedPageCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SEALED_CACHE_TTL) return hit;

  const url = `https://www.cardkingdom.com/mtg/${slug}/sealed`;
  const res = await fetchPage(url);
  if (!res.ok || res.text.length < 500) return null;
  const entry = { at: Date.now(), html: res.text, url: res.url };
  sealedPageCache.set(cacheKey, entry);
  return entry;
}

export async function fetchCardKingdomOffers(
  product: ProductSeed,
): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  try {
    const page = await loadCardKingdomSealedPage(product.setName);
    if (!page) return [];
    const listings = parseCardKingdomSealedHtml(page.html, page.url);
    for (const listing of listings) {
      if (!titleMatchesProduct(listing.name, product)) continue;
      const key = `${listing.url}|${listing.priceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push({
        retailerId: "card_kingdom",
        sellerName: "Card Kingdom",
        itemPriceCents: listing.priceCents,
        shippingCents: listing.priceCents >= 5000 ? 0 : 399,
        url: listing.url,
        inStock: listing.inStock,
        isPreorder: listing.isPreorder,
        isDemo: false,
      });
    }
  } catch {
    return [];
  }

  return offers;
}
