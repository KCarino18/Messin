import { cents } from "@/lib/money";
import { isPreorderRadarEligible } from "@/lib/sealedTypes";
import type { ProductSeed } from "@/lib/retailers/types";

/**
 * Catalog tuned for ~July 2026:
 * - Budget deals: currently available sealed
 * - Preorder radar: just-released (Marvel Super Heroes, Jun 26) + unreleased upcoming sets
 */
export const SEALED_CATALOG: ProductSeed[] = [
  // —— Just released / still hot ——
  {
    id: "msh-play-booster-box",
    name: "Marvel Super Heroes Play Booster Box",
    setName: "Marvel Super Heroes",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-06-26",
    msrpCents: cents(143.76),
  },
  {
    id: "msh-collector-booster-box",
    name: "Marvel Super Heroes Collector Booster Box",
    setName: "Marvel Super Heroes",
    category: "box",
    sealedType: "collector_booster_box",
    releaseDate: "2026-06-26",
    msrpCents: cents(287.76),
  },
  {
    id: "msh-collector-booster-display",
    name: "Marvel Super Heroes Collector Booster Display",
    setName: "Marvel Super Heroes",
    category: "box",
    sealedType: "collector_booster_display",
    releaseDate: "2026-06-26",
    msrpCents: cents(287.76),
  },
  {
    id: "msh-bundle",
    name: "Marvel Super Heroes Bundle",
    setName: "Marvel Super Heroes",
    category: "bundle",
    sealedType: "bundle",
    releaseDate: "2026-06-26",
    msrpCents: cents(49.99),
  },

  // —— Upcoming (preorder) ——
  {
    id: "hobbit-play-booster-box",
    name: "The Hobbit Play Booster Box",
    setName: "The Hobbit",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-08-14",
    msrpCents: cents(143.76),
  },
  {
    id: "hobbit-collector-booster-box",
    name: "The Hobbit Collector Booster Box",
    setName: "The Hobbit",
    category: "box",
    sealedType: "collector_booster_box",
    releaseDate: "2026-08-14",
    msrpCents: cents(287.76),
  },
  {
    id: "hobbit-collector-booster-display",
    name: "The Hobbit Collector Booster Display",
    setName: "The Hobbit",
    category: "box",
    sealedType: "collector_booster_display",
    releaseDate: "2026-08-14",
    msrpCents: cents(287.76),
  },
  {
    id: "hobbit-bundle",
    name: "The Hobbit Bundle",
    setName: "The Hobbit",
    category: "bundle",
    sealedType: "bundle",
    releaseDate: "2026-08-14",
    msrpCents: cents(49.99),
  },
  {
    id: "reality-fracture-play-booster-box",
    name: "Reality Fracture Play Booster Box",
    setName: "Reality Fracture",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-10-02",
    msrpCents: cents(143.76),
  },
  {
    id: "reality-fracture-collector-booster-box",
    name: "Reality Fracture Collector Booster Box",
    setName: "Reality Fracture",
    category: "box",
    sealedType: "collector_booster_box",
    releaseDate: "2026-10-02",
    msrpCents: cents(287.76),
  },
  {
    id: "star-trek-play-booster-box",
    name: "Star Trek Play Booster Box",
    setName: "Star Trek",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-11-13",
    msrpCents: cents(143.76),
  },
  {
    id: "star-trek-collector-booster-display",
    name: "Star Trek Collector Booster Display",
    setName: "Star Trek",
    category: "box",
    sealedType: "collector_booster_display",
    releaseDate: "2026-11-13",
    msrpCents: cents(287.76),
  },

  // —— Released catalog for budget deals ——
  {
    id: "strixhaven-secrets-play-booster-box",
    name: "Secrets of Strixhaven Play Booster Box",
    setName: "Secrets of Strixhaven",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-04-24",
    msrpCents: cents(143.76),
  },
  {
    id: "strixhaven-secrets-collector-booster-box",
    name: "Secrets of Strixhaven Collector Booster Box",
    setName: "Secrets of Strixhaven",
    category: "box",
    sealedType: "collector_booster_box",
    releaseDate: "2026-04-24",
    msrpCents: cents(287.76),
  },
  {
    id: "tmnt-play-booster-box",
    name: "Teenage Mutant Ninja Turtles Play Booster Box",
    setName: "Teenage Mutant Ninja Turtles",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-03-06",
    msrpCents: cents(143.76),
  },
  {
    id: "tmnt-collector-booster-display",
    name: "Teenage Mutant Ninja Turtles Collector Booster Display",
    setName: "Teenage Mutant Ninja Turtles",
    category: "box",
    sealedType: "collector_booster_display",
    releaseDate: "2026-03-06",
    msrpCents: cents(287.76),
  },
  {
    id: "lorwyn-eclipsed-play-booster-box",
    name: "Lorwyn Eclipsed Play Booster Box",
    setName: "Lorwyn Eclipsed",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2026-01-23",
    msrpCents: cents(143.76),
  },
  {
    id: "lorwyn-eclipsed-set-booster-box",
    name: "Lorwyn Eclipsed Set Booster Box",
    setName: "Lorwyn Eclipsed",
    category: "box",
    sealedType: "set_booster_box",
    releaseDate: "2026-01-23",
    msrpCents: cents(143.76),
  },
  {
    id: "lorwyn-eclipsed-collector-booster-box",
    name: "Lorwyn Eclipsed Collector Booster Box",
    setName: "Lorwyn Eclipsed",
    category: "box",
    sealedType: "collector_booster_box",
    releaseDate: "2026-01-23",
    msrpCents: cents(287.76),
  },
  {
    id: "fdn-play-booster-box",
    name: "Foundations Play Booster Box",
    setName: "Foundations",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2024-11-15",
    msrpCents: cents(143.76),
  },
  {
    id: "fdn-bundle",
    name: "Foundations Bundle",
    setName: "Foundations",
    category: "bundle",
    sealedType: "bundle",
    releaseDate: "2024-11-15",
    msrpCents: cents(44.99),
  },
  {
    id: "mh3-play-booster-box",
    name: "Modern Horizons 3 Play Booster Box",
    setName: "Modern Horizons 3",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2024-06-14",
    msrpCents: cents(159.99),
  },
  {
    id: "mh3-collector-booster-box",
    name: "Modern Horizons 3 Collector Booster Box",
    setName: "Modern Horizons 3",
    category: "box",
    sealedType: "collector_booster_box",
    releaseDate: "2024-06-14",
    msrpCents: cents(299.99),
  },
  {
    id: "blb-commander-deck-display",
    name: "Bloomburrow Commander Deck Display",
    setName: "Bloomburrow",
    category: "commander",
    sealedType: "commander_deck_display",
    releaseDate: "2024-08-02",
    msrpCents: cents(179.96),
  },
  {
    id: "dsk-play-booster-box",
    name: "Duskmourn Play Booster Box",
    setName: "Duskmourn",
    category: "box",
    sealedType: "play_booster_box",
    releaseDate: "2024-09-27",
    msrpCents: cents(143.76),
  },
];

export function productSearchText(p: ProductSeed): string {
  return `${p.name} ${p.setName} ${p.category} ${p.sealedType} sealed`.toLowerCase();
}

export function preorderCatalog(now = new Date()): ProductSeed[] {
  return SEALED_CATALOG.filter((p) => isPreorderRadarEligible(p.releaseDate, now));
}
