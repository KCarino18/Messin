import { createHash, createHmac } from "node:crypto";
import { retailerName } from "../allowlist";
import { getApiCredentials } from "../../settings/apiCredentials";
import { collectAmazonAsins } from "../productIds";
import type { ProductSeed, RawOffer } from "../types";

const HOST = "webservices.amazon.com";
const REGION = "us-east-1";
const SERVICE = "ProductAdvertisingAPI";
const PATH = "/paapi5/getitems";
const TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secretKey: string, dateStamp: string) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function signPaapiRequest(input: {
  accessKey: string;
  secretKey: string;
  payload: string;
  amzDate: string;
  dateStamp: string;
}) {
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${input.amzDate}\n` +
    `x-amz-target:${TARGET}\n`;
  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST",
    PATH,
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(input.payload),
  ].join("\n");
  const credentialScope = `${input.dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(input.secretKey, input.dateStamp), stringToSign).toString("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    host: HOST,
    "content-encoding": "amz-1.0",
    "content-type": "application/json; charset=utf-8",
    "x-amz-date": input.amzDate,
    "x-amz-target": TARGET,
    Authorization: authorization,
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

function parseAvailability(raw: unknown): { inStock: boolean; isPreorder: boolean } {
  const value = String(raw ?? "").toLowerCase();
  const isPreorder = value.includes("preorder") || value.includes("pre-order");
  const outOfStock =
    value.includes("outofstock") ||
    value.includes("out of stock") ||
    value.includes("unavailable");
  return { inStock: !outOfStock || isPreorder, isPreorder };
}

function listingPrice(item: Record<string, unknown>): number | null {
  const offersV2 = item.OffersV2 as Record<string, unknown> | undefined;
  const listingsV2 = offersV2?.Listings as Array<Record<string, unknown>> | undefined;
  const v2Price = listingsV2?.[0]?.Price as Record<string, unknown> | undefined;
  const v2Money = v2Price?.Money as Record<string, unknown> | undefined;
  const v2Amount = moneyToCents(v2Money?.Amount ?? v2Money?.DisplayAmount);
  if (v2Amount != null) return v2Amount;

  const offers = item.Offers as Record<string, unknown> | undefined;
  const listings = offers?.Listings as Array<Record<string, unknown>> | undefined;
  const price = listings?.[0]?.Price as Record<string, unknown> | undefined;
  return moneyToCents(price?.Amount ?? price?.DisplayAmount);
}

function listingAvailability(item: Record<string, unknown>) {
  const offersV2 = item.OffersV2 as Record<string, unknown> | undefined;
  const listingsV2 = offersV2?.Listings as Array<Record<string, unknown>> | undefined;
  const v2Availability = listingsV2?.[0]?.Availability as Record<string, unknown> | undefined;
  if (v2Availability?.Type) return parseAvailability(v2Availability.Type);

  const offers = item.Offers as Record<string, unknown> | undefined;
  const listings = offers?.Listings as Array<Record<string, unknown>> | undefined;
  const availability = listings?.[0]?.Availability as Record<string, unknown> | undefined;
  return parseAvailability(availability?.Type ?? availability?.Message);
}

export async function fetchAmazonPaApiOffers(product: ProductSeed): Promise<RawOffer[]> {
  const creds = getApiCredentials().amazon;
  if (!creds) return [];

  const asins = collectAmazonAsins(product.listingUrls);
  if (asins.length === 0) return [];

  const payload = JSON.stringify({
    ItemIds: asins,
    ItemIdType: "ASIN",
    PartnerTag: creds.partnerTag,
    PartnerType: "Associates",
    Marketplace: creds.marketplace,
    Resources: [
      "ItemInfo.Title",
      "OffersV2.Listings.Price",
      "OffersV2.Listings.Availability",
      "Offers.Listings.Price",
      "Offers.Listings.Availability",
    ],
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers = signPaapiRequest({
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    payload,
    amzDate,
    dateStamp,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`https://${HOST}${PATH}`, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("Amazon PA-API error", res.status, text.slice(0, 400));
      return [];
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return [];
    }

    const errors = data.Errors as Array<Record<string, unknown>> | undefined;
    if (errors?.length) {
      console.error("Amazon PA-API response errors", errors.slice(0, 2));
    }

    const itemsResult = data.ItemsResult as Record<string, unknown> | undefined;
    const items = itemsResult?.Items as Array<Record<string, unknown>> | undefined;
    if (!items?.length) return [];

    const offers: RawOffer[] = [];
    for (const item of items) {
      const asin = String(item.ASIN ?? "");
      const priceCents = listingPrice(item);
      if (!asin || priceCents == null || priceCents < 500) continue;
      const availability = listingAvailability(item);
      const detailPage = item.DetailPageURL as string | undefined;
      offers.push({
        retailerId: "amazon",
        sellerName: retailerName("amazon"),
        itemPriceCents: priceCents,
        shippingCents: 0,
        url: detailPage ?? `https://www.amazon.com/dp/${asin}`,
        inStock: availability.inStock,
        isPreorder: availability.isPreorder,
        isDemo: false,
        soldByAmazon: true,
      });
    }
    return offers;
  } catch (error) {
    console.error("Amazon PA-API fetch failed", product.id, error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
