/** Extract an Amazon ASIN from a product page URL. */
export function amazonAsinFromUrl(url: string): string | null {
  const match =
    url.match(/\/dp\/([A-Z0-9]{10})/i) ??
    url.match(/\/gp\/product\/([A-Z0-9]{10})/i) ??
    url.match(/\/product\/([A-Z0-9]{10})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

/** Extract a Walmart numeric item id from a product page URL. */
export function walmartItemIdFromUrl(url: string): string | null {
  const match =
    url.match(/\/ip\/[^/]+\/(\d{6,})/i) ??
    url.match(/\/ip\/(\d{6,})/i);
  return match?.[1] ?? null;
}

export function collectAmazonAsins(listingUrls?: Partial<Record<string, string>>): string[] {
  if (!listingUrls?.amazon) return [];
  const asin = amazonAsinFromUrl(listingUrls.amazon);
  return asin ? [asin] : [];
}

export function collectWalmartItemIds(listingUrls?: Partial<Record<string, string>>): string[] {
  if (!listingUrls?.walmart) return [];
  const id = walmartItemIdFromUrl(listingUrls.walmart);
  return id ? [id] : [];
}
