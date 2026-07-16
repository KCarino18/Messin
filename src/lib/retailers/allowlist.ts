export type RetailerId =
  | "card_kingdom"
  | "coolstuffinc"
  | "channel_fireball"
  | "starcitygames"
  | "gamenerdz"
  | "amazon"
  | "target"
  | "walmart"
  | "tcgplayer";

export type RetailerConfig = {
  id: RetailerId;
  name: string;
  domain: string;
  directOnly: boolean;
  marketplace: boolean;
};

export const RETAILER_ALLOWLIST: RetailerConfig[] = [
  {
    id: "card_kingdom",
    name: "Card Kingdom",
    domain: "cardkingdom.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "coolstuffinc",
    name: "CoolStuffInc",
    domain: "coolstuffinc.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "channel_fireball",
    name: "Channel Fireball",
    domain: "channelfireball.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "starcitygames",
    name: "StarCityGames",
    domain: "starcitygames.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "gamenerdz",
    name: "GameNerdz",
    domain: "gamenerdz.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "amazon",
    name: "Amazon",
    domain: "amazon.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "target",
    name: "Target",
    domain: "target.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "walmart",
    name: "Walmart",
    domain: "walmart.com",
    directOnly: true,
    marketplace: false,
  },
  {
    id: "tcgplayer",
    name: "TCGPlayer Marketplace",
    domain: "tcgplayer.com",
    directOnly: false,
    marketplace: true,
  },
];

export const RETAILER_BY_ID = Object.fromEntries(
  RETAILER_ALLOWLIST.map((r) => [r.id, r]),
) as Record<RetailerId, RetailerConfig>;

export function isAllowlistedRetailer(id: string): id is RetailerId {
  return id in RETAILER_BY_ID;
}
