/**
 * @fileoverview Serializable game-data bundle contract
 * @module shared/types/game-bundle
 *
 * The single source of truth for the renderer-ready game data that crosses the
 * IPC boundary. The backend game packages assemble a `GameBundle` per game and
 * the game-loader serves it; the renderer consumes it directly (its data types
 * are aliases of the entries here). This is intentionally self-contained (no
 * heavy imports) so the renderer can import the types without pulling in the
 * kernel/zod/eventemitter dependencies of shared/types/index.ts.
 *
 * WHY separate from GameDefinition: GameDefinition is the static rules contract
 * (equipment schema, OCR regexes, combat multipliers, set bonuses). GameBundle
 * is the fully-assembled, UI-facing payload (rosters with per-character skills,
 * a stat catalog, sample gear with rolled stats, enemies, buffs, talents) that
 * the UI renders without further computation.
 */

/** A stat the game exposes to the UI. Drives every stat-driven surface. */
export interface StatDef {
    key: string;
    label: string;
    /** Rendered with a % suffix. */
    percent?: boolean;
}

export interface SkillDef {
    id: string;
    name: string;
    type: string; // Basic / Skill / Ultimate / Forte / Normal / Burst ...
    /** Overrides `type` for buff-scope matching only — see `CharacterSkill.scope` in `shared/types/game-definition.ts` for why the two can diverge. */
    scope?: string;
    description: string;
    /** Multiplier at a reference talent level (fallback when no table). */
    multiplier: number;
    /** Which stat this skill scales off. Defaults to 'atk'. */
    scaling?: 'atk' | 'hp' | 'def' | 'em';
    /** Damage element (for reactions/element bonus). Defaults to the character's element. */
    element?: string;
    /** Reuse timer in seconds — see `CharacterSkill.cooldown` for the full doc. */
    cooldown?: number;
    /**
     * Talent-level multiplier table, indexed by (talentLevel - 1). When present,
     * the engine uses `multipliers[level-1]` instead of `multiplier`.
     */
    multipliers?: number[];
    /** Icon path relative to the game package (art added later). */
    icon?: string;
    /**
     * True when this entry was auto-filled from the game-wide generic action
     * table rather than authored precisely for this character (e.g. a
     * character has precise Skill/Burst data but no precise Normal Attack —
     * the engine backfills Normal Attack generically so it's still a usable
     * optimization target, but the multiplier isn't character-verified).
     */
    approx?: boolean;
    /**
     * Ceiling for a user-configurable "stack count" this skill's damage scales
     * with, on top of its base `multiplier`/`multipliers` — a DIFFERENT axis
     * from talent level (e.g. Eula's Lightfall Sword: base DMG + stacks ×
     * DMG-per-stack, up to 30 stacks gained from her own hits during its
     * window). Present ONLY on skills with a genuine in-game stack mechanic;
     * absent means "no stack scaling" (the common case), not "0 stacks".
     * Effective multiplier = `multiplier(s)At(level) + stacks * perStack(s)At(level)`.
     * The user's chosen stack count defaults to `stackMax` when unset — same
     * "assume best-case/max stacks" convention already used for buffs — and is
     * configurable via a Calculator stepper next to this skill.
     */
    stackMax?: number;
    /** Per-stack multiplier at a reference talent level (fallback when no table). Required when `stackMax` is set. */
    stackMultiplier?: number;
    /** Talent-level per-stack-multiplier table, same indexing as `multipliers`. */
    stackMultipliers?: number[];
    /**
     * A skill whose own damage is the SUM of two independently-scaled terms
     * (not a single motion value against one stat) — e.g. Nahida's Tri-Karma
     * Purification: `ATK x atkMult(level) + EM x emMult(level)`, two separate
     * labeled/leveled genshin-db params, not one multiplier applied to a
     * blended stat. Present ONLY when the source text gives two distinct
     * motion-value tables for the SAME damage instance. `scaling2` names the
     * second stat; `multiplier2`/`multipliers2` mirror `multiplier`/
     * `multipliers`' table-or-scalar shape for its own level scaling.
     * Effective damage = `scaleStat(level) + stats[scaling2] * mult2(level)`
     * (added inside `skillDamage`'s own scaling term, before crit/DMG%/enemy
     * mitigation — same treatment as the primary term, since it's the SAME hit).
     */
    scaling2?: 'atk' | 'hp' | 'def' | 'em';
    /** Second-term multiplier at a reference talent level (fallback when no table). Required when `scaling2` is set. */
    multiplier2?: number;
    /** Talent-level table for the second scaling term, same indexing as `multipliers`. */
    multipliers2?: number[];
    /**
     * Per-stack multiplier for the SECOND scaling term, mirroring
     * `stackMultiplier`/`stackMultipliers` exactly but applied to `scaling2`'s
     * term instead of the primary one — for a skill where BOTH terms of a
     * dual-stat hit repeat per stack (e.g. Alhaitham's Projection Attack: each
     * consumed mirror adds one more full ATK+EM instance, not just an ATK
     * bump). Only meaningful when both `stackMax` and `scaling2` are set;
     * absent means the second term does not scale with stacks (the common
     * case for skills that happen to have both fields).
     */
    stackMultiplier2?: number;
    /** Talent-level per-stack-multiplier table for the second term, same indexing as `multipliers2`. */
    stackMultipliers2?: number[];
}

/**
 * A self-buff entry that may be unconditional (`conditional:false`, auto-
 * applies) or opt-in (`conditional:true`, a manual Calculator/Rotation
 * Builder toggle) — shared shape used by `ConstellationNode.selfBuffs`,
 * `CharacterEntry.selfBuffs`, `WeaponEntry.selfBuffs`, and
 * `GearEntry.selfBuffs`.
 */
export interface ConditionalSelfBuff {
    stat: string;
    label: string;
    value: number;
    conditional?: boolean;
    appliesTo?: string[];
    scaleOff?: BuffEntry['scaleOff'];
    stacksMax?: number;
    /**
     * Present ONLY for the clean "N seconds after casting skill X" pattern —
     * lets the Rotation Builder auto-compute this buff's uptime instead of
     * requiring a manual toggle. Absent for stance/stack/HP-threshold-gated
     * buffs (permanently manual-toggle-only, not a placeholder — see
     * `docs/superpowers/specs/2026-07-19-rotation-builder-overhaul-design.md`
     * Section 3 for the full scoping rationale).
     */
    autoTrigger?: { skillIds: string[]; durationSeconds: number };
    /**
     * Restricts this buff to specific wielders (`CharacterEntry.name` exact
     * match), same convention as `SetBonusEntry.restrictedToCharacters` —
     * e.g. an echo's main-slot bonus that only applies to certain
     * characters (WW's "Adam Smasher" echo → Lucy/Rebecca only). Absent =
     * applies to any wielder.
     */
    restrictedToCharacters?: string[];
}

/** One Constellation (GI) / Sequence (WW) node — read-only flavor + effect text. */
export interface ConstellationNode {
    /** 1-6. */
    level: number;
    name: string;
    description: string;
    /**
     * GI-only: when this node's effect is "Increases the Level of <skill> by 3, max
     * 15" (C3/C5's universal pattern), the skill id whose effective talent level
     * should be boosted by 3 (capped at 15) once the character's constellation is at
     * or above this node's level. Absent when this node isn't a level-boost (most
     * nodes) or the skill couldn't be identified (see [[constellation-sequence-data]]).
     */
    boostsSkillId?: string;
    /**
     * SELF stat buffs this node grants the character once unlocked (constellation
     * level >= this node's level). Unconditional (`conditional:false`) auto-apply;
     * conditional are opt-in Calculator toggles, same two-tier model as
     * `WeaponEntry.selfBuffs`. `appliesTo` scopes a DMG% buff to attack types.
     */
    selfBuffs?: ConditionalSelfBuff[];
    /** PARTY-WIDE buffs this node deploys (support characters), same shape as `WeaponEntry.buffs`. */
    buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff']; stacksMax?: number; autoTrigger?: { skillIds: string[]; durationSeconds: number } }>;
}

export interface CharacterEntry {
    kind: 'character';
    id: string;
    name: string;
    element: string;
    weaponType: string;
    rarity: number;
    /** Canonical camelCase stat keys (atk, critRate, <element>Dmg, …). */
    stats: Record<string, number>;
    skills: SkillDef[];
    equipped: { weaponId?: string; gearIds: string[] };
    /** True when base stats are rarity-defaults (no per-character data in the module). */
    approx?: boolean;
    /** Icon path relative to the game package (art added later). */
    icon?: string;
    /**
     * Constellation (GI) / Sequence (WW) nodes 1-6, read-only flavor text. NOT applied
     * to damage calc — the Calculator's stat model is gear+buffs only (see
     * `sequence`/`setSequence` in calcStore, which is a display-only level tracker
     * today). Absent when not yet imported for this character.
     */
    constellations?: ConstellationNode[];
    /**
     * SELF stat buffs from the character's own (non-weapon, non-constellation)
     * passive talents — e.g. Zhongli's "Dominance of Earth" (Normal/Charged/
     * Plunge/Skill/Burst DMG scaled by his own Max HP). Same two-tier model as
     * `WeaponEntry.selfBuffs`: unconditional (`conditional:false`) auto-apply,
     * conditional are opt-in Calculator toggles. Distinct from `constellations[].
     * selfBuffs` (those require the constellation to be unlocked); these are
     * always available regardless of constellation level (ascension-gated in the
     * real game, which this calc doesn't track separately).
     */
    selfBuffs?: ConditionalSelfBuff[];
}

export interface WeaponEntry {
    kind: 'weapon';
    id: string;
    name: string;
    weaponType: string;
    rarity: number;
    baseAtk: number;
    secondaryStat: string;
    secondaryValue: number;
    /** Weapon passive, human-readable. */
    passive?: string;
    /**
     * TEAM buffs the weapon passive deploys to the party (support weapons).
     * `appliesTo` scopes a DMG% bonus to specific attack types (per-member, applied
     * the same way as a scoped BuffEntry — see `appliesTo` above).
     */
    buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff']; stacksMax?: number; autoTrigger?: { skillIds: string[]; durationSeconds: number } }>;
    /**
     * SELF buffs the weapon passive grants the wielder (best-effort, R1). Surfaced
     * as opt-in toggles in the Calculator (default OFF, since many are conditional);
     * in the Rotation Builder they become trigger-conditional. Unconditional entries
     * (`conditional: false`, from the game's addProps) auto-apply; conditional ones are toggles.
     */
    selfBuffs?: ConditionalSelfBuff[];
    /**
     * Stat conversions the passive grants: `to` gains `pct`% of the wielder's final
     * `from` stat (e.g. Staff of Homa ATK += 0.8% of Max HP; Scarlet Sands ATK += 52%
     * of Elemental Mastery). Applied on final stats in `computeBuildStats`, so they
     * read post-buff HP/EM/DEF. Auto-applied (the always-on portion of the passive).
     */
    conversions?: Array<{ from: string; to: string; pct: number; label?: string }>;
    /** Icon path relative to the game package (art added later). */
    icon?: string;
}

export interface GearEntry {
    kind: 'echo' | 'artifact';
    id: string;
    name: string;
    setName: string;
    rarity: number;
    cost?: number;  // WuWa echoes
    slot?: string;  // GI artifacts
    mainStat: { key: string; label: string; value: number };
    subStats: Array<{ key: string; label: string; value: number }>;
    /** Icon path relative to the game package (art added later). */
    icon?: string;
    /**
     * SELF buffs a specific named gear piece's own active skill grants the
     * wielder (WW: an echo's "Echo Skill"; distinct from its Sonata Set
     * bonus). Looked up dynamically by `name` (not baked in at instance-
     * creation time), same two-tier model as `WeaponEntry.selfBuffs`:
     * unconditional (`conditional:false`) auto-apply, conditional are opt-in
     * Calculator toggles. Present only for the specific named pieces this
     * has been sourced for — most gear has none.
     */
    selfBuffs?: ConditionalSelfBuff[];
}

export interface EnemyEntry {
    id: string;
    name: string;
    level: number;
    def: number;
    res: number; // percent
    /** Icon path relative to the game package (art added later). */
    icon?: string;
}

export interface BuffEntry {
    id: string;
    name: string;
    source: string;
    stat: string;
    value: number;
    /** Optional human description of where the buff comes from / conditions. */
    description?: string;
    /**
     * Per-attack-type scoping. When present, this buff is a DMG% bonus that
     * applies ONLY to skills whose type/id matches one of these tokens
     * (e.g. ['basic'], ['heavy'], ['skill'], ['plunge']). Scoped buffs are NOT
     * folded into global stats; the engine adds `value`% to the elemental-DMG
     * term for matching skills only. Absent → a normal global stat buff.
     * Used for outros like Sanhua (Basic-Attack DMG) / Mortefi (Heavy-Attack DMG)
     * / Taoqi (Resonance-Skill DMG) that amp a single attack type.
     */
    appliesTo?: string[];
    /**
     * If present, `value` is a fallback/typical-investment estimate — the buff's
     * real magnitude scales with the SOURCE character's own stat (e.g. Bennett's
     * ATK bonus is a % of his own Base ATK, not a fixed number). Only resolved
     * for `data.buffs.character` (kit) entries at party-effect time, since only
     * there do we know the source's own equipped gear/weapon — see
     * `resolveScaledValue` in `src/renderer/src/lib/party.ts`.
     */
    scaleOff?: {
        sourceStat: 'atk' | 'elementalMastery' | 'energyRegen' | 'hp' | 'def' | 'critRate' | 'critDmg';
        /**
         * 'base' = char+weapon base ATK only (excludes artifacts). 'total' = the
         * SOURCE's own fully computed stat. 'partyMax' = the highest `sourceStat`
         * value across ALL resolved party members (including the source) — for
         * "shares whichever ally has the most X" mechanics (e.g. Nahida's EM
         * share), not just the source's own stat.
         */
        basis: 'base' | 'total' | 'partyMax';
        ratio: number;
        cap?: number;
        /**
         * Subtracted from the source stat BEFORE multiplying by `ratio`, clamped
         * to 0 (never negative) — for "each 1% ER ABOVE 100%" style effects
         * (Raiden Shogun, Neuvillette) where the bonus is 0 until a threshold is
         * crossed, not proportional to the raw stat from zero.
         */
        offset?: number;
    };
    /**
     * WW only — this buff additionally requires the TARGET to currently
     * carry one of these reaction/negative-status debuffs (e.g. Spectro
     * Frazzle, Aero Erosion), gated live against the Calculator's "Target
     * has: ..." reference toggles (`calcStore.targetStatuses`) rather than
     * left as an unstated assumption in the description text. OR-matched —
     * true if ANY listed status is currently toggled on. Distinct from
     * `appliesTo`, which scopes by the ATTACKER's own move type (Basic/
     * Skill/Outro/etc) and has no notion of the target's state at all; a
     * buff can carry both (e.g. "Outro DMG, but only to a Frazzled
     * target" is `appliesTo: ['outro']` + `requiresTargetStatus: ['frazzle']`
     * — the AND of an attack-type condition and a target-state condition,
     * which neither field alone can express).
     */
    requiresTargetStatus?: string[];
}

/**
 * An equipment set's bonus, projected from the game module's set-bonus table
 * into concrete stat buffs the engine can apply. Used by Party Setup to deploy
 * a party member's set effect (e.g. Noblesse Oblige's team ATK%).
 */
export interface SetBonusEntry {
    name: string;
    /** Piece count required for the FULL bonus below (GI 4-pc, WuWa 5-pc). */
    pieces: number;
    /** The full-set bonus: the 2-piece tier COMBINED with the 4pc/5pc set
     * effect — what a build running this as its ONLY set (all `pieces`
     * slots) deploys. `appliesTo` scopes a per-attack-type DMG% buff. */
    buffs: Array<{ stat: string; label: string; value: number; appliesTo?: string[] }>;
    /** Just the 2-piece tier, separate from the full-set effect above — what
     * a build running this alongside ANOTHER set (2pc + 2pc, splitting the
     * available slots) actually gets from THIS set alone, since 5 total
     * slots split two ways can never reach the full 4pc/5pc threshold on
     * both. Used by the Calculator's "Set bonus" optimizer constraint when
     * 2 sets are selected. */
    twoPieceBuffs: Array<{ stat: string; label: string; value: number; appliesTo?: string[] }>;
    /** Just the top-up gained AT the full 4pc/5pc threshold, on top of
     * (not merged with) `twoPieceBuffs` — display-only, so the picker can
     * show "2pc: X" and "5pc: Y" as the two genuinely additive tiers a
     * player sees in-game, instead of `buffs`' pre-summed total (which
     * would otherwise silently double-count the 2pc portion next to a
     * separately-shown 2pc row). */
    fullSetOnlyBuffs: Array<{ stat: string; label: string; value: number; appliesTo?: string[] }>;
    /** When set, this set's bonus is a character-exclusive collab mechanic
     * (e.g. WuWa's "Shadow of Shattered Dreams," which only functions for
     * Rebecca/Lucy) — real in-game, not a data gap. Names match
     * `CharacterEntry.name` exactly, same convention as kit buffs' `source`
     * field. `activeSetName` and any manual set-bonus selection must treat
     * this set as inert for every other character, even at full piece count. */
    restrictedToCharacters?: string[];
}

export interface PassiveEntry {
    id: string;
    name: string;
    description: string;
    /** Icon path relative to the game package (art added later). */
    icon?: string;
}

// ── Gear catalog: the rules for creating owned echoes/artifacts ──────────────

export interface StatRange {
    min: number;
    max: number;
}

/** A main-stat option. Its value is auto-set to a fixed max per rarity. */
export interface GearMainStat {
    key: string;
    label: string;
    percent?: boolean;
    /** rarity → the fixed (max) value the main stat takes at that rarity. */
    byRarity: Record<number, number>;
}

/** A sub-stat option. Its value is user-tuned within [min, max] per rarity. */
export interface GearSubStat {
    key: string;
    label: string;
    percent?: boolean;
    /** rarity → allowed value range. */
    byRarity: Record<number, StatRange>;
}

/** A gear slot: GI's five artifact slots, or WuWa's echo cost tiers. */
export interface GearSlot {
    id: string;
    label: string;
    /** WuWa echo cost this slot represents (undefined for GI). */
    cost?: number;
    /** Main-stat keys allowed on this slot. */
    mainStats: string[];
    /**
     * WuWa mechanic: every echo carries one "base" sub-stat whose TYPE is
     * fixed by cost tier (never a roll) — flat HP for cost 1, flat ATK for
     * cost 3/4 — shown separately from the genuinely random sub-stats. Its
     * catalog `GearSubStat.key` here; undefined where no such mechanic
     * exists (GI's slots).
     */
    lockedSubStat?: string;
    /**
     * The base stat's VALUE, keyed by rarity — unlike a regular sub-stat,
     * this is a fully DETERMINISTIC number (confirmed against real
     * community-datamined sources, cross-checked across 2 independent
     * sites), not a min/max roll: every 5★ cost-4 echo has exactly 150 flat
     * ATK as its base stat, no variance. Undefined where `lockedSubStat` is
     * (no base-stat mechanic).
     */
    baseStatByRarity?: Record<number, number>;
    /**
     * WuWa mechanic: a main stat's value genuinely differs by cost tier even
     * for the SAME stat type — e.g. 5★ ATK% is 18% at cost 1, 30% at cost 3,
     * 33% at cost 4 — so a single shared `GearMainStat.byRarity` table
     * (correct for GI, where main values don't vary by slot) can't represent
     * WuWa correctly. When a key here has an entry, it OVERRIDES that
     * stat's `byRarity` for this slot only; falls back to the shared table
     * for any key not listed (GI's slots need no overrides at all).
     */
    mainStatOverrides?: Record<string, Record<number, number>>;
}

/**
 * Everything needed to CREATE an owned echo/artifact: which sets/slots exist,
 * which stats can be main vs sub, and the per-rarity value bounds. The user's
 * add-gear flow renders from this; the main stat auto-maxes to `mains.byRarity`,
 * and each chosen sub stat is bounded by `subs.byRarity[rarity]`.
 */
export interface GearCatalog {
    rarities: number[];
    /** Max number of sub-stats an item can carry. */
    maxSubStats: number;
    /**
     * Whether a sub-stat may be the SAME stat as the main stat. True for
     * Wuthering Waves (e.g. Crit DMG main + Crit DMG sub is legal); false for
     * Genshin Impact (a sub-stat can never duplicate the main stat).
     */
    subStatsCanRepeatMain: boolean;
    /** `icon` is a path relative to the game package's `icons/` folder — undefined for a set with no sourced art yet (falls back to placeholder). */
    sets: Array<{ id: string; name: string; icon?: string }>;
    slots: GearSlot[];
    mains: GearMainStat[];
    subs: GearSubStat[];
    /**
     * The real in-game cap on the SUM of all equipped pieces' `GearSlot.cost`
     * (WuWa: 12, across exactly 5 echoes whose individual costs are 1/3/4 —
     * e.g. 4+3+3+1+1). Undefined for games with no cost concept (GI), where
     * the optimizer applies no total-cost constraint at all.
     */
    maxTotalCost?: number;
}

/**
 * The authored parts of a bundle that the game MODULE doesn't define — passed
 * to `buildGameBundle` alongside the module data. `gearRanges` supplies the
 * gear slots/mains/subs/rarities (the module supplies `maxSubStats` + `sets`).
 */
export interface GameCatalogSupplements {
    gearRanges: Omit<GearCatalog, 'maxSubStats' | 'sets'>;
    statCatalog: StatDef[];
    enemies: EnemyEntry[];
    buffs: { basic: BuffEntry[]; character: BuffEntry[] };
    passives: PassiveEntry[];
    /** Optional set-name -> icon-path lookup, merged into `gearCatalog.sets` at derive time (see `buildGameBundle`). A set with no entry here falls back to placeholder art. */
    setIcons?: Record<string, string>;
}

/** The complete, UI-ready data payload for one game. */
export interface GameBundle {
    id: string;
    gearKind: 'echo' | 'artifact';
    gearLabel: string;
    gearLabelPlural: string;
    /** Equipment slots per character. */
    maxGear: number;
    /** "Sequence" (WuWa) / "Constellation" (GI). */
    sequenceLabel: string;
    sequenceMax: number;
    /** Number of teammates that join the active character in a party (WuWa 2, GI 3). */
    partyTeammates: number;
    /** The one character a fresh save owns (WuWa: Rover; GI: Traveler). */
    starterCharacterId: string;
    /** Rules for creating owned echoes/artifacts (stat ranges per rarity). */
    gearCatalog: GearCatalog;
    /**
     * True if the game has an elemental-reaction system (Genshin's Vaporize/
     * Melt/Aggravate/Spread). Wuthering Waves has no such mechanic — the
     * Calculator hides the reaction picker when this is false.
     */
    supportsReactions: boolean;
    /** Ordered stats this game exposes. */
    statCatalog: StatDef[];
    characters: CharacterEntry[];
    weapons: WeaponEntry[];
    gear: GearEntry[];
    /** Boss targets (the renderer prepends a universal Training Dummy). */
    enemies: EnemyEntry[];
    /** Basic (generic) + character/team-sourced buffs. */
    buffs: { basic: BuffEntry[]; character: BuffEntry[] };
    /** Passive skills for the Talents window. */
    passives: PassiveEntry[];
    /** Equipment set bonuses (from the module), as deployable stat buffs. */
    setBonuses: SetBonusEntry[];
}
