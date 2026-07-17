/**
 * @fileoverview Game-agnostic loadout optimizer (shared engine)
 * @module shared/calc/optimizer
 *
 * The single source of truth for build math. Given a character, a pool of gear
 * (echoes/artifacts), active buffs and a crit assumption, it enumerates
 * combinations, computes stats + per-skill damage for exactly the stats in the
 * game's catalog, filters by "minimum" targets, and ranks by a composite of the
 * "maximize" targets.
 *
 * Fully generic — it operates on the catalog and data passed in, so a game
 * module adds/removes stats with no engine change. Imported by BOTH the backend
 * damage-calculator module (which serves it over an `optimize` RPC) and the
 * renderer (client-side fallback), guaranteeing identical results either way.
 */

import type {
    CharacterEntry,
    GearEntry,
    WeaponEntry,
    StatDef,
    SkillDef,
    BuffEntry,
    EnemyEntry,
} from '../types/game-bundle';

const GEAR_SLOTS = 5;

/** Maps a weapon's secondary-stat label to a build-stat key. */
const SECONDARY_KEY: Record<string, string> = {
    'Crit Rate': 'critRate',
    'Crit DMG': 'critDmg',
    'ATK%': 'atkPct',
    'HP%': 'hpPct',
    'DEF%': 'defPct',
    'Energy Regen': 'energyRegen',
    'Elemental Mastery': 'elementalMastery',
};

/** How to treat crit when computing damage. */
export type CritMode = 'always' | 'average' | 'none';

export const CRIT_MODE_LABEL: Record<CritMode, string> = {
    always: 'Always crit',
    average: 'Average damage',
    none: 'No crit',
};

/** A single optimization target: either a minimum threshold or something to maximize. */
export interface Target {
    id: string;
    kind: 'stat' | 'skill';
    key: string;
    label: string;
    mode: 'min' | 'max';
    min?: number; // used when mode === 'min'
}

/**
 * Elemental reaction applied to skill damage (Genshin). Amplifying reactions
 * multiply; additive reactions (aggravate/spread) add EM-scaled flat damage.
 */
export type ReactionType =
    | 'none'
    | 'vape-1.5' | 'vape-2'      // Vaporize (Pyro↔Hydro)
    | 'melt-1.5' | 'melt-2'      // Melt (Pyro↔Cryo)
    | 'aggravate' | 'spread';    // Quicken (Electro/Dendro)

export const REACTION_LABEL: Record<ReactionType, string> = {
    'none': 'No reaction',
    'vape-1.5': 'Vaporize (1.5×)',
    'vape-2': 'Vaporize (2×)',
    'melt-1.5': 'Melt (1.5×)',
    'melt-2': 'Melt (2×)',
    'aggravate': 'Aggravate',
    'spread': 'Spread',
};

export interface OptimizeConfig {
    targets: Target[];
    buffs: BuffEntry[];
    critMode: CritMode;
    enemy: EnemyEntry;
    weapon?: WeaponEntry;
    /** The active game's stat catalog — computed stats follow it exactly. */
    catalog: StatDef[];
    topN: number;
    /** Per-skill talent levels (skillId → level) for the multiplier table. */
    talentLevels?: Record<string, number>;
    /** Per-skill user-configured stack count (skillId → stacks), for skills with `SkillDef.stackMax`. */
    stacks?: Record<string, number>;
    /** Elemental reaction to apply (Genshin). */
    reaction?: ReactionType;
    /** Character level (enemy DEF + reaction base scale off it). */
    charLevel?: number;
    /** Real in-game cap on the SUM of all equipped pieces' `cost` (WuWa: 12
     * across 5 echoes costing 1/3/4 each — see `GearCatalog.maxTotalCost`).
     * Undefined for games with no cost concept (GI) — no constraint applied. */
    maxTotalCost?: number;
}

/** Amplifying-reaction EM bonus: 2.78·EM/(EM+1400). */
function ampEmBonus(em: number): number {
    return (2.78 * em) / (em + 1400);
}
/** Additive-reaction (aggravate/spread) EM bonus: 5·EM/(EM+1200). */
function addEmBonus(em: number): number {
    return (5 * em) / (em + 1200);
}
/** Base additive-reaction damage at level 90 (approx). */
const AGGRAVATE_BASE_L90 = 1446;
const SPREAD_BASE_L90 = 1206;

/** Reaction effect: an amplifying multiplier and/or an additive flat bonus. */
function reactionEffect(r: ReactionType, em: number): { mult: number; addFlat: number } {
    const amp = (base: number) => base * (1 + ampEmBonus(em));
    switch (r) {
        case 'vape-1.5': return { mult: amp(1.5), addFlat: 0 };
        case 'vape-2': return { mult: amp(2.0), addFlat: 0 };
        case 'melt-1.5': return { mult: amp(1.5), addFlat: 0 };
        case 'melt-2': return { mult: amp(2.0), addFlat: 0 };
        case 'aggravate': return { mult: 1, addFlat: AGGRAVATE_BASE_L90 * (1 + addEmBonus(em)) };
        case 'spread': return { mult: 1, addFlat: SPREAD_BASE_L90 * (1 + addEmBonus(em)) };
        default: return { mult: 1, addFlat: 0 };
    }
}

/** How damage is computed for one skill instance. */
export interface SkillContext {
    mode: CritMode;
    enemy?: EnemyEntry;
    talentLevels?: Record<string, number>;
    reaction?: ReactionType;
    charLevel?: number;
    defaultTalentLevel?: number;
    /** User-configured stack count per skill id, for skills with `SkillDef.stackMax` set. Defaults to that skill's `stackMax` when this skill id is absent — see `effectiveSkillMultiplier`. */
    stacks?: Record<string, number>;
    /**
     * Per-attack-type DMG% buffs (BuffEntry with `appliesTo`). Applied inside
     * skillDamage ONLY to skills matching the buff's scope — never folded into
     * global stats. e.g. Sanhua's Basic-Attack DMG amp.
     */
    scopedBuffs?: BuffEntry[];
}

/**
 * Canonical attack-type category for a skill type/id or a buff scope token, so
 * scoping is robust to the many spellings used across games and the backfill
 * (e.g. 'Normal'/'na'/'normalAttack' → 'basic'; 'Ultimate'/'liberation' → 'ult').
 */
function canonScope(token: string): string {
    const t = token.toLowerCase().replace(/[\s_-]/g, '');
    if (['basic', 'basicattack', 'normal', 'normalattack', 'na'].includes(t)) return 'basic';
    if (['heavy', 'heavyattack'].includes(t)) return 'heavy';
    if (['skill', 'resonanceskill'].includes(t)) return 'skill';
    if (['ult', 'ultimate', 'liberation', 'resonanceliberation', 'burst'].includes(t)) return 'ult';
    if (['forte', 'fortecircuit'].includes(t)) return 'forte';
    if (['charged', 'chargedattack'].includes(t)) return 'charged';
    if (['plunge', 'plunging', 'plungingattack'].includes(t)) return 'plunge';
    if (['aimed', 'aimedshot'].includes(t)) return 'aimed';
    if (['intro', 'introskill'].includes(t)) return 'intro';
    if (['outro', 'outroskill'].includes(t)) return 'outro';
    if (['echo', 'echoskill', 'echoskilldmg'].includes(t)) return 'echo';
    // WW's per-element reaction/Negative-Status names — a buff scoped to one
    // of these amplifies only THAT reaction's own proc/DoT damage, not the
    // attacker's whole kit (e.g. Phoebe's Outro amps Spectro Frazzle ticks
    // specifically). 'fusionburst' (not bare 'burst') to avoid colliding with
    // GI's Elemental Burst, which already canonicalizes 'burst' → 'ult' above.
    if (['frazzle', 'spectrofrazzle'].includes(t)) return 'frazzle';
    if (['erosion', 'aeroerosion'].includes(t)) return 'erosion';
    if (['chafe', 'glaciochafe'].includes(t)) return 'chafe';
    if (['flare', 'electroflare'].includes(t)) return 'flare';
    if (['bane', 'havocbane'].includes(t)) return 'bane';
    if (['fusionburst'].includes(t)) return 'fusionburst';
    return t;
}

/** True if a scoped buff (appliesTo) applies to this skill (by scope override, type, or id). */
function skillMatchesScope(skill: SkillDef, appliesTo: string[] | undefined): boolean {
    if (!appliesTo || appliesTo.length === 0) return true;
    const cats = new Set([canonScope(skill.scope ?? skill.type ?? ''), canonScope(skill.id ?? '')]);
    return appliesTo.some((a) => cats.has(canonScope(a)));
}

/**
 * `flatDmgAdd` is a DIFFERENT mechanic from every other scoped buff: it's not a
 * %-multiplier on the skill's damage, it's a flat amount added to the skill's
 * base damage (e.g. "Skill DMG is increased by 40% of DEF" — Cinnabar Spindle;
 * "gain Hurricane Guard: this DMG is increased based on 32% of Faruzan's Base
 * ATK" — Faruzan's kit buff). `value` is pre-resolved by the caller (usually via
 * `scaleOff`, computed against whichever character's stat the effect scales
 * off — the wielder for a self-buff, the source teammate for a kit/weapon team
 * buff) before it ever reaches here; this function only sums and scopes it.
 * ALWAYS scoped (`appliesTo` required) — an unscoped flat add has no attack to
 * attach to, so it's authored with a specific skill scope, never global.
 */
function scopedFlatAddFor(skill: SkillDef, scoped: BuffEntry[] | undefined): number {
    if (!scoped || scoped.length === 0) return 0;
    let sum = 0;
    for (const b of scoped) if (b.stat === 'flatDmgAdd' && skillMatchesScope(skill, b.appliesTo)) sum += b.value;
    return sum;
}

/** Sum of scoped-buff DMG% that applies to this specific skill (excludes `flatDmgAdd`, `defIgnore` and `resShred` — different mechanics, see their own functions). */
function scopedDmgFor(skill: SkillDef, scoped: BuffEntry[] | undefined): number {
    if (!scoped || scoped.length === 0) return 0;
    let sum = 0;
    for (const b of scoped) if (b.stat !== 'flatDmgAdd' && b.stat !== 'defIgnore' && b.stat !== 'resShred' && skillMatchesScope(skill, b.appliesTo)) sum += b.value;
    return sum;
}

/**
 * `defIgnore`: percent of the enemy's DEF to ignore before the standard
 * def-mitigation formula (e.g. Blazing Justice's "ignores 8% of the target's
 * DEF"). Unlike `flatDmgAdd`, this one CAN be unscoped (no `appliesTo`) —
 * many real effects ("dealing damage ignores X% DEF") apply to every attack,
 * not just one type; `skillMatchesScope` already treats a missing/empty
 * `appliesTo` as "matches everything", so this needs no special case beyond
 * `isScopedBuff` including it regardless of `appliesTo` (see that function).
 * Summed (not maxed) across multiple sources, then clamped in
 * `enemyMultiplier` — matches how every other %-buff in this engine stacks.
 */
function scopedDefIgnoreFor(skill: SkillDef, scoped: BuffEntry[] | undefined): number {
    if (!scoped || scoped.length === 0) return 0;
    let sum = 0;
    for (const b of scoped) if (b.stat === 'defIgnore' && skillMatchesScope(skill, b.appliesTo)) sum += b.value;
    return sum;
}

/**
 * `resShred`: percentage POINTS subtracted from the enemy's RES (e.g. "RES
 * -10%" drops a 20% RES enemy to 10%, not "10% less than current RES") —
 * same unscoped-allowed convention as `scopedDefIgnoreFor`.
 */
function scopedResShredFor(skill: SkillDef, scoped: BuffEntry[] | undefined): number {
    if (!scoped || scoped.length === 0) return 0;
    let sum = 0;
    for (const b of scoped) if (b.stat === 'resShred' && skillMatchesScope(skill, b.appliesTo)) sum += b.value;
    return sum;
}

/**
 * Whether a buff belongs in `SkillContext.scopedBuffs` (resolved inside
 * `skillDamage` against the specific skill being computed) rather than
 * folded into global `BuildStats` by `computeBuildStats`. Normally that's
 * exactly "has an `appliesTo`" — but `defIgnore`/`resShred` are never global
 * stats (there's no "DEF ignore" stat catalog entry in any game module, by
 * design — see `scopedDefIgnoreFor`'s doc comment), so an UNSCOPED one still
 * needs to reach `skillDamage`, not silently vanish the way an unscoped
 * `dmgBonus` would (that's a data-authoring mistake for `dmgBonus`; it's the
 * NORMAL case for `defIgnore`/`resShred`).
 */
export function isScopedBuff(b: BuffEntry): boolean {
    return !!(b.appliesTo && b.appliesTo.length) || b.stat === 'defIgnore' || b.stat === 'resShred';
}

/**
 * Gear stat keys that are really a per-attack-type DMG% bonus, not a global
 * stat — e.g. WuWa's echo sub-stats "Basic Attack DMG Bonus"/"Heavy Attack
 * DMG Bonus"/"Resonance Skill DMG Bonus"/"Resonance Liberation DMG Bonus"
 * only boost that ONE attack type, same real mechanic as a kit buff with
 * `appliesTo`. These never had a stat-catalog entry (correctly — a catalog
 * entry drives `computeBuildStats`'s GLOBAL flat/pct accumulation, which
 * would incorrectly apply them to every skill, not just the one type the
 * game restricts them to) which meant gear rolling them contributed NOTHING
 * to computed damage at all: `computeBuildStats` only surfaces catalog keys
 * into `BuildStats`, so these were silently dropped on the floor. Keyed
 * generically (not "WW's 4 keys" hardcoded elsewhere) so a future game
 * module can add its own equivalent stat keys with no engine change.
 */
const GEAR_SCOPED_DMG_KEYS: Record<string, string> = {
    basicAttackDmgBonus: 'basic',
    heavyAttackDmgBonus: 'heavy',
    resonanceSkillDmgBonus: 'skill',
    resonanceLiberationDmgBonus: 'ult',
};

/**
 * Synthesizes scoped `BuffEntry` rows from a gear loadout's own main/sub
 * stats for any key in `GEAR_SCOPED_DMG_KEYS` — same shape a kit/weapon buff
 * with `appliesTo` would produce, so they flow through the exact same
 * `isScopedBuff` → `SkillContext.scopedBuffs` → `scopedDmgFor` pipeline
 * every other per-attack-type buff already uses. Must be computed PER GEAR
 * COMBO (unlike kit/weapon buffs, which are the same across every combo
 * during an Optimizer search) since different combos roll different
 * sub-stats — see `computeBaseLoadouts`, the one caller that needs this
 * inside its per-combo loop rather than once upfront.
 */
export function gearScopedBuffs(gear: GearEntry[]): BuffEntry[] {
    const out: BuffEntry[] = [];
    for (const piece of gear) {
        for (const s of [piece.mainStat, ...piece.subStats]) {
            const scope = GEAR_SCOPED_DMG_KEYS[s.key];
            if (scope) out.push({ id: `gear-${piece.id}-${s.key}`, name: s.label, source: piece.name, stat: 'dmgBonus', value: s.value, appliesTo: [scope] });
        }
    }
    return out;
}

/** Multiplier for a skill at a talent level (uses the table when present). */
export function skillMultiplierAt(skill: SkillDef, level: number): number {
    const table = skill.multipliers;
    if (table && table.length > 0) {
        const i = Math.max(0, Math.min(table.length - 1, level - 1));
        return table[i];
    }
    return skill.multiplier;
}

/**
 * Effective multiplier for a skill, folding in its user-configurable stack
 * count on top of the talent-level base (see `SkillDef.stackMax` doc) — a
 * no-op passthrough to `skillMultiplierAt` for the common case of a skill with
 * no stack mechanic. `stacks` defaults to `skill.stackMax` when unset
 * ("assume max stacks", the same convention already used for buffs), and is
 * clamped to `[0, stackMax]` so a stale/out-of-range stored value can't
 * silently overshoot the skill's real ceiling.
 */
export function effectiveSkillMultiplier(skill: SkillDef, level: number, stacks?: number): number {
    const base = skillMultiplierAt(skill, level);
    if (skill.stackMax == null) return base;
    const n = Math.max(0, Math.min(skill.stackMax, stacks ?? skill.stackMax));
    const perStackTable = skill.stackMultipliers;
    const perStack = perStackTable && perStackTable.length > 0
        ? perStackTable[Math.max(0, Math.min(perStackTable.length - 1, level - 1))]
        : (skill.stackMultiplier ?? 0);
    return base + n * perStack;
}

/**
 * Effective talent levels after applying GI's Constellation 3/5 "+3 to a skill's
 * level, max 15" bonus (`ConstellationNode.boostsSkillId`, see game-bundle.ts). A
 * no-op for WW (no `constellations` data carries `boostsSkillId`) and for any GI
 * character/node we couldn't identify a target skill for (left text-only). The
 * `?? 10` default matches `skillDamage`'s own `talentLevels?.[id] ?? defaultTalentLevel
 * ?? 10` fallback — a skill the user never touched is implicitly at the game's
 * baseline trained level 10 before any constellation bonus.
 *
 * `boostsSkillId` names exactly ONE representative skill id (however it was
 * matched at import time), but a character's real kit often splits a single
 * in-game talent across several ids sharing the same `type` (e.g. Nahida's
 * 'skill'/'skill_trikarma'/'skill_hold', all Elemental Skill; Neuvillette's
 * 'burst'/'burst_waterfall', both Elemental Burst) — the Talents window
 * already levels every such sibling together (see `talentGroups.ts`), so the
 * boost must reach all of them too, not just the one id the constellation
 * data happens to reference, or the Calculator would silently under-boost
 * every sibling skill's damage.
 */
export function applyConstellationLevelBoosts(
    character: Pick<CharacterEntry, 'constellations' | 'skills'>,
    talentLevels: Record<string, number> | undefined,
    constellationLevel: number,
): Record<string, number> | undefined {
    const boosts = character.constellations?.filter((n) => n.boostsSkillId && constellationLevel >= n.level);
    if (!boosts || boosts.length === 0) return talentLevels;
    const out = { ...talentLevels };
    for (const node of boosts) {
        const id = node.boostsSkillId!;
        const target = character.skills.find((s) => s.id === id);
        const siblingIds = target
            ? character.skills.filter((s) => canonScope(s.type) === canonScope(target.type)).map((s) => s.id)
            : [id];
        for (const sid of siblingIds) out[sid] = Math.min(15, (out[sid] ?? 10) + 3);
    }
    return out;
}

/**
 * Computed build stats, keyed by the game's stat-catalog keys. A record (not a
 * fixed interface) so game modules can add stats without touching this engine.
 * Well-known keys used by the damage formula: atk, critRate, critDmg, elemDmg.
 */
export type BuildStats = Record<string, number>;

export interface Loadout {
    id: string;
    gear: GearEntry[];
    stats: BuildStats;
    skillDamage: Record<string, number>;
    score: number;
    meets: boolean;
    failed: string[];
}

/**
 * Combined defense + resistance multiplier applied to a skill's raw damage.
 * DEF scales with character level; RES uses the standard piecewise formula.
 * (Lives here so the engine is self-contained; the renderer re-exports it.)
 *
 * `defIgnorePct` (0-100, clamped) scales the enemy's effective DEF down
 * before the mitigation formula — e.g. Blazing Justice's "ignores 8% of the
 * target's DEF". `resShredPct` is subtracted from the enemy's RES in
 * percentage POINTS before the same formula (can push RES negative — the
 * piecewise formula below already handles that, same as a real negative-RES
 * enemy would). Both default to 0 (no change from the old 2-arg behavior).
 */
export function enemyMultiplier(e: EnemyEntry, charLevel = 90, defIgnorePct = 0, resShredPct = 0): number {
    const factor = 5 * charLevel + 500;
    const effectiveDef = e.def * (1 - Math.min(100, Math.max(0, defIgnorePct)) / 100);
    const defMult = factor / (factor + effectiveDef);
    const r = (e.res - resShredPct) / 100;
    const resMult = r < 0 ? 1 - r / 2 : r < 0.75 ? 1 - r : 1 / (4 * r + 1);
    return defMult * resMult;
}

/**
 * All k-combinations of `arr`, in lexicographic order of index. When
 * `firstIndices` is given, only combinations whose SMALLEST chosen index is
 * in that set are generated — since combos partition cleanly by their first
 * pick (every combo starting with `arr[i]` is disjoint from every combo
 * starting with `arr[j]`, `i !== j`), this lets the worker pool split the
 * full search space across threads without any combinatorial-index math:
 * each thread just gets a different subset of starting picks. `undefined`
 * (the default) generates the complete set, unchanged from before.
 */
export function combinations<T>(arr: T[], k: number, firstIndices?: Set<number>): T[][] {
    if (k <= 0) return [[]];
    if (k > arr.length) return [];
    if (k === arr.length) return firstIndices && !firstIndices.has(0) ? [] : [arr.slice()];
    const result: T[][] = [];
    const rec = (start: number, combo: T[]) => {
        if (combo.length === k) { result.push(combo.slice()); return; }
        for (let i = start; i < arr.length; i++) {
            if (combo.length === 0 && firstIndices && !firstIndices.has(i)) continue;
            combo.push(arr[i]); rec(i + 1, combo); combo.pop();
        }
    };
    rec(0, []);
    return result;
}

/** `C(n, k)` — the binomial coefficient, used to estimate how much work each
 * possible "first pick" index represents (`subtreeSize`) for load-balancing
 * across worker threads, without generating the actual combinations. */
function binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
    return Math.round(result);
}

/** How many k-combinations of an n-item pool start with index `firstIndex`
 * (0-based) as their smallest chosen index — `C(n - 1 - firstIndex, k - 1)`,
 * the count of ways to pick the remaining `k - 1` items from everything
 * after it. Exported so the worker pool can balance load by ESTIMATED work
 * per starting index rather than assuming every index is equally expensive
 * (index 0's subtree is always the largest). */
export function subtreeSize(poolSize: number, k: number, firstIndex: number): number {
    return binomial(poolSize - 1 - firstIndex, k - 1);
}

/** Total number of k-combinations of an n-item pool — `C(n, k)`. */
export function totalCombinations(poolSize: number, k: number): number {
    return binomial(poolSize, k);
}

export const elemKey = (element: string) => element.toLowerCase() + 'Dmg';

/** Baseline values for stats a character sheet may omit. */
const BASE_DEFAULTS: Record<string, number> = { critRate: 5, critDmg: 50, energyRegen: 100 };

/** Stats whose `${key}Pct` modifiers scale the base value (others are additive). */
const PCT_SCALED = new Set(['atk', 'hp', 'def']);

/**
 * Compute a character's final stats from base + gear + buffs + (optional)
 * weapon, for exactly the stats in the game's catalog. Fully generic: modifier
 * keys ending in `Pct` scale their base stat, the character's own element key
 * (e.g. spectroDmg) and the generic `elemDmg` both feed the elemDmg slot, and
 * everything else adds flat — so new game-module stats need no engine changes.
 */
export function computeBuildStats(
    c: CharacterEntry,
    gear: GearEntry[],
    buffs: BuffEntry[],
    weapon: WeaponEntry | undefined,
    catalog: StatDef[],
): BuildStats {
    const ek = elemKey(c.element);
    const flat: Record<string, number> = {};
    const pct: Record<string, number> = {};
    // Base additions that %-modifiers scale (weapon base ATK is part of the "white"
    // base ATK that ATK% applies to, alongside the character's base ATK). Flat ATK
    // from artifacts/buffs is added AFTER the %.
    const scalable: Record<string, number> = {};
    const bump = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

    const apply = (key: string, value: number) => {
        if (key.endsWith('Pct')) { bump(pct, key.slice(0, -3), value); return; }
        if (key === ek) { bump(flat, 'elemDmg', value); return; } // off-element dmg stays inert
        bump(flat, key, value);
    };
    if (weapon) {
        // Weapon base ATK joins the scalable base ATK (ATK% scales char + weapon base).
        bump(scalable, 'atk', weapon.baseAtk);
        const key = SECONDARY_KEY[weapon.secondaryStat];
        if (key) apply(key, weapon.secondaryValue);
    }
    for (const piece of gear) {
        apply(piece.mainStat.key, piece.mainStat.value);
        for (const s of piece.subStats) apply(s.key, s.value);
    }
    // Scoped (per-attack-type) buffs are NOT global — they're applied inside
    // skillDamage only to matching skills. Skip them here.
    for (const b of buffs) { if (b.appliesTo && b.appliesTo.length) continue; apply(b.stat, b.value); }

    const out: BuildStats = {};
    for (const def of catalog) {
        const key = def.key;
        const base = (key === 'elemDmg' ? c.stats[ek] : c.stats[key]) ?? BASE_DEFAULTS[key] ?? 0;
        const value = PCT_SCALED.has(key)
            ? (base + (scalable[key] ?? 0)) * (1 + (pct[key] ?? 0) / 100) + (flat[key] ?? 0)
            : base + (scalable[key] ?? 0) + (flat[key] ?? 0);
        out[key] = def.percent ? Math.round(value * 10) / 10 : Math.round(value);
    }
    // Weapon stat conversions (Homa ATK += 0.8% of Max HP, Scarlet Sands ATK += 52% of
    // EM, …). Applied on FINAL stats so they read post-buff HP/EM/DEF; the added amount
    // is a flat bonus to the target (not re-scaled by that stat's %).
    if (weapon?.conversions) {
        const pctOf = new Set(catalog.filter((d) => d.percent).map((d) => d.key));
        for (const cv of weapon.conversions) {
            const add = (out[cv.from] ?? 0) * cv.pct / 100;
            const next = (out[cv.to] ?? 0) + add;
            out[cv.to] = pctOf.has(cv.to) ? Math.round(next * 10) / 10 : Math.round(next);
        }
    }
    if (out.critRate != null) out.critRate = Math.min(out.critRate, 100);
    return out;
}

export function critMultiplier(stats: BuildStats, mode: CritMode): number {
    const critRate = stats.critRate ?? 0;
    const critDmg = stats.critDmg ?? 0;
    switch (mode) {
        case 'always': return 1 + critDmg / 100;
        case 'none': return 1;
        case 'average':
        default: return 1 + (Math.min(critRate, 100) / 100) * (critDmg / 100);
    }
}

/**
 * Maps a `SkillDef.scaling`/`scaling2` short enum value to the actual
 * `BuildStats` key it reads from. Only 'em' differs (`elementalMastery` in
 * the stats object, matching the stat catalog's real key) — this mapping was
 * previously MISSING entirely (`stats[skill.scaling]` was used directly),
 * silently falling back to `stats.atk` for any EM-scaling skill. Never
 * caught because no character used `scaling:'em'` until the dual-stat-scaling
 * rollout (Nahida/Alhaitham/Lauma/etc.) — fixed here, applies retroactively
 * to any future 'em'-scaling skill on either the primary or `scaling2` term.
 */
function scaleStatKey(scaling: 'atk' | 'hp' | 'def' | 'em'): string {
    return scaling === 'em' ? 'elementalMastery' : scaling;
}

/**
 * Damage of a single skill. Scales off the skill's stat (ATK/HP/DEF/EM), uses
 * the talent-level multiplier table when present, adds the character's
 * elemental DMG bonus + any flat additive DMG scoped to this skill, applies
 * any elemental reaction, then crit + enemy defense/resistance.
 */
export function skillDamage(stats: BuildStats, skill: SkillDef, ctx: SkillContext): number {
    const level = ctx.talentLevels?.[skill.id] ?? ctx.defaultTalentLevel ?? 10;
    const mult = effectiveSkillMultiplier(skill, level, ctx.stacks?.[skill.id]);
    const scaleKey = scaleStatKey(skill.scaling ?? 'atk');
    const scaleStat = stats[scaleKey] ?? stats.atk ?? 0;
    // Second independently-scaled additive term (SkillDef.scaling2) — e.g.
    // Nahida's Tri-Karma: ATK term + EM term, both part of the SAME hit. A
    // no-op (0) for the ~99% of skills without a compound-scaling mechanic.
    const scale2Stat = skill.scaling2 ? (stats[scaleStatKey(skill.scaling2)] ?? 0) : 0;
    const mult2Base = skill.scaling2 ? skillMultiplierAt({ ...skill, multiplier: skill.multiplier2 ?? 0, multipliers: skill.multipliers2 }, level) : 0;
    // Second term's own stack scaling (SkillDef.stackMultiplier2) — mirrors the
    // primary term's stack handling in `effectiveSkillMultiplier`, for a dual-stat
    // skill where BOTH terms repeat per stack (e.g. Alhaitham's Projection Attack:
    // each consumed mirror adds one more full ATK+EM instance). A no-op (mult2Base
    // unchanged) unless both `stackMax` and a stackMultiplier2 table/scalar are set.
    let mult2 = mult2Base;
    if (skill.scaling2 && skill.stackMax != null && (skill.stackMultiplier2 != null || skill.stackMultipliers2)) {
        const n = Math.max(0, Math.min(skill.stackMax, ctx.stacks?.[skill.id] ?? skill.stackMax));
        const perStackTable2 = skill.stackMultipliers2;
        const perStack2 = perStackTable2 && perStackTable2.length > 0
            ? perStackTable2[Math.max(0, Math.min(perStackTable2.length - 1, level - 1))]
            : (skill.stackMultiplier2 ?? 0);
        mult2 = mult2Base + n * perStack2;
    }
    // Global elemental DMG% + any per-attack-type DMG% scoped to this skill.
    const dmgPct = (stats.elemDmg ?? 0) + scopedDmgFor(skill, ctx.scopedBuffs);
    // Flat DMG add scoped to this skill (e.g. "Skill DMG +40% of DEF") — part of
    // the skill's own base damage, so it's boosted by crit/reaction and reduced
    // by enemy mitigation same as the motion-value damage, not a separate hit.
    const talentBase = (scaleStat * mult + scale2Stat * mult2) * (1 + dmgPct / 100) + scopedFlatAddFor(skill, ctx.scopedBuffs);

    const { mult: rMult, addFlat } = reactionEffect(ctx.reaction ?? 'none', stats.elementalMastery ?? 0);
    const withReaction = talentBase * rMult + addFlat;

    const mit = ctx.enemy
        ? enemyMultiplier(ctx.enemy, ctx.charLevel ?? 90, scopedDefIgnoreFor(skill, ctx.scopedBuffs), scopedResShredFor(skill, ctx.scopedBuffs))
        : 1;
    const dmg = withReaction * critMultiplier(stats, ctx.mode) * mit;
    return Math.round(dmg);
}

export function targetValue(t: { kind: 'stat' | 'skill'; key: string }, stats: BuildStats, skillDmg: Record<string, number>): number {
    return t.kind === 'skill' ? (skillDmg[t.key] ?? 0) : (stats[t.key] ?? 0);
}

/** How many gear slots a build fills for a given pool size — `min(5, poolSize)`, never 0. Exported so the worker pool can compute the same `k` the engine will use, before any combinations are generated. */
export function gearSlotsFor(poolSize: number): number {
    return Math.max(1, Math.min(GEAR_SLOTS, poolSize));
}

/** Whether a gear combo stays within the real in-game total-cost budget (WuWa's
 * 12, across 5 echoes costing 1/3/4 each — see `OptimizeConfig.maxTotalCost`).
 * Always true when `maxTotalCost` is undefined (GI has no cost concept) or a
 * piece has no `cost` (same reason). Exported so the worker path can apply
 * the identical filter to its own generated slice of combos. */
export function withinCostBudget(combo: GearEntry[], maxTotalCost: number | undefined): boolean {
    if (maxTotalCost == null) return true;
    let total = 0;
    for (const g of combo) total += g.cost ?? 0;
    return total <= maxTotalCost;
}

/** A candidate build's stats/damage/pass-fail — everything BUT its composite
 * score, which needs the full candidate set's min/max range to normalize
 * against (see `targetRanges`). Split out from `Loadout` so the worker pool
 * can compute this (the expensive part) per-thread, then score centrally
 * once every thread's range contribution is known. */
export type BaseLoadout = Omit<Loadout, 'score' | 'meets'>;

/** The expensive per-combo work (build stats + skill damage + min-target
 * pass/fail) for a list of gear combinations — shared by the single-threaded
 * `optimize()` below and each worker's assigned slice in the parallel path.
 * `idOffset` keeps `Loadout.id` unique across workers, each of which only
 * ever sees its own combo indices starting from 0.
 */
export function computeBaseLoadouts(c: CharacterEntry, combos: GearEntry[][], config: OptimizeConfig, idOffset = 0): BaseLoadout[] {
    const minTargets = config.targets.filter((t) => t.mode === 'min');
    const kitScopedBuffs = config.buffs.filter(isScopedBuff);
    const baseCtx: Omit<SkillContext, 'scopedBuffs'> = {
        mode: config.critMode,
        enemy: config.enemy,
        talentLevels: config.talentLevels,
        stacks: config.stacks,
        reaction: config.reaction,
        charLevel: config.charLevel,
    };
    return combos.map((gear, idx) => {
        const stats = computeBuildStats(c, gear, config.buffs, config.weapon, config.catalog);
        // Per-attack-type DMG% sub-stats (e.g. WW's "Basic Attack DMG Bonus")
        // vary per combo, unlike kit/weapon buffs — must be recomputed here,
        // not folded into `kitScopedBuffs` above (see `gearScopedBuffs`).
        const ctx: SkillContext = { ...baseCtx, scopedBuffs: [...kitScopedBuffs, ...gearScopedBuffs(gear)] };
        const skillDmg: Record<string, number> = {};
        for (const skill of c.skills) skillDmg[skill.id] = skillDamage(stats, skill, ctx);
        const failed = minTargets.filter((t) => targetValue(t, stats, skillDmg) < (t.min ?? 0)).map((t) => t.label);
        return { id: `lo-${idOffset + idx}`, gear, stats, skillDamage: skillDmg, failed };
    });
}

export interface TargetRange { t: Target; lo: number; hi: number }

/**
 * Per-maximize-target [lo, hi] across a set of base loadouts — used to
 * normalize each candidate's raw target values into a comparable [0,1]
 * composite score. Loop-based on purpose, NOT `Math.min(...vals)`/
 * `Math.max(...vals)`: spreading an array into a function call has a real
 * engine argument-count ceiling (V8 throws `RangeError: Maximum call stack
 * size exceeded` past roughly 65k-125k elements) that a real gear pool can
 * exceed easily — `C(30, 5)` alone is 142,506 combinations. This was the
 * actual cause of "optimize runs for a while, then no loadouts appear": the
 * spread threw, the `run()` handler that calls this had no surrounding
 * try/catch, so the exception became a silently-swallowed unhandled promise
 * rejection instead of an error the user could see.
 */
export function targetRanges(base: BaseLoadout[], maxTargets: Target[]): TargetRange[] {
    return maxTargets.map((t) => {
        let lo = Infinity, hi = -Infinity;
        for (const b of base) {
            const v = targetValue(t, b.stats, b.skillDamage);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        return { t, lo, hi };
    });
}

/** Merge several partial `targetRanges` results (one per worker thread) into
 * the true global range per target — every input must list the same targets
 * in the same order (true here since every worker is given the same
 * `config.targets`). */
export function mergeRanges(parts: TargetRange[][]): TargetRange[] {
    if (parts.length === 0) return [];
    return parts[0].map((first, i) => {
        let lo = Infinity, hi = -Infinity;
        for (const part of parts) {
            if (part[i].lo < lo) lo = part[i].lo;
            if (part[i].hi > hi) hi = part[i].hi;
        }
        return { t: first.t, lo, hi };
    });
}

/** Score (composite normalized-sum of maximize targets, or a flat ATK
 * fallback with none set), sort (meets-minimums first, then score), and take
 * the top N from a set of base loadouts — given the (possibly
 * globally-merged, see `mergeRanges`) per-target ranges to normalize
 * against. The final step of both the single-threaded and parallel paths.
 */
export function scoreAndRank(base: BaseLoadout[], ranges: TargetRange[], topN: number): Loadout[] {
    const loadouts: Loadout[] = base.map((b) => {
        let score: number;
        if (ranges.length > 0) {
            score = ranges.reduce((acc, r) => {
                const v = targetValue(r.t, b.stats, b.skillDamage);
                const n = r.hi > r.lo ? (v - r.lo) / (r.hi - r.lo) : 1;
                return acc + n;
            }, 0);
        } else {
            score = b.stats.atk ?? 0; // no maximize targets → rank by ATK as a sensible default
        }
        return { ...b, score, meets: b.failed.length === 0 };
    });
    loadouts.sort((a, b) => (Number(b.meets) - Number(a.meets)) || (b.score - a.score));
    return loadouts.slice(0, Math.max(1, topN));
}

/** Single-threaded reference path — same composable pieces the worker pool
 * uses, just run in one pass. Still used for small gear pools and as the
 * fallback when Web Workers aren't available. */
export function optimize(c: CharacterEntry, pool: GearEntry[], config: OptimizeConfig): Loadout[] {
    const k = gearSlotsFor(pool.length);
    const combos = combinations(pool, k).filter((combo) => withinCostBudget(combo, config.maxTotalCost));
    const maxTargets = config.targets.filter((t) => t.mode === 'max');
    const base = computeBaseLoadouts(c, combos, config);
    const ranges = targetRanges(base, maxTargets);
    return scoreAndRank(base, ranges, config.topN);
}
