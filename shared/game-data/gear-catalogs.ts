/**
 * @fileoverview Gear catalogs — the rules for creating owned echoes/artifacts
 * @module shared/game-data/gear-catalogs
 *
 * The per-stat, per-rarity value bounds and slot/main-stat rules the inventory
 * "add gear" flow renders from. Authored ONCE here and imported by both the
 * backend game bundles (adapters/game-definitions/<game>/bundle.ts) and the
 * renderer's embedded fallback (src/renderer/src/data/gameData.ts), so the two
 * can't drift. Values are believable but not perfectly game-accurate.
 */

import type { GearCatalog } from '../types/game-bundle';

// ── Wuthering Waves (echoes: cost tiers 4/3/1, up to 5 RANDOM sub-stats) ─────
// Confirmed against real screenshots (2026-07 OCR-scanner session): an echo
// shows 7 stat rows TOTAL — 1 main stat, then 1 "base" stat that's always a
// fixed roll determined by cost tier (flat HP for cost 1, flat ATK for cost
// 3/4 — see each slot's `lockedSubStat` below), then 5 genuinely random
// sub-stats. `maxSubStats` here counts ONLY the random ones (5) — the base
// stat is tracked/shown separately (AddGearWindow renders it as its own
// section, keyed by the selected slot's `lockedSubStat`) since it isn't a
// choice the user makes. Kept in sync with
// `adapters/game-definitions/wuthering-waves/definition.ts`'s
// `equipment.maxSubStats` (a separate hand-authored field the live app
// actually uses — see `shared/game-data/derive.ts`); the two had drifted
// apart before despite this file's header comment saying they shouldn't.

export const WW_GEAR_CATALOG: GearCatalog = {
    rarities: [3, 4, 5],
    maxSubStats: 5,
    subStatsCanRepeatMain: true, // WuWa: a sub can repeat the main stat
    // Real mechanic: the 5 equipped echoes' costs (1/3/4 each) must sum to
    // AT MOST 12 — e.g. a typical build is 4+3+3+1+1. Without this, the
    // optimizer can (and did) recommend 5 pieces that can't actually all be
    // equipped in-game at once (e.g. five cost-4 echoes = 20).
    maxTotalCost: 12,
    // Full Sonata (echo set) roster — kept in sync with `SET_BONUSES` in
    // `adapters/game-definitions/wuthering-waves/definition.ts` (was
    // previously a stale 16-set subset missing the 18 sets added
    // 2026-07-12). `icon` sourced from api.encore.moe's per-echo
    // `FetterGroups[].Icon` (2026-07-13) — one representative icon per set.
    sets: [
        { id: 'freezing-frost', name: 'Freezing Frost', icon: 'icons/echoes/freezing-frost.webp' },
        { id: 'molten-rift', name: 'Molten Rift', icon: 'icons/echoes/molten-rift.webp' },
        { id: 'void-thunder', name: 'Void Thunder', icon: 'icons/echoes/void-thunder.webp' },
        { id: 'sierra-gale', name: 'Sierra Gale', icon: 'icons/echoes/sierra-gale.webp' },
        { id: 'celestial-light', name: 'Celestial Light', icon: 'icons/echoes/celestial-light.webp' },
        { id: 'havoc-eclipse', name: 'Havoc Eclipse', icon: 'icons/echoes/havoc-eclipse.webp' },
        { id: 'moonlit-clouds', name: 'Moonlit Clouds', icon: 'icons/echoes/moonlit-clouds.webp' },
        { id: 'rejuvenating-glow', name: 'Rejuvenating Glow', icon: 'icons/echoes/rejuvenating-glow.webp' },
        { id: 'lingering-tunes', name: 'Lingering Tunes', icon: 'icons/echoes/lingering-tunes.webp' },
        { id: 'frosty-resolve', name: 'Frosty Resolve', icon: 'icons/echoes/frosty-resolve.webp' },
        { id: 'empyrean-anthem', name: 'Empyrean Anthem', icon: 'icons/echoes/empyrean-anthem.webp' },
        { id: 'midnight-veil', name: 'Midnight Veil', icon: 'icons/echoes/midnight-veil.webp' },
        { id: 'eternal-radiance', name: 'Eternal Radiance', icon: 'icons/echoes/eternal-radiance.webp' },
        { id: 'tidebreaking-courage', name: 'Tidebreaking Courage', icon: 'icons/echoes/tidebreaking-courage.webp' },
        { id: 'gusts-of-welkin', name: 'Gusts of Welkin', icon: 'icons/echoes/gusts-of-welkin.webp' },
        { id: 'windward-pilgrimage', name: 'Windward Pilgrimage', icon: 'icons/echoes/windward-pilgrimage.webp' },
        { id: 'chromatic-foam', name: 'Chromatic Foam', icon: 'icons/echoes/chromatic-foam.webp' },
        { id: 'crown-of-valor', name: 'Crown of Valor', icon: 'icons/echoes/crown-of-valor.webp' },
        { id: 'dream-of-the-lost', name: 'Dream of the Lost', icon: 'icons/echoes/dream-of-the-lost.webp' },
        { id: 'flamewings-shadow', name: "Flamewing's Shadow", icon: 'icons/echoes/flamewings-shadow.webp' },
        { id: 'flaming-clawprint', name: 'Flaming Clawprint', icon: 'icons/echoes/flaming-clawprint.webp' },
        { id: 'halo-of-starry-radiance', name: 'Halo of Starry Radiance', icon: 'icons/echoes/halo-of-starry-radiance.webp' },
        { id: 'heart-of-evils-purge', name: "Heart of Evil's Purge", icon: 'icons/echoes/heart-of-evils-purge.webp' },
        { id: 'lamp-of-nether-road', name: 'Lamp of Nether Road', icon: 'icons/echoes/lamp-of-nether-road.webp' },
        { id: 'law-of-harmony', name: 'Law of Harmony', icon: 'icons/echoes/law-of-harmony.webp' },
        { id: 'pact-of-neonlight-leap', name: 'Pact of Neonlight Leap', icon: 'icons/echoes/pact-of-neonlight-leap.webp' },
        { id: 'reel-of-spliced-memories', name: 'Reel of Spliced Memories', icon: 'icons/echoes/reel-of-spliced-memories.webp' },
        { id: 'rite-of-gilded-revelation', name: 'Rite of Gilded Revelation', icon: 'icons/echoes/rite-of-gilded-revelation.webp' },
        { id: 'shadow-of-shattered-dreams', name: 'Shadow of Shattered Dreams', icon: 'icons/echoes/shadow-of-shattered-dreams.webp' },
        { id: 'song-of-feathered-trace', name: 'Song of Feathered Trace', icon: 'icons/echoes/song-of-feathered-trace.webp' },
        { id: 'sound-of-true-name', name: 'Sound of True Name', icon: 'icons/echoes/sound-of-true-name.webp' },
        { id: 'thread-of-severed-fate', name: 'Thread of Severed Fate', icon: 'icons/echoes/thread-of-severed-fate.webp' },
        { id: 'trailblazing-star', name: 'Trailblazing Star', icon: 'icons/echoes/trailblazing-star.webp' },
        { id: 'wishes-of-quiet-snowfall', name: 'Wishes of Quiet Snowfall', icon: 'icons/echoes/wishes-of-quiet-snowfall.webp' },
    ],
    // Base-stat values (flat HP for cost-1, flat ATK for cost-3/4) are
    // DETERMINISTIC per rarity — confirmed against 2 independent
    // community-datamined sources (wutheringwaves.gg, game8.co) agreeing
    // exactly: cost-1 flat HP 516/957/2280, cost-3 flat ATK 44/63/100,
    // cost-4 flat ATK 68/92/150 (3★/4★/5★). NOT a rolled range like the
    // other 5 sub-stats — every echo of a given cost+rarity has the exact
    // same base-stat number.
    //
    // Main-stat OPTIONS and VALUES, corrected against the same 2 sources
    // (game8.co numbers used as primary — internally consistent across all
    // 3 cost tiers; wutheringwaves.gg's numbers agree within rounding).
    // Real cost-1 echoes' main-stat options are percentage HP/ATK/DEF, NOT
    // flat ATK/HP/DEF as this catalog previously (wrongly) listed — flat
    // stats are never a main-stat choice anywhere in WuWa, only a sub-stat
    // or the cost-locked base stat. Cost-4 also has Healing Bonus (new
    // catalog entry) but NOT Elemental DMG Bonus (previously wrongly
    // included at cost-4 instead of cost-3-only, and Healing Bonus was
    // missing entirely). `mainStatOverrides` supplies the real per-slot
    // values — see `GearSlot.mainStatOverrides` for why a single shared
    // `mains[].byRarity` table can't represent this on its own.
    slots: [
        {
            id: 'c4', label: 'Cost 4', cost: 4,
            mainStats: ['atkPct', 'hpPct', 'defPct', 'critRate', 'critDmg', 'healingBonus'],
            lockedSubStat: 'atk', baseStatByRarity: { 3: 68, 4: 92, 5: 150 },
            mainStatOverrides: {
                atkPct: { 3: 14.9, 4: 20.7, 5: 33.0 },
                hpPct: { 3: 14.9, 4: 20.7, 5: 33.0 },
                defPct: { 3: 18.9, 4: 26.3, 5: 41.8 },
                critRate: { 3: 9.9, 4: 13.8, 5: 22.0 },
                critDmg: { 3: 19.9, 4: 27.7, 5: 44.0 },
                healingBonus: { 3: 11.9, 4: 16.6, 5: 26.4 },
            },
        },
        {
            id: 'c3', label: 'Cost 3', cost: 3,
            // Elemental DMG Bonus split into one key per element (matching
            // shared/calc/optimizer.ts's `elemKey()` naming, element.toLowerCase()
            // + 'Dmg') instead of one generic 'elemDmg' — this ALSO activates
            // already-existing-but-dormant element-discrimination logic in the
            // damage engine (it already only applies a stat literally keyed
            // 'elemDmg' or the character's own e.g. 'spectroDmg' to that
            // character; every gear entry emitting the generic key meant this
            // silently applied to any character regardless of element). Not
            // just an OCR-resolution fix — a real calculation-accuracy one.
            mainStats: ['atkPct', 'hpPct', 'defPct', 'energyRegen', 'glacioDmg', 'fusionDmg', 'electroDmg', 'aeroDmg', 'spectroDmg', 'havocDmg'],
            lockedSubStat: 'atk', baseStatByRarity: { 3: 44, 4: 63, 5: 100 },
            mainStatOverrides: {
                atkPct: { 3: 13.6, 4: 18.9, 5: 30.0 },
                hpPct: { 3: 13.6, 4: 18.9, 5: 30.0 },
                defPct: { 3: 17.2, 4: 23.9, 5: 38.0 },
                energyRegen: { 3: 14.5, 4: 20.1, 5: 32.0 },
                glacioDmg: { 3: 13.6, 4: 18.9, 5: 30.0 },
                fusionDmg: { 3: 13.6, 4: 18.9, 5: 30.0 },
                electroDmg: { 3: 13.6, 4: 18.9, 5: 30.0 },
                aeroDmg: { 3: 13.6, 4: 18.9, 5: 30.0 },
                spectroDmg: { 3: 13.6, 4: 18.9, 5: 30.0 },
                havocDmg: { 3: 13.6, 4: 18.9, 5: 30.0 },
            },
        },
        {
            id: 'c1', label: 'Cost 1', cost: 1,
            mainStats: ['atkPct', 'hpPct', 'defPct'],
            lockedSubStat: 'hp', baseStatByRarity: { 3: 516, 4: 957, 5: 2280 },
            mainStatOverrides: {
                atkPct: { 3: 8.1, 4: 11.3, 5: 18.0 },
                hpPct: { 3: 10.3, 4: 14.3, 5: 22.8 },
                defPct: { 3: 8.1, 4: 11.3, 5: 18.0 },
            },
        },
    ],
    // Shared metadata (label/percent) + a fallback byRarity, only actually
    // used if a slot doesn't override a key (WuWa's slots above always do —
    // this fallback mirrors cost-4's real values, the most-shared tier).
    // Flat atk/hp/def are kept here (even though no WuWa slot ever lists
    // them as a main-stat OPTION) so a scanned echo whose main-stat line got
    // misread as the cost-locked base stat can still resolve to a real key
    // for the "main resolved to the base stat" validation in ocrMapping.ts.
    mains: [
        { key: 'atkPct', label: 'ATK%', percent: true, byRarity: { 3: 14.9, 4: 20.7, 5: 33.0 } },
        { key: 'hpPct', label: 'HP%', percent: true, byRarity: { 3: 14.9, 4: 20.7, 5: 33.0 } },
        { key: 'defPct', label: 'DEF%', percent: true, byRarity: { 3: 18.9, 4: 26.3, 5: 41.8 } },
        { key: 'critRate', label: 'Crit Rate', percent: true, byRarity: { 3: 9.9, 4: 13.8, 5: 22.0 } },
        { key: 'critDmg', label: 'Crit DMG', percent: true, byRarity: { 3: 19.9, 4: 27.7, 5: 44.0 } },
        { key: 'healingBonus', label: 'Healing Bonus', percent: true, byRarity: { 3: 11.9, 4: 16.6, 5: 26.4 } },
        { key: 'energyRegen', label: 'Energy Regen', percent: true, byRarity: { 3: 14.5, 4: 20.1, 5: 32.0 } },
        { key: 'glacioDmg', label: 'Glacio DMG Bonus', percent: true, byRarity: { 3: 13.6, 4: 18.9, 5: 30.0 } },
        { key: 'fusionDmg', label: 'Fusion DMG Bonus', percent: true, byRarity: { 3: 13.6, 4: 18.9, 5: 30.0 } },
        { key: 'electroDmg', label: 'Electro DMG Bonus', percent: true, byRarity: { 3: 13.6, 4: 18.9, 5: 30.0 } },
        { key: 'aeroDmg', label: 'Aero DMG Bonus', percent: true, byRarity: { 3: 13.6, 4: 18.9, 5: 30.0 } },
        { key: 'spectroDmg', label: 'Spectro DMG Bonus', percent: true, byRarity: { 3: 13.6, 4: 18.9, 5: 30.0 } },
        { key: 'havocDmg', label: 'Havoc DMG Bonus', percent: true, byRarity: { 3: 13.6, 4: 18.9, 5: 30.0 } },
        { key: 'atk', label: 'ATK', byRarity: { 3: 60, 4: 100, 5: 150 } },
        { key: 'hp', label: 'HP', byRarity: { 3: 940, 4: 1580, 5: 2280 } },
        { key: 'def', label: 'DEF', byRarity: { 3: 70, 4: 120, 5: 180 } },
    ],
    // Sub-stat ranges: confirmed (wutheringwaves.gg, cross-checked against
    // game8.co/wutheringlab.com's structural description) that WuWa
    // sub-stat roll ranges are UNIVERSAL — identical regardless of the
    // echo's own rarity — unlike Genshin, where the range narrows for lower
    // rarities. Same range at every rarity tier here (previously had
    // fabricated per-rarity narrowing that doesn't reflect the real game).
    //
    // The 4 attack-type DMG Bonus stats were MISSING entirely (a real, not
    // hypothetical, gap — surfaced repeatedly as "Sub-stat: ... DMG BONUS%"
    // unresolved warnings on real scans whose OCR read was otherwise
    // perfectly correct). Ranges from wutheringwaves.gg; a 3rd source
    // (wutheringlab.com) gave meaningfully different numbers for these
    // (and for ATK%/HP%, where its numbers disagree with the already-
    // verified 6.4-11.6 range) — treated as the same unreliable-source
    // pattern already found for that site's base-stat numbers earlier, not
    // a genuine reason to doubt wutheringwaves.gg here.
    subs: [
        { key: 'atkPct', label: 'ATK%', percent: true, byRarity: { 3: { min: 6.4, max: 11.6 }, 4: { min: 6.4, max: 11.6 }, 5: { min: 6.4, max: 11.6 } } },
        { key: 'hpPct', label: 'HP%', percent: true, byRarity: { 3: { min: 6.4, max: 11.6 }, 4: { min: 6.4, max: 11.6 }, 5: { min: 6.4, max: 11.6 } } },
        { key: 'defPct', label: 'DEF%', percent: true, byRarity: { 3: { min: 8.1, max: 14.7 }, 4: { min: 8.1, max: 14.7 }, 5: { min: 8.1, max: 14.7 } } },
        { key: 'critRate', label: 'Crit Rate', percent: true, byRarity: { 3: { min: 6.3, max: 10.5 }, 4: { min: 6.3, max: 10.5 }, 5: { min: 6.3, max: 10.5 } } },
        { key: 'critDmg', label: 'Crit DMG', percent: true, byRarity: { 3: { min: 12.6, max: 21.0 }, 4: { min: 12.6, max: 21.0 }, 5: { min: 12.6, max: 21.0 } } },
        { key: 'energyRegen', label: 'Energy Regen', percent: true, byRarity: { 3: { min: 5.6, max: 14.9 }, 4: { min: 5.6, max: 14.9 }, 5: { min: 5.6, max: 14.9 } } },
        { key: 'basicAttackDmgBonus', label: 'Basic Attack DMG Bonus', percent: true, byRarity: { 3: { min: 6.4, max: 12.4 }, 4: { min: 6.4, max: 12.4 }, 5: { min: 6.4, max: 12.4 } } },
        { key: 'heavyAttackDmgBonus', label: 'Heavy Attack DMG Bonus', percent: true, byRarity: { 3: { min: 6.4, max: 11.6 }, 4: { min: 6.4, max: 11.6 }, 5: { min: 6.4, max: 11.6 } } },
        { key: 'resonanceSkillDmgBonus', label: 'Resonance Skill DMG Bonus', percent: true, byRarity: { 3: { min: 6.4, max: 11.6 }, 4: { min: 6.4, max: 11.6 }, 5: { min: 6.4, max: 11.6 } } },
        { key: 'resonanceLiberationDmgBonus', label: 'Resonance Liberation DMG Bonus', percent: true, byRarity: { 3: { min: 6.4, max: 11.6 }, 4: { min: 6.4, max: 11.6 }, 5: { min: 6.4, max: 11.6 } } },
        { key: 'atk', label: 'ATK', byRarity: { 3: { min: 30, max: 70 }, 4: { min: 30, max: 70 }, 5: { min: 30, max: 70 } } },
        { key: 'hp', label: 'HP', byRarity: { 3: { min: 320, max: 580 }, 4: { min: 320, max: 580 }, 5: { min: 320, max: 580 } } },
        { key: 'def', label: 'DEF', byRarity: { 3: { min: 30, max: 70 }, 4: { min: 30, max: 70 }, 5: { min: 30, max: 70 } } },
    ],
};

// ── Genshin Impact (artifacts: 5 slots, up to 4 sub-stats) ───────────────────

export const GI_GEAR_CATALOG: GearCatalog = {
    rarities: [4, 5],
    maxSubStats: 4,
    subStatsCanRepeatMain: false, // GI: a sub can never duplicate the main stat
    // Full artifact set roster — kept in sync with `SET_BONUSES` in
    // `adapters/game-definitions/genshin-impact/definition.ts` (was
    // previously an 8-set subset). `icon` sourced from the genshin-db
    // package's `flower` slot art, with gi.yatta.moe/enka.network fallbacks
    // for sets whose mihoyo CDN URL had gone stale (2026-07-13). "Unseen
    // Feather" has no sourced icon — not found in any of the 3 sources
    // checked, falls back to placeholder art.
    sets: [
        { id: 'archaic-petra', name: 'Archaic Petra', icon: 'icons/artifacts/archaic-petra.png' },
        { id: 'blizzard-strayer', name: 'Blizzard Strayer', icon: 'icons/artifacts/blizzard-strayer.png' },
        { id: 'bloodstained-chivalry', name: 'Bloodstained Chivalry', icon: 'icons/artifacts/bloodstained-chivalry.png' },
        { id: 'crimson-witch-of-flames', name: 'Crimson Witch of Flames', icon: 'icons/artifacts/crimson-witch-of-flames.png' },
        { id: 'deepwood-memories', name: 'Deepwood Memories', icon: 'icons/artifacts/deepwood-memories.png' },
        { id: 'desert-pavilion-chronicle', name: 'Desert Pavilion Chronicle', icon: 'icons/artifacts/desert-pavilion-chronicle.png' },
        { id: 'echoes-of-an-offering', name: 'Echoes of an Offering', icon: 'icons/artifacts/echoes-of-an-offering.png' },
        { id: 'emblem-of-severed-fate', name: 'Emblem of Severed Fate', icon: 'icons/artifacts/emblem-of-severed-fate.png' },
        { id: 'flower-of-paradise-lost', name: 'Flower of Paradise Lost', icon: 'icons/artifacts/flower-of-paradise-lost.png' },
        { id: 'fragment-of-harmonic-whimsy', name: 'Fragment of Harmonic Whimsy', icon: 'icons/artifacts/fragment-of-harmonic-whimsy.png' },
        { id: 'gilded-dreams', name: 'Gilded Dreams', icon: 'icons/artifacts/gilded-dreams.png' },
        { id: 'gladiators-finale', name: 'Gladiators Finale', icon: 'icons/artifacts/gladiators-finale.png' },
        { id: 'golden-troupe', name: 'Golden Troupe', icon: 'icons/artifacts/golden-troupe.png' },
        { id: 'heart-of-depth', name: 'Heart of Depth', icon: 'icons/artifacts/heart-of-depth.png' },
        { id: 'husk-of-opulent-dreams', name: 'Husk of Opulent Dreams', icon: 'icons/artifacts/husk-of-opulent-dreams.png' },
        { id: 'lavawalker', name: 'Lavawalker', icon: 'icons/artifacts/lavawalker.png' },
        { id: 'maiden-beloved', name: 'Maiden Beloved', icon: 'icons/artifacts/maiden-beloved.png' },
        { id: 'marechaussee-hunter', name: 'Marechaussee Hunter', icon: 'icons/artifacts/marechaussee-hunter.png' },
        { id: 'nighttime-whispers-in-the-echoing-woods', name: 'Nighttime Whispers in the Echoing Woods', icon: 'icons/artifacts/nighttime-whispers-in-the-echoing-woods.png' },
        { id: 'noblesse-oblige', name: 'Noblesse Oblige', icon: 'icons/artifacts/noblesse-oblige.png' },
        { id: 'nymphs-dream', name: 'Nymphs Dream', icon: 'icons/artifacts/nymphs-dream.png' },
        { id: 'obsidian-codex', name: 'Obsidian Codex', icon: 'icons/artifacts/obsidian-codex.png' },
        { id: 'ocean-hued-clam', name: 'Ocean Hued Clam', icon: 'icons/artifacts/ocean-hued-clam.png' },
        { id: 'pale-flame', name: 'Pale Flame', icon: 'icons/artifacts/pale-flame.png' },
        { id: 'retracing-bolide', name: 'Retracing Bolide', icon: 'icons/artifacts/retracing-bolide.png' },
        { id: 'scroll-of-the-hero-of-cinder-city', name: 'Scroll of the Hero of Cinder City', icon: 'icons/artifacts/scroll-of-the-hero-of-cinder-city.png' },
        { id: 'shimenawas-reminiscence', name: 'Shimenawas Reminiscence', icon: 'icons/artifacts/shimenawas-reminiscence.png' },
        { id: 'song-of-days-past', name: 'Song of Days Past', icon: 'icons/artifacts/song-of-days-past.png' },
        { id: 'tenacity-of-the-millelith', name: 'Tenacity of the Millelith', icon: 'icons/artifacts/tenacity-of-the-millelith.png' },
        { id: 'thundering-fury', name: 'Thundering Fury', icon: 'icons/artifacts/thundering-fury.png' },
        { id: 'thundersoother', name: 'Thundersoother', icon: 'icons/artifacts/thundersoother.png' },
        { id: 'unfinished-reverie', name: 'Unfinished Reverie', icon: 'icons/artifacts/unfinished-reverie.png' },
        { id: 'vermillion-hereafter', name: 'Vermillion Hereafter', icon: 'icons/artifacts/vermillion-hereafter.png' },
        { id: 'viridescent-venerer', name: 'Viridescent Venerer', icon: 'icons/artifacts/viridescent-venerer.png' },
        { id: 'vourukashas-glow', name: 'Vourukashas Glow', icon: 'icons/artifacts/vourukashas-glow.png' },
        { id: 'wanderers-troupe', name: 'Wanderers Troupe', icon: 'icons/artifacts/wanderers-troupe.png' },
    ],
    slots: [
        { id: 'flower', label: 'Flower', mainStats: ['hp'] },
        { id: 'plume', label: 'Plume', mainStats: ['atk'] },
        { id: 'sands', label: 'Sands', mainStats: ['hpPct', 'atkPct', 'defPct', 'elementalMastery', 'energyRegen'] },
        // Elemental DMG Bonus split into one key per element (matching
        // shared/calc/optimizer.ts's `elemKey()` naming) instead of one
        // generic 'elemDmg' — same rationale as WW's cost-3 slot: this
        // activates already-existing element-discrimination logic in the
        // damage engine rather than applying to any character regardless
        // of element, and lets scanned specific-element main stats (e.g.
        // "Pyro DMG Bonus") resolve instead of always showing unresolved.
        { id: 'goblet', label: 'Goblet', mainStats: ['hpPct', 'atkPct', 'defPct', 'elementalMastery', 'anemoDmg', 'cryoDmg', 'electroDmg', 'geoDmg', 'pyroDmg', 'hydroDmg', 'dendroDmg'] },
        { id: 'circlet', label: 'Circlet', mainStats: ['hpPct', 'atkPct', 'defPct', 'elementalMastery', 'critRate', 'critDmg'] },
    ],
    mains: [
        { key: 'hp', label: 'HP', byRarity: { 4: 3571, 5: 4780 } },
        { key: 'atk', label: 'ATK', byRarity: { 4: 232, 5: 311 } },
        { key: 'hpPct', label: 'HP%', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'atkPct', label: 'ATK%', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'defPct', label: 'DEF%', percent: true, byRarity: { 4: 43.5, 5: 58.3 } },
        { key: 'elementalMastery', label: 'Elemental Mastery', byRarity: { 4: 139, 5: 186.5 } },
        { key: 'energyRegen', label: 'Energy Recharge', percent: true, byRarity: { 4: 38.9, 5: 51.8 } },
        { key: 'anemoDmg', label: 'Anemo DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'cryoDmg', label: 'Cryo DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'electroDmg', label: 'Electro DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'geoDmg', label: 'Geo DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'pyroDmg', label: 'Pyro DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'hydroDmg', label: 'Hydro DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'dendroDmg', label: 'Dendro DMG Bonus', percent: true, byRarity: { 4: 34.8, 5: 46.6 } },
        { key: 'critRate', label: 'Crit Rate', percent: true, byRarity: { 4: 23.3, 5: 31.1 } },
        { key: 'critDmg', label: 'Crit DMG', percent: true, byRarity: { 4: 46.6, 5: 62.2 } },
    ],
    subs: [
        { key: 'atkPct', label: 'ATK%', percent: true, byRarity: { 4: { min: 4.1, max: 19.8 }, 5: { min: 4.1, max: 23.3 } } },
        { key: 'hpPct', label: 'HP%', percent: true, byRarity: { 4: { min: 4.1, max: 19.8 }, 5: { min: 4.1, max: 23.3 } } },
        { key: 'defPct', label: 'DEF%', percent: true, byRarity: { 4: { min: 5.1, max: 24.8 }, 5: { min: 5.1, max: 29.2 } } },
        { key: 'critRate', label: 'Crit Rate', percent: true, byRarity: { 4: { min: 2.7, max: 13.1 }, 5: { min: 2.7, max: 15.6 } } },
        { key: 'critDmg', label: 'Crit DMG', percent: true, byRarity: { 4: { min: 5.4, max: 26.2 }, 5: { min: 5.4, max: 31.1 } } },
        { key: 'elementalMastery', label: 'Elemental Mastery', byRarity: { 4: { min: 16, max: 79 }, 5: { min: 16, max: 94 } } },
        { key: 'energyRegen', label: 'Energy Recharge', percent: true, byRarity: { 4: { min: 4.5, max: 21.9 }, 5: { min: 4.5, max: 26 } } },
        { key: 'atk', label: 'ATK', byRarity: { 4: { min: 14, max: 66 }, 5: { min: 16, max: 76 } } },
        { key: 'hp', label: 'HP', byRarity: { 4: { min: 167, max: 807 }, 5: { min: 209, max: 1000 } } },
        { key: 'def', label: 'DEF', byRarity: { 4: { min: 16, max: 78 }, 5: { min: 19, max: 92 } } },
    ],
};

/** The character a fresh save owns, per game. */
export const STARTER_CHARACTER: Record<string, string> = {
    'wuthering-waves': 'rover-spectro',
    'genshin-impact': 'traveler-anemo',
};
