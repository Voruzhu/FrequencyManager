# FrequencyManager

> **A build optimizer and companion app for gacha-RPGs.** Scan your gear,
> calculate damage, and find your best loadout — for Wuthering Waves and
> Genshin Impact, with more games on the way.

*FrequencyManager is an independent fan-made project and is not affiliated
with, endorsed by, or sponsored by Kuro Games, HoYoverse, or any other game
developer/publisher. Wuthering Waves, Genshin Impact, and all related assets
are trademarks of their respective owners.*

---

## What is FrequencyManager?

FrequencyManager is a free desktop companion app for gacha-RPG players who
want to get the most out of their characters' builds. Instead of manually
theorycrafting stats in a spreadsheet, you tell the app what you own
(characters, weapons, gear) and what you're trying to maximize, and it does
the math — including searching through every gear combination you own to
find the best one.

The app itself ships with **no game data built in** — **Wuthering Waves**
(echoes) and **Genshin Impact** (artifacts) are official downloadable game
packages, installed the same way any community-made game is (see
[Installing a game](#-installing-a-game) below). Every installed game shares
the same calculator, optimizer, and inventory tools — switch between them
any time from Settings.

---

## 📥 Download & Install

Grab the latest installer from the
**[Releases page](https://github.com/Voruzhu/FrequencyManager/releases/latest)**:

1. Download `FrequencyManager-Setup-<version>.exe`.
2. Run it — no admin rights required, per-user install.
3. Launch FrequencyManager from the Desktop or Start Menu shortcut.
4. On first launch you'll see a "No game installed yet" screen — download a
   game package (Wuthering Waves and/or Genshin Impact, also on the
   [Releases page](https://github.com/Voruzhu/FrequencyManager/releases/latest))
   and drop it into the folder the app shows you, then restart. See
   [Installing a game](#-installing-a-game) below for the full steps.

The app checks for new versions automatically and will prompt you to update
when one is available. **Windows only** for now.

Want to build it yourself instead? See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## ✨ What each screen does

| Screen | What it's for |
| --- | --- |
| **Dashboard** | A quick overview of your build workspace — recent calculations and scans at a glance. |
| **Calculator** | Pick a character, set what you want to maximize (or hit a minimum threshold for), and either see live stats for your currently-equipped gear or run the **Optimizer** to search every combination of gear you own for the best build. Supports crit modes, elemental reactions (Genshin), a Set Bonus picker, Party Setup for team-wide buffs, and a real boss roster (both games) with per-element RES instead of a generic enemy. |
| **Scanner** | Point your hotkey at an in-game gear screen and FrequencyManager reads the stats off the screenshot (OCR) and adds it to your inventory — no manual typing. You can also scan a previously saved screenshot, or batch-import several at once. Currently supported: **Wuthering Waves echoes** only (see below). |
| **Inventory** | Manage everything you own: characters, weapons, and gear. Add, edit, equip, and unequip pieces; filter and sort your gear by stat, set, rarity, or cost; get warned before double-equipping a piece another character is already using. |
| **Rotation** | Build and save a damage rotation — a sequence of skills/attacks and manually-placed buffs — against your actual party and a real boss (or multi-wave fight), to see total damage over a fight instead of just a single hit. Consecutive actions for the same character group into one card, and any conditional buff a party member can grant (weapon, passive, constellation/sequence) can be dropped into the timeline with its own duration. |
| **Settings** | Switch the active game, tune calculator/optimizer behavior (like how many CPU threads the optimizer uses), configure the scan hotkey, manage app/game updates, back up or clear your data, and toggle individual feature modules on or off. |

---

## 🔍 OCR Scanning support

OCR scanning currently supports **Wuthering Waves echoes only** (Genshin
artifacts and any other game/gear type aren't wired up yet — add them to your
inventory manually via **Inventory → Add**). To get a clean scan, line up the
in-game Echo screen like this before pressing the scan hotkey:

**Character → Echo → select a set → click into an echo → Scan**

That's the individual echo's detail view — name, cost, main stat, and
sub-stats all visible on one screen, which is what the scanner reads.

**Requires the game running fullscreen at 1920×1080.** The scanner crops
fixed regions of the screen calibrated against that resolution — a different
resolution, windowed mode, or a different display scale will crop the wrong
area and produce a bad or empty scan.

---

## 📊 Data accuracy

Game data (character kits, weapons, sets) is hand-curated and cross-checked
against multiple community sources, not scraped automatically — coverage and
accuracy vary by game as that work continues:

- **Wuthering Waves** — ~95% accurate (full-roster re-audit against 2+
  independent sources completed 2026-07-17).
- **Genshin Impact** — still in progress.
- **OCR scan support** — unchanged, Wuthering Waves echoes only (see above).

Found something wrong? Open an issue with the character/weapon and what's off.

---

## 🎮 Installing a game

FrequencyManager ships with **no game data built in** — every game, including
the official Wuthering Waves and Genshin Impact packages, is installed the
same way:

1. Download a game package (a `.zip`) from the
   **[Releases page](https://github.com/Voruzhu/FrequencyManager/releases/latest)**
   — official packages are published there, and anyone can package and share
   their own.
2. Extract it into:
   ```
   %APPDATA%\frequency-manager\game-modules\
   ```
   (the app creates this folder automatically; if nothing is installed yet,
   it shows a "No game installed yet" screen pointing here).
3. Restart FrequencyManager — the game now appears in **Settings → Game**.

Once you have two or more games installed, switching between them from
**Settings → Game** takes effect immediately, no restart needed. Your data
for each game (characters, gear, loadouts, rotations) is kept separate.

See [docs/GAME_MODULES.md](./docs/GAME_MODULES.md) for the full format guide,
including how to author your own game package.

---

## 🔄 Staying Updated

FrequencyManager checks for updates automatically on launch:

- **App updates** download and install in the background; you'll get a
  prompt to restart when one is ready.
- **Game data updates** (new characters, weapons, balance changes) are
  checked independently, so the app itself doesn't need a new release just
  to catch up with a game patch.

You can also trigger a manual check any time from **Settings → Updates**.

---

## 🗺️ Roadmap

Per-game character/roster data progress and what's planned next now live in
[ROADMAP.md](./ROADMAP.md) — short version: Wuthering Waves' full roster just
went through a fresh accuracy re-audit (~95%), Genshin Impact is getting the
same treatment next, and Rotation Builder is still being refined as a
rotation-testing tool.

---

## 🤝 Contributing

Want to help build FrequencyManager, add a new game, or build a module? See
[CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guides, and
[ARCHITECTURE.md](./ARCHITECTURE.md) for how the app is put together under
the hood.

---

## 📜 License

MIT — see [LICENSE](./LICENSE).

---

## ☕ Support

FrequencyManager is free and built in spare time. If it's saved you a
spreadsheet or two:

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/voruzhu)

This is my first public project as a junior developer, built and maintained
in my spare time. If you run into bugs, rough edges, or have suggestions,
please open an issue — feedback is genuinely welcome and helps me improve
both the app and myself as a developer.
