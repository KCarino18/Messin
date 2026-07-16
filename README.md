# MTG Budget

Stylized sealed-product deal finder for Magic: The Gathering.

Set a budget, get the best **factory-sealed** deals from a curated US retailer allowlist, look up the cheapest reputable **total price** (item + shipping + tax estimate), and keep a live **Preorder Radar** on the right that polls every **1 minute**.

## Features

- **Sealed only** — boosters, bundles, commander decks, boxes (no singles)
- **Budget deals** — ranks products under your spend by deal quality vs MSRP
- **Product lookup** — cheapest allowlisted US offer with item / ship / tax / total breakdown
- **Anti-scam scoring** — rejects penny + huge-shipping, Amazon/Walmart 3P, low-rep TCGPlayer sellers
- **Preorder Radar** — right rail polls allowlisted retailers every 60s via SSE

## Allowlisted retailers

Card Kingdom · CoolStuffInc · Channel Fireball · StarCityGames · GameNerdz · Amazon (sold/shipped by Amazon) · Target · Walmart (sold/shipped by Walmart) · TCGPlayer Marketplace (reputation-filtered)

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma · SQLite

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run db:seed` | Reseed sealed catalog + demo offers + preorder events |
| `npm test` | Run total-price scorer checks |

## Notes

- `PRICE_MODE=demo` (default) uses deterministic demo prices from allowlisted retailer adapters so the UI works without live scrapers.
- Set `PRICE_MODE=live` when live retailer adapters are implemented; empty live responses fall back to demo.
- Tax estimate defaults to 8% (`TAX_RATE`) when a store does not publish tax.
- Preorder poll interval is `PREORDER_POLL_MS=60000`.
