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
    t.includes("sleeved play") ||
    /\bbundle case\b/.test(t) ||
    /\bscene box case\b/.test(t)
  );
}

function isSpecialtyBundleTitle(t: string): boolean {
  return (
    t.includes("beam me up") ||
    t.includes("codex bundle") ||
    t.includes("pizza bundle") ||
    t.includes("gift bundle") ||
    t.includes("special bundle")
  );
}

function setTokensMatch(title: string, setName: string): boolean {
  const t = normalize(title);
  const tokens = normalize(setName)
    .split(" ")
    .filter((w) => w.length > 2 && !["the", "and", "house", "of"].includes(w));
  if (tokens.length === 0) return t.includes(normalize(setName));
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
      return (
        (t.includes("collector booster display") ||
          t.includes("collector booster box")) &&
        !t.includes("omega") &&
        !t.includes("pack") &&
        !/\bcase\b/.test(t)
      );
    case "collector_booster_omega":
      return t.includes("collector booster omega") || t.includes("omega pack");
    case "bundle":
      return (
        t.includes("bundle") &&
        !isSpecialtyBundleTitle(t) &&
        !t.includes("case")
      );
    case "specialty_bundle":
      return (
        (t.includes("beam me up") ||
          t.includes("codex bundle") ||
          t.includes("pizza bundle")) &&
        !t.includes("case")
      );
    case "gift_bundle":
      return t.includes("gift bundle") && !t.includes("case");
    case "scene_box":
      return t.includes("scene box") && !t.includes("case");
    case "commander_deck_display":
      return t.includes("commander") && (t.includes("display") || t.includes("deck display"));
    case "commander_deck":
      return t.includes("commander deck") && !t.includes("display");
    default:
      return false;
  }
}

export function titleMatchesProduct(title: string, product: ProductSeed): boolean {
  if (!title || isExcludedSku(title)) return false;
  if (!setTokensMatch(title, product.setName)) return false;

  // Specialty / named SKUs also match on distinctive product-name tokens.
  if (
    product.sealedType === "specialty_bundle" ||
    product.sealedType === "gift_bundle" ||
    product.sealedType === "scene_box"
  ) {
    const t = normalize(title);
    const name = normalize(product.name);
    if (name.includes("beam me up") && !t.includes("beam me up")) return false;
    if (name.includes("codex") && !t.includes("codex")) return false;
    if (name.includes("pizza") && !t.includes("pizza")) return false;
    if (name.includes("gift bundle") && !t.includes("gift bundle")) return false;
    // Scene boxes: require a unique word from the product name beyond set + "scene box".
    if (product.sealedType === "scene_box") {
      const extra = name
        .replace(normalize(product.setName), "")
        .replace(/scene box/g, "")
        .trim()
        .split(" ")
        .filter((w) => w.length > 2);
      if (extra.length > 0 && !extra.some((w) => t.includes(w))) return false;
    }
  }

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
    case "collector_booster_omega":
      return [
        `${set} Collector Booster Omega`,
        `${set} Collector Booster Omega Pack`,
        `Magic ${set} Collector Booster Omega`,
      ];
    case "bundle":
      return [`${set} Bundle`, `Magic ${set} Bundle`];
    case "specialty_bundle":
      return [product.name, `Magic ${product.name}`];
    case "gift_bundle":
      return [`${set} Gift Bundle`, `Magic ${set} Gift Bundle`];
    case "scene_box":
      return [product.name, `Magic ${product.name}`];
    case "commander_deck_display":
      return [`${set} Commander Deck Display`];
    case "commander_deck":
      return [`${set} Commander Deck`];
    default:
      return [product.name];
  }
}
