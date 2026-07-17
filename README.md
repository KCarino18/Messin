# MTG Budget

**Desktop app** for Magic: The Gathering sealed-product deals and preorder watching.

[![Install for Windows](https://img.shields.io/badge/install-Windows_Setup.exe-3d9b72?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/KCarino18/Messin/releases/latest)

## Install (Windows)

1. Open the [latest release](https://github.com/KCarino18/Messin/releases/latest)
2. Download **`MTG-Budget-Setup-*.exe`**
3. Double-click the Setup file to install
4. Launch **MTG Budget** from the Start Menu or Desktop shortcut

That installs a real desktop application on your PC. No browser. No zip. No Node.js.

Linux AppImage and macOS DMG are also published on the same releases page when available.

## What it does

- Set a budget and filter by sealed type (Play / Set / Collector boxes, displays, bundles, commander)
- Look up sealed product and see the cheapest reputable US total price (item + shipping + tax)
- Keep a live **Preorder Radar** for **just-released + unreleased** sets only, with the same sealed-type filters

## Allowlisted retailers

**Core:** Card Kingdom · CoolStuffInc · Channel Fireball · StarCityGames · GameNerdz · Forge & Fire · Flipside Gaming · Amazon (sold/shipped by Amazon) · Target · Walmart (sold/shipped by Walmart) · TCGPlayer Marketplace (reputation-filtered)

**Sealed specialists:** Miniature Market · Troll and Toad · Mox Boarding House · Cardhaus · Millennium Games · Gaming Etc · Face to Face Games · ABU Games · Pastimes · Ideal808

**Big-box / comics:** GameStop · Best Buy · Barnes & Noble · HobbyTown · Midtown Comics · Forbidden Planet

**More LGS / online:** Top Deck Hero · Untapped Games · Mythic Store · Card Sphere · Adventure Games · Red Castle · TableTop Gaming Center · Critical Hit · Collector Store · Game Quest · Enchanted Grounds · Three Kingdoms · Gamers Guild AZ · Gamezenter · Shuffle & Cut · Nexus TCG · Hall of Heroes · Springfield Games · TCG Cafe

**NA / UK sealed:** 401 Games · Wizard's Tower · High Level Games · Magic Madhouse · Manaleak · TCG Republic

## Develop the desktop app

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

`npm run dev` opens the Electron desktop window.

### Build installers

```bash
npm run desktop:build:win     # Windows Setup.exe
npm run desktop:build:linux   # Linux AppImage
npm run desktop:build:mac     # macOS .dmg
```

Artifacts are written to `dist-desktop/`.
