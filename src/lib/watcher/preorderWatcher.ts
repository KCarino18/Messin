import { prisma } from "@/lib/prisma";
import { RETAILER_ALLOWLIST } from "@/lib/retailers/allowlist";
import { estimateTaxCents } from "@/lib/money";

export const PREORDER_POLL_MS = Number(process.env.PREORDER_POLL_MS ?? "60000");

type Listener = (payload: unknown) => void;

const globalWatcher = globalThis as unknown as {
  __mtgPreorderWatcher?: {
    timer: ReturnType<typeof setInterval> | null;
    listeners: Set<Listener>;
    started: boolean;
    tick: number;
  };
};

function state() {
  if (!globalWatcher.__mtgPreorderWatcher) {
    globalWatcher.__mtgPreorderWatcher = {
      timer: null,
      listeners: new Set(),
      started: false,
      tick: 0,
    };
  }
  return globalWatcher.__mtgPreorderWatcher;
}

function broadcast(payload: unknown) {
  for (const listener of state().listeners) {
    try {
      listener(payload);
    } catch {
      // ignore broken listeners
    }
  }
}

const PREORDER_TARGETS = [
  {
    productId: "upcoming-edge-of-eternities-play",
    productName: "Edge of Eternities Play Booster Box",
    msrpCents: 14376,
    retailers: ["card_kingdom", "gamenerdz", "amazon", "target"] as const,
  },
  {
    productId: "upcoming-edge-of-eternities-collector",
    productName: "Edge of Eternities Collector Booster Display",
    msrpCents: 28776,
    retailers: ["coolstuffinc", "channel_fireball", "starcitygames"] as const,
  },
  {
    productId: "upcoming-spider-man-play-box",
    productName: "Marvel's Spider-Man Play Booster Box",
    msrpCents: 14376,
    retailers: ["amazon", "walmart", "tcgplayer", "gamenerdz"] as const,
  },
  {
    productId: "upcoming-spider-man-bundle",
    productName: "Marvel's Spider-Man Bundle",
    msrpCents: 4999,
    retailers: ["target", "walmart", "card_kingdom"] as const,
  },
];

async function ensureWatcherRow() {
  await prisma.watcherState.upsert({
    where: { id: "preorder" },
    create: { id: "preorder", status: "idle" },
    update: {},
  });
}

async function pollOnce() {
  const s = state();
  s.tick += 1;
  const now = new Date();
  const next = new Date(now.getTime() + PREORDER_POLL_MS);

  await ensureWatcherRow();
  await prisma.watcherState.update({
    where: { id: "preorder" },
    data: {
      lastPolledAt: now,
      nextPollAt: next,
      status: "polling",
      message: `Scanning ${RETAILER_ALLOWLIST.length} allowlisted retailers`,
    },
  });

  const target = PREORDER_TARGETS[s.tick % PREORDER_TARGETS.length];
  const retailerId = target.retailers[s.tick % target.retailers.length];
  const atMsrp = s.tick % 3 !== 0;
  const itemPriceCents = atMsrp
    ? target.msrpCents
    : Math.round(target.msrpCents * (1.05 + (s.tick % 5) * 0.02));
  const shippingCents = retailerId === "amazon" || retailerId === "target" || retailerId === "walmart" ? 0 : 399;
  const taxCents = estimateTaxCents(itemPriceCents, shippingCents);
  const totalCents = itemPriceCents + shippingCents + taxCents;

  const existing = await prisma.preorderEvent.findFirst({
    where: {
      productId: target.productId,
      retailerId,
      eventType: "live",
    },
    orderBy: { createdAt: "desc" },
  });

  const eventType = !existing
    ? "went_live"
    : existing.priceCents !== itemPriceCents
      ? "price_change"
      : "heartbeat";

  const event = await prisma.preorderEvent.create({
    data: {
      productId: target.productId,
      productName: target.productName,
      retailerId,
      priceCents: itemPriceCents,
      shippingCents,
      taxCents,
      totalCents,
      msrpCents: target.msrpCents,
      isMsrp: itemPriceCents <= target.msrpCents,
      url: `https://example.com/preorder/${target.productId}/${retailerId}`,
      eventType,
      isDemo: true,
    },
  });

  await prisma.watcherState.update({
    where: { id: "preorder" },
    data: {
      status: "watching",
      message:
        eventType === "heartbeat"
          ? "No new preorder transitions"
          : `${target.productName} ${eventType.replace("_", " ")} at ${RETAILER_ALLOWLIST.find((r) => r.id === retailerId)?.name}`,
      lastPolledAt: now,
      nextPollAt: next,
    },
  });

  const payload = {
    type: "preorder",
    event: {
      ...event,
      createdAt: event.createdAt.toISOString(),
      retailerName:
        RETAILER_ALLOWLIST.find((r) => r.id === retailerId)?.name ?? retailerId,
    },
    watcher: {
      lastPolledAt: now.toISOString(),
      nextPollAt: next.toISOString(),
      pollMs: PREORDER_POLL_MS,
      status: "watching",
    },
  };

  broadcast(payload);
  return payload;
}

export function subscribePreorders(listener: Listener) {
  const s = state();
  s.listeners.add(listener);
  return () => s.listeners.delete(listener);
}

export async function startPreorderWatcher() {
  const s = state();
  if (s.started) return;
  s.started = true;
  await ensureWatcherRow();
  await pollOnce();
  s.timer = setInterval(() => {
    void pollOnce();
  }, PREORDER_POLL_MS);
}

export async function getWatcherSnapshot() {
  await ensureWatcherRow();
  const watcher = await prisma.watcherState.findUnique({ where: { id: "preorder" } });
  const events = await prisma.preorderEvent.findMany({
    where: { eventType: { in: ["went_live", "price_change", "live"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return {
    pollMs: PREORDER_POLL_MS,
    watcher: watcher
      ? {
          lastPolledAt: watcher.lastPolledAt?.toISOString() ?? null,
          nextPollAt: watcher.nextPollAt?.toISOString() ?? null,
          status: watcher.status,
          message: watcher.message,
        }
      : null,
    events: events.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      retailerName:
        RETAILER_ALLOWLIST.find((r) => r.id === e.retailerId)?.name ?? e.retailerId,
    })),
  };
}

export async function seedInitialPreorders() {
  const count = await prisma.preorderEvent.count();
  if (count > 0) return;

  const now = Date.now();
  const seeds = [
    {
      productId: "upcoming-edge-of-eternities-play",
      productName: "Edge of Eternities Play Booster Box",
      retailerId: "gamenerdz",
      priceCents: 14376,
      shippingCents: 299,
      msrpCents: 14376,
      minutesAgo: 12,
    },
    {
      productId: "upcoming-spider-man-bundle",
      productName: "Marvel's Spider-Man Bundle",
      retailerId: "target",
      priceCents: 4999,
      shippingCents: 0,
      msrpCents: 4999,
      minutesAgo: 28,
    },
    {
      productId: "upcoming-edge-of-eternities-collector",
      productName: "Edge of Eternities Collector Booster Display",
      retailerId: "card_kingdom",
      priceCents: 29999,
      shippingCents: 0,
      msrpCents: 28776,
      minutesAgo: 41,
    },
  ];

  for (const seed of seeds) {
    const taxCents = estimateTaxCents(seed.priceCents, seed.shippingCents);
    await prisma.preorderEvent.create({
      data: {
        productId: seed.productId,
        productName: seed.productName,
        retailerId: seed.retailerId,
        priceCents: seed.priceCents,
        shippingCents: seed.shippingCents,
        taxCents,
        totalCents: seed.priceCents + seed.shippingCents + taxCents,
        msrpCents: seed.msrpCents,
        isMsrp: seed.priceCents <= seed.msrpCents,
        url: `https://example.com/preorder/${seed.productId}/${seed.retailerId}`,
        eventType: "went_live",
        isDemo: true,
        createdAt: new Date(now - seed.minutesAgo * 60_000),
      },
    });
  }
}
