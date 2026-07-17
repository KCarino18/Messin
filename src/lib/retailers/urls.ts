import { RETAILER_BY_ID, type RetailerId } from "./allowlist";

/** Best-effort product search URL for a retailer. */
export function retailerProductSearchUrl(
  retailerId: RetailerId,
  productName: string,
): string {
  const q = encodeURIComponent(productName);
  const domain = RETAILER_BY_ID[retailerId]?.domain;

  switch (retailerId) {
    case "card_kingdom":
      return `https://www.cardkingdom.com/catalog/search?search=${q}`;
    case "coolstuffinc":
      return `https://www.coolstuffinc.com/main_search.php?Pa=searchOnName&page=1&resultsPerPage=25&q=${q}`;
    case "channel_fireball":
      return `https://store.channelfireball.com/search?q=${q}`;
    case "starcitygames":
      return `https://starcitygames.com/search/?search_query=${q}`;
    case "gamenerdz":
      return `https://www.gamenerdz.com/search?type=product&q=${q}`;
    case "amazon":
      return `https://www.amazon.com/s?k=${q}`;
    case "target":
      return `https://www.target.com/s?searchTerm=${q}`;
    case "walmart":
      return `https://www.walmart.com/search?q=${q}`;
    case "tcgplayer":
      return `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${q}&view=grid`;
    case "forge_and_fire":
      return `https://forgeandfiregaming.com/?s=${q}&post_type=product`;
    case "flipside_gaming":
      return `https://flipsidegaming.com/search?q=${q}`;
    case "miniature_market":
      return `https://www.miniaturemarket.com/catalogsearch/result/?q=${q}`;
    case "troll_and_toad":
      return `https://www.trollandtoad.com/category.php?selected-cat=0&search-words=${q}`;
    case "mox_boarding_house":
      return `https://www.moxboardinghouse.com/search?q=${q}`;
    case "cardhaus":
      return `https://www.cardhaus.com/search?q=${q}`;
    case "game_stop":
      return `https://www.gamestop.com/search/?q=${q}`;
    case "best_buy":
      return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
    case "barnes_and_noble":
      return `https://www.barnesandnoble.com/s/${q}`;
    case "face_to_face":
      return `https://www.facetofacegames.com/search?q=${q}`;
    case "abu_games":
      return `https://abugames.com/search?q=${q}`;
    case "games_401":
      return `https://store.401games.ca/search?q=${q}`;
    case "wizard_tower":
      return `https://store.wizardtower.com/search?q=${q}`;
    case "magic_madhouse":
      return `https://magicmadhouse.co.uk/search?q=${q}`;
    case "mana_leak":
      return `https://www.manaleak.com/search?q=${q}`;
    default:
      if (domain) {
        // Shopify-style search works for a large share of LGS sites.
        return `https://${domain.replace(/^www\./, "")}/search?q=${q}`;
      }
      return `https://www.google.com/search?q=${q}+magic+sealed`;
  }
}
