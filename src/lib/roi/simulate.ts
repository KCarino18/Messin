import type { SealedTypeId } from "@/lib/sealedTypes";
import { poolByRarity, type PricedCard } from "./cardData";

/** TCGPlayer-ish sell friction (fees + time/shipping drag). */
export const SELL_FRICTION = 0.13;

/** Floor value for bulk when selling as sealed-open singles. */
const BULK_NONFOIL: Record<PricedCard["rarity"], number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  mythic: 50,
};
const BULK_FOIL: Record<PricedCard["rarity"], number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  mythic: 100,
};

/** Traditional foil-sheet rarity mix (approx.). */
const FOIL_SLOT_RARITY: Array<{ rarity: PricedCard["rarity"]; weight: number }> = [
  { rarity: "common", weight: 0.67 },
  { rarity: "uncommon", weight: 0.21 },
  { rarity: "rare", weight: 0.105 },
  { rarity: "mythic", weight: 0.015 },
];

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

function pickWeightedRarity(rand: () => number): PricedCard["rarity"] {
  const roll = rand();
  let acc = 0;
  for (const row of FOIL_SLOT_RARITY) {
    acc += row.weight;
    if (roll <= acc) return row.rarity;
  }
  return "common";
}

/** Use TCGPlayer Normal vs Foil market explicitly. */
function cardValue(card: PricedCard | null, finish: "nonfoil" | "foil"): number {
  if (!card) return 0;
  if (finish === "foil") {
    const foil = card.foilPriceCents > 0 ? card.foilPriceCents : Math.round(card.priceCents * 1.35);
    return Math.max(foil, BULK_FOIL[card.rarity]);
  }
  return Math.max(card.priceCents, BULK_NONFOIL[card.rarity]);
}

function rareMythicSlot(
  pools: ReturnType<typeof poolByRarity>,
  rand: () => number,
  finish: "nonfoil" | "foil",
): number {
  // Traditional rare slot: mythic replaces rare ~1/7.4
  const mythicRate = 1 / 7.4;
  if (rand() < mythicRate && pools.mythic.length > 0) {
    return cardValue(pick(pools.mythic, rand), finish);
  }
  return cardValue(pick(pools.rare, rand) ?? pick(pools.mythic, rand), finish);
}

function foilAnyRaritySlot(
  pools: ReturnType<typeof poolByRarity>,
  rand: () => number,
): number {
  const rarity = pickWeightedRarity(rand);
  const pool = pools[rarity];
  // Fall back up the rarity ladder if a pool is empty.
  const card =
    pick(pool, rand) ??
    pick(pools.common, rand) ??
    pick(pools.uncommon, rand) ??
    pick(pools.rare, rand) ??
    pick(pools.mythic, rand);
  return cardValue(card, "foil");
}

/**
 * Play Booster: mostly non-foil slots + one traditional foil slot
 * (foil and non-foil priced separately from TCGPlayer).
 */
function openPlayPack(
  pools: ReturnType<typeof poolByRarity>,
  rand: () => number,
): number {
  let total = 0;
  // Non-foil commons / uncommons / rare
  for (let i = 0; i < 6; i++) total += cardValue(pick(pools.common, rand), "nonfoil");
  for (let i = 0; i < 3; i++) total += cardValue(pick(pools.uncommon, rand), "nonfoil");
  total += rareMythicSlot(pools, rand, "nonfoil");
  // Traditional foil slot (any rarity)
  total += foilAnyRaritySlot(pools, rand);
  // Play Booster wildcard / extra premium ~12%
  if (rand() < 0.12) {
    total += rareMythicSlot(pools, rand, rand() < 0.25 ? "foil" : "nonfoil");
  }
  return total;
}

/**
 * Collector Booster: mix of non-foil and foil slots, each using the matching
 * TCGPlayer Normal / Foil market price.
 */
function openCollectorPack(
  pools: ReturnType<typeof poolByRarity>,
  rand: () => number,
): number {
  let total = 0;
  // Non-foil rare/mythic
  total += rareMythicSlot(pools, rand, "nonfoil");
  // Foil rare/mythic
  total += rareMythicSlot(pools, rand, "foil");
  // Non-foil uncommons
  for (let i = 0; i < 2; i++) total += cardValue(pick(pools.uncommon, rand), "nonfoil");
  // Foil uncommons
  for (let i = 0; i < 2; i++) total += cardValue(pick(pools.uncommon, rand), "foil");
  // Non-foil commons
  for (let i = 0; i < 2; i++) total += cardValue(pick(pools.common, rand), "nonfoil");
  // Foil commons / wildcard foil
  for (let i = 0; i < 3; i++) total += cardValue(pick(pools.common, rand), "foil");
  // Extra foil-any slot (special treatments approximated as foil market)
  total += foilAnyRaritySlot(pools, rand);
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

  const withFoil = options.cards.filter((c) => c.foilPriceCents > 0).length;
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
      ? "Collector Booster (non-foil + foil slots @ TCGPlayer Normal/Foil)"
      : options.sealedType === "bundle"
        ? "Bundle ≈ 8 Play Boosters (non-foil + foil slots)"
        : "Play Booster (non-foil commons/uncommons/rare + traditional foil slot)";

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
      `TCGPlayer Normal + Foil market prices (${withFoil}/${options.cards.length} cards have foil quotes).`,
      `Assumes selling singles with ~${Math.round(SELL_FRICTION * 100)}% fees/friction.`,
      "Pull rates are a simplified foil/non-foil slot model — not official Wizards odds.",
    ],
  };
}
