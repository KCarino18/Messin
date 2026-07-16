"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/money";
import { desktop, openProductLink } from "@/lib/desktopClient";

type PreorderEvent = {
  id: string;
  productName: string;
  retailerName: string;
  priceCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  msrpCents: number | null;
  isMsrp: boolean;
  url: string;
  eventType: string;
  createdAt: string;
  isDemo: boolean;
};

type Watcher = {
  lastPolledAt: string | null;
  nextPollAt: string | null;
  status: string;
  message: string | null;
};

type Props = {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export function PreorderRadar({ mobileOpen, onCloseMobile }: Props) {
  const [events, setEvents] = useState<PreorderEvent[]>([]);
  const [watcher, setWatcher] = useState<Watcher | null>(null);
  const [pollMs, setPollMs] = useState(60_000);
  const [now, setNow] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const immediate = window.setTimeout(() => setNow(Date.now()), 0);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(immediate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      const data = (await desktop().getPreorders()) as {
        events: PreorderEvent[];
        watcher: Watcher | null;
        pollMs: number;
      };
      if (cancelled) return;
      setEvents(data.events);
      setWatcher(data.watcher);
      setPollMs(data.pollMs);
    }

    void loadSnapshot();
    const unsubscribe = desktop().onPreorder((raw) => {
      const data = raw as {
        type: string;
        event?: PreorderEvent;
        watcher?: Watcher & { pollMs?: number };
      };
      if (data.type !== "preorder" || !data.event) return;
      setFlashId(data.event.id);
      setEvents((prev) => {
        const next = [data.event!, ...prev.filter((e) => e.id !== data.event!.id)];
        return next.slice(0, 30);
      });
      if (data.watcher) {
        setWatcher({
          lastPolledAt: data.watcher.lastPolledAt,
          nextPollAt: data.watcher.nextPollAt,
          status: data.watcher.status,
          message: null,
        });
        if (data.watcher.pollMs) setPollMs(data.watcher.pollMs);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const nextPollAt = watcher?.nextPollAt ?? null;
  let secondsToNext = Math.round(pollMs / 1000);
  if (nextPollAt && now > 0) {
    secondsToNext = Math.max(0, Math.ceil((new Date(nextPollAt).getTime() - now) / 1000));
  }

  const panel = (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--line)] bg-[rgba(11,18,16,0.92)] backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="radar-live-dot inline-block h-2.5 w-2.5 rounded-full bg-[var(--emerald-400)]" />
            <h2 className="font-display text-xl tracking-wide text-[var(--brass-200)]">
              Preorder Radar
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--parchment)]/55">
            Watching allowlisted US retailers every 1 minute
          </p>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="text-sm text-[var(--parchment)]/60 lg:hidden"
          >
            Close
          </button>
        )}
      </div>

      <div className="space-y-1 border-b border-[var(--line)] px-4 py-3 text-xs text-[var(--parchment)]/60">
        <p>
          Status:{" "}
          <span className="text-[var(--emerald-300)]">{watcher?.status ?? "starting"}</span>
        </p>
        <p>
          Last check:{" "}
          {watcher?.lastPolledAt
            ? new Date(watcher.lastPolledAt).toLocaleTimeString()
            : "—"}
        </p>
        <p>
          Next check in:{" "}
          <span className="font-semibold text-[var(--brass-300)]">{secondsToNext}s</span>
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {events.length === 0 && (
          <li className="px-1 text-sm text-[var(--parchment)]/50">
            Watching for sealed preorders to go live…
          </li>
        )}
        {events.map((event) => (
          <li
            key={event.id}
            className={`rounded-md border border-[var(--line)] px-3 py-3 ${
              flashId === event.id ? "preorder-flash" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[10px] uppercase tracking-widest ${
                  event.isMsrp ? "text-[var(--emerald-300)]" : "text-[var(--brass-300)]"
                }`}
              >
                {event.isMsrp ? "MSRP" : "Above MSRP"} · {event.eventType.replaceAll("_", " ")}
              </span>
              <span className="text-[10px] text-[var(--parchment)]/40">
                {new Date(event.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 font-display text-sm text-[var(--parchment)]">
              {event.productName}
            </p>
            <p className="mt-1 text-xs text-[var(--parchment)]/55">{event.retailerName}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
                <p className="font-display text-lg text-[var(--brass-200)]">
                  {formatUsd(event.totalCents)}
                </p>
                <p className="text-[10px] text-[var(--parchment)]/45">
                  item {formatUsd(event.priceCents)}
                  {event.msrpCents != null && ` · MSRP ${formatUsd(event.msrpCents)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openProductLink(event.url)}
                className="text-xs text-[var(--emerald-300)] underline-offset-2 hover:underline"
              >
                Open
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <>
      <div className="hidden h-full lg:block">{panel}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close preorder radar"
            className="absolute inset-0 bg-black/60"
            onClick={onCloseMobile}
          />
          <div className="absolute inset-y-0 right-0 w-[min(100%,22rem)] shadow-2xl">
            {panel}
          </div>
        </div>
      ) : null}
    </>
  );
}
