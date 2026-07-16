import { cents } from "@/lib/money";
import { retailerProductSearchUrl } from "./urls";
import type { ProductSeed, RawOffer } from "./types";

/** Deterministic pseudo-random from product id + retailer for stable demo prices */
function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function jitter(seed: string, min: number, max: number): number {
  const h = hash(seed);
  return min + (h % (max - min + 1));
}

export function buildDemoOffers(product: ProductSeed): RawOffer[] {
  const msrp = product.msrpCents;
  const base = Math.round(msrp * (0.88 + jitter(product.id, 0, 20) / 100));
  const isPreorderProduct = new Date(`${product.releaseDate}T12:00:00Z`).getTime() > Date.now();

  const offers: RawOffer[] = [
    {
      retailerId: "card_kingdom",
      sellerName: "Card Kingdom",
      itemPriceCents: base + jitter(`${product.id}-ck`, -200, 400),
      shippingCents: product.msrpCents >= 5000 ? 0 : 399,
      url: retailerProductSearchUrl("card_kingdom", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
    },
    {
      retailerId: "coolstuffinc",
      sellerName: "CoolStuffInc",
      itemPriceCents: base + jitter(`${product.id}-csi`, -300, 500),
      shippingCents: 499,
      url: retailerProductSearchUrl("coolstuffinc", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
    },
    {
      retailerId: "channel_fireball",
      sellerName: "Channel Fireball",
      itemPriceCents: base + jitter(`${product.id}-cfb`, -100, 600),
      shippingCents: 399,
      url: retailerProductSearchUrl("channel_fireball", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
    },
    {
      retailerId: "starcitygames",
      sellerName: "StarCityGames",
      itemPriceCents: base + jitter(`${product.id}-scg`, -250, 450),
      shippingCents: 499,
      url: retailerProductSearchUrl("starcitygames", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
    },
    {
      retailerId: "gamenerdz",
      sellerName: "GameNerdz",
      itemPriceCents: Math.round(msrp * 0.92) + jitter(`${product.id}-gn`, -150, 350),
      shippingCents: 299,
      url: retailerProductSearchUrl("gamenerdz", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
    },
    {
      retailerId: "amazon",
      sellerName: "Amazon.com",
      itemPriceCents: base + jitter(`${product.id}-amz`, -400, 700),
      shippingCents: 0,
      url: retailerProductSearchUrl("amazon", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
      soldByAmazon: true,
    },
    {
      retailerId: "target",
      sellerName: "Target",
      itemPriceCents: msrp + jitter(`${product.id}-tgt`, -100, 200),
      shippingCents: 0,
      url: retailerProductSearchUrl("target", product.name),
      inStock: jitter(`${product.id}-tgt-stock`, 0, 3) !== 0,
      isPreorder: isPreorderProduct,
      isDemo: true,
      soldByTarget: true,
    },
    {
      retailerId: "walmart",
      sellerName: "Walmart",
      itemPriceCents: msrp + jitter(`${product.id}-wmt`, -200, 300),
      shippingCents: 0,
      url: retailerProductSearchUrl("walmart", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
      soldByWalmart: true,
    },
    {
      retailerId: "tcgplayer",
      sellerName: "MTG Sealed Vault",
      itemPriceCents: Math.round(msrp * 0.85) + jitter(`${product.id}-tcg`, -200, 300),
      shippingCents: 199,
      url: retailerProductSearchUrl("tcgplayer", product.name),
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: true,
      tcgSellerRating: 99.5,
      tcgFeedbackCount: 4200,
      shipsFromUs: true,
    },
    {
      retailerId: "tcgplayer",
      sellerName: "PennyShipExpress",
      itemPriceCents: cents(0.01),
      shippingCents: cents(500),
      url: "https://www.tcgplayer.com/scam-example",
      inStock: true,
      isPreorder: false,
      isDemo: true,
      tcgSellerRating: 91,
      tcgFeedbackCount: 12,
      shipsFromUs: true,
    },
    {
      retailerId: "amazon",
      sellerName: "Random3PSeller",
      itemPriceCents: Math.round(msrp * 0.7),
      shippingCents: cents(12.99),
      url: "https://www.amazon.com/3p-example",
      inStock: true,
      isPreorder: false,
      isDemo: true,
      soldByAmazon: false,
    },
  ];

  return offers;
}
