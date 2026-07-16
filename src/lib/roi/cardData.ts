import { SEALED_CATALOG } from "@/lib/catalog/products";
import { fetchTcgPlayerSinglesForGroup } from "@/lib/retailers/tcgcsv";

export type PricedCard = {
  name: string;
  rarity: "common" | "uncommon" | "rare" | "mythic";
  /** TCGPlayer Normal (non-foil) market. */
  priceCents: number;
  /** TCGPlayer Foil market (0 if no foil listing). */
  foilPriceCents: number;
};

type CacheEntry = { at: number; cards: PricedCard[] };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

function tcgGroupIdForSet(setName: string): number | null {
  const hit = SEALED_CATALOG.find(
    (p) => p.setName === setName && p.tcgplayerGroupId != null,
  );
  return hit?.tcgplayerGroupId ?? null;
}

/** Load unique main-set cards priced from TCGPlayer market (via tcgcsv). */
export async function loadPricedCardsForSet(setName: string): Promise<PricedCard[]> {
  const groupId = tcgGroupIdForSet(setName);
  if (groupId == null) return [];

  const cacheKey = `tcg:${groupId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.cards;

  const singles = await fetchTcgPlayerSinglesForGroup(groupId);
  const cards: PricedCard[] = singles.map((s) => ({
    name: s.name,
    rarity: s.rarity,
    // Keep Normal and Foil distinct — sim slots pick the matching finish.
    priceCents: s.marketPriceCents,
    foilPriceCents:
      s.foilMarketPriceCents && s.foilMarketPriceCents > 0
        ? s.foilMarketPriceCents
        : 0,
  }));

  cache.set(cacheKey, { at: Date.now(), cards });
  return cards;
}

export function poolByRarity(cards: PricedCard[]) {
  return {
    common: cards.filter((c) => c.rarity === "common"),
    uncommon: cards.filter((c) => c.rarity === "uncommon"),
    rare: cards.filter((c) => c.rarity === "rare"),
    mythic: cards.filter((c) => c.rarity === "mythic"),
  };
}
