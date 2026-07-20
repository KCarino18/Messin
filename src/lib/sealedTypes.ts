/**
 * Retail sealed SKUs players actually buy.
 * Collector product is a "Collector Booster Display" (usually 12 packs) —
 * there is no separate Wizards SKU called "Collector Booster Box".
 */
export const SEALED_TYPES = [
  { id: "play_booster_box", label: "Play Booster Box" },
  { id: "collector_booster_display", label: "Collector Booster Display" },
  { id: "collector_booster_omega", label: "Collector Booster Omega" },
  { id: "bundle", label: "Bundle" },
  { id: "specialty_bundle", label: "Specialty Bundle" },
  { id: "gift_bundle", label: "Gift Bundle" },
  { id: "scene_box", label: "Scene Box" },
  { id: "commander_deck", label: "Commander Deck" },
  { id: "commander_deck_display", label: "Commander Deck Display" },
] as const;

export type SealedTypeId = (typeof SEALED_TYPES)[number]["id"];

export const SEALED_TYPE_LABELS: Record<SealedTypeId, string> = Object.fromEntries(
  SEALED_TYPES.map((t) => [t.id, t.label]),
) as Record<SealedTypeId, string>;

/** Map retired / mistaken type ids onto current ones. */
export function normalizeSealedType(id: string): SealedTypeId | null {
  if (id === "collector_booster_box") return "collector_booster_display";
  if ((SEALED_TYPE_LABELS as Record<string, string>)[id]) return id as SealedTypeId;
  return null;
}

/** Just-released window shown on the main deals feed (days). */
export const JUST_RELEASED_DAYS = 14;

export function releaseBucket(
  releaseDateIso: string,
  now = new Date(),
): "preorder" | "just_released" | "released" {
  const release = new Date(`${releaseDateIso}T12:00:00Z`);
  const ms = release.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days > 0) return "preorder";
  if (days >= -JUST_RELEASED_DAYS) return "just_released";
  return "released";
}

/** Preorder Radar: unreleased sets only (release date still in the future). */
export function isPreorderRadarEligible(releaseDateIso: string, now = new Date()): boolean {
  return releaseBucket(releaseDateIso, now) === "preorder";
}

/** Sets with a street date still ahead of today (for the radar set dropdown). */
export function isUpcomingSet(releaseDateIso: string, now = new Date()): boolean {
  return isPreorderRadarEligible(releaseDateIso, now);
}
