# MTG Budget

[![Download for Windows](https://img.shields.io/badge/download-Windows_.exe-3d9b72?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/KCarino18/Messin/releases/latest)
[![Download for macOS](https://img.shields.io/badge/download-macOS_.dmg-d4a85a?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/KCarino18/Messin/releases/latest)
[![Download for Linux](https://img.shields.io/badge/download-Linux_.AppImage-62c095?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/KCarino18/Messin/releases/latest)

Stylized sealed-product deal finder for Magic: The Gathering.

Set a budget, get the best **factory-sealed** deals from a curated US retailer allowlist, look up the cheapest reputable **total price** (item + shipping + tax estimate), and keep a live **Preorder Radar** on the right that polls every **1 minute**.

## One-click download

**No zip. No Node install. Download → double-click.**

1. Open the [latest release](https://github.com/KCarino18/Messin/releases/latest)
2. Download the file for your OS:
   - **Windows:** `MTG-Budget-*-Windows.exe` (portable) or `MTG-Budget-Setup-*.exe`
   - **macOS:** `MTG-Budget-*-macOS.dmg`
   - **Linux:** `MTG-Budget-*-Linux.AppImage`
3. Double-click it — the app opens

That is the whole install.

## Features

- **Sealed only** — boosters, bundles, commander decks, boxes (no singles)
- **Budget deals** — ranks products under your spend by deal quality vs MSRP
- **Product lookup** — cheapest allowlisted US offer with item / ship / tax / total breakdown
- **Anti-scam scoring** — rejects penny + huge-shipping, Amazon/Walmart 3P, low-rep TCGPlayer sellers
- **Preorder Radar** — right rail polls allowlisted retailers every 60s via SSE

## Allowlisted retailers

Card Kingdom · CoolStuffInc · Channel Fireball · StarCityGames · GameNerdz · Amazon (sold/shipped by Amazon) · Target · Walmart (sold/shipped by Walmart) · TCGPlayer Marketplace (reputation-filtered)

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma · SQLite · Electron (desktop builds)

## Develop from source

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build desktop installers locally

```bash
npm run desktop:build:win     # Windows .exe
npm run desktop:build:linux   # Linux AppImage
npm run desktop:build:mac     # macOS .dmg (macOS host required)
```

Artifacts land in `dist-desktop/`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local web dev server |
| `npm run build` | Production Next.js build |
| `npm run db:seed` | Reseed sealed catalog + demo offers + preorder events |
| `npm test` | Run total-price scorer checks |
| `npm run desktop:build:win` | Build one-click Windows `.exe` |

## Notes

- `PRICE_MODE=demo` (default) uses deterministic demo prices from allowlisted retailer adapters so the UI works without live scrapers.
- Set `PRICE_MODE=live` when live retailer adapters are implemented; empty live responses fall back to demo.
- Tax estimate defaults to 8% (`TAX_RATE`) when a store does not publish tax.
- Preorder poll interval is `PREORDER_POLL_MS=60000`.
