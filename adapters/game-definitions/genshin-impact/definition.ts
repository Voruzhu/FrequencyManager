/**
 * @fileoverview Genshin Impact GameDefinition package
 * @module adapters/game-definitions/genshin-impact
 *
 * Exports a `GameDefinition` for Genshin Impact. The OCR scanner and damage
 * calculator modules read this package to know the GI-specific vocabulary,
 * OCR patterns, artifact set bonuses, and combat action multipliers.
 *
 * WHY: Extracting this into its own package keeps every game-specific
 * constant in one place. Swapping from Wuthering Waves is as simple as
 * setting `activeGame: 'genshin-impact'` in config/default.json — no
 * code changes anywhere else.
 */

import type { GameDefinition } from '@shared/types/game-definition';

// ─────────────────────────────────────────────────────────────────────────────
// OCR patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genshin Impact artifact screenshot OCR patterns. Genshin does not have a
 * "Cost" concept for artifacts, so costPattern is empty. Elemental Mastery
 * is a GI-specific stat that doesn't exist in WU.
 */
// Same rationale as WuWa's STAT_VALUE_GAP (unverified against a real GI
// screenshot yet, but applying the same robustness fix preemptively rather
// than waiting to rediscover the identical bug). Bound kept in sync with
// WW's (12 -> 20, see that file's comment).
const STAT_VALUE_GAP = '[^\\d\\n]{1,20}';

const OCR_PATTERNS = {
    namePattern: '^([A-Z][a-zA-Z\\s\'-]+)',
    costPattern: '',
    // Every literal space between words below is `\s*` (zero-or-more) —
    // same fix as WW's, in case OCR merges/drops a space in a multi-word
    // label (e.g. "Energy Recharge" -> "EnergyRecharge").
    mainStatPattern:
        `(ATK|DEF|HP|CRIT\\s*Rate|CRIT\\s*DMG|Energy\\s*Recharge|Elemental\\s*Mastery|Healing\\s*Bonus|Physical\\s*DMG\\s*Bonus|Anemo\\s*DMG\\s*Bonus|Cryo\\s*DMG\\s*Bonus|Electro\\s*DMG\\s*Bonus|Geo\\s*DMG\\s*Bonus|Pyro\\s*DMG\\s*Bonus|Hydro\\s*DMG\\s*Bonus|Dendro\\s*DMG\\s*Bonus)${STAT_VALUE_GAP}([\\d.,]+)%?`,
    subStatPattern:
        `(ATK|DEF|HP|CRIT\\s*Rate|CRIT\\s*DMG|Elemental\\s*Mastery|Energy\\s*Recharge|Healing\\s*Bonus|Physical\\s*DMG\\s*Bonus)${STAT_VALUE_GAP}([\\d.,]+)%?`,
    setNames: [
        'Gladiators Finale',
        'Wanderers Troupe',
        'Noblesse Oblige',
        'Bloodstained Chivalry',
        'Maiden Beloved',
        'Viridescent Venerer',
        'Archaic Petra',
        'Retracing Bolide',
        'Thundersoother',
        'Thundering Fury',
        'Lavawalker',
        'Crimson Witch of Flames',
        'Blizzard Strayer',
        'Heart of Depth',
        'Tenacity of the Millelith',
        'Pale Flame',
        'Shimenawas Reminiscence',
        'Emblem of Severed Fate',
        'Husk of Opulent Dreams',
        'Ocean Hued Clam',
        'Vermillion Hereafter',
        'Echoes of an Offering',
        'Deepwood Memories',
        'Gilded Dreams',
        'Desert Pavilion Chronicle',
        'Flower of Paradise Lost',
        'Nymphs Dream',
        'Vourukashas Glow',
        'Marechaussee Hunter',
        'Unfinished Reverie',
        'Song of Days Past',
        'Nighttime Whispers in the Echoing Woods',
        'Golden Troupe',
        'Fragment of Harmonic Whimsy',
        'Scroll of the Hero of Cinder City',
        'Obsidian Codex',
    ],
    // NOT verified against a real GI artifact-inspection screenshot (only a WW
    // Echo Management screenshot was available this session — see
    // wuthering-waves/definition.ts's OCR_PATTERNS, which IS verified).
    // levelPattern mirrors GI's well-established "+N" artifact-level display
    // convention (high confidence). equippedByPattern is a best-effort guess
    // at the "Equipped by X" phrasing GI's artifact bag view is believed to
    // use — verify against a real screenshot before trusting this in production.
    levelPattern: '\\+(\\d+)',
    equippedByPattern: 'Equipped by ([A-Za-z][A-Za-z\\s]*)',
    // The official client's window title, regardless of game language/region.
    windowTitleHint: 'Genshin Impact',
};

// ─────────────────────────────────────────────────────────────────────────────
// Combat actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genshin Impact combat action vocabulary. Multipliers are coarse defaults
 * pulled from average character skill scaling; per-character fine-tuning lives
 * in the character database (not part of the GameDefinition).
 */
const COMBAT_ACTIONS = [
    { id: 'normalAttack', label: 'Normal Attack', multiplier: 1.0, energy: 0, duration: 1.0 },
    { id: 'chargedAttack', label: 'Charged Attack', multiplier: 1.8, energy: 0, duration: 1.2 },
    { id: 'plungingAttack', label: 'Plunging Attack', multiplier: 2.2, energy: 0, duration: 1.5 },
    { id: 'elementalSkill', label: 'Elemental Skill', multiplier: 3.2, energy: 0, duration: 1.5 },
    { id: 'elementalBurst', label: 'Elemental Burst', multiplier: 5.5, energy: 0, duration: 2.5 },
    // Aimed Shot (fully-drawn bow shot) only applies to Bow-wielding characters.
    { id: 'aimedShot', label: 'Aimed Shot', multiplier: 1.5, energy: 0, duration: 1.0, weaponTypes: ['Bow'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Set bonuses (4-piece only; 2-piece is listed separately in-game but both
// can be captured via the same bonuses object — the calculator applies the
// full bonus only when the count threshold is met, see damage-calculator)
// ─────────────────────────────────────────────────────────────────────────────

// `bonuses` = 2-piece bonus; `setBonus` = the 4-piece set effect. Both deploy
// together when a member runs the full 4pc set. 4pc values are best-effort at
// typical investment; CONDITIONAL effects (after burst / while shielded / vs
// affected enemies / stacking) are modeled as if active — verify against the game.
// Per-attack-type 4pc amps use scoped keys (normalAttackDmg / naCaPlDmg / etc.).
const SET_BONUSES = [
    { name: 'Gladiators Finale', bonuses: { atkPercent: 18 }, setBonus: { normalAttackDmg: 35 } },
    { name: 'Wanderers Troupe', bonuses: { atkPercent: 35, elementalMastery: 80 }, setBonus: { chargedAttackDmg: 35 } },
    { name: 'Noblesse Oblige', bonuses: { burstDmg: 20 }, setBonus: { atkPercent: 20 } },
    { name: 'Bloodstained Chivalry', bonuses: { elementalDmgBonus: { Physical: 25 } }, setBonus: { chargedAttackDmg: 50 } },
    { name: 'Maiden Beloved', bonuses: { healingBonus: 15 }, setBonus: { healingBonus: 20 } },
    { name: 'Viridescent Venerer', bonuses: { elementalDmgBonus: { Anemo: 15 } }, setBonus: { elemDmg: 40 } },
    { name: 'Archaic Petra', bonuses: { elementalDmgBonus: { Geo: 15 } }, setBonus: { elemDmg: 35 } },
    { name: 'Retracing Bolide', bonuses: { }, setBonus: { naCaDmg: 40 } },
    { name: 'Thundersoother', bonuses: { }, setBonus: { elemDmg: 35 } },
    { name: 'Thundering Fury', bonuses: { elementalDmgBonus: { Electro: 15 } }, setBonus: { } },
    { name: 'Lavawalker', bonuses: { }, setBonus: { elemDmg: 35 } },
    { name: 'Crimson Witch of Flames', bonuses: { elementalDmgBonus: { Pyro: 15 } }, setBonus: { elementalDmgBonus: { Pyro: 22 } } },
    { name: 'Blizzard Strayer', bonuses: { elementalDmgBonus: { Cryo: 15 } }, setBonus: { critRate: 40 } },
    { name: 'Heart of Depth', bonuses: { elementalDmgBonus: { Hydro: 15 } }, setBonus: { naCaDmg: 30 } },
    { name: 'Tenacity of the Millelith', bonuses: { hpPercent: 20 }, setBonus: { atkPercent: 20 } },
    { name: 'Pale Flame', bonuses: { elementalDmgBonus: { Physical: 25 } }, setBonus: { atkPercent: 18 } },
    { name: 'Shimenawas Reminiscence', bonuses: { atkPercent: 18 }, setBonus: { naCaPlDmg: 50 } },
    { name: 'Emblem of Severed Fate', bonuses: { energyRegen: 20 }, setBonus: { burstDmg: 40 } },
    { name: 'Husk of Opulent Dreams', bonuses: { defPercent: 30 }, setBonus: { defPercent: 24, geoDmgBonus: 24 } },
    { name: 'Ocean Hued Clam', bonuses: { healingBonus: 15 }, setBonus: { } },
    { name: 'Vermillion Hereafter', bonuses: { atkPercent: 18 }, setBonus: { atkPercent: 24 } },
    { name: 'Echoes of an Offering', bonuses: { atkPercent: 18 }, setBonus: { normalAttackDmg: 30 } },
    { name: 'Deepwood Memories', bonuses: { elementalDmgBonus: { Dendro: 15 } }, setBonus: { elemDmg: 30 } },
    { name: 'Gilded Dreams', bonuses: { elementalMastery: 80 }, setBonus: { atkPercent: 14, elementalMastery: 50 } },
    { name: 'Desert Pavilion Chronicle', bonuses: { anemoDmgBonus: 15 }, setBonus: { naCaPlDmg: 40 } },
    { name: 'Flower of Paradise Lost', bonuses: { elementalMastery: 80 }, setBonus: { elemDmg: 40 } },
    { name: 'Nymphs Dream', bonuses: { hydroDmgBonus: 15 }, setBonus: { atkPercent: 18, hydroDmgBonus: 15 } },
    { name: 'Vourukashas Glow', bonuses: { hpPercent: 20 }, setBonus: { skillDmg: 10, burstDmg: 10 } },
    { name: 'Marechaussee Hunter', bonuses: { naCaDmg: 15 }, setBonus: { critRate: 36 } },
    { name: 'Unfinished Reverie', bonuses: { atkPercent: 18 }, setBonus: { elemDmg: 50 } },
    { name: 'Song of Days Past', bonuses: { healingBonus: 15 }, setBonus: { } },
    { name: 'Nighttime Whispers in the Echoing Woods', bonuses: { geoDmgBonus: 20 }, setBonus: { atkPercent: 20 } },
    { name: 'Golden Troupe', bonuses: { skillDmg: 20 }, setBonus: { skillDmg: 25 } },
    { name: 'Fragment of Harmonic Whimsy', bonuses: { atkPercent: 18 }, setBonus: { atkPercent: 18 } },
    { name: 'Scroll of the Hero of Cinder City', bonuses: { elementalMastery: 80 }, setBonus: { elemDmg: 12 } },
    { name: 'Obsidian Codex', bonuses: { elementalDmgBonus: { Geo: 20 } }, setBonus: { critRate: 40 } },
];

// ─────────────────────────────────────────────────────────────────────────────
// GameDefinition
// ─────────────────────────────────────────────────────────────────────────────

export const genshinImpact: GameDefinition = {
    id: 'genshin-impact',
    displayName: 'Genshin Impact',
    description: 'Open-world action-RPG with artifacts as equipment.',
    version: '1.0.0',

    equipment: {
        slotLabel: 'Artifact',
        slotLabelPlural: 'Artifacts',
        maxSubStats: 4,
        maxLevel: 20,
        allowedMainStatTypes: [
            'ATK', 'HP', 'DEF',
            'ATK%', 'HP%', 'DEF%',
            'CRIT Rate', 'CRIT DMG',
            'Energy Regen', 'Healing Bonus',
            'Elemental Mastery',
        ],
        // GI has no "cost" concept; artifacts are equipped in 5 slots instead.
        allowedCosts: [],
    },

    character: {
        elements: ['Anemo', 'Cryo', 'Electro', 'Geo', 'Dendro', 'Hydro', 'Pyro', 'Physical'],
        weapons: ['Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst'],
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
        'Crit Rate': 'CRIT Rate',
        'Crit DMG': 'CRIT DMG',
        'Crit RATE': 'CRIT Rate',
        'Energy Recharge': 'Energy Regen',
        'ElementalMastery': 'Elemental Mastery',
        'EM': 'Elemental Mastery',
    },

    uiOptions: {
        characters: [
            { value: 'traveler-anemo', label: 'Traveler (Anemo)' },
            { value: 'traveler-geo', label: 'Traveler (Geo)' },
            { value: 'traveler-electro', label: 'Traveler (Electro)' },
            { value: 'traveler-dendro', label: 'Traveler (Dendro)' },
            { value: 'traveler-hydro', label: 'Traveler (Hydro)' },
            { value: 'amber', label: 'Amber' },
            { value: 'kaeya', label: 'Kaeya' },
            { value: 'lisa', label: 'Lisa' },
            { value: 'barbara', label: 'Barbara' },
            { value: 'razor', label: 'Razor' },
            { value: 'bennett', label: 'Bennett' },
            { value: 'noelle', label: 'Noelle' },
            { value: 'fischl', label: 'Fischl' },
            { value: 'sucrose', label: 'Sucrose' },
            { value: 'beidou', label: 'Beidou' },
            { value: 'ningguang', label: 'Ningguang' },
            { value: 'xiangling', label: 'Xiangling' },
            { value: 'xingqiu', label: 'Xingqiu' },
            { value: 'chongyun', label: 'Chongyun' },
            { value: 'jean', label: 'Jean' },
            { value: 'diluc', label: 'Diluc' },
            { value: 'qiqi', label: 'Qiqi' },
            { value: 'mona', label: 'Mona' },
            { value: 'keqing', label: 'Keqing' },
            { value: 'venti', label: 'Venti' },
            { value: 'klee', label: 'Klee' },
            { value: 'zhongli', label: 'Zhongli' },
            { value: 'childe', label: 'Childe (Tartaglia)' },
            { value: 'albedo', label: 'Albedo' },
            { value: 'ganyu', label: 'Ganyu' },
            { value: 'xiao', label: 'Xiao' },
            { value: 'hu_tao', label: 'Hu Tao' },
            { value: 'rosaria', label: 'Rosaria' },
            { value: 'eula', label: 'Eula' },
            { value: 'yoimiya', label: 'Yoimiya' },
            { value: 'sayu', label: 'Sayu' },
            { value: 'kazuha', label: 'Kaedehara Kazuha' },
            { value: 'ayaka', label: 'Kamisato Ayaka' },
            { value: 'raiden', label: 'Raiden Shogun' },
            { value: 'sara', label: 'Kujou Sara' },
            { value: 'kokomi', label: 'Sangonomiya Kokomi' },
            { value: 'thoma', label: 'Thoma' },
            { value: 'gorou', label: 'Gorou' },
            { value: 'itto', label: 'Arataki Itto' },
            { value: 'shenhe', label: 'Shenhe' },
            { value: 'yunjin', label: 'Yunjin' },
            { value: 'yae_miko', label: 'Yae Miko' },
            { value: 'ayato', label: 'Kamisato Ayato' },
            { value: 'nahida', label: 'Nahida' },
            { value: 'nilou', label: 'Nilou' },
            { value: 'cyno', label: 'Cyno' },
            { value: 'candace', label: 'Candace' },
            { value: 'layla', label: 'Layla' },
            { value: 'faruzan', label: 'Faruzan' },
            { value: 'wanderer', label: 'Wanderer (Scaramouche)' },
            { value: 'yaoyao', label: 'Yaoyao' },
            { value: 'alhaitham', label: 'Alhaitham' },
            { value: 'dehya', label: 'Dehya' },
            { value: 'mika', label: 'Mika' },
            { value: 'baizhu', label: 'Baizhu' },
            { value: 'kaveh', label: 'Kaveh' },
            { value: 'kirara', label: 'Kirara' },
            { value: 'lyney', label: 'Lyney' },
            { value: 'lynette', label: 'Lynette' },
            { value: 'freminet', label: 'Freminet' },
            { value: 'neuvillette', label: 'Neuvillette' },
            { value: 'wriothesley', label: 'Wriothesley' },
            { value: 'furina', label: 'Furina' },
            { value: 'charlotte', label: 'Charlotte' },
            { value: 'navia', label: 'Navia' },
            { value: 'chevreuse', label: 'Chevreuse' },
            { value: 'gaming', label: 'Gaming' },
            { value: 'xianyun', label: 'Xianyun' },
            { value: 'chiori', label: 'Chiori' },
            { value: 'arliecino', label: 'Arlecchino' },
            { value: 'sethos', label: 'Sethos' },
            { value: 'clorinde', label: 'Clorinde' },
            { value: 'sigewinne', label: 'Sigewinne' },
            { value: 'emilie', label: 'Emilie' },
            { value: 'kinich', label: 'Kinich' },
            { value: 'mualani', label: 'Mualani' },
            { value: 'kachina', label: 'Kachina' },
            { value: 'ororon', label: 'Ororon' },
            { value: 'chaska', label: 'Chasca' },
            { value: 'citlali', label: 'Citlali' },
            { value: 'mavuika', label: 'Mavuika' },
            { value: 'lan_yan', label: 'Lan Yan' },
            { value: 'yelan', label: 'Yelan' },
            { value: 'aino', label: "Aino" },
            { value: 'aloy', label: "Aloy" },
            { value: 'collei', label: "Collei" },
            { value: 'columbina', label: "Columbina" },
            { value: 'dahlia', label: "Dahlia" },
            { value: 'diona', label: "Diona" },
            { value: 'dori', label: "Dori" },
            { value: 'durin', label: "Durin" },
            { value: 'escoffier', label: "Escoffier" },
            { value: 'flins', label: "Flins" },
            { value: 'iansan', label: "Iansan" },
            { value: 'ifa', label: "Ifa" },
            { value: 'illuga', label: "Illuga" },
            { value: 'ineffa', label: "Ineffa" },
            { value: 'jahoda', label: "Jahoda" },
            { value: 'kuki_shinobu', label: "Kuki Shinobu" },
            { value: 'lauma', label: "Lauma" },
            { value: 'linnea', label: "Linnea" },
            { value: 'lohen', label: "Lohen" },
            { value: 'nefer', label: "Nefer" },
            { value: 'nicole', label: "Nicole" },
            { value: 'prune', label: "Prune" },
            { value: 'sandrone', label: "Sandrone" },
            { value: 'shikanoin_heizou', label: "Shikanoin Heizou" },
            { value: 'skirk', label: "Skirk" },
            { value: 'tighnari', label: "Tighnari" },
            { value: 'varesa', label: "Varesa" },
            { value: 'varka', label: "Varka" },
            { value: 'xilonen', label: "Xilonen" },
            { value: 'xinyan', label: "Xinyan" },
            { value: 'yanfei', label: "Yanfei" },
            { value: 'yumemizuki_mizuki', label: "Yumemizuki Mizuki" },
            { value: 'zibai', label: "Zibai" },
        ],
        setNames: [
            'Gladiators Finale',
            'Wanderers Troupe',
            'Noblesse Oblige',
            'Bloodstained Chivalry',
            'Maiden Beloved',
            'Viridescent Venerer',
            'Archaic Petra',
            'Retracing Bolide',
            'Thundersoother',
            'Thundering Fury',
            'Lavawalker',
            'Crimson Witch of Flames',
            'Blizzard Strayer',
            'Heart of Depth',
            'Tenacity of the Millelith',
            'Pale Flame',
            'Shimenawas Reminiscence',
            'Emblem of Severed Fate',
            'Husk of Opulent Dreams',
            'Ocean Hued Clam',
            'Vermillion Hereafter',
            'Echoes of an Offering',
            'Deepwood Memories',
            'Gilded Dreams',
            'Desert Pavilion Chronicle',
            'Flower of Paradise Lost',
            'Nymphs Dream',
            'Vourukashas Glow',
            'Marechaussee Hunter',
            'Unfinished Reverie',
            'Song of Days Past',
            'Nighttime Whispers in the Echoing Woods',
            'Golden Troupe',
            'Fragment of Harmonic Whimsy',
            'Scroll of the Hero of Cinder City',
            'Obsidian Codex',
        ],
        weaponTypes: ['Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst'],
        elements: ['Anemo', 'Cryo', 'Electro', 'Geo', 'Dendro', 'Hydro', 'Pyro', 'Physical'],
        inventoryTabs: [
            { id: 'characters', label: 'Characters', slot: 'characters' },
            { id: 'weapons', label: 'Weapons', slot: 'weapons' },
            { id: 'artifacts', label: 'Artifacts', slot: 'artifacts' },
        ],
    },
};

export default genshinImpact;