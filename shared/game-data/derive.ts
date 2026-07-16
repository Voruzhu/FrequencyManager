/**
 * @fileoverview Derive a renderer-ready GameBundle from a game module
 * @module shared/game-data/derive
 *
 * The game modules (adapters/game-definitions/<game>/*) are the source of truth
 * for rosters, weapons, sets, base stats and combat actions. This helper
 * PROJECTS that module data into the UI-facing {@link GameBundle} shape,
 * filling the parts the modules don't define (gear stat ranges, enemies, buffs,
 * passives, stat catalog) from authored supplements passed in by the caller.
 *
 * Skills: when a character has no precise module skills, it's projected with
 * the game's full action set (game-wide multipliers). When a character DOES
 * have precise skills (`skills.ts`) but that list only covers a subset of the
 * game's universal action types (e.g. a character with Skill/Burst data but no
 * authored Normal Attack), the missing ones are BACKFILLED from the game-wide
 * action table — so every character's optimization-target list always covers
 * the full skill set the game exposes (Normal/Charged/Plunge, or WuWa's Heavy/
 * Outro/Intro), whether or not each entry has been precisely authored yet.
 * Backfilled entries are flagged `approx` and inherit the scaling stat from a
 * sibling basic-attack-family skill when one was authored (e.g. Neuvillette's
 * authored Charged Attack scales HP, so a backfilled Normal Attack also scales
 * HP, matching the real character). Characters listed in the roster but
 * missing from the stat DB get rarity default base stats and are flagged
 * `approx` at the character level.
 */

import type {
    GameBundle, GameCatalogSupplements, CharacterEntry, WeaponEntry, SkillDef, SetBonusEntry, ConstellationNode,
} from '../types/game-bundle';
import type { CharacterSkill } from '../types/game-definition';
import { elemKey } from '../calc/optimizer';

// A game module's raw character DB row (WU/GI share these fields).
export interface RawCharacter {
    id: string;
    name: string;
    element: string;
    weapon: string;
    rarity?: number;
    baseAtk: number;
    baseHp: number;
    baseDef: number;
    baseCritRate: number;
    baseCritDmg: number;
    baseEnergyRegen: number;
    baseElementalMastery?: number;
    icon?: string;
    /** Precise per-character skills. When present, used instead of game actions. */
    skills?: CharacterSkill[];
    /** Constellation (GI) / Sequence (WW) nodes 1-6. */
    constellations?: ConstellationNode[];
    /** SELF stat buffs from the character's own passive talents (see CharacterEntry.selfBuffs doc). */
    selfBuffs?: CharacterEntry['selfBuffs'];
}

// A game module's raw weapon DB row.
export interface RawWeapon {
    id: string;
    name: string;
    weaponType: string;
    rarity: number;
    baseAtk: number;
    secondaryStat: string; // StatType, e.g. "CRIT Rate", "ATK%"
    secondaryValue: number;
    passive?: string;
    buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[] }>;
    selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }>;
    conversions?: Array<{ from: string; to: string; pct: number; label?: string }>;
    icon?: string;
}

interface RawAction {
    id: string;
    label: string;
    multiplier: number;
    /** Restricts this action to characters using one of these weapon types (e.g. Aimed Shot → Bow only). Omit = universal. */
    weaponTypes?: string[];
}

/** Map a module StatType string to the display label the optimizer expects. */
export function statTypeToLabel(st: string): string {
    switch (st) {
        case 'CRIT Rate': return 'Crit Rate';
        case 'CRIT DMG': return 'Crit DMG';
        default: return st; // ATK%, HP%, DEF%, Energy Regen, Elemental Mastery, ATK, HP, DEF
    }
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Project the game's combat actions as a fallback character skill list,
 * excluding any action restricted to weapon types this character doesn't use
 * (e.g. Aimed Shot only applies to Bow users).
 */
function actionsAsSkills(actions: RawAction[], weaponType: string): SkillDef[] {
    return actions
        .filter((a) => !a.weaponTypes || a.weaponTypes.includes(weaponType))
        .map((a) => ({
            id: a.id,
            name: a.label,
            type: a.label,
            description: `${a.label} — game action (×${a.multiplier}).`,
            multiplier: a.multiplier,
        }));
}

/** Map a character's precise module skills to renderer SkillDefs. */
function characterSkills(skills: CharacterSkill[], element: string): SkillDef[] {
    return skills.map((s) => {
        const ref = s.multiplier
            ?? (s.multipliers && s.multipliers.length ? s.multipliers[Math.min(9, s.multipliers.length - 1)] : 0);
        const scaleNote = s.scaling && s.scaling !== 'atk' ? ` · scales ${s.scaling.toUpperCase()}` : '';
        return {
            id: s.id,
            name: s.name,
            type: s.type,
            scope: s.scope,
            description: `${s.type}${scaleNote}`,
            multiplier: ref,
            scaling: s.scaling ?? 'atk',
            element: s.element ?? element,
            multipliers: s.multipliers,
            stackMax: s.stackMax,
            stackMultiplier: s.stackMultiplier,
            stackMultipliers: s.stackMultipliers,
            scaling2: s.scaling2,
            multiplier2: s.multiplier2,
            multipliers2: s.multipliers2,
            stackMultiplier2: s.stackMultiplier2,
            stackMultipliers2: s.stackMultipliers2,
        };
    });
}

/** Maps a short precise-skill id (e.g. 'na') to the game-wide action id it backfills from ('normalAttack'). */
export interface BackfillSlot {
    id: string;
    actionId: string;
    /** Restricts this slot to characters using one of these weapon types (e.g. Aimed Shot → Bow only). Omit = universal. */
    weaponTypes?: string[];
}

/**
 * Fill in any universal action types a character's precise skill list omits,
 * using the game-wide action's multiplier and inheriting the scaling stat
 * from a sibling basic-attack-family skill already present (so e.g. a DEF-
 * scaling character's backfilled Charged Attack also scales DEF, not ATK).
 * Slots restricted to weapon types the character doesn't use are skipped
 * (e.g. a Sword character never gets a backfilled Aimed Shot).
 * No-ops when `slots` is empty (i.e. the game passed no backfill table).
 */
function backfillSkills(precise: SkillDef[], fallback: SkillDef[], slots: BackfillSlot[], element: string, weaponType: string): SkillDef[] {
    if (slots.length === 0) return precise;
    const haveIds = new Set(precise.map((s) => s.id));
    const familyIds = new Set(slots.map((s) => s.id));
    const siblingScaling = precise.find((s) => familyIds.has(s.id))?.scaling;
    const extra: SkillDef[] = [];
    for (const slot of slots) {
        if (haveIds.has(slot.id)) continue;
        if (slot.weaponTypes && !slot.weaponTypes.includes(weaponType)) continue;
        const action = fallback.find((f) => f.id === slot.actionId);
        if (!action) continue;
        extra.push({
            id: slot.id,
            name: action.name,
            type: action.type,
            description: `${action.type} — generic value (no precise data authored for this character yet).`,
            multiplier: action.multiplier,
            scaling: siblingScaling ?? 'atk',
            element,
            approx: true,
        });
    }
    return extra.length > 0 ? [...precise, ...extra] : precise;
}

/**
 * Build the full character roster: every name in `roster`, hydrated from
 * `charDB` where possible, else rarity-default stats flagged `approx`.
 */
export function deriveCharacters(
    roster: Array<{ value: string; label: string }>,
    charDB: RawCharacter[],
    actions: RawAction[],
    opts: { defaultElement: string; defaultWeapon: string; hasElementalMastery: boolean; backfill?: BackfillSlot[] },
): CharacterEntry[] {
    return roster.map(({ value, label }) => {
        const db = charDB.find((c) => c.id === value);
        const rarity = db?.rarity ?? 5;
        const dflt = rarity >= 5 ? { atk: 800, hp: 12000, def: 700 } : { atk: 700, hp: 10000, def: 600 };
        const element = db?.element ?? opts.defaultElement;
        const weaponType = db?.weapon ?? opts.defaultWeapon;
        const stats: Record<string, number> = {
            atk: db?.baseAtk ?? dflt.atk,
            hp: db?.baseHp ?? dflt.hp,
            def: db?.baseDef ?? dflt.def,
            critRate: db?.baseCritRate ?? 5,
            critDmg: db?.baseCritDmg ?? 50,
            energyRegen: db?.baseEnergyRegen ?? 100,
            [`${element.toLowerCase()}Dmg`]: 0,
        };
        if (opts.hasElementalMastery) stats.elementalMastery = db?.baseElementalMastery ?? 0;
        // Fallback skill set is weapon-aware (e.g. only Bow characters get Aimed
        // Shot). Precise per-character skills, when the module provides them,
        // are backfilled with any universal action types they don't cover;
        // else the character gets the full game-wide action set for their weapon.
        const fallbackSkills = actionsAsSkills(actions, weaponType);
        const skills = db?.skills && db.skills.length > 0
            ? backfillSkills(characterSkills(db.skills, element), fallbackSkills, opts.backfill ?? [], element, weaponType)
            : fallbackSkills;
        return {
            kind: 'character',
            id: value,
            name: label,
            element,
            weaponType,
            rarity,
            stats,
            skills,
            equipped: { gearIds: [] },
            approx: !db,
            icon: db?.icon,
            constellations: db?.constellations,
            selfBuffs: db?.selfBuffs,
        };
    });
}

/** Maps a module set-bonus stat key to an optimizer stat key + display label. */
const SET_BONUS_STAT: Record<string, { stat: string; label: string }> = {
    atkPercent: { stat: 'atkPct', label: 'ATK%' },
    hpPercent: { stat: 'hpPct', label: 'HP%' },
    defPercent: { stat: 'defPct', label: 'DEF%' },
    critRate: { stat: 'critRate', label: 'Crit Rate' },
    critDmg: { stat: 'critDmg', label: 'Crit DMG' },
    normalCritDmg: { stat: 'critDmg', label: 'Crit DMG' },
    energyRegen: { stat: 'energyRegen', label: 'Energy Regen' },
    elementalMastery: { stat: 'elementalMastery', label: 'Elemental Mastery' },
    healingBonus: { stat: 'healingBonus', label: 'Healing Bonus' },
    // Generic elemental DMG% (used by 4pc/5pc effects that grant all-DMG / RES-shred).
    elemDmg: { stat: 'elemDmg', label: 'Elemental DMG' },
};

interface RawSetBonus {
    name: string;
    /** 2-piece (GI) / 2-piece (WuWa) base bonus. */
    bonuses: Record<string, unknown>;
    /** 4-piece (GI) / 5-piece (WuWa) set effect — the signature bonus. */
    setBonus?: Record<string, unknown>;
    /** Overrides the game's default piece threshold (GI 4, WuWa 5) for sets
     * that activate at a genuinely different count — e.g. WuWa's 1pc/3pc
     * collab sets (only "Shadow of Shattered Dreams" actually needs this;
     * the rest still fit the default 5pc deployment, see the comment at
     * their definition). */
    pieces?: number;
    /** Character-exclusive set — see `SetBonusEntry.restrictedToCharacters`. */
    restrictedToCharacters?: string[];
}

/**
 * Per-attack-type set-bonus keys → the scoped-buff `appliesTo` tokens + a label.
 * Values are DMG% bonuses that apply ONLY to matching attack types (via the
 * engine's scoped-buff path), e.g. Gladiator's 4pc Normal-Attack DMG. Keys end
 * in `Dmg` (NOT `DmgBonus`) so they don't collide with element `{x}DmgBonus`.
 */
const SET_ATTACK_SCOPE: Record<string, { scope: string[]; label: string }> = {
    normalAttackDmg: { scope: ['normal'], label: 'Normal-Atk DMG' },
    chargedAttackDmg: { scope: ['charged'], label: 'Charged-Atk DMG' },
    plungeAttackDmg: { scope: ['plunge'], label: 'Plunge DMG' },
    naCaPlDmg: { scope: ['normal', 'charged', 'plunge'], label: 'NA/CA/Plunge DMG' },
    naCaDmg: { scope: ['normal', 'charged'], label: 'NA/Charged DMG' },
    basicAttackDmg: { scope: ['basic'], label: 'Basic-Atk DMG' },
    heavyAttackDmg: { scope: ['heavy'], label: 'Heavy-Atk DMG' },
    resonanceSkillDmg: { scope: ['skill'], label: 'Res. Skill DMG' },
    skillDmg: { scope: ['skill'], label: 'Skill DMG' },
    liberationDmg: { scope: ['ult'], label: 'Liberation DMG' },
    burstDmg: { scope: ['ult'], label: 'Burst DMG' },
    echoSkillDmg: { scope: ['echo'], label: 'Echo Skill DMG' },
};

/** Extract deployable buffs from one bonus-tier object (2pc or 4pc/5pc). */
function extractSetBuffs(b: Record<string, unknown>): SetBonusEntry['buffs'] {
    const buffs: SetBonusEntry['buffs'] = [];
    for (const [key, map] of Object.entries(SET_BONUS_STAT)) {
        const v = b[key];
        if (typeof v === 'number' && v !== 0) buffs.push({ stat: map.stat, label: map.label, value: v });
    }
    // elementalDmgBonus is a per-element map (e.g. Sierra Gale's Aero DMG+30%)
    // — a SPECIFIC element, not the wielder's own. Tagging these with the
    // generic `elemDmg` key (as before) made `computeBuildStats`'s
    // `apply()` treat them as ALWAYS active regardless of the character's
    // actual element (`elemDmg` bypasses the same-element check that every
    // OTHER per-element key — `spectroDmg`, `aeroDmg`, etc. — already gets),
    // so e.g. a Spectro character equipping an Aero-set echo would have
    // wrongly gained Aero DMG% that can never apply to any of their real
    // attacks. Tagged with the real per-element key instead — inert on a
    // mismatched character, exactly like a mismatched-element gear
    // sub-stat already correctly behaves.
    const em = b.elementalDmgBonus;
    if (em && typeof em === 'object') {
        for (const [element, v] of Object.entries(em as Record<string, number>)) {
            if (typeof v === 'number' && v !== 0) buffs.push({ stat: elemKey(element), label: `${element} DMG`, value: v });
        }
    }
    // Same real-element-vs-generic distinction for flat `<element>DmgBonus`
    // keys (e.g. GI's `geoDmgBonus`) — was ALSO collapsing to the generic,
    // always-applies `elemDmg` slot.
    for (const [key, v] of Object.entries(b)) {
        if (key !== 'elementalDmgBonus' && key.endsWith('DmgBonus') && typeof v === 'number' && v !== 0) {
            const element = key.slice(0, -'DmgBonus'.length);
            const label = element.charAt(0).toUpperCase() + element.slice(1);
            buffs.push({ stat: elemKey(element), label: `${label} DMG`, value: v });
        }
    }
    // Per-attack-type DMG amps → scoped `dmgBonus` buffs.
    for (const [key, map] of Object.entries(SET_ATTACK_SCOPE)) {
        const v = b[key];
        if (typeof v === 'number' && v !== 0) buffs.push({ stat: 'dmgBonus', label: map.label, value: v, appliesTo: map.scope });
    }
    return buffs;
}

/** Sum same-stat / same-scope buffs so a full set shows one row per effect. */
function mergeSetBuffs(buffs: SetBonusEntry['buffs']): SetBonusEntry['buffs'] {
    const byKey = new Map<string, SetBonusEntry['buffs'][number]>();
    for (const b of buffs) {
        const k = `${b.stat}|${(b.appliesTo ?? []).join(',')}`;
        const cur = byKey.get(k);
        if (cur) cur.value += b.value;
        else byKey.set(k, { ...b });
    }
    return [...byKey.values()];
}

/**
 * Project the module's set-bonus table into deployable stat buffs, combining the
 * 2-piece base (`bonuses`) with the 4pc/5pc set effect (`setBonus`). Element-
 * specific DMG bonuses collapse to the generic `elemDmg` slot; per-attack-type
 * DMG amps become scoped `dmgBonus` buffs. `pieces` = the game threshold (GI 4,
 * WuWa 5), i.e. a member running a full set deploys 2pc + set effect together.
 */
export function deriveSetBonuses(sets: RawSetBonus[], pieces: number): SetBonusEntry[] {
    return sets.map((sb) => {
        const twoPieceBuffs = mergeSetBuffs(extractSetBuffs(sb.bonuses ?? {}));
        const fullSetOnlyBuffs = mergeSetBuffs(extractSetBuffs(sb.setBonus ?? {}));
        const buffs = mergeSetBuffs([...twoPieceBuffs, ...fullSetOnlyBuffs]);
        return { name: sb.name, pieces: sb.pieces ?? pieces, buffs, twoPieceBuffs, fullSetOnlyBuffs, restrictedToCharacters: sb.restrictedToCharacters };
    });
}

/** Project the game's weapon DB into WeaponEntry rows. */
export function deriveWeapons(weaponDB: RawWeapon[]): WeaponEntry[] {
    return weaponDB.map((w) => ({
        kind: 'weapon',
        id: w.id,
        name: w.name,
        weaponType: w.weaponType,
        rarity: w.rarity,
        baseAtk: w.baseAtk,
        secondaryStat: statTypeToLabel(w.secondaryStat),
        secondaryValue: w.secondaryValue,
        passive: w.passive,
        buffs: w.buffs,
        selfBuffs: w.selfBuffs,
        conversions: w.conversions,
        icon: w.icon,
    }));
}

/** The GameDefinition fields this builder reads (structural subset). */
interface DefLike {
    id: string;
    equipment: { slotLabel: string; slotLabelPlural: string; maxSubStats: number };
    combat: { actions: RawAction[] };
    sets?: RawSetBonus[];
    uiOptions?: { characters: Array<{ value: string; label: string }>; setNames: string[] };
}

/**
 * Assemble a GameBundle from a game module (`def` + character/weapon DBs) and
 * authored supplements (gear ranges, stat catalog, enemies, buffs, passives).
 */
export function buildGameBundle(input: {
    def: DefLike;
    charDB: RawCharacter[];
    weaponDB: RawWeapon[];
    defaultElement: string;
    defaultWeapon: string;
    hasElementalMastery: boolean;
    /** Whether the game has an elemental-reaction system (Genshin: true; WuWa: false). */
    supportsReactions: boolean;
    /** Universal action types to backfill onto any character with a partial precise skill list. */
    backfillSkillIds?: BackfillSlot[];
    /** Pieces required for a set bonus to apply (GI 4, WuWa 5). */
    setPieces: number;
    /** Teammates that join the active character in a party (WuWa 2, GI 3). */
    partyTeammates: number;
    starterCharacterId: string;
    sequenceLabel: string;
    sequenceMax: number;
    supplements: GameCatalogSupplements;
}): GameBundle {
    const { def, supplements: s } = input;
    const gearKind = def.equipment.slotLabel.toLowerCase() === 'echo' ? 'echo' : 'artifact';
    const roster = def.uiOptions?.characters ?? [];
    const setNames = def.uiOptions?.setNames ?? [];
    return {
        id: def.id,
        gearKind,
        gearLabel: def.equipment.slotLabel,
        gearLabelPlural: def.equipment.slotLabelPlural,
        maxGear: 5,
        sequenceLabel: input.sequenceLabel,
        sequenceMax: input.sequenceMax,
        partyTeammates: input.partyTeammates,
        starterCharacterId: input.starterCharacterId,
        gearCatalog: {
            ...s.gearRanges,
            maxSubStats: def.equipment.maxSubStats,
            sets: setNames.map((n) => {
                const icon = s.setIcons?.[n];
                return icon ? { id: slug(n), name: n, icon } : { id: slug(n), name: n };
            }),
        },
        supportsReactions: input.supportsReactions,
        statCatalog: s.statCatalog,
        characters: deriveCharacters(roster, input.charDB, def.combat.actions, {
            defaultElement: input.defaultElement,
            defaultWeapon: input.defaultWeapon,
            hasElementalMastery: input.hasElementalMastery,
            backfill: input.backfillSkillIds,
        }),
        weapons: deriveWeapons(input.weaponDB),
        gear: [],
        enemies: s.enemies,
        buffs: s.buffs,
        passives: s.passives,
        setBonuses: deriveSetBonuses(def.sets ?? [], input.setPieces),
    };
}
