import { cents } from "@/lib/money";
import { scryfallCodeForSet } from "./setMeta";

export type PricedCard = {
  name: string;
  rarity: "common" | "uncommon" | "rare" | "mythic";
  priceCents: number;
  foilPriceCents: number;
};

type CacheEntry = { at: number; cards: PricedCard[] };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000;

type ScryfallCard = {
  name: string;
  rarity: string;
  prices?: { usd?: string | null; usd_foil?: string | null };
  type_line?: string;
  booster?: boolean;
};

function parseUsd(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? cents(n) : 0;
}

function normalizeRarity(
  rarity: string,
): PricedCard["rarity"] | null {
  if (rarity === "common" || rarity === "uncommon" || rarity === "rare" || rarity === "mythic") {
    return rarity;
  }
  return null;
}

async function fetchScryfallPages(code: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${code} unique:cards`)}&order=rarity`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MTG-Budget/0.3",
      },
    });
    if (!res.ok) {
      throw new Error(`Scryfall ${res.status} for ${code}`);
    }
    const body = (await res.json()) as {
      data: ScryfallCard[];
      has_more?: boolean;
      next_page?: string;
    };
    cards.push(...body.data);
    url = body.has_more && body.next_page ? body.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 75));
  }
  return cards;
}

/** Load unique main-set cards with USD prices for ROI simulation. */
export async function loadPricedCardsForSet(setName: string): Promise<PricedCard[]> {
  const code = scryfallCodeForSet(setName);
  if (!code) return [];

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.cards;

  const raw = await fetchScryfallPages(code);
  const byName = new Map<string, PricedCard>();

  for (const card of raw) {
    const rarity = normalizeRarity(card.rarity);
    if (!rarity) continue;
    // Skip basic lands for valuable slots (still fine as commons).
    const isBasic =
      typeof card.type_line === "string" &&
      /^Basic Land\b/i.test(card.type_line);
    if (isBasic && rarity === "common") continue;

    const priceCents = parseUsd(card.prices?.usd);
    const foilPriceCents = parseUsd(card.prices?.usd_foil) || Math.round(priceCents * 1.35);
    if (priceCents <= 0 && foilPriceCents <= 0) continue;

    const existing = byName.get(card.name);
    const next: PricedCard = {
      name: card.name,
      rarity,
      priceCents: Math.max(priceCents, existing?.priceCents ?? 0),
      foilPriceCents: Math.max(foilPriceCents, existing?.foilPriceCents ?? 0),
    };
    byName.set(card.name, next);
  }

  const cards = [...byName.values()];
  cache.set(code, { at: Date.now(), cards });
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
