/**
 * Retail sealed SKUs players actually buy.
 * Collector product is a "Collector Booster Display" (usually 12 packs) —
 * there is no separate Wizards SKU called "Collector Booster Box".
 */
export const SEALED_TYPES = [
  { id: "play_booster_box", label: "Play Booster Box" },
  { id: "collector_booster_display", label: "Collector Booster Display" },
  { id: "bundle", label: "Bundle" },
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

/** Just-released window for the Preorder Radar (days). */
export const JUST_RELEASED_DAYS = 35;

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

export function isPreorderRadarEligible(releaseDateIso: string, now = new Date()): boolean {
  const bucket = releaseBucket(releaseDateIso, now);
  return bucket === "preorder" || bucket === "just_released";
}
