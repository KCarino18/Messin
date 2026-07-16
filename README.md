# MTG Budget

Stylized sealed-product deal finder for Magic: The Gathering.

Set a budget, get the best **factory-sealed** deals from a curated US retailer allowlist, look up the cheapest reputable **total price** (item + shipping + tax estimate), and keep a live **Preorder Radar** on the right that polls every **1 minute**.

## One-click download

Download the latest installer from GitHub Releases:

**[Download MTG-Budget-Installer.zip](https://github.com/KCarino18/Messin/releases/latest/download/MTG-Budget-Installer.zip)**

Then unzip and:

- **macOS** — double-click `Install.command`
- **Windows** — double-click `Install.bat`
- **Linux** — run `./install.sh`

Requires [Node.js 20+](https://nodejs.org). The installer sets up the database, seeds demo data, builds the app, and opens http://localhost:3000.

All releases: https://github.com/KCarino18/Messin/releases

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
| `npm run package:installer` | Build `dist/MTG-Budget-Installer.zip` locally |

Installer packages are also published automatically via GitHub Actions when you push a `v*` tag (or run the **Release installer** workflow).

## Notes

- `PRICE_MODE=demo` (default) uses deterministic demo prices from allowlisted retailer adapters so the UI works without live scrapers.
- Set `PRICE_MODE=live` when live retailer adapters are implemented; empty live responses fall back to demo.
- Tax estimate defaults to 8% (`TAX_RATE`) when a store does not publish tax.
- Preorder poll interval is `PREORDER_POLL_MS=60000`.
