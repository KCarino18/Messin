import type { ProductSeed } from "./types";
import type { SealedTypeId } from "@/lib/sealedTypes";

export function setSlug(setName: string): string {
  return setName
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reject accessory / bulk case SKUs. */
function isExcludedSku(title: string): boolean {
  const t = normalize(title);
  return (
    t.includes("master case") ||
    t.includes("display case") ||
    t.includes("booster case") ||
    t.includes("case of") ||
    t.includes("omega pack") ||
    t.includes("sleeved play") ||
    t.includes("scene box")
  );
}

function setTokensMatch(title: string, setName: string): boolean {
  const t = normalize(title);
  const tokens = normalize(setName)
    .split(" ")
    .filter((w) => w.length > 2 && !["the", "and", "house", "of"].includes(w));
  if (tokens.length === 0) return t.includes(normalize(setName));
  // require most distinctive tokens
  const hits = tokens.filter((tok) => t.includes(tok)).length;
  return hits >= Math.min(2, tokens.length) || t.includes(normalize(setName));
}

function matchesSealedType(title: string, sealedType: SealedTypeId): boolean {
  const t = normalize(title);

  switch (sealedType) {
    case "play_booster_box":
      return (
        (t.includes("play booster box") || t.includes("play booster display")) &&
        !t.includes("collector") &&
        !t.includes("pack")
      );
    case "collector_booster_display":
      // Retailers often label the 12-pack display as "Collector Booster Box".
      return (
        (t.includes("collector booster display") ||
          t.includes("collector booster box")) &&
        !t.includes("pack") &&
        !/\bcase\b/.test(t)
      );
    case "bundle":
      return t.includes("bundle") && !t.includes("gift bundle") && !t.includes("case");
    case "commander_deck_display":
      return t.includes("commander") && (t.includes("display") || t.includes("deck display"));
    case "commander_deck":
      return t.includes("commander deck") && !t.includes("display");
    case "set_booster_box":
      return t.includes("set booster box") || t.includes("set booster display");
    default:
      return false;
  }
}

export function titleMatchesProduct(title: string, product: ProductSeed): boolean {
  if (!title || isExcludedSku(title)) return false;
  if (!setTokensMatch(title, product.setName)) return false;
  return matchesSealedType(title, product.sealedType);
}

export function searchQueriesForProduct(product: ProductSeed): string[] {
  const set = product.setName;
  switch (product.sealedType) {
    case "play_booster_box":
      return [
        `${set} Play Booster Box`,
        `${set} Play Booster Display`,
        `Magic ${set} Play Booster Box`,
      ];
    case "collector_booster_display":
      return [
        `${set} Collector Booster Display`,
        `${set} Collector Booster Box`,
        `Magic ${set} Collector Booster Display`,
      ];
    case "bundle":
      return [`${set} Bundle`, `Magic ${set} Bundle`];
    case "commander_deck_display":
      return [`${set} Commander Deck Display`];
    case "commander_deck":
      return [`${set} Commander Deck`];
    default:
      return [product.name];
  }
}
