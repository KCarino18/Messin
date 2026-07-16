import type { RetailerId } from "./allowlist";

export function retailerProductSearchUrl(retailerId: RetailerId, productName: string): string {
  const q = encodeURIComponent(productName);
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
    default:
      return `https://www.google.com/search?q=${q}+magic+sealed`;
  }
}
