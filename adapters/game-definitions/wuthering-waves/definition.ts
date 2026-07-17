/**
 * @fileoverview Wuthering Waves GameDefinition package
 * @module adapters/game-definitions/wuthering-waves
 *
 * Exports a `GameDefinition` for Wuthering Waves. The OCR scanner and damage
 * calculator modules read this package to know the WU-specific vocabulary,
 * OCR patterns, set bonuses, and combat action multipliers.
 *
 * WHY: Extracting this into its own package keeps every game-specific
 * constant in one place. Swapping in Genshin Impact is as simple as
 * setting `activeGame: 'genshin-impact'` in config/default.json — no
 * code changes anywhere else.
 */

import type { GameDefinition, StatRules, StatType } from '@shared/types/game-definition';

// ─────────────────────────────────────────────────────────────────────────────
// OCR patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WU echo screenshot OCR patterns. The main stat and sub-stat regexes both
 * target the same vocabulary; the difference is that sub-stat is global
 * (so all sub-stats in a screenshot are captured).
 */
// Verified against a real Echo Management screenshot (2026-07 session): the
// original stat list only covered the "generic" substats and silently missed
// attack-type/elemental DMG Bonus substats (e.g. "Basic Attack DMG Bonus"),
// which real echoes routinely roll — expanded so those aren't dropped.
//
// A SECOND real screenshot (same session) showed the game actually renders
// "Crit. Rate" / "Crit. DMG" WITH a period after "Crit" — the original
// pattern only matched "CRIT Rate" (no period), so real Crit-stat substats
// were silently dropped entirely (never even attempted a match). `\.?` makes
// the period optional so both spellings match.
//
// A THIRD real screenshot showed OCR sometimes merges/drops the space
// between words in a multi-word label ("Energy Regen" -> "EnergyRegen"),
// same underlying issue as the period case above — every literal space
// between words here is `\s*` (zero-or-more) instead, so both a normal
// space and a fully-merged run match.
const WW_STAT_NAMES = 'ATK|DEF|HP|CRIT\\.?\\s*Rate|CRIT\\.?\\s*DMG|Energy\\s*Regen|Healing\\s*Bonus|Effect\\s*Hit\\s*Rate|Effect\\s*RES|'
    + 'Basic\\s*Attack\\s*DMG\\s*Bonus|Heavy\\s*Attack\\s*DMG\\s*Bonus|Resonance\\s*Skill\\s*DMG\\s*Bonus|Resonance\\s*Liberation\\s*DMG\\s*Bonus|'
    + 'Glacio\\s*DMG\\s*Bonus|Fusion\\s*DMG\\s*Bonus|Electro\\s*DMG\\s*Bonus|Aero\\s*DMG\\s*Bonus|Spectro\\s*DMG\\s*Bonus|Havoc\\s*DMG\\s*Bonus';

// Real captures showed a stray OCR-misread glyph (e.g. a decorative bullet
// icon between a stat's label and its value rendered as "~~") occasionally
// landing between the label and the number — the original `[:\s]+`
// separator required ONLY a colon/whitespace there and silently failed to
// match the whole stat on any line where that happened, which (worse) could
// cause a LATER, cleanly-read stat to be wrongly picked up as the main stat
// instead (parsing takes the first successful match in the text). `[^\d\n]`
// tolerates any non-digit junk in that gap. Bound raised 12 -> 20 after a
// real capture showed a 15-character garbage run between "Crit. Rate" and
// its value (likely two short rows bleeding together) — still bounded (not
// unlimited) so it can't run away and skip onto a different line's number,
// but 12 was too tight for real-world garbling on short adjacent lines.
const STAT_VALUE_GAP = '[^\\d\\n]{1,20}';

// When a cosmetic skin is applied to an echo, the game prefixes its display
// name with "Phantom: " (e.g. "Phantom: Lightcrusher" — confirmed against a
// real skinned-echo screenshot, 2026-07-12). That's a skin indicator, not
// part of the echo's real identity — stripped here (with the colon and
// following space both optional, since OCR sometimes drops the colon) so
// `echo.name` always comes out as just the real name ("Lightcrusher"), which
// is what WW_ECHO_NAME_TO_SET's lookup and the confirm-window display both
// expect. No real echo name is known to genuinely start with "Phantom" itself.
// A single Title-Case name word, optionally extended by an apostrophe or
// inner hyphen + more letters — real echo names use both ("Devotee's Flesh",
// "Bell-Borne Geochelone", "Cyan-Feathered Heron"). Without this, the name
// capture stopped dead at the punctuation, silently truncating to just
// "Devotee" / "Bell" / "Cyan".
// {2,} (not {1,}) so a 2-letter OCR misread of the set-filter chip's icon
// row (e.g. "Ag", "hg" — garbled glyphs that happen to fake-match a Title-
// Case word) can't chain onto the echo name below it; every real echo/set
// name word is 3+ letters, so this costs nothing genuine.
const NAME_WORD = "[A-Z][a-z]{2,}(?:['\\u2019-][a-zA-Z]+)*";
// A handful of real echo names use a lowercase linking word between two
// Title-Case words ("Lady of the Sea", "Fallacy of No Return", "Dragon of
// Dirge", "Rage Against the Statue") — checked against every echo name in
// the live game data, "of"/"the" are the ONLY lowercase words that occur, so
// this is an exact, sourced list, not a guessed English stop-word set.
// Without this, capture stopped dead at the lowercase word, silently
// truncating e.g. "Lady of the Sea" to just "Lady".
const NAME_CONNECTOR = '(?:of|the)';
// One Title-Case name, tolerating the lowercase connectors above.
const NAME_PART = `${NAME_WORD}(?:\\s+(?:${NAME_CONNECTOR}\\s+)*${NAME_WORD})*`;
// Some real echoes are a "Main: Sub" (or deeper) compound — multi-part boss
// drops like "Chop Chop: Headless"/"Leftless"/"Rightless", "Kernel Puppet:
// Anger", "Fog Lionarch: Body"/"Head", "Myriad Snare: Rustfire Chassis", and
// the "Nightmare: X" prefix itself (a genuinely distinct echo from its base
// form, unlike the cosmetic "Phantom: " skin prefix stripped above) — all
// confirmed against game8.co's own echo pages, which show the colon/hyphen
// in the actual echo name, not just as wiki-page punctuation. Up to now the
// regex only ever captured "Nightmare" and stopped dead at the colon —
// every `WW_ECHO_NAME_TO_SET`/`WW_ECHO_AMBIGUOUS_SETS` entry keyed
// `'Nightmare: X'` was silently unreachable by a real scan until this fix.
// A handful of names go up to two levels deep, in EITHER order —
// "Reminiscence: Threnodian - Leviathan" (colon then hyphen) and
// "Reminiscence - Nightmare: Adam Smasher" (hyphen then colon, confirmed
// real) — so the compound suffix repeats up to twice, each occurrence
// independently either separator, rather than hardcoding one specific order.
const COMPOUND_SEP = `(?:\\s*[:-]\\s*${NAME_PART})`;
// Not anchored to the start of the text: the screenshot's Sonata-set filter
// chip (its own crop region — see modules/ocr-scanner's capture pipeline)
// sits directly above the echo name, so the raw OCR text is actually
// "<Set name><icon junk><echo name> +<level>", e.g. "Void Thunder Y
// Phantom: Thundering Mephis +25". An anchored match greedily grabbed
// whatever Title-Case run happened to start at position 0 — usually the
// SET name, not the echo name. Instead, require the captured name to be
// immediately followed by the "+<level>" that always follows a real echo
// name on this screen; the regex engine then naturally skips past the set
// name (and any non-word icon junk between the two) to the name that's
// actually adjacent to "+N".
const OCR_PATTERNS = {
    namePattern: `(?:Phantom\\s*:?\\s*)?(${NAME_PART}${COMPOUND_SEP}{0,2})(?=\\s*\\+\\d)`,
    costPattern: `Cost${STAT_VALUE_GAP}(\\d+)`,
    mainStatPattern: `(${WW_STAT_NAMES})${STAT_VALUE_GAP}([\\d.]+)%?`,
    subStatPattern: `(${WW_STAT_NAMES})${STAT_VALUE_GAP}([\\d.]+)%?`,
    setNames: [
        'Freezing Frost', 'Molten Rift', 'Void Thunder', 'Sierra Gale', 'Celestial Light',
        'Havoc Eclipse', 'Moonlit Clouds', 'Rejuvenating Glow', 'Lingering Tunes', 'Frosty Resolve',
        'Empyrean Anthem', 'Midnight Veil', 'Eternal Radiance', 'Tidebreaking Courage',
        'Gusts of Welkin', 'Windward Pilgrimage',
        'Chromatic Foam', 'Crown of Valor', 'Dream of the Lost', "Flamewing's Shadow",
        'Flaming Clawprint', 'Halo of Starry Radiance', "Heart of Evil's Purge", 'Lamp of Nether Road',
        'Law of Harmony', 'Pact of Neonlight Leap', 'Reel of Spliced Memories', 'Rite of Gilded Revelation',
        'Shadow of Shattered Dreams', 'Song of Feathered Trace', 'Sound of True Name',
        'Thread of Severed Fate', 'Trailblazing Star', 'Wishes of Quiet Snowfall',
    ],
    // Both verified against a real Echo Management screenshot: the level is
    // shown as "+25" next to the echo name, and equipped echoes show
    // "Equipped by <Character Name>" further down (no scroll needed).
    levelPattern: '\\+(\\d+)',
    equippedByPattern: 'Equipped by ([A-Za-z][A-Za-z\\s]*)',
    // The official client's window title, regardless of game language/region.
    windowTitleHint: 'Wuthering Waves',
};

// ─────────────────────────────────────────────────────────────────────────────
// Combat actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WU combat action vocabulary. These are the canonical WU action ids used
 * by the damage breakdown and rotation generator. Multipliers are coarse
 * defaults; character-specific scaling lives in the character database.
 */
const COMBAT_ACTIONS = [
    { id: 'basicAttack', label: 'Basic Attack', multiplier: 1.0, energy: 2, duration: 1.0 },
    { id: 'heavyAttack', label: 'Heavy Attack', multiplier: 2.5, energy: 5, duration: 1.5 },
    { id: 'resonanceSkill', label: 'Resonance Skill', multiplier: 3.2, energy: 15, duration: 2.0 },
    { id: 'resonanceLiberation', label: 'Resonance Liberation', multiplier: 5.5, energy: 30, duration: 3.0 },
    { id: 'forteCircuit', label: 'Forte Circuit', multiplier: 2.8, energy: 10, duration: 2.5 },
    { id: 'outroSkill', label: 'Outro Skill', multiplier: 1.8, energy: 0, duration: 1.5 },
    { id: 'introSkill', label: 'Intro Skill', multiplier: 1.5, energy: 0, duration: 1.5 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Set bonuses
// ─────────────────────────────────────────────────────────────────────────────

// `bonuses` = 2-piece; `setBonus` = the 5-piece set effect (deploy together on a
// full echo set). 5pc values are best-effort; conditional element-DMG effects are
// modeled as if active — verify. Element sets grant ~+30% of that element's DMG.
// `bonuses` = 2-piece, `setBonus` = 5-piece — verified against the Dimbreath datamine
// (PhantomFetterGroup / PhantomFetter). Element 2pc = +10% of that element's DMG;
// element 5pc = +30% (Void Thunder 15%, Havoc Eclipse 6%×5). Team/support 5pc effects
// (Moonlit next-resonator ATK, Frosty/Empyrean/Tidebreaking) are best-effort at typical
// uptime. Conditional 5pc modeled as if active.
const SET_BONUSES = [
    { name: 'Freezing Frost', bonuses: { elementalDmgBonus: { Glacio: 10 } }, setBonus: { elementalDmgBonus: { Glacio: 30 } } },
    { name: 'Molten Rift', bonuses: { elementalDmgBonus: { Fusion: 10 } }, setBonus: { elementalDmgBonus: { Fusion: 30 } } },
    // 5pc: +15% Electro DMG, stacking up to 2 times — modeled at max stacks (30%), matching this session's established convention.
    { name: 'Void Thunder', bonuses: { elementalDmgBonus: { Electro: 10 } }, setBonus: { elementalDmgBonus: { Electro: 30 } } },
    { name: 'Sierra Gale', bonuses: { elementalDmgBonus: { Aero: 10 } }, setBonus: { elementalDmgBonus: { Aero: 30 } } },
    { name: 'Celestial Light', bonuses: { elementalDmgBonus: { Spectro: 10 } }, setBonus: { elementalDmgBonus: { Spectro: 30 } } },
    { name: 'Havoc Eclipse', bonuses: { elementalDmgBonus: { Havoc: 10 } }, setBonus: { elementalDmgBonus: { Havoc: 30 } } },
    // 5pc grants the NEXT resonator (on Outro) +22.5% ATK — a TEAM buff.
    { name: 'Moonlit Clouds', bonuses: { energyRegen: 10 }, setBonus: { atkPercent: 22.5 } },
    // 5pc: +15% ATK to the whole team for 30s upon healing allies — a TEAM buff, was empty.
    { name: 'Rejuvenating Glow', bonuses: { healingBonus: 10 }, setBonus: { atkPercent: 15 } },
    // 2pc = +10% ATK; 5pc grants ATK% after basic-attack hits.
    { name: 'Lingering Tunes', bonuses: { atkPercent: 10 }, setBonus: { atkPercent: 20 } },
    // 5pc: Resonance Skill grants 22.5% GLACIO DMG (not ATK% — was wrong stat
    // entirely). A separate stacking Resonance Skill DMG component (up to
    // 36%) exists too but is left unmodeled — too conditionally coupled to
    // confidently reduce to one number, same "don't guess" precedent as
    // Flamewing's Shadow's skipped Crit Rate component below.
    { name: 'Frosty Resolve', bonuses: { resonanceSkillDmg: 12 }, setBonus: { elementalDmgBonus: { Glacio: 22.5 } } },
    { name: 'Empyrean Anthem', bonuses: { energyRegen: 10 }, setBonus: { atkPercent: 20 } },
    { name: 'Midnight Veil', bonuses: { elementalDmgBonus: { Havoc: 10 } }, setBonus: { elementalDmgBonus: { Havoc: 15 } } },
    // 5pc: 20% Crit Rate (was wrongly modeled as Spectro DMG) + 15% Spectro DMG at 10 stacks (was missing entirely).
    { name: 'Eternal Radiance', bonuses: { elementalDmgBonus: { Spectro: 10 } }, setBonus: { critRate: 20, elementalDmgBonus: { Spectro: 15 } } },
    { name: 'Tidebreaking Courage', bonuses: { energyRegen: 10 }, setBonus: { atkPercent: 15 } },
    { name: 'Gusts of Welkin', bonuses: { elementalDmgBonus: { Aero: 10 } }, setBonus: { elementalDmgBonus: { Aero: 15 } } },
    { name: 'Windward Pilgrimage', bonuses: { elementalDmgBonus: { Aero: 10 } }, setBonus: { elementalDmgBonus: { Aero: 30 } } },

    // ── 18 sets added from newer content (2026-07-12), sourced from game8.co's
    // "List of All Sonata Effects" page (single-source — NOT independently
    // cross-verified against a second source like the 16 sets above were).
    // Several of these use a 1pc/3pc activation threshold instead of the
    // usual 2pc/5pc (Crown of Valor, Dream of the Lost, Flamewing's Shadow,
    // Law of Harmony, Thread of Severed Fate, Shadow of Shattered Dreams) —
    // this app's model only supports one flat 5-piece deployment (see
    // `deriveSetBonuses` in shared/game-data/derive.ts), which is still
    // correct for a full 5-echo build (5 pieces trivially satisfies any
    // lower threshold too); for these, `bonuses` is left empty and the
    // set's one real tier goes in `setBonus`. Where a real effect doesn't
    // map onto any stat this engine models (Echo Skill DMG/Crit Rate has no
    // scope at all; per-stack "Tune Break Boost" isn't a modeled stat), that
    // component is left out rather than approximated — same "best-effort,
    // don't fabricate" precedent as Empyrean Anthem's already-skipped
    // Coordinated Attack DMG above. Stacking effects are modeled at their
    // max stack count, matching this session's established convention.
    { name: 'Chromatic Foam', bonuses: { elementalDmgBonus: { Fusion: 10 } }, setBonus: { elementalDmgBonus: { Fusion: 10 } } },
    // 3pc: up to 5 stacks of (ATK 6%, Crit DMG 4%) on Shield — modeled at max stacks.
    { name: 'Crown of Valor', bonuses: { }, setBonus: { atkPercent: 30, critDmg: 20 } },
    // 3pc: 20% Crit Rate at zero Resonance Energy, + 35% Echo Skill DMG (now
    // modeled via the 'echo' appliesTo scope added 2026-07-16 — see
    // shared/calc/optimizer.ts's canonScope() and derive.ts's SET_ATTACK_SCOPE.
    // NOTE: no skill in this engine is currently scoped 'echo' (Echo Skill's
    // own damage isn't modeled — depends on the specific equipped Echo,
    // deliberately out of scope), so this buff is correctly inert for now,
    // not wrong — shovel-ready for whenever Echo Skill damage gets modeled.
    { name: 'Dream of the Lost', bonuses: { }, setBonus: { critRate: 20, echoSkillDmg: 35 } },
    // 3pc: Echo Skill/Heavy Attack cross-buff when both active grants 16% Fusion DMG (Crit Rate components skipped, too conditionally coupled).
    { name: "Flamewing's Shadow", bonuses: { }, setBonus: { elementalDmgBonus: { Fusion: 16 } } },
    // 5pc: Resonance Liberation grants the CASTER 20% RESONANCE LIBERATION DMG
    // for 35s (was wrongly modeled as 20% Fusion DMG — that 20% figure is
    // real but belongs to liberationDmg, not elementalDmgBonus.Fusion; the
    // team's separate 15% Fusion DMG component is skipped, self-only convention).
    { name: 'Flaming Clawprint', bonuses: { elementalDmgBonus: { Fusion: 10 } }, setBonus: { liberationDmg: 20 } },
    // 5pc: healing grants team ATK scaling with Off-Tune Buildup Rate, max 25% — modeled at cap.
    { name: 'Halo of Starry Radiance', bonuses: { healingBonus: 10 }, setBonus: { atkPercent: 25 } },
    { name: "Heart of Evil's Purge", bonuses: { elementalDmgBonus: { Aero: 10 } }, setBonus: { elementalDmgBonus: { Aero: 20 }, critDmg: 20 } },
    // 5pc: Shield grants up to 4 stacks of 5% Crit Rate, then +15% Fusion DMG at max stacks — modeled at max stacks.
    { name: 'Lamp of Nether Road', bonuses: { hpPercent: 10 }, setBonus: { critRate: 20, elementalDmgBonus: { Fusion: 15 } } },
    // 3pc: Echo Skill grants the caster 30% Heavy Attack DMG (team Echo Skill DMG stacking has no modeled scope — skipped).
    { name: 'Law of Harmony', bonuses: { }, setBonus: { heavyAttackDmg: 30 } },
    // 5pc: mostly a team swap-support buff (incoming character ATK, scaling with Tune Break Boost) — flat component only.
    { name: 'Pact of Neonlight Leap', bonuses: { elementalDmgBonus: { Spectro: 10 } }, setBonus: { atkPercent: 15 } },
    // 5pc grants "Tune Break Boost," a stat this engine doesn't model at all — left empty rather than approximated.
    { name: 'Reel of Spliced Memories', bonuses: { atkPercent: 10 }, setBonus: { } },
    // 5pc: Basic Attack DMG stacks Spectro DMG up to 3x, then +40% Basic Attack DMG at max stacks — modeled at max stacks.
    { name: 'Rite of Gilded Revelation', bonuses: { elementalDmgBonus: { Spectro: 10 } }, setBonus: { elementalDmgBonus: { Spectro: 30 }, basicAttackDmg: 40 } },
    // 1pc-only (collab-exclusive set, Lucy/Rebecca): Hack-Shifting grants 35% Basic AND Heavy Attack DMG for 15s.
    // Only ONE echo exists in this set ("Reminiscence - Nightmare: Adam
    // Smasher", cost 4 — see echo-set-names.ts), so the game's usual
    // "5 pieces trivially satisfies any lower threshold" fallback doesn't
    // hold here: `pieces: 1` makes the real 1pc threshold explicit instead
    // of leaving the bonus unreachable at the default 5pc. It's also
    // genuinely restricted to its two collab characters in-game, not a
    // generic Sonata effect any Resonator can slot in for.
    { name: 'Shadow of Shattered Dreams', bonuses: { }, setBonus: { basicAttackDmg: 35, heavyAttackDmg: 35 }, pieces: 1, restrictedToCharacters: ['Rebecca', 'Lucy'] },
    // 5pc: two mutually-exclusive branches (Havoc Bane vs Glacio Chafe) — modeled on the Havoc Bane branch only.
    { name: 'Song of Feathered Trace', bonuses: { energyRegen: 10 }, setBonus: { critRate: 20, heavyAttackDmg: 25 } },
    // 5pc: Echo Skill Crit Rate component has no modeled scope (skipped); +15% Aero DMG kept.
    { name: 'Sound of True Name', bonuses: { elementalDmgBonus: { Aero: 10 } }, setBonus: { elementalDmgBonus: { Aero: 15 } } },
    { name: 'Thread of Severed Fate', bonuses: { }, setBonus: { atkPercent: 20, liberationDmg: 30 } },
    { name: 'Trailblazing Star', bonuses: { elementalDmgBonus: { Fusion: 10 } }, setBonus: { elementalDmgBonus: { Fusion: 20 }, critRate: 20 } },
    // 5pc: complex "Snowfall" branching mechanic beyond the base Glacio DMG bonus — only the flat, unconditional component kept.
    { name: 'Wishes of Quiet Snowfall', bonuses: { elementalDmgBonus: { Glacio: 10 } }, setBonus: { elementalDmgBonus: { Glacio: 10 } } },
];

// ─────────────────────────────────────────────────────────────────────────────
// GameDefinition
// ─────────────────────────────────────────────────────────────────────────────

export const wutheringWaves: GameDefinition = {
    id: 'wuthering-waves',
    displayName: 'Wuthering Waves',
    description: 'Post-apocalyptic action-RPG with echoes as equipment.',
    version: '1.0.0',

    equipment: {
        slotLabel: 'Echo',
        slotLabelPlural: 'Echoes',
        // 7 stat rows total: main stat + a cost-locked "base" stat (tracked
        // separately, see GearSlot.lockedSubStat) + 5 random sub-stats — this
        // counts only the random ones. See the matching comment in
        // shared/game-data/gear-catalogs.ts (kept in sync with
        // WW_GEAR_CATALOG.maxSubStats there; this is the field the live app's
        // gear catalog actually uses — derive.ts overrides WW_GEAR_CATALOG's
        // own value with this one).
        maxSubStats: 5,
        maxLevel: 25,
        allowedMainStatTypes: [
            'ATK', 'HP', 'DEF',
            'ATK%', 'HP%', 'DEF%',
            'CRIT Rate', 'CRIT DMG',
            'Energy Regen', 'Healing Bonus',
        ],
        allowedCosts: [1, 3, 4],
    },

    character: {
        elements: ['Glacio', 'Fusion', 'Electro', 'Aero', 'Spectro', 'Havoc', 'Physical'],
        weapons: ['Sword', 'Broadblade', 'Pistols', 'Gauntlets', 'Rectifier'],
        maxLevel: 90,
        maxAscension: 6,
        ascensionBonus: [
            { atk: 0.00, hp: 0.00, def: 0.00 },
            { atk: 0.06, hp: 0.06, def: 0.06 },
            { atk: 0.12, hp: 0.12, def: 0.12 },
            { atk: 0.18, hp: 0.18, def: 0.18 },
            { atk: 0.24, hp: 0.24, def: 0.24 },
            { atk: 0.30, hp: 0.30, def: 0.30 },
            { atk: 0.36, hp: 0.36, def: 0.36 },
        ],
    },

    combat: {
        actions: COMBAT_ACTIONS,
        defaultRotationLength: 20,
    },

    ocr: OCR_PATTERNS,
    sets: SET_BONUSES,

    statAliases: {
        'ATK %': 'ATK%',
        'HP %': 'HP%',
        'DEF %': 'DEF%',
    },

    uiOptions: {
        characters: [
            { value: 'rover-spectro', label: 'Rover (Spectro)' },
            { value: 'jinhsi', label: 'Jinhsi' },
            { value: 'yinlin', label: 'Yinlin' },
            { value: 'changli', label: 'Changli' },
            { value: 'camellya', label: 'Camellya' },
            { value: 'jiyan', label: 'Jiyan' },
            { value: 'calcharo', label: 'Calcharo' },
            { value: 'encore', label: 'Encore' },
            { value: 'verina', label: 'Verina' },
            { value: 'sanhua', label: 'Sanhua' },
            { value: 'baizhi', label: 'Baizhi' },
            { value: 'yangyang', label: 'Yangyang' },
            { value: 'chixia', label: 'Chixia' },
            { value: 'danjin', label: 'Danjin' },
            { value: 'mortefi', label: 'Mortefi' },
            { value: 'aalto', label: 'Aalto' },
            { value: 'taoqi', label: 'Taoqi' },
            { value: 'xiangli-yao', label: 'Xiangli Yao' },
            { value: 'zhezhi', label: 'Zhezhi' },
            { value: 'shorekeeper', label: 'Shorekeeper' },
            { value: 'carlotta', label: 'Carlotta' },
            { value: 'roccia', label: 'Roccia' },
            { value: 'cantarella', label: 'Cantarella' },
            { value: 'lingyang', label: 'Lingyang' },
            { value: 'yuanwu', label: "Yuanwu" },
            { value: 'lumi', label: "Lumi" },
            { value: 'youhu', label: "Youhu" },
            { value: 'brant', label: "Brant" },
            { value: 'phoebe', label: "Phoebe" },
            { value: 'ciaccona', label: "Ciaccona" },
            { value: 'zani', label: "Zani" },
            { value: 'lupa', label: "Lupa" },
            { value: 'phrolova', label: "Phrolova" },
            { value: 'cartethyia', label: "Cartethyia" },
            { value: 'augusta', label: "Augusta" },
            { value: 'iuno', label: "Iuno" },
            { value: 'buling', label: "Buling" },
            { value: 'galbrena', label: "Galbrena" },
            { value: 'chisa', label: "Chisa" },
            { value: 'qiuyuan', label: "Qiuyuan" },
            { value: 'lynae', label: "Lynae" },
            { value: 'mornye', label: "Mornye" },
            { value: 'luuk-herssen', label: "Luuk Herssen" },
            { value: 'aemeath', label: "Aemeath" },
            { value: 'denia', label: "Denia" },
            { value: 'hiyuki', label: "Hiyuki" },
            { value: 'jianxin', label: "Jianxin" },
            { value: 'lucilla', label: "Lucilla" },
            { value: 'lucy', label: "Lucy" },
            { value: 'rebecca', label: "Rebecca" },
            { value: 'sigrika', label: "Sigrika" },
            { value: 'suisui', label: "Suisui" },
            { value: 'rover-aero', label: "Rover (Aero)" },
            { value: 'rover-havoc', label: "Rover (Havoc)" },
            { value: 'rover-electro', label: "Rover (Electro)" },
            { value: 'yangyang-xuanling', label: "Yangyang: Xuanling" },
        ],
        setNames: [
            'Freezing Frost',
            'Molten Rift',
            'Void Thunder',
            'Sierra Gale',
            'Celestial Light',
            'Havoc Eclipse',
            'Moonlit Clouds',
            'Rejuvenating Glow',
            'Lingering Tunes',
            'Frosty Resolve',
            'Empyrean Anthem',
            'Midnight Veil',
            'Eternal Radiance',
            'Tidebreaking Courage',
            'Gusts of Welkin',
            'Windward Pilgrimage',
            'Chromatic Foam',
            'Crown of Valor',
            'Dream of the Lost',
            "Flamewing's Shadow",
            'Flaming Clawprint',
            'Halo of Starry Radiance',
            "Heart of Evil's Purge",
            'Lamp of Nether Road',
            'Law of Harmony',
            'Pact of Neonlight Leap',
            'Reel of Spliced Memories',
            'Rite of Gilded Revelation',
            'Shadow of Shattered Dreams',
            'Song of Feathered Trace',
            'Sound of True Name',
            'Thread of Severed Fate',
            'Trailblazing Star',
            'Wishes of Quiet Snowfall',
        ],
        weaponTypes: ['Sword', 'Broadblade', 'Pistols', 'Gauntlets', 'Rectifier'],
        elements: ['Glacio', 'Fusion', 'Electro', 'Aero', 'Spectro', 'Havoc', 'Physical'],
        inventoryTabs: [
            { id: 'characters', label: 'Characters', slot: 'characters' },
            { id: 'weapons', label: 'Weapons', slot: 'weapons' },
            { id: 'echoes', label: 'Echoes', slot: 'echoes' },
        ],
    },
};

/**
 * Wuthering Waves stat validation rules.
 * These define the legal ranges for all stats. The kernel enforces these
 * on writes; the renderer validates eagerly for instant feedback.
 */
export const wutheringWavesStatRules: StatRules = {
    character: {
        baseStats: {
            'rover-spectro': { atk: 800, hp: 12000, def: 600, critRate: 5, critDmg: 50, energyRegen: 100 },
            'jinhsi': { atk: 850, hp: 11500, def: 580, critRate: 5, critDmg: 50, energyRegen: 100 },
            'yinlin': { atk: 780, hp: 11000, def: 550, critRate: 5, critDmg: 50, energyRegen: 100 },
        },
        maxStats: {
            atk: 9999,
            hp: 99999,
            def: 9999,
            critRate: 100,
            critDmg: 800,
            energyRegen: 500,
            elementalMastery: 2000,
            healingBonus: 200,
            effectHitRate: 200,
            effectRes: 200,
        },
    },
    echoes: {
        mainStatCaps: {
            'ATK': { 1: 180, 3: 330, 4: 420 },
            'HP': { 1: 2700, 3: 4950, 4: 6300 },
            'DEF': { 1: 180, 3: 330, 4: 420 },
            'ATK%': { 1: 18, 3: 33, 4: 42 },
            'HP%': { 1: 18, 3: 33, 4: 42 },
            'DEF%': { 1: 18, 3: 33, 4: 42 },
            'CRIT Rate': { 1: 9, 3: 17, 4: 22 },
            'CRIT DMG': { 1: 18.4, 3: 33.6, 4: 43.2 },
            'Energy Regen': { 1: 18, 3: 33, 4: 42 },
            'Healing Bonus': { 1: 18, 3: 33, 4: 42 },
            'Effect Hit Rate': { 1: 18, 3: 33, 4: 42 },
            'Effect RES': { 1: 18, 3: 33, 4: 42 },
            'Elemental Mastery': { 1: 0, 3: 0, 4: 0 },
        } as Partial<Record<StatType, Record<number, number>>>,
        subStatCaps: {
            'ATK': { maxPerRoll: 58, maxTotal: 580 },
            'HP': { maxPerRoll: 870, maxTotal: 8700 },
            'DEF': { maxPerRoll: 58, maxTotal: 580 },
            'ATK%': { maxPerRoll: 5.8, maxTotal: 58 },
            'HP%': { maxPerRoll: 5.8, maxTotal: 58 },
            'DEF%': { maxPerRoll: 5.8, maxTotal: 58 },
            'CRIT Rate': { maxPerRoll: 3.9, maxTotal: 39 },
            'CRIT DMG': { maxPerRoll: 7.8, maxTotal: 78 },
            'Energy Regen': { maxPerRoll: 5.8, maxTotal: 58 },
            'Healing Bonus': { maxPerRoll: 5.8, maxTotal: 58 },
            'Effect Hit Rate': { maxPerRoll: 5.8, maxTotal: 58 },
            'Effect RES': { maxPerRoll: 5.8, maxTotal: 58 },
            'Elemental Mastery': { maxPerRoll: 0, maxTotal: 0 },
        } as Partial<Record<StatType, { maxPerRoll: number; maxTotal: number }>>,
    },
};

export default wutheringWaves;
