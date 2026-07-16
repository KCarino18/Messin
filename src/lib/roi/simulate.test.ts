import assert from "node:assert/strict";
import { simulateSealedRoi } from "./simulate";
import type { PricedCard } from "./cardData";

function makePool(): PricedCard[] {
  const cards: PricedCard[] = [];
  for (let i = 0; i < 80; i++) {
    cards.push({
      name: `Common ${i}`,
      rarity: "common",
      priceCents: 10,
      foilPriceCents: 30, // distinct foil quote
    });
  }
  for (let i = 0; i < 40; i++) {
    cards.push({
      name: `Uncommon ${i}`,
      rarity: "uncommon",
      priceCents: 40,
      foilPriceCents: 120,
    });
  }
  for (let i = 0; i < 50; i++) {
    cards.push({
      name: `Rare ${i}`,
      rarity: "rare",
      priceCents: i < 5 ? 2000 : 150,
      foilPriceCents: i < 5 ? 4500 : 400, // foil chases worth more
    });
  }
  for (let i = 0; i < 15; i++) {
    cards.push({
      name: `Mythic ${i}`,
      rarity: "mythic",
      priceCents: i < 2 ? 8000 : 600,
      foilPriceCents: i < 2 ? 15000 : 1200,
    });
  }
  return cards;
}

const cheapBuy = simulateSealedRoi({
  cards: makePool(),
  sealedType: "collector_booster_display",
  buyPriceCents: 10000, // $100 — should often break even
  trials: 1500,
  seed: 7,
});

assert.ok(cheapBuy);
assert.ok(cheapBuy!.breakEvenChancePercent > 50);
assert.ok(cheapBuy!.expectedNetCents > cheapBuy!.buyPriceCents);

const expensiveBuy = simulateSealedRoi({
  cards: makePool(),
  sealedType: "collector_booster_display",
  buyPriceCents: 200000, // $2000 — should rarely break even
  trials: 1500,
  seed: 7,
});

assert.ok(expensiveBuy);
assert.ok(expensiveBuy!.breakEvenChancePercent < 20);

console.log(
  `simulate.test.ts passed (cheap ${cheapBuy!.breakEvenChancePercent}% / expensive ${expensiveBuy!.breakEvenChancePercent}%)`,
);
