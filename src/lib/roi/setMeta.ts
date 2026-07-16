/** Scryfall set codes for catalog set names (main booster set). */
export const SET_SCRYFALL_CODE: Record<string, string> = {
  "Marvel Super Heroes": "msh",
  "The Hobbit": "hob",
  "Reality Fracture": "fra",
  "Star Trek": "trk",
  "Secrets of Strixhaven": "sos",
  "Teenage Mutant Ninja Turtles": "tmt",
  "Lorwyn Eclipsed": "ecl",
  Foundations: "fdn",
  "Modern Horizons 3": "mh3",
  Bloomburrow: "blb",
  "Duskmourn: House of Horror": "dsk",
  Duskmourn: "dsk",
};

export function scryfallCodeForSet(setName: string): string | null {
  return SET_SCRYFALL_CODE[setName] ?? null;
}
