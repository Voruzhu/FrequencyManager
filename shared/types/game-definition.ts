/**
 * @fileoverview Game-agnostic GameDefinition contract
 * @module shared/types/game-definition
 *
 * A `GameDefinition` describes everything that is game-specific (vocabulary,
 * OCR rules, set bonuses, combat actions, scaling). The OCR scanner and damage
 * calculator modules read from this contract and become game-agnostic.
 *
 * WHY: FrequencyManager originally targeted Wuthering Waves only. To support
 * Genshin Impact (or any other similar gacha-game) without forking the kernel,
 * we extract every game-specific constant into a typed definition. Each game
 * ships its own package under `games/<game-id>/` that exports one of these.
 *
 * The canonical game-agnostic vocabularies (ElementType, WeaponType, StatType)
 * live here so all game packages can share them. The GameDefinition specifies
 * the *subset* of each that is valid in that particular game.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical game-agnostic vocabularies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical elements used across all supported games. Each game picks a
 * subset via `GameDefinition.character.elements`.
 *
 * Wuthering Waves uses: Glacio, Fusion, Electro, Aero, Spectro, Havoc, Physical.
 * Genshin Impact uses:  Cryo, Pyro, Electro, Anemo, Geo, Dendro, Physical.
 *
 * The shared string ids for the cross-game elements intentionally share names
 * where possible (Electro, Physical). For game-specific elements (WU's
 * Spectro/Havoc, GI's Geo/Dendro) we just declare them as additional literals.
 */
export type ElementType =
    | 'Glacio'      // WU
    | 'Fusion'      // WU
    | 'Electro'     // both
    | 'Aero'        // WU
    | 'Spectro'     // WU
    | 'Havoc'       // WU
    | 'Cryo'        // GI
    | 'Pyro'        // GI
    | 'Anemo'       // GI
    | 'Geo'         // GI
    | 'Dendro'      // GI
    | 'Hydro'       // GI
    | 'Physical';   // both

/**
 * Canonical weapon classes used across all supported games.
 *
 * WU uses: Sword, Broadblade, Pistols, Gauntlets, Rectifier.
 * GI uses: Sword, Claymore, Polearm, Bow, Catalyst.
 */
export type WeaponType =
    | 'Sword'       // both
    | 'Broadblade'  // WU
    | 'Pistols'     // WU
    | 'Gauntlets'   // WU
    | 'Rectifier'   // WU
    | 'Claymore'    // GI
    | 'Polearm'     // GI
    | 'Bow'         // GI
    | 'Catalyst';   // GI

/**
 * Canonical stat types used across all supported games. The damage
 * calculator's stat-application switch keys off this vocabulary so it does
 * not need to be re-implemented per game.
 */
export type StatType =
    | 'ATK'
    | 'ATK%'
    | 'HP'
    | 'HP%'
    | 'DEF'
    | 'DEF%'
    | 'CRIT Rate'
    | 'CRIT DMG'
    | 'Energy Regen'
    | 'Elemental Mastery'
    | 'Healing Bonus'
    | 'Physical DMG Bonus'
    | 'Effect Hit Rate'
    | 'Effect RES';

// ─────────────────────────────────────────────────────────────────────────────
// Equipment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Definition of an equipment slot's main stat slot, sub-stat capacity, and
 * maximum level. Both WU echoes and GI artifacts follow the same structure:
 * one main stat + N sub-stats, scalable by level, with set bonuses.
 */
export interface EquipmentDefinition {
    /** Human-readable slot label, e.g. "Echo" (WU) or "Artifact" (GI). */
    slotLabel: string;
    /** Human-readable plural, e.g. "Echoes" or "Artifacts". */
    slotLabelPlural: string;
    /** Maximum number of sub-stats per equipment piece. */
    maxSubStats: number;
    /** Maximum level an equipment piece can reach. */
    maxLevel: number;
    /** Stat types that may appear as the main stat. */
    allowedMainStatTypes: StatType[];
    /** Allowed cost values (WU has 1-4; GI has no cost). Empty = no cost. */
    allowedCosts: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Character
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single per-character skill (Normal/Charged/Skill/Burst, or WuWa
 * Forte/Outro/Intro). Precise damage needs the scaling stat and, ideally, a
 * talent-level multiplier table. When a character defines its own skills the
 * derived bundle uses them; otherwise it falls back to the game-wide combat
 * actions (which scale off ATK with a single multiplier).
 */
export interface CharacterSkill {
    /** Stable id, e.g. 'na', 'charged', 'skill', 'burst', 'forte', 'outro'. */
    id: string;
    name: string;
    /** Category label: 'Normal' | 'Charged' | 'Skill' | 'Burst' | 'Forte' | … */
    type: string;
    /**
     * Overrides `type` for buff-scope matching only (`appliesTo`/`canonScope` in
     * `shared/calc/optimizer.ts`) — NOT for Talents-window grouping, which
     * always uses `type` (see `src/renderer/src/data/talentGroups.ts`). Needed
     * because WW occasionally reclassifies a character's Forte-Circuit-
     * exclusive signature move as a different DMG family for buff purposes
     * (e.g. "considered as Resonance Liberation DMG") while it still levels
     * and displays under the Forte Circuit talent — a single `type` field
     * can't represent both facts when they diverge. Omit when `type` already
     * matches the real buff-scope (the common case).
     */
    scope?: string;
    /** Stat the skill scales off. Defaults to 'atk'. */
    scaling?: 'atk' | 'hp' | 'def' | 'em';
    /** Damage element. Defaults to the character's element. */
    element?: string;
    /** Reuse timer in seconds — how long before this skill can be cast again, NOT how long casting it takes (no cast-time data exists anywhere in this project's sources). Undefined for skills with no real cooldown (most Basic Attacks). */
    cooldown?: number;
    /** Multiplier per talent level, indexed by (level - 1). Preferred. */
    multipliers?: number[];
    /** Single multiplier fallback when no per-level table is provided. */
    multiplier?: number;
    /**
     * Ceiling for a user-configurable stack count this skill's damage scales
     * with ON TOP of `multiplier`/`multipliers` — a different axis from talent
     * level (e.g. Eula's Lightfall Sword: base DMG + stacks × DMG-per-stack, up
     * to 30). See `shared/types/game-bundle.ts`'s `SkillDef.stackMax` doc for
     * the full mechanic and the "assume max stacks" default convention.
     */
    stackMax?: number;
    /** Per-stack multiplier at a reference talent level. Required when `stackMax` is set. */
    stackMultiplier?: number;
    /** Talent-level per-stack-multiplier table, same indexing as `multipliers`. */
    stackMultipliers?: number[];
    /**
     * Second independently-scaled additive term for a skill whose damage is
     * the SUM of two motion values against two different stats (e.g. Nahida's
     * Tri-Karma: ATK term + EM term). See `SkillDef.scaling2` doc for the
     * full mechanic.
     */
    scaling2?: 'atk' | 'hp' | 'def' | 'em';
    /** Second-term multiplier at a reference talent level. Required when `scaling2` is set. */
    multiplier2?: number;
    /** Talent-level table for the second scaling term, same indexing as `multipliers`. */
    multipliers2?: number[];
    /** Per-stack multiplier for the SECOND scaling term — see `SkillDef.stackMultiplier2` doc. */
    stackMultiplier2?: number;
    /** Talent-level per-stack-multiplier table for the second term, same indexing as `multipliers2`. */
    stackMultipliers2?: number[];
}

/**
 * Definition of a character within the game. Both WU and GI characters share:
 *   - an element
 *   - a weapon class
 *   - base ATK / HP / DEF at level 1
 *   - crit / energy / ascension
 *   - ascension steps 0..maxAscension (0-indexed; max is usually 6)
 */
export interface CharacterDefinition {
    /** All element ids used by the game, e.g. ["Glacio","Fusion","Electro"] */
    elements: ElementType[];
    /** All weapon class ids used by the game. */
    weapons: WeaponType[];
    /** Maximum character level (WU: 90, GI: 90). */
    maxLevel: number;
    /** Maximum ascension tier (WU: 6, GI: 6). */
    maxAscension: number;
    /**
     * Per-ascension stat multiplier bonus (0..maxAscension inclusive).
     * Each entry is the additive % bonus applied to ATK/HP/DEF.
     * Length must equal maxAscension + 1.
     */
    ascensionBonus: { atk: number; hp: number; def: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Combat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single combat action type. Each game defines its own canonical actions
 * (WU: Resonance Skill/Liberation/Forte; GI: Normal/Charged/Skill/Burst).
 * Multipliers and energy deltas feed the rotation generator.
 */
export interface CombatActionDefinition {
    /** Canonical action id, used as an event payload field. */
    id: string;
    /** Human-readable label for UI rendering. */
    label: string;
    /** Damage multiplier applied to final ATK. */
    multiplier: number;
    /** Concerto / energy delta contributed to the rotation counter. */
    energy: number;
    /** Time this action occupies in the rotation, in seconds. */
    duration: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OCR parsing rules. The OCR scanner reads these to know which set names
 * and stat labels are valid in the current game.
 */
export interface OcrRules {
    /**
     * Regex source (no surrounding slashes) that matches the very first
     * capitalized word sequence in a screenshot — used to identify the
     * equipment name.
     */
    namePattern: string;
    /**
     * Regex source matching a "Cost: N" label. Use empty string to disable.
     */
    costPattern: string;
    /**
     * Regex source matching the main-stat row. Must have two capture groups:
     * (1) stat label, (2) numeric value.
     */
    mainStatPattern: string;
    /**
     * Regex source for sub-stats. Must have two capture groups: label, value.
     * Use the global flag.
     */
    subStatPattern: string;
    /**
     * List of canonical set names for this game. The OCR parser will look
     * for one of these as a substring of the OCR text to populate the
     * `setName` field.
     */
    setNames: string[];
    /**
     * Regex source matching the equipment's displayed "+N" upgrade level.
     * One capture group: the numeric level. Omit to skip level extraction.
     */
    levelPattern?: string;
    /**
     * Regex source matching an "Equipped by X" label. One capture group: the
     * character's display name. Omit to skip equipped-by extraction.
     */
    equippedByPattern?: string;
    /**
     * Substring (case-insensitive) to match against OS window titles, used to
     * target OCR screen capture at this specific game's window instead of
     * whichever window currently has focus. Omit if the game has no
     * consistent native window title, or to fall back to full-screen capture.
     */
    windowTitleHint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Set bonuses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single set bonus definition. Maps the set name to the stat bonuses it
 * provides. The damage calculator applies these to the character before
 * computing final stats.
 *
 * Stats use the canonical `StatType` vocabulary so the same engine works
 * for both games.
 */
export interface SetBonusDefinition {
    name: string;
    bonuses: {
        /** Elemental damage bonus by element id (percent). */
        elementalDmgBonus?: Partial<Record<ElementType, number>>;
        /** ATK % bonus. */
        atkPercent?: number;
        /** HP % bonus. */
        hpPercent?: number;
        /** DEF % bonus. */
        defPercent?: number;
        /** Energy regen bonus. */
        energyRegen?: number;
        /** Healing bonus %. */
        healingBonus?: number;
        /** Crit rate %. */
        critRate?: number;
        /** Crit damage %. */
        critDmg?: number;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// GameDefinition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A complete game-specific configuration package. Loaded at boot by the
 * `game-loader` module and injected into the OCR scanner and damage
 * calculator via the kernel config.
 */
export interface GameDefinition {
    /** Unique kebab-case game id, e.g. "wuthering-waves". */
    id: string;
    /** Display name shown to users, e.g. "Wuthering Waves". */
    displayName: string;
    /** Short description for the installer / selector UI. */
    description: string;
    /** Version of the package, semver. */
    version: string;
    /**
     * Minimum app version (semver) required to load this game definition.
      * If absent, the game def is assumed to be compatible with any 1.x.y app.
      *
      * The update-checker module uses this to warn the user before a
      * downloaded game def overrides a local one whose `minAppVersion`
      * exceeds the running app version.
      *
      * Backwards compatibility is OPTIONAL: missing field means "compatible
      * with anything". This avoids breaking older game defs after this
      * field is added.
      */
    minAppVersion?: string;

    /** Equipment schema. */
    equipment: EquipmentDefinition;
    /** Character schema. */
    character: CharacterDefinition;
    /** Combat action vocabulary + multipliers. */
    combat: {
        actions: CombatActionDefinition[];
        /** Length of the default rotation in seconds. */
        defaultRotationLength: number;
    };
    /** OCR parsing rules. */
    ocr: OcrRules;
    /** Set bonus table. */
    sets: SetBonusDefinition[];

    /**
     * Optional list of stat aliases. OCR text may show slightly different
     * spellings ("ATK%" vs "ATK_PERCENT"); this map normalizes them to the
     * canonical `StatType` string.
     */
    statAliases?: Record<string, string>;

    /**
     * UI option lists derived from the game definition. The frontend uses
     * these to populate dropdowns without hardcoding any game-specific
     * vocabulary. Each entry is a flat `{value, label}` pair.
     */
    uiOptions?: {
        /** Characters available for damage calculation, in display order. */
        characters: Array<{ value: string; label: string }>;
        /** Equipment set names for filters/display. */
        setNames: string[];
        /** Weapon classes available in this game. */
        weaponTypes: string[];
        /** Elements available in this game. */
        elements: string[];
        /** Sidebar categories. If omitted, uses app shows all default categories; use hiddenCategories to remove. */
        categories?: Array<{ id: string; label: string; icon?: string }>;
        /** Category ids to hide from defaults. */
        hiddenCategories?: string[];
        /** Inventory sub-tabs. Each game defines its equipment types. */
        inventoryTabs?: Array<{
            id: string;
            label: string;
            slot?: 'characters' | 'weapons' | 'echoes' | 'artifacts';
        }>;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Validation Rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation rules for character stats. These define the legal ranges for
 * base stats and buffed stats. The kernel enforces these on writes; the
 * renderer validates eagerly for instant feedback.
 */
export interface CharacterStatRules {
    /** Base stats per character id (from game DB). */
    baseStats: Record<string, {
        atk: number;
        hp: number;
        def: number;
        critRate: number;
        critDmg: number;
        energyRegen: number;
        elementalMastery?: number;
        healingBonus?: number;
        effectHitRate?: number;
        effectRes?: number;
    }>;
    /** Absolute maximums for any character (buffed). */
    maxStats: {
        atk: number;
        hp: number;
        def: number;
        critRate: number;
        critDmg: number;
        energyRegen: number;
        elementalMastery: number;
        healingBonus: number;
        effectHitRate: number;
        effectRes: number;
    };
}

/**
 * Validation rules for equipment (echoes/artifacts).
 */
export interface EquipmentStatRules {
    /** Maximum main stat value by stat type and cost. Partial — not every game has every stat. */
    mainStatCaps: Partial<Record<StatType, Record<number, number>>>;
    /** Sub-stat caps: max per roll and max total across all sub-stats. */
    subStatCaps: Partial<Record<StatType, {
        maxPerRoll: number;
        maxTotal: number;
    }>>;
}

/**
 * Complete stat validation rules for a game.
 */
export interface StatRules {
    character: CharacterStatRules;
    echoes: EquipmentStatRules;
}

