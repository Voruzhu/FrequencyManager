/**
 * Game data access for the renderer.
 *
 * The BACKEND (game-loader module) is the source of truth: it serves a full
 * {@link GameBundle} per game over IPC, cached in `gameDataStore`. `getGameData`
 * reads that cache and falls back to the EMBEDDED bundles below when the bridge
 * is unavailable (dev-in-browser / offline / pre-fetch). The embedded copy
 * mirrors the backend data (adapters/game-definitions/<game>/bundle.ts), so the
 * UI renders identically whether or not the fetch has landed.
 *
 * All data shapes come from the shared contract (`@shared/types/game-bundle`),
 * so the renderer and backend can never drift on structure.
 */

import type {
    GameBundle,
    StatDef,
    SkillDef,
    CharacterEntry,
    WeaponEntry,
    GearEntry,
    PassiveEntry,
} from '@shared/types/game-bundle';
import { WW_GEAR_CATALOG, GI_GEAR_CATALOG, STARTER_CHARACTER } from '@shared/game-data/gear-catalogs';
import { WW_ECHO_SELF_BUFFS, WW_ECHO_ITEM_ICONS } from '@shared/game-data/echo-set-names';
import { useGameDataStore } from '../stores/gameDataStore';

// Renderer-facing type aliases (kept for call-site compatibility).
export type ItemKind = 'character' | 'weapon' | 'echo' | 'artifact';
export type { StatDef };
export type Skill = SkillDef;
export type CharacterData = CharacterEntry;
export type WeaponData = WeaponEntry;
export type GearData = GearEntry;
export type GameData = GameBundle;
export type Passive = PassiveEntry;

/** Fallback slot count when a game module doesn't specify one. */
export const DEFAULT_MAX_GEAR = 5;

// ── Embedded fallback bundles (mirror the backend bundle.ts files) ───────────

const WUTHERING_WAVES: GameBundle = {
    id: 'wuthering-waves',
    gearKind: 'echo', gearLabel: 'Echo', gearLabelPlural: 'Echoes', maxGear: 5,
    sequenceLabel: 'Sequence', sequenceMax: 6,
    partyTeammates: 2,
    starterCharacterId: STARTER_CHARACTER['wuthering-waves'],
    gearCatalog: WW_GEAR_CATALOG,
    supportsReactions: false,
    statCatalog: [
        { key: 'atk', label: 'ATK' },
        { key: 'hp', label: 'HP' },
        { key: 'def', label: 'DEF' },
        { key: 'critRate', label: 'Crit Rate', percent: true },
        { key: 'critDmg', label: 'Crit DMG', percent: true },
        { key: 'energyRegen', label: 'Energy Regen', percent: true },
        { key: 'elemDmg', label: 'Elemental DMG', percent: true },
    ],
    characters: [
        {
            kind: 'character', id: 'rover-spectro', name: 'Rover (Spectro)', element: 'Spectro', weaponType: 'Sword', rarity: 5,
            stats: { atk: 1250, hp: 12800, def: 980, critRate: 32, critDmg: 210, energyRegen: 120, spectroDmg: 30 },
            skills: [
                { id: 'basic', name: 'Basic Attack', type: 'Basic', description: 'Rapid sword strikes dealing Spectro DMG.', multiplier: 1.0 },
                { id: 'skill', name: 'Resonance Skill', type: 'Skill', description: 'Unleash a Spectro burst forward.', multiplier: 3.2 },
                { id: 'ult', name: 'Resonance Liberation', type: 'Ultimate', description: 'Channel Spectro energy for massive AoE.', multiplier: 5.6 },
                { id: 'forte', name: 'Forte Circuit', type: 'Forte', description: 'Empowered stance follow-up.', multiplier: 2.8 },
            ],
            equipped: { weaponId: 'ww-sword-1', gearIds: ['ww-echo-1', 'ww-echo-3', 'ww-echo-6'] },
        },
        {
            kind: 'character', id: 'jinhsi', name: 'Jinhsi', element: 'Spectro', weaponType: 'Broadblade', rarity: 5,
            stats: { atk: 1360, hp: 12100, def: 940, critRate: 28, critDmg: 224, energyRegen: 110, spectroDmg: 42 },
            skills: [
                { id: 'basic', name: 'Basic Attack', type: 'Basic', description: 'Broadblade sweeps dealing Spectro DMG.', multiplier: 1.1 },
                { id: 'skill', name: 'Resonance Skill', type: 'Skill', description: 'Incandescent slash.', multiplier: 3.6 },
                { id: 'ult', name: 'Resonance Liberation', type: 'Ultimate', description: 'Unleash Illuminous Epiphany.', multiplier: 6.4 },
                { id: 'forte', name: 'Forte Circuit', type: 'Forte', description: 'Absorb Incandescence for a burst.', multiplier: 3.1 },
            ],
            equipped: { weaponId: 'ww-broad-1', gearIds: ['ww-echo-2', 'ww-echo-4'] },
        },
        {
            kind: 'character', id: 'yinlin', name: 'Yinlin', element: 'Electro', weaponType: 'Rectifier', rarity: 5,
            stats: { atk: 1180, hp: 11200, def: 880, critRate: 30, critDmg: 200, energyRegen: 130, electroDmg: 38 },
            skills: [
                { id: 'basic', name: 'Basic Attack', type: 'Basic', description: 'Electro puppet strikes.', multiplier: 0.9 },
                { id: 'skill', name: 'Resonance Skill', type: 'Skill', description: "Command Zapstring's Dance.", multiplier: 3.0 },
                { id: 'ult', name: 'Resonance Liberation', type: 'Ultimate', description: 'Chasm Wolves converge.', multiplier: 5.2 },
                { id: 'forte', name: 'Forte Circuit', type: 'Forte', description: 'Judgment Strike.', multiplier: 2.6 },
            ],
            equipped: { weaponId: 'ww-rect-1', gearIds: ['ww-echo-5'] },
        },
    ],
    weapons: [
        { kind: 'weapon', id: 'ww-sword-1', name: 'Emerald of Genesis', weaponType: 'Sword', rarity: 5, baseAtk: 500, secondaryStat: 'Crit Rate', secondaryValue: 36 },
        { kind: 'weapon', id: 'ww-broad-1', name: 'Ages of Harvest', weaponType: 'Broadblade', rarity: 5, baseAtk: 500, secondaryStat: 'Crit DMG', secondaryValue: 72 },
        { kind: 'weapon', id: 'ww-rect-1', name: 'Stringmaster', weaponType: 'Rectifier', rarity: 5, baseAtk: 500, secondaryStat: 'Crit Rate', secondaryValue: 36 },
    ],
    gear: [
        { kind: 'echo', id: 'ww-echo-1', name: 'Molten Rift', setName: 'Molten Rift', rarity: 5, cost: 4, mainStat: { key: 'atkPct', label: 'ATK%', value: 43.2 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 7.8 }, { key: 'critDmg', label: 'Crit DMG', value: 15.6 }, { key: 'atkPct', label: 'ATK%', value: 8.6 }] },
        { kind: 'echo', id: 'ww-echo-2', name: 'Impermanence Heron', setName: 'Impermanence Heron', rarity: 5, cost: 4, mainStat: { key: 'critDmg', label: 'Crit DMG', value: 38.4 }, subStats: [{ key: 'atkPct', label: 'ATK%', value: 9.4 }, { key: 'critRate', label: 'Crit Rate', value: 6.3 }, { key: 'energyRegen', label: 'Energy Regen', value: 8.4 }] },
        { kind: 'echo', id: 'ww-echo-3', name: 'Void Thunder', setName: 'Void Thunder', rarity: 4, cost: 3, mainStat: { key: 'critRate', label: 'Crit Rate', value: 22 }, subStats: [{ key: 'critDmg', label: 'Crit DMG', value: 12.6 }, { key: 'atkPct', label: 'ATK%', value: 7.9 }] },
        { kind: 'echo', id: 'ww-echo-4', name: 'Celestial Light', setName: 'Celestial Light', rarity: 4, cost: 3, mainStat: { key: 'spectroDmg', label: 'Spectro DMG', value: 30 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 6.9 }, { key: 'atkPct', label: 'ATK%', value: 8.6 }] },
        { kind: 'echo', id: 'ww-echo-5', name: 'Thundering Mephis', setName: 'Thundering Mephis', rarity: 4, cost: 3, mainStat: { key: 'electroDmg', label: 'Electro DMG', value: 30 }, subStats: [{ key: 'critDmg', label: 'Crit DMG', value: 14.2 }, { key: 'energyRegen', label: 'Energy Regen', value: 6.8 }] },
        { kind: 'echo', id: 'ww-echo-6', name: 'Crownless', setName: 'Crownless', rarity: 3, cost: 1, mainStat: { key: 'critRate', label: 'Crit Rate', value: 9 }, subStats: [{ key: 'critDmg', label: 'Crit DMG', value: 7.8 }, { key: 'atkPct', label: 'ATK%', value: 5.2 }] },
        { kind: 'echo', id: 'ww-echo-7', name: 'Sierra Gale', setName: 'Sierra Gale', rarity: 3, cost: 1, mainStat: { key: 'atkPct', label: 'ATK%', value: 18 }, subStats: [{ key: 'energyRegen', label: 'Energy Regen', value: 7.6 }] },
        { kind: 'echo', id: 'ww-echo-8', name: 'Lampylumen Myriad', setName: 'Lampylumen Myriad', rarity: 3, cost: 1, mainStat: { key: 'energyRegen', label: 'Energy Regen', value: 32 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 6.3 }] },
    ],
    enemies: [
        { id: 'ww-crownless', name: 'Crownless', level: 90, def: 900, res: 10 },
        { id: 'ww-aix', name: 'Mourning Aix', level: 90, def: 950, res: 10 },
        { id: 'ww-beringal', name: 'Feilian Beringal', level: 90, def: 920, res: 20 },
        { id: 'ww-mephis', name: 'Tempest Mephis', level: 90, def: 1000, res: 20 },
        { id: 'ww-inferno', name: 'Inferno Rider', level: 90, def: 880, res: 20 },
        { id: 'ww-lampylumen', name: 'Lampylumen Myriad', level: 90, def: 860, res: 20 },
        { id: 'ww-dreamless', name: 'Dreamless', level: 90, def: 1050, res: 15 },
        { id: 'ww-hecate', name: 'Hecate', level: 90, def: 1150, res: 20 },
    ],
    buffs: {
        basic: [
            { id: 'b-atkp', name: 'ATK% Buff', source: 'Basic', stat: 'atkPct', value: 20 },
            { id: 'b-atk', name: 'Flat ATK', source: 'Basic', stat: 'atk', value: 120 },
            { id: 'b-defp', name: 'DEF% Buff', source: 'Basic', stat: 'defPct', value: 20 },
            { id: 'b-def', name: 'Flat DEF', source: 'Basic', stat: 'def', value: 60 },
            { id: 'b-cr', name: 'Crit Rate', source: 'Basic', stat: 'critRate', value: 12 },
            { id: 'b-cd', name: 'Crit DMG', source: 'Basic', stat: 'critDmg', value: 24 },
            { id: 'b-er', name: 'Energy Regen', source: 'Basic', stat: 'energyRegen', value: 20 },
            { id: 'b-elem', name: 'Elemental DMG', source: 'Basic', stat: 'elemDmg', value: 18 },
        ],
        character: [
            { id: 'cb-ww-1', name: 'Concerto ATK Surge', source: 'Rover (Spectro)', stat: 'atkPct', value: 24 },
            { id: 'cb-ww-2', name: 'Zapstring Amplify', source: 'Yinlin', stat: 'elemDmg', value: 20 },
            { id: 'cb-ww-3', name: 'Incandescence', source: 'Jinhsi', stat: 'critDmg', value: 30 },
            { id: 'cb-ww-4', name: 'Verdant Coordination', source: 'Verina', stat: 'atkPct', value: 15 },
        ],
    },
    passives: [
        { id: 'ww-p1', name: 'Inherent Skill I', description: 'Unlocks a permanent stat or effect at Ascension.' },
        { id: 'ww-p2', name: 'Inherent Skill II', description: 'A second inherent effect for the kit.' },
    ],
    setBonuses: [
        { name: 'Molten Rift', pieces: 5, buffs: [{ stat: 'elemDmg', label: 'Elemental DMG', value: 30 }], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
        { name: 'Moonlit Clouds', pieces: 5, buffs: [{ stat: 'atkPct', label: 'ATK%', value: 22.5 }], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
    ],
};

const GENSHIN_IMPACT: GameBundle = {
    id: 'genshin-impact',
    gearKind: 'artifact', gearLabel: 'Artifact', gearLabelPlural: 'Artifacts', maxGear: 5,
    sequenceLabel: 'Constellation', sequenceMax: 6,
    partyTeammates: 3,
    starterCharacterId: STARTER_CHARACTER['genshin-impact'],
    gearCatalog: GI_GEAR_CATALOG,
    supportsReactions: true,
    statCatalog: [
        { key: 'atk', label: 'ATK' },
        { key: 'hp', label: 'HP' },
        { key: 'def', label: 'DEF' },
        { key: 'elementalMastery', label: 'Elemental Mastery' },
        { key: 'critRate', label: 'Crit Rate', percent: true },
        { key: 'critDmg', label: 'Crit DMG', percent: true },
        { key: 'energyRegen', label: 'Energy Recharge', percent: true },
        { key: 'elemDmg', label: 'Elemental DMG', percent: true },
    ],
    characters: [
        {
            kind: 'character', id: 'traveler-anemo', name: 'Traveler (Anemo)', element: 'Anemo', weaponType: 'Sword', rarity: 5,
            stats: { atk: 830, hp: 10875, def: 685, critRate: 24, critDmg: 150, energyRegen: 100, elementalMastery: 0, anemoDmg: 0 },
            skills: [
                { id: 'na', name: 'Normal Attack', type: 'Normal', description: 'Sword strikes dealing Physical DMG.', multiplier: 0.8 },
                { id: 'skill', name: 'Palm Vortex', type: 'Skill', description: 'Anemo palm blast.', multiplier: 2.0 },
                { id: 'burst', name: 'Gust Surge', type: 'Burst', description: 'Sweeping Anemo tornado.', multiplier: 3.2 },
            ],
            equipped: { gearIds: [] },
        },
        {
            kind: 'character', id: 'hu-tao', name: 'Hu Tao', element: 'Pyro', weaponType: 'Polearm', rarity: 5,
            stats: { atk: 1180, hp: 22800, def: 870, critRate: 34, critDmg: 208, energyRegen: 106, elementalMastery: 120, pyroDmg: 33 },
            skills: [
                { id: 'na', name: 'Normal Attack', type: 'Normal', description: 'Spear thrusts dealing Physical/Pyro DMG.', multiplier: 0.9 },
                { id: 'skill', name: 'Guide to Afterlife', type: 'Skill', description: 'Enter Paramita Papilio stance.', multiplier: 2.6 },
                { id: 'burst', name: 'Spirit Soother', type: 'Burst', description: 'Blossoming Pyro AoE + heal.', multiplier: 6.1 },
            ],
            equipped: { weaponId: 'gi-pole-1', gearIds: ['gi-art-1', 'gi-art-2', 'gi-art-6'] },
        },
        {
            kind: 'character', id: 'ganyu', name: 'Ganyu', element: 'Cryo', weaponType: 'Bow', rarity: 5,
            stats: { atk: 1090, hp: 15400, def: 790, critRate: 30, critDmg: 224, energyRegen: 112, elementalMastery: 60, cryoDmg: 40 },
            skills: [
                { id: 'na', name: 'Charged Shot', type: 'Charged', description: 'Frostflake Arrow + bloom.', multiplier: 2.3 },
                { id: 'skill', name: 'Trail of the Qilin', type: 'Skill', description: 'Ice Lotus taunt.', multiplier: 1.3 },
                { id: 'burst', name: 'Celestial Shower', type: 'Burst', description: 'Raining Cryo icicles.', multiplier: 1.4 },
            ],
            equipped: { weaponId: 'gi-bow-1', gearIds: ['gi-art-3', 'gi-art-4'] },
        },
        {
            kind: 'character', id: 'bennett', name: 'Bennett', element: 'Pyro', weaponType: 'Sword', rarity: 4,
            stats: { atk: 940, hp: 13600, def: 760, critRate: 24, critDmg: 150, energyRegen: 140, elementalMastery: 40, pyroDmg: 20 },
            skills: [
                { id: 'na', name: 'Normal Attack', type: 'Normal', description: 'Sword combo.', multiplier: 0.8 },
                { id: 'skill', name: 'Passion Overload', type: 'Skill', description: 'Fiery slash.', multiplier: 2.2 },
                { id: 'burst', name: 'Fantastic Voyage', type: 'Burst', description: 'Healing + ATK buff field.', multiplier: 3.0 },
            ],
            equipped: { weaponId: 'gi-sword-1', gearIds: ['gi-art-5'] },
        },
    ],
    weapons: [
        { kind: 'weapon', id: 'gi-pole-1', name: 'Staff of Homa', weaponType: 'Polearm', rarity: 5, baseAtk: 608, secondaryStat: 'Crit DMG', secondaryValue: 66 },
        { kind: 'weapon', id: 'gi-bow-1', name: "Amos' Bow", weaponType: 'Bow', rarity: 5, baseAtk: 608, secondaryStat: 'ATK%', secondaryValue: 49 },
        { kind: 'weapon', id: 'gi-sword-1', name: 'The Black Sword', weaponType: 'Sword', rarity: 4, baseAtk: 510, secondaryStat: 'Crit Rate', secondaryValue: 27.6 },
    ],
    gear: [
        { kind: 'artifact', id: 'gi-art-1', name: 'Magnificent Tsurumi', setName: 'Crimson Witch of Flames', rarity: 5, slot: 'flower', mainStat: { key: 'hp', label: 'HP', value: 4780 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 7.0 }, { key: 'critDmg', label: 'Crit DMG', value: 14.0 }, { key: 'atkPct', label: 'ATK%', value: 9.3 }] },
        { kind: 'artifact', id: 'gi-art-2', name: 'Wine-Stained Goblet', setName: 'Crimson Witch of Flames', rarity: 5, slot: 'goblet', mainStat: { key: 'pyroDmg', label: 'Pyro DMG', value: 46.6 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 6.6 }, { key: 'critDmg', label: 'Crit DMG', value: 12.4 }] },
        { kind: 'artifact', id: 'gi-art-3', name: 'Frost Blizzard Plume', setName: 'Blizzard Strayer', rarity: 5, slot: 'plume', mainStat: { key: 'atk', label: 'ATK', value: 311 }, subStats: [{ key: 'critDmg', label: 'Crit DMG', value: 15.6 }, { key: 'atkPct', label: 'ATK%', value: 5.8 }] },
        { kind: 'artifact', id: 'gi-art-4', name: 'Icebreaker Circlet', setName: 'Blizzard Strayer', rarity: 5, slot: 'circlet', mainStat: { key: 'critDmg', label: 'Crit DMG', value: 62.2 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 3.9 }, { key: 'atkPct', label: 'ATK%', value: 10.5 }] },
        { kind: 'artifact', id: 'gi-art-5', name: 'Noble Hourglass', setName: 'Noblesse Oblige', rarity: 5, slot: 'sands', mainStat: { key: 'energyRegen', label: 'Energy Recharge', value: 51.8 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 5.4 }, { key: 'atkPct', label: 'ATK%', value: 8.2 }] },
        { kind: 'artifact', id: 'gi-art-6', name: 'Witch Sands', setName: 'Crimson Witch of Flames', rarity: 5, slot: 'sands', mainStat: { key: 'atkPct', label: 'ATK%', value: 46.6 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 8.1 }, { key: 'critDmg', label: 'Crit DMG', value: 10.9 }] },
        { kind: 'artifact', id: 'gi-art-7', name: 'Gilded Flower', setName: 'Gilded Dreams', rarity: 5, slot: 'flower', mainStat: { key: 'hp', label: 'HP', value: 4780 }, subStats: [{ key: 'elementalMastery', label: 'EM', value: 44 }, { key: 'critRate', label: 'Crit Rate', value: 6.2 }] },
    ],
    enemies: [
        { id: 'gi-dvalin', name: 'Stormterror Dvalin', level: 90, def: 900, res: 10 },
        { id: 'gi-andrius', name: 'Lupus Boreas (Andrius)', level: 90, def: 920, res: 10 },
        { id: 'gi-childe', name: 'Childe (Tartaglia)', level: 90, def: 950, res: 10 },
        { id: 'gi-azhdaha', name: 'Azhdaha', level: 90, def: 1000, res: 20 },
        { id: 'gi-raiden', name: 'Raiden Shogun', level: 90, def: 1050, res: 10 },
        { id: 'gi-geovishap', name: 'Primo Geovishap', level: 90, def: 900, res: 30 },
        { id: 'gi-serpent', name: 'Ruin Serpent', level: 90, def: 980, res: 10 },
        { id: 'gi-guard', name: 'Ruin Guard', level: 90, def: 820, res: 10 },
    ],
    buffs: {
        basic: [
            { id: 'b-atkp', name: 'ATK% Buff', source: 'Basic', stat: 'atkPct', value: 20 },
            { id: 'b-atk', name: 'Flat ATK', source: 'Basic', stat: 'atk', value: 120 },
            { id: 'b-defp', name: 'DEF% Buff', source: 'Basic', stat: 'defPct', value: 20 },
            { id: 'b-def', name: 'Flat DEF', source: 'Basic', stat: 'def', value: 60 },
            { id: 'b-cr', name: 'Crit Rate', source: 'Basic', stat: 'critRate', value: 12 },
            { id: 'b-cd', name: 'Crit DMG', source: 'Basic', stat: 'critDmg', value: 24 },
            { id: 'b-er', name: 'Energy Recharge', source: 'Basic', stat: 'energyRegen', value: 20 },
            { id: 'b-em', name: 'Elemental Mastery', source: 'Basic', stat: 'elementalMastery', value: 80 },
            { id: 'b-elem', name: 'Elemental DMG', source: 'Basic', stat: 'elemDmg', value: 18 },
        ],
        character: [
            { id: 'cb-gi-1', name: 'Fantastic Voyage (ATK)', source: 'Bennett', stat: 'atk', value: 800 },
            { id: 'cb-gi-2', name: 'Noblesse Oblige (Party)', source: 'Noblesse Oblige', stat: 'atkPct', value: 20 },
            { id: 'cb-gi-3', name: 'Cryo Amplification', source: 'Ganyu', stat: 'critRate', value: 15 },
            { id: 'cb-gi-4', name: 'Paramita Papilio', source: 'Hu Tao', stat: 'atkPct', value: 25 },
        ],
    },
    passives: [
        { id: 'gi-p1', name: '1st Ascension Passive', description: 'Unlocked at Ascension 1.' },
        { id: 'gi-p4', name: '4th Ascension Passive', description: 'Unlocked at Ascension 4.' },
        { id: 'gi-put', name: 'Utility Passive', description: 'An out-of-combat convenience.' },
    ],
    setBonuses: [
        { name: 'Noblesse Oblige', pieces: 4, buffs: [{ stat: 'atkPct', label: 'ATK%', value: 20 }], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
        { name: 'Crimson Witch of Flames', pieces: 4, buffs: [{ stat: 'elemDmg', label: 'Elemental DMG', value: 15 }], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
        { name: 'Emblem of Severed Fate', pieces: 4, buffs: [{ stat: 'atkPct', label: 'ATK%', value: 25 }, { stat: 'energyRegen', label: 'Energy Recharge', value: 20 }], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
    ],
};

const EMBEDDED: Record<string, GameBundle> = {
    'wuthering-waves': WUTHERING_WAVES,
    'genshin-impact': GENSHIN_IMPACT,
};

/**
 * The active game's data. Prefers the backend-served bundle (cached in
 * gameDataStore); falls back to the embedded copy when the bridge hasn't
 * delivered yet or is unavailable. Both share the same shape, so callers never
 * see a difference.
 */
export function getGameData(gameId: string): GameData {
    const fromBackend = useGameDataStore.getState().getBundle(gameId);
    return fromBackend ?? EMBEDDED[gameId] ?? EMBEDDED['wuthering-waves'];
}

/**
 * Reactive variant of {@link getGameData} for use in components — re-renders
 * when the backend bundle for `gameId` arrives (so the full module roster/sets
 * replace the embedded fallback without a manual refresh).
 */
export function useGameData(gameId: string): GameData {
    const fromBackend = useGameDataStore((s) => s.bundles[gameId]);
    return fromBackend ?? EMBEDDED[gameId] ?? EMBEDDED['wuthering-waves'];
}

/** Format a stat value according to its catalog definition. */
export function formatCatalogValue(def: StatDef, v: number): string {
    return def.percent ? `${v}%` : v.toLocaleString();
}

/**
 * Display label for a catalog stat. The generic `elemDmg` slot is labeled with
 * the character's element when one is in context ("Spectro DMG", "Pyro DMG").
 */
export function catalogStatLabel(def: StatDef, element?: string): string {
    if (def.key === 'elemDmg' && element) return `${element} DMG`;
    return def.label;
}

/** Stat keys the optimizer/inspector can target, with display labels. */
export const STAT_LABELS: Record<string, string> = {
    atk: 'ATK', hp: 'HP', def: 'DEF',
    critRate: 'Crit Rate', critDmg: 'Crit DMG', energyRegen: 'Energy Regen',
    elementalMastery: 'Elemental Mastery',
    atkPct: 'ATK%', hpPct: 'HP%', defPct: 'DEF%',
    elemDmg: 'Elemental DMG',
    spectroDmg: 'Spectro DMG', electroDmg: 'Electro DMG', pyroDmg: 'Pyro DMG', cryoDmg: 'Cryo DMG',
    // A per-attack-type (`appliesTo`-scoped) %DMG bonus — e.g. "Heavy Attack
    // DMG +30%" — is a DIFFERENT mechanic from `elemDmg` (an unscoped,
    // always-applies elemental bonus): both feed the same `scopedDmgFor`
    // summation in `skillDamage()` identically regardless of which literal
    // stat key is used (the engine only checks `stat !== 'flatDmgAdd'` for
    // scoped buffs), so this label existing wasn't a correctness bug — but
    // dozens of weapon passives across both games were tagged `elemDmg`
    // anyway despite being scoped, which showed as "Elemental DMG" in the
    // Custom Buffs list (misleadingly implying an unscoped bonus) instead of
    // this. Fixed at the source (see `weapons.ts`) for scoped weapon
    // passives; this label covers every OTHER already-correct `dmgBonus`
    // buff (most character kit passives) too, which previously fell through
    // to `statLabel`'s raw-key fallback and displayed the literal string
    // "dmgBonus".
    dmgBonus: 'DMG Bonus',
};

export function statLabel(key: string): string {
    return STAT_LABELS[key] ?? key;
}

/** True for stats rendered with a % suffix (rates, %-modifiers, DMG bonuses). */
export function isPercentStat(key: string): boolean {
    return key.endsWith('Pct') || key.endsWith('Dmg') || key === 'critRate' || key === 'critDmg' || key === 'energyRegen';
}

/** Format a gear stat instance value (which carries only key/label/value). */
export function formatGearStat(stat: { key: string; value: number }): string {
    return isPercentStat(stat.key) ? `${stat.value}%` : `${stat.value}`;
}

/**
 * A specific named echo's own item art (WW only — looked up dynamically by
 * `name` against `WW_ECHO_ITEM_ICONS`, so it applies retroactively to
 * already-owned pieces with no data migration needed). Undefined for the 12
 * "Illusive" echoes with no sourced art and for every GI artifact (that
 * catalog has no per-name identity the way WW's echoes do).
 */
export function echoItemIconFor(g: { name: string }): string | undefined {
    return WW_ECHO_ITEM_ICONS[g.name];
}

/**
 * Resolve a gear item's icon: its own specific item art if known, else the
 * Set's badge icon (covers the vast majority of gear, which has no sourced
 * item-specific art) — `g.icon` is a legacy/future manual-override field,
 * checked in between the two.
 */
export function gearIcon(data: GameData, g: { icon?: string; name: string; setName: string }): string | undefined {
    return echoItemIconFor(g) ?? g.icon ?? setIconFor(data, g);
}

/**
 * A specific named gear piece's own Echo-Skill self-buffs (WW only — looked
 * up dynamically by `name` against `WW_ECHO_SELF_BUFFS`, so it applies
 * retroactively to already-owned pieces with no data migration needed).
 * Empty for the vast majority of gear, which has no such mechanic.
 */
export function gearSelfBuffs(g: { name: string }): Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }> {
    return WW_ECHO_SELF_BUFFS[g.name] ?? [];
}

/** A piece's Set icon specifically (independent of its own specific-item icon, if any) — e.g. for a badge overlay on top of the piece's own art. */
export function setIconFor(data: GameData, g: { setName: string }): string | undefined {
    return data.gearCatalog.sets.find((s) => s.name === g.setName)?.icon;
}

// ── Talents: passive skills + sequences/constellations ──────────────────────

export function getPassives(gameId: string): Passive[] {
    return getGameData(gameId).passives;
}

/** WuWa calls them Sequences (Resonance Chains); Genshin calls them Constellations. */
export function getSequenceLabel(gameId: string): string {
    return getGameData(gameId).sequenceLabel;
}

/** Both games cap at 6 nodes. */
export const SEQUENCE_MAX = 6;
