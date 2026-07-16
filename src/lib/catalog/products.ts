import { cents } from "@/lib/money";
import type { ProductSeed } from "@/lib/retailers/types";

export const SEALED_CATALOG: ProductSeed[] = [
  {
    id: "mh3-play-booster-box",
    name: "Modern Horizons 3 Play Booster Box",
    setName: "Modern Horizons 3",
    category: "box",
    msrpCents: cents(159.99),
  },
  {
    id: "mh3-collector-booster-box",
    name: "Modern Horizons 3 Collector Booster Box",
    setName: "Modern Horizons 3",
    category: "box",
    msrpCents: cents(299.99),
  },
  {
    id: "fdn-play-booster-box",
    name: "Foundations Play Booster Box",
    setName: "Foundations",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "fdn-bundle",
    name: "Foundations Bundle",
    setName: "Foundations",
    category: "bundle",
    msrpCents: cents(44.99),
  },
  {
    id: "dsk-play-booster-box",
    name: "Duskmourn: House of Horror Play Booster Box",
    setName: "Duskmourn",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "dsk-bundle",
    name: "Duskmourn Bundle",
    setName: "Duskmourn",
    category: "bundle",
    msrpCents: cents(44.99),
  },
  {
    id: "blb-play-booster-box",
    name: "Bloomburrow Play Booster Box",
    setName: "Bloomburrow",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "blb-commander-deck-set",
    name: "Bloomburrow Commander Deck Display",
    setName: "Bloomburrow",
    category: "commander",
    msrpCents: cents(179.96),
  },
  {
    id: "otj-play-booster-box",
    name: "Outlaws of Thunder Junction Play Booster Box",
    setName: "Outlaws of Thunder Junction",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "mkm-play-booster-box",
    name: "Murders at Karlov Manor Play Booster Box",
    setName: "Murders at Karlov Manor",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "lci-play-booster-box",
    name: "The Lost Caverns of Ixalan Play Booster Box",
    setName: "The Lost Caverns of Ixalan",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "woe-bundle",
    name: "Wilds of Eldraine Bundle",
    setName: "Wilds of Eldraine",
    category: "bundle",
    msrpCents: cents(44.99),
  },
  {
    id: "cmm-commander-masters-box",
    name: "Commander Masters Draft Booster Box",
    setName: "Commander Masters",
    category: "box",
    msrpCents: cents(329.99),
  },
  {
    id: "ltr-bundle",
    name: "The Lord of the Rings: Tales of Middle-earth Bundle",
    setName: "The Lord of the Rings",
    category: "bundle",
    msrpCents: cents(49.99),
  },
  {
    id: "upcoming-edge-of-eternities-play",
    name: "Edge of Eternities Play Booster Box",
    setName: "Edge of Eternities",
    category: "box",
    msrpCents: cents(143.76),
  },
  {
    id: "upcoming-edge-of-eternities-collector",
    name: "Edge of Eternities Collector Booster Box",
    setName: "Edge of Eternities",
    category: "box",
    msrpCents: cents(287.76),
  },
  {
    id: "upcoming-spider-man-bundle",
    name: "Marvel's Spider-Man Bundle",
    setName: "Marvel's Spider-Man",
    category: "bundle",
    msrpCents: cents(49.99),
  },
  {
    id: "upcoming-spider-man-play-box",
    name: "Marvel's Spider-Man Play Booster Box",
    setName: "Marvel's Spider-Man",
    category: "box",
    msrpCents: cents(143.76),
  },
];

export function productSearchText(p: ProductSeed): string {
  return `${p.name} ${p.setName} ${p.category} sealed`.toLowerCase();
}
