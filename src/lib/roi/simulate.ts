import type { SealedTypeId } from "@/lib/sealedTypes";
import { poolByRarity, type PricedCard } from "./cardData";

/** TCGPlayer-ish sell friction (fees + time/shipping drag). */
export const SELL_FRICTION = 0.13;

/** Floor value for bulk commons when selling as sealed-open singles. */
const BULK_COMMON_CENTS = 5;
const BULK_UNCOMMON_CENTS = 15;

export type RoiResult = {
  packCount: number;
  expectedGrossCents: number;
  expectedNetCents: number;
  buyPriceCents: number;
  roiPercent: number;
  breakEvenChancePercent: number;
  trials: number;
  model: string;
  notes: string[];
};

function pick<T>(arr: T[], rand: () => number): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(rand() * arr.length)]!;
}

function cardValue(card: PricedCard | null, foil: boolean): number {
  if (!card) return 0;
  if (foil) return Math.max(card.foilPriceCents, card.priceCents, BULK_COMMON_CENTS);
  if (card.rarity === "common") return Math.max(card.priceCents, BULK_COMMON_CENTS);
  if (card.rarity === "uncommon") return Math.max(card.priceCents, BULK_UNCOMMON_CENTS);
  return Math.max(card.priceCents, BULK_UNCOMMON_CENTS);
}

function rareMythicSlot(
  rares: PricedCard[],
  mythics: PricedCard[],
  rand: () => number,
  foil: boolean,
): number {
  // Traditional rare slot: mythic replaces rare ~1/7.4
  const mythicRate = 1 / 7.4;
  if (rand() < mythicRate && mythics.length > 0) {
    return cardValue(pick(mythics, rand), foil);
  }
  return cardValue(pick(rares, rand) ?? pick(mythics, rand), foil);
}

/** Simplified Play Booster value for one pack. */
function openPlayPack(
  pools: ReturnType<typeof poolByRarity>,
  rand: () => number,
): number {
  let total = 0;
  // 6 commons
  for (let i = 0; i < 6; i++) total += cardValue(pick(pools.common, rand), false);
  // 3 uncommons
  for (let i = 0; i < 3; i++) total += cardValue(pick(pools.uncommon, rand), false);
  // 1 rare/mythic
  total += rareMythicSlot(pools.rare, pools.mythic, rand, false);
  // Wildcard-ish second premium ~12% of packs (Play Booster chaos slot)
  if (rand() < 0.12) {
    total += rareMythicSlot(pools.rare, pools.mythic, rand, false);
  }
  return total;
}

/** Simplified Collector Booster value for one pack. */
function openCollectorPack(
  pools: ReturnType<typeof poolByRarity>,
  rand: () => number,
): number {
  let total = 0;
  // Traditional rare/mythic
  total += rareMythicSlot(pools.rare, pools.mythic, rand, false);
  // Foil rare/mythic (or special treatment approximated as foil)
  total += rareMythicSlot(pools.rare, pools.mythic, rand, true);
  // Elevated uncommons / foil uncommons
  for (let i = 0; i < 2; i++) {
    total += cardValue(pick(pools.uncommon, rand), true);
  }
  // Foil commons filler
  for (let i = 0; i < 3; i++) {
    total += cardValue(pick(pools.common, rand), true);
  }
  return total;
}

function packCountFor(sealedType: SealedTypeId): number | null {
  switch (sealedType) {
    case "play_booster_box":
      return 36;
    case "collector_booster_display":
      return 12;
    case "bundle":
      return 8; // treated as 8 Play Boosters
    default:
      return null;
  }
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateSealedRoi(options: {
  cards: PricedCard[];
  sealedType: SealedTypeId;
  buyPriceCents: number;
  trials?: number;
  seed?: number;
}): RoiResult | null {
  const packCount = packCountFor(options.sealedType);
  if (!packCount || options.buyPriceCents <= 0) return null;

  const pools = poolByRarity(options.cards);
  if (pools.rare.length + pools.mythic.length < 5) return null;

  const trials = options.trials ?? 4000;
  const rand = mulberry32(options.seed ?? 42);
  const openPack =
    options.sealedType === "collector_booster_display"
      ? openCollectorPack
      : openPlayPack;

  let grossSum = 0;
  let wins = 0;

  for (let t = 0; t < trials; t++) {
    let gross = 0;
    for (let p = 0; p < packCount; p++) {
      gross += openPack(pools, rand);
    }
    const net = Math.round(gross * (1 - SELL_FRICTION));
    grossSum += gross;
    if (net >= options.buyPriceCents) wins += 1;
  }

  const expectedGrossCents = Math.round(grossSum / trials);
  const expectedNetCents = Math.round(expectedGrossCents * (1 - SELL_FRICTION));
  const roiPercent =
    Math.round(
      ((expectedNetCents - options.buyPriceCents) / options.buyPriceCents) * 1000,
    ) / 10;
  const breakEvenChancePercent = Math.round((wins / trials) * 1000) / 10;

  const model =
    options.sealedType === "collector_booster_display"
      ? "Collector Booster slot model (rare + foil rare + foil uncommons)"
      : options.sealedType === "bundle"
        ? "Bundle ≈ 8 Play Boosters"
        : "Play Booster slot model (commons/uncommons/rare + wildcard)";

  return {
    packCount,
    expectedGrossCents,
    expectedNetCents,
    buyPriceCents: options.buyPriceCents,
    roiPercent,
    breakEvenChancePercent,
    trials,
    model,
    notes: [
      `Assumes selling singles with ~${Math.round(SELL_FRICTION * 100)}% fees/friction.`,
      "Pull rates are a simplified model — not official Wizards odds for every special slot.",
      "Special guests, list cards, and treatment variants can swing results.",
    ],
  };
}
