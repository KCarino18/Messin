"use client";

import { SEALED_TYPES, type SealedTypeId } from "@/lib/sealedTypes";

type Props = {
  selected: SealedTypeId[];
  onChange: (next: SealedTypeId[]) => void;
  compact?: boolean;
};

export function SealedTypeFilter({ selected, onChange, compact }: Props) {
  function toggle(id: SealedTypeId) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
      return;
    }
    onChange([...selected, id]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--brass-300)]/80">
          Sealed type
        </p>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="text-[var(--emerald-300)] underline-offset-2 hover:underline"
            onClick={() => onChange(SEALED_TYPES.map((t) => t.id))}
          >
            All
          </button>
          <button
            type="button"
            className="text-[var(--parchment)]/55 underline-offset-2 hover:underline"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </div>
      <div className={`flex flex-wrap gap-2 ${compact ? "" : ""}`}>
        {SEALED_TYPES.map((type) => {
          const active = selected.includes(type.id);
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => toggle(type.id)}
              className={`rounded border px-2.5 py-1 text-xs transition ${
                active
                  ? "border-[var(--emerald-400)]/60 bg-[var(--emerald-400)]/15 text-[var(--emerald-300)]"
                  : "border-[var(--line)] text-[var(--parchment)]/60 hover:border-[var(--brass-400)]/40 hover:text-[var(--parchment)]"
              }`}
            >
              {type.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
