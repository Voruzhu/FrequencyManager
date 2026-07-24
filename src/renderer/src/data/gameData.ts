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
import { WW_ECHO_SELF_BUFFS, WW_ECHO_ITEM_ICONS } from '@shared/game-data/echo-set-names';
import { useGameDataStore } from '../stores/gameDataStore';
// `bundle.ts` is the SAME pre-derived GameBundle (`buildGameBundle(...)`)
// the Electron backend serves over IPC — real full roster, real OCR rules,
// everything — assembled from plain-data adapter modules with no Node/
// Electron dependency, so importing it directly here costs nothing. This
// replaces a hand-written, ~3-4-character-per-game approximation that had
// drifted from what this file's own header comment always said it should
// be ("mirrors the backend data"). See docs/WEB_VERSION.md.
import { wutheringWavesBundle } from '@adapters/game-definitions/wuthering-waves/bundle';
import { genshinImpactBundle } from '@adapters/game-definitions/genshin-impact/bundle';

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

// ── Embedded fallback bundles ─────────────────────────────────────────────
// Real, full GameBundles (55/121-character rosters, real icon paths, real
// OCR rules) — the exact same data Electron gets over IPC once a game
// package is installed, imported directly instead of via IPC. Used whenever
// the bridge hasn't delivered yet (Electron, briefly, before the real IPC
// bundle lands) and PERMANENTLY on the web build (no IPC there at all).

const EMBEDDED: Record<string, GameBundle> = {
    'wuthering-waves': wutheringWavesBundle,
    'genshin-impact': genshinImpactBundle,
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
export function gearSelfBuffs(g: { name: string }): Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }> {
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

/**
 * `data.passives` is a generic, game-wide 2-3 slot label list ("Inherent
 * Skill I" / "1st Ascension Passive" etc.) with boilerplate descriptions —
 * there's no per-character version of that catalog. The REAL per-character
 * text already exists as tagged labels inside `character.selfBuffs` (e.g.
 * WW's "Havoc DMG Bonus +15% (Inherent I)", GI's "... (P1)") — this pulls
 * whichever of those match the Nth passive slot for use as its real
 * description, falling back to the generic placeholder (return undefined)
 * when the character has no self-buff tagged for that slot (a real passive
 * that doesn't affect a modeled stat, or simply not yet authored).
 */
const PASSIVE_SLOT_TAGS: Record<string, RegExp[]> = {
    'wuthering-waves': [/\(Inherent I\b/, /\(Inherent II\b/],
    'genshin-impact': [/\(P1\)/, /\(P2\)/],
};

/** The character's own `selfBuffs` entries tagged for the Nth passive slot, each paired with its
 * original index in `character.selfBuffs` (needed to reconstruct the SAME id `characterAutoBuffs`/
 * `passiveBuffId` would use for it, so toggling here stays in sync with the Calculator's own chips). */
export function getPassiveSlotBuffs(gameId: string, character: CharacterData, slotIndex: number): Array<{ sb: NonNullable<CharacterData['selfBuffs']>[number]; index: number }> {
    const tag = PASSIVE_SLOT_TAGS[gameId]?.[slotIndex];
    if (!tag) return [];
    return (character.selfBuffs ?? []).map((sb, index) => ({ sb, index })).filter(({ sb }) => tag.test(sb.label));
}

export function describePassiveSlot(gameId: string, character: CharacterData, slotIndex: number): string | undefined {
    const matches = getPassiveSlotBuffs(gameId, character, slotIndex);
    if (matches.length === 0) return undefined;
    return matches.map(({ sb }) => sb.label.replace(/\s*\([^()]*\)\s*$/, '')).join('; ');
}

/** WuWa calls them Sequences (Resonance Chains); Genshin calls them Constellations. */
export function getSequenceLabel(gameId: string): string {
    return getGameData(gameId).sequenceLabel;
}

/** Both games cap at 6 nodes. */
export const SEQUENCE_MAX = 6;
