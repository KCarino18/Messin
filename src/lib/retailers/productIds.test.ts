import assert from "node:assert/strict";
import {
  amazonAsinFromUrl,
  collectAmazonAsins,
  collectWalmartItemIds,
  walmartItemIdFromUrl,
} from "./productIds";

assert.equal(amazonAsinFromUrl("https://www.amazon.com/dp/B0GXCBJG9L"), "B0GXCBJG9L");
assert.equal(
  amazonAsinFromUrl("https://www.amazon.com/gp/product/B0F8XQK9LM/ref=abc"),
  "B0F8XQK9LM",
);
assert.equal(
  walmartItemIdFromUrl(
    "https://www.walmart.com/ip/Magic-The-Gathering-The-Hobbit-Play-Booster-Display/20213053526",
  ),
  "20213053526",
);
assert.deepEqual(
  collectAmazonAsins({ amazon: "https://www.amazon.com/dp/B0GXCBJG9L" }),
  ["B0GXCBJG9L"],
);
assert.deepEqual(
  collectWalmartItemIds({
    walmart:
      "https://www.walmart.com/ip/Magic-The-Gathering-The-Hobbit-Play-Booster-Display/20213053526",
  }),
  ["20213053526"],
);

console.log("productIds.test.ts passed");
