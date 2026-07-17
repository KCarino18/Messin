export type RetailerId =
  | "card_kingdom"
  | "coolstuffinc"
  | "channel_fireball"
  | "starcitygames"
  | "gamenerdz"
  | "amazon"
  | "target"
  | "walmart"
  | "tcgplayer"
  | "forge_and_fire"
  | "flipside_gaming"
  | "miniature_market"
  | "troll_and_toad"
  | "mox_boarding_house"
  | "cardhaus"
  | "millennium_games"
  | "gaming_etc"
  | "face_to_face"
  | "game_stop"
  | "best_buy"
  | "barnes_and_noble"
  | "top_deck_hero"
  | "untapped_games"
  | "mythic_store"
  | "card_sphere"
  | "adventure_games"
  | "red_castle"
  | "tabletop_gaming"
  | "hobby_town"
  | "critical_hit"
  | "collector_store"
  | "game_quest"
  | "enchanted_grounds"
  | "three_kingdoms"
  | "midtown_comics"
  | "forbidden_planet"
  | "abu_games"
  | "pastimes"
  | "ideal808"
  | "gamers_guild"
  | "gamezenter"
  | "shuffle_and_cut"
  | "nexus_tcg"
  | "games_401"
  | "wizard_tower"
  | "high_level_games"
  | "magic_madhouse"
  | "mana_leak"
  | "tcg_republic"
  | "hall_of_heroes"
  | "springfield_games"
  | "tcg_cafe";

export type RetailerConfig = {
  id: RetailerId;
  name: string;
  domain: string;
  directOnly: boolean;
  marketplace: boolean;
  /** Include in DuckDuckGo product-page discovery. */
  deepSearch?: boolean;
  /** Actively poll on Preorder Radar. */
  preorderWatch?: boolean;
};

/**
 * Reputable sealed retailers (US-first, plus a few strong NA/UK shops that
 * commonly list English MTG sealed and ship internationally).
 */
export const RETAILER_ALLOWLIST: RetailerConfig[] = [
  // —— Core ——
  {
    id: "card_kingdom",
    name: "Card Kingdom",
    domain: "cardkingdom.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "coolstuffinc",
    name: "CoolStuffInc",
    domain: "coolstuffinc.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "channel_fireball",
    name: "Channel Fireball",
    domain: "store.channelfireball.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "starcitygames",
    name: "StarCityGames",
    domain: "starcitygames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "gamenerdz",
    name: "GameNerdz",
    domain: "gamenerdz.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "amazon",
    name: "Amazon",
    domain: "amazon.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "target",
    name: "Target",
    domain: "target.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "walmart",
    name: "Walmart",
    domain: "walmart.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "tcgplayer",
    name: "TCGPlayer Marketplace",
    domain: "tcgplayer.com",
    directOnly: false,
    marketplace: true,
  },
  {
    id: "forge_and_fire",
    name: "Forge & Fire Gaming",
    domain: "forgeandfiregaming.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "flipside_gaming",
    name: "Flipside Gaming",
    domain: "flipsidegaming.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },

  // —— Major sealed specialists ——
  {
    id: "miniature_market",
    name: "Miniature Market",
    domain: "miniaturemarket.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "troll_and_toad",
    name: "Troll and Toad",
    domain: "trollandtoad.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "mox_boarding_house",
    name: "Mox Boarding House",
    domain: "moxboardinghouse.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "cardhaus",
    name: "Cardhaus",
    domain: "cardhaus.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "millennium_games",
    name: "Millennium Games",
    domain: "milleniumgames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "gaming_etc",
    name: "Gaming Etc",
    domain: "gamingetc.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "face_to_face",
    name: "Face to Face Games",
    domain: "facetofacegames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "abu_games",
    name: "ABU Games",
    domain: "abugames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
    preorderWatch: true,
  },
  {
    id: "pastimes",
    name: "Pastimes",
    domain: "pastimes.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "ideal808",
    name: "Ideal808",
    domain: "ideal808.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },

  // —— Big-box / mass retail ——
  {
    id: "game_stop",
    name: "GameStop",
    domain: "gamestop.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "best_buy",
    name: "Best Buy",
    domain: "bestbuy.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "barnes_and_noble",
    name: "Barnes & Noble",
    domain: "barnesandnoble.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "hobby_town",
    name: "HobbyTown",
    domain: "hobbytown.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "midtown_comics",
    name: "Midtown Comics",
    domain: "midtowncomics.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "forbidden_planet",
    name: "Forbidden Planet",
    domain: "forbiddenplanet.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },

  // —— Online LGS / specialty ——
  {
    id: "top_deck_hero",
    name: "Top Deck Hero",
    domain: "topdeckhero.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "untapped_games",
    name: "Untapped Games",
    domain: "untappedgames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "mythic_store",
    name: "Mythic Store",
    domain: "mythicstore.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "card_sphere",
    name: "Card Sphere",
    domain: "cardsphere.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "adventure_games",
    name: "Adventure Games",
    domain: "adventuregamesonline.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "red_castle",
    name: "Red Castle Games",
    domain: "redcastlegames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "tabletop_gaming",
    name: "TableTop Gaming Center",
    domain: "tabletopgamingcenter.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "critical_hit",
    name: "Critical Hit Games",
    domain: "criticalhitgames.net",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "collector_store",
    name: "Collector Store",
    domain: "collectorstore.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "game_quest",
    name: "Game Quest",
    domain: "gamequest.us",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "enchanted_grounds",
    name: "Enchanted Grounds",
    domain: "enchantedgrounds.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "three_kingdoms",
    name: "Three Kingdoms Games",
    domain: "threekingdomsgames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "gamers_guild",
    name: "Gamers Guild AZ",
    domain: "gamersguildaz.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "gamezenter",
    name: "Gamezenter",
    domain: "gamezenter.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "shuffle_and_cut",
    name: "Shuffle & Cut Games",
    domain: "shuffleandcutgames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "nexus_tcg",
    name: "Nexus TCG",
    domain: "nexustcg.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "hall_of_heroes",
    name: "Hall of Heroes",
    domain: "hallofheroescollectibles.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "springfield_games",
    name: "Springfield Games",
    domain: "springfieldgames.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "tcg_cafe",
    name: "TCG Cafe",
    domain: "tcgcafe.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },

  // —— Strong NA / UK sealed shops ——
  {
    id: "games_401",
    name: "401 Games",
    domain: "store.401games.ca",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "wizard_tower",
    name: "Wizard's Tower",
    domain: "store.wizardtower.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "high_level_games",
    name: "High Level Games",
    domain: "highlevelgames.ca",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "magic_madhouse",
    name: "Magic Madhouse",
    domain: "magicmadhouse.co.uk",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "mana_leak",
    name: "Manaleak",
    domain: "manaleak.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
  {
    id: "tcg_republic",
    name: "TCG Republic",
    domain: "tcgrepublic.com",
    directOnly: true,
    marketplace: false,
    deepSearch: true,
  },
];

/** Retailers the Preorder Radar actively watches. */
export const PREORDER_WATCH_RETAILERS: RetailerId[] = RETAILER_ALLOWLIST.filter(
  (r) => r.preorderWatch,
).map((r) => r.id);

/** Domains used for deep DuckDuckGo product discovery. */
export const DEEP_SEARCH_RETAILERS: RetailerConfig[] = RETAILER_ALLOWLIST.filter(
  (r) => r.deepSearch,
);

export const RETAILER_BY_ID = Object.fromEntries(
  RETAILER_ALLOWLIST.map((r) => [r.id, r]),
) as Record<RetailerId, RetailerConfig>;

export function isAllowlistedRetailer(id: string): id is RetailerId {
  return id in RETAILER_BY_ID;
}

export function retailerName(id: RetailerId): string {
  return RETAILER_BY_ID[id]?.name ?? id;
}
