import assert from "node:assert/strict";
import { rankOffers, scoreOffer } from "./scorer";
import type { RawOffer } from "./types";

const msrp = 4499;

const scam: RawOffer = {
  retailerId: "tcgplayer",
  sellerName: "PennyShipExpress",
  itemPriceCents: 1,
  shippingCents: 50000,
  url: "https://example.com/scam",
  inStock: true,
  isPreorder: false,
  isDemo: true,
  tcgSellerRating: 91,
  tcgFeedbackCount: 12,
  shipsFromUs: true,
};

const good: RawOffer = {
  retailerId: "gamenerdz",
  sellerName: "GameNerdz",
  itemPriceCents: 3999,
  shippingCents: 299,
  url: "https://example.com/good",
  inStock: true,
  isPreorder: false,
  isDemo: true,
};

const amazon3p: RawOffer = {
  retailerId: "amazon",
  sellerName: "Random3P",
  itemPriceCents: 3500,
  shippingCents: 0,
  url: "https://example.com/3p",
  inStock: true,
  isPreorder: false,
  isDemo: true,
  soldByAmazon: false,
};

const amazonDirect: RawOffer = {
  retailerId: "amazon",
  sellerName: "Amazon.com",
  itemPriceCents: 4200,
  shippingCents: 0,
  url: "https://example.com/amz",
  inStock: true,
  isPreorder: false,
  isDemo: true,
  soldByAmazon: true,
};

assert.equal(scoreOffer(scam, msrp).rejected, true);
assert.equal(scoreOffer(amazon3p, msrp).rejected, true);
assert.equal(scoreOffer(good, msrp).rejected, false);

const ranked = rankOffers([scam, amazon3p, amazonDirect, good], msrp);
assert.ok(ranked.length >= 2);
assert.ok(ranked[0].totalCents <= ranked[1].totalCents);
assert.ok(!ranked.some((o) => o.sellerName === "PennyShipExpress"));
assert.ok(!ranked.some((o) => o.sellerName === "Random3P"));

console.log("scorer.test.ts passed");
