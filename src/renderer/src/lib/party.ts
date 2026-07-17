/**
 * Party-buff aggregation — pure logic shared by the Party Setup panel, the
 * Calculator, and the rotation editor. A party's effects come from each
 * member's kit buffs, the set bonus of the set they run, and (later) weapon
 * passives. Enabled effects flatten into `BuffEntry`s that feed the existing
 * optimizer/rotation buff pipeline unchanged.
 */
import type { BuffEntry, CharacterEntry, GameBundle, GearEntry, StatDef, WeaponEntry } from '@shared/types/game-bundle';
import { computeBuildStats, activeSetBonuses, type ActiveSetBonus } from '@shared/calc/optimizer';
import { getWeaponScaling, refineMul } from '../data/weaponScaling';

export type EffectCategory = 'kit' | 'set' | 'weapon';

const SCOPE_LABEL: Record<string, string> = {
    basic: 'Basic-Atk', heavy: 'Heavy-Atk', skill: 'Res. Skill', ult: 'Liberation',
    forte: 'Forte', charged: 'Charged', plunge: 'Plunge', aimed: 'Aimed', normal: 'Normal-Atk',
};

/** Human label for a per-attack-type scope, e.g. ['basic'] → "Basic-Atk". */
export function scopeLabel(appliesTo?: string[]): string | undefined {
    if (!appliesTo || appliesTo.length === 0) return undefined;
    return appliesTo.map((a) => SCOPE_LABEL[a.toLowerCase()] ?? a).join('/');
}

export interface PartyEffect {
    id: string;
    name: string;
    /** Character the effect comes from (display). */
    source: string;
    category: EffectCategory;
    /** Concrete stat buffs this effect grants. `appliesTo` scopes a per-attack-type DMG% buff. */
    buffs: Array<{ stat: string; label?: string; value: number; appliesTo?: string[]; requiresTargetStatus?: string[] }>;
    description?: string;
}

/** One party slot resolved to the data the aggregation needs. */
export interface PartyMemberResolved {
    /** Stable id — 'active' for the calc character, else the teammate entry id. */
    id: string;
    character: CharacterEntry;
    /** Equipped gear pieces (this member's own loadout) — usable with computeBuildStats. */
    gear: GearEntry[];
    /** Every set-bonus tier this member's REAL equipped gear activates — a
     * build can run 2 different sets at their 2pc tier simultaneously (5
     * slots split 2+2+1), not just one, see `activeSetBonuses`. */
    setBonuses?: ActiveSetBonus[];
    /** Weapon the member wields (drives the weapon team-buff effect + own stats). */
    weapon?: WeaponEntry;
    /** The wielded weapon's refinement rank (R1-R5) — undefined/1 means R1, the baseline `weapon.buffs`/`selfBuffs` values already reflect. */
    weaponRefine?: number;
    /**
     * Constellation/Sequence level (0-6) — persisted per-character via
     * `sequenceStore` for BOTH the active character (`calcStore.sequence`,
     * write-through mirrored) and teammates (`resolveParty`'s `getSequence`
     * param), same persistence shape as `loadoutStore`. Undefined here means a
     * caller didn't pass a lookup for this member (no constellation team-buff
     * effects deployed for them), not "level 0" — level 0 is a real, valid,
     * persisted value once the character has been set.
     */
    sequence?: number;
    isActive?: boolean;
}

/**
 * The single "best" active set-bonus name for simple display purposes (a
 * full-tier set if one is active, else the first 2pc-tier set found) — most
 * callers just want one label. For anything that needs to know about EVERY
 * active tier (a build can run 2 different sets at 2pc simultaneously — 5
 * slots split 2+2+1 — a real, common WuWa build pattern), use
 * `activeSetBonuses` directly instead; this is a thin convenience wrapper
 * over it, kept for callers that only ever showed one set name.
 */
export function activeSetName(equippedGear: GearEntry[], data: Pick<GameBundle, 'setBonuses'>, characterName?: string): string | undefined {
    const bonuses = activeSetBonuses(equippedGear, data.setBonuses, characterName);
    return (bonuses.find((b) => b.tier === 'full') ?? bonuses[0])?.name;
}

/**
 * Resolve a `scaleOff` buff (kit, weapon, or constellation/sequence) to its
 * real magnitude — 'base' reads char+weapon base ATK only (excludes
 * artifacts/buffs, matching how the game's own "Base ATK" tooltips work,
 * e.g. Bennett's/Kujou Sara's burst ATK-bonus ratio); 'total' reads the
 * SOURCE member's own fully computed stat (includes artifacts, e.g.
 * Sucrose's/Kazuha's "X% of my own EM", or a weapon's "X% of the wielder's
 * own DEF" team buff); 'partyMax' reads the highest value of that stat
 * across ALL resolved party members, for "shares whichever ally has the
 * most X" mechanics (e.g. Nahida's EM share) rather than the source's own
 * stat. Talent level is assumed 10 (max non-const) — teammates have no
 * persisted per-character talent level to read instead.
 */
function resolveScaledValue(m: PartyMemberResolved, scaleOff: NonNullable<BuffEntry['scaleOff']>, catalog: StatDef[], members: PartyMemberResolved[]): number {
    const totalOf = (mm: PartyMemberResolved) => computeBuildStats(mm.character, mm.gear, [], mm.weapon, catalog)[scaleOff.sourceStat] ?? 0;
    const source =
        scaleOff.basis === 'base' ? (m.character.stats.atk ?? 0) + (m.weapon?.baseAtk ?? 0)
        : scaleOff.basis === 'partyMax' ? Math.max(...members.map(totalOf))
        : totalOf(m);
    const raw = Math.max(0, source - (scaleOff.offset ?? 0)) * scaleOff.ratio;
    const capped = scaleOff.cap != null ? Math.min(raw, scaleOff.cap) : raw;
    return Math.round(capped * 10) / 10;
}

/** Resolve a buff's real `value`, substituting a `scaleOff` computation when present. */
function resolveBuffValue<T extends { value: number; scaleOff?: BuffEntry['scaleOff'] }>(m: PartyMemberResolved, b: T, catalog: StatDef[], members: PartyMemberResolved[]): number {
    return b.scaleOff ? resolveScaledValue(m, b.scaleOff, catalog, members) : b.value;
}

/** All available party effects from the given members (kit + set). */
export function partyEffects(data: Pick<GameBundle, 'id' | 'buffs' | 'setBonuses' | 'statCatalog'>, members: PartyMemberResolved[]): PartyEffect[] {
    const effects: PartyEffect[] = [];
    for (const m of members) {
        // Kit buffs: matched to the character by display name (that's how the
        // authored character buffs record their source).
        for (const b of data.buffs.character) {
            if (b.source !== m.character.name) continue;
            const value = resolveBuffValue(m, b, data.statCatalog, members);
            effects.push({
                id: `kit-${m.id}-${b.id}`,
                name: b.name,
                source: m.character.name,
                category: 'kit',
                buffs: [{ stat: b.stat, value, appliesTo: b.appliesTo, requiresTargetStatus: b.requiresTargetStatus }],
                description: b.description,
            });
        }
        // Set bonus(es) this member's REAL equipped gear activates — every
        // tier, not just one (see `PartyMemberResolved.setBonuses`).
        for (const sb of m.setBonuses ?? []) {
            if (sb.buffs.length === 0) continue;
            effects.push({
                id: `set-${m.id}-${sb.name}-${sb.tier}`,
                name: `${sb.name} (${sb.tier === 'full' ? 'full' : '2pc'})`,
                source: m.character.name,
                category: 'set',
                buffs: sb.buffs,
            });
        }
        // Team buff from the member's weapon passive (support weapons only).
        // `buffs` values are the R1 baseline (same convention as `selfBuffs` —
        // see `weaponAutoBuffs`), so scale by this wielder's own refine rank.
        if (m.weapon?.buffs && m.weapon.buffs.length > 0) {
            const refineMultiplier = refineMul(getWeaponScaling(data.id, m.weapon.id), m.weaponRefine ?? 1);
            effects.push({
                id: `weapon-${m.id}-${m.weapon.id}`,
                name: m.weapon.name,
                source: m.character.name,
                category: 'weapon',
                buffs: m.weapon.buffs.map((b) => ({ ...b, value: resolveBuffValue(m, b, data.statCatalog, members) * refineMultiplier })),
                description: m.weapon.passive,
            });
        }
        // Team buff(s) from the member's UNLOCKED Constellation/Sequence nodes
        // (m.sequence >= node.level). Only known for the active character today.
        if (m.sequence != null && m.character.constellations) {
            for (const node of m.character.constellations) {
                if (m.sequence < node.level || !node.buffs || node.buffs.length === 0) continue;
                effects.push({
                    id: `const-${m.id}-L${node.level}`,
                    name: `${node.name} (L${node.level})`,
                    source: m.character.name,
                    category: 'kit',
                    buffs: node.buffs.map((b) => ({ ...b, value: resolveBuffValue(m, b, data.statCatalog, members) })),
                    description: node.description,
                });
            }
        }
    }
    return effects;
}

/**
 * Flatten the ENABLED effects (not in `disabled`) into optimizer BuffEntry
 * rows. A buff carrying `requiresTargetStatus` is additionally gated live
 * against `targetStatuses` (the Calculator's "Target has: ..." toggles) —
 * OR-matched, true if any listed status is currently on. Missing
 * `targetStatuses` (a caller that doesn't track them, e.g. GI) or a status
 * key it doesn't contain defaults to true, same "assume active" convention
 * the reference row itself defaults to — so this is additive/backward
 * compatible, never a new way to silently lose a buff that has no such
 * requirement.
 */
export function enabledPartyBuffs(effects: PartyEffect[], disabled: string[], targetStatuses?: Record<string, boolean>): BuffEntry[] {
    const off = new Set(disabled);
    const statusMet = (statuses?: string[]) =>
        !statuses || statuses.length === 0 || statuses.some((s) => (targetStatuses?.[s] ?? true));
    const out: BuffEntry[] = [];
    for (const e of effects) {
        if (off.has(e.id)) continue;
        e.buffs.forEach((b, i) => {
            if (!statusMet(b.requiresTargetStatus)) return;
            out.push({ id: `${e.id}#${i}`, name: e.name, source: e.source, stat: b.stat, value: b.value, appliesTo: b.appliesTo });
        });
    }
    return out;
}

/** A character's equipped weapon + gear, as looked up from wherever loadouts live. */
export interface ResolvedLoadout {
    weaponId?: string;
    weaponRefine?: number;
    gearIds: string[];
}

/**
 * Resolve a whole party into its members, available effects, and the flattened
 * ENABLED buffs — the single entry point used by the Party Setup panel, the
 * Calculator, and the rotation editor.
 *
 * A teammate is never a separate hand-picked build: `getLoadout` resolves each
 * teammate's weapon/set from THAT character's own equipped loadout (exactly what
 * inspecting them directly would show), via `ownedGear` for the gear pieces.
 */
export function resolveParty(
    data: Pick<GameBundle, 'id' | 'characters' | 'weapons' | 'buffs' | 'setBonuses' | 'statCatalog'>,
    party: { teammates: Array<{ id: string; characterId: string }>; disabled: string[] },
    activeChar: CharacterEntry,
    equippedGear: GearEntry[],
    activeWeaponId: string | undefined,
    ownedGear: GearEntry[],
    getLoadout: (characterId: string) => ResolvedLoadout,
    /** The active character's Constellation/Sequence level — deploys their own unlocked team buffs. */
    activeSequence?: number,
    /** A teammate's Constellation/Sequence level, from the same per-character persisted store the active character's `activeSequence` is backed by (`sequenceStore`) — deploys THEIR unlocked team buffs too, e.g. a support Bennett's C6 Pyro infusion. Optional so callers that don't need teammate constellation buffs (or haven't been updated yet) still work — omitting it leaves teammates at `sequence: undefined` (no team buffs from their own constellation), same as before this param existed. */
    getSequence?: (characterId: string) => number,
    /** The Calculator's "Target has: ..." reference toggles — gates any buff carrying `requiresTargetStatus`. Omit for callers that don't track them (e.g. GI). */
    targetStatuses?: Record<string, boolean>,
): { members: PartyMemberResolved[]; effects: PartyEffect[]; enabledBuffs: BuffEntry[] } {
    const weaponOf = (id?: string) => (id ? data.weapons.find((w) => w.id === id) : undefined);
    // The active character's own weaponRefine also lives in loadoutStore
    // (calcStore mirrors every equip mutation into it) — reuse `getLoadout`
    // instead of adding a parallel param that could drift out of sync.
    const activeWeaponRefine = getLoadout(activeChar.id).weaponRefine;
    const members: PartyMemberResolved[] = [
        { id: 'active', character: activeChar, gear: equippedGear, setBonuses: activeSetBonuses(equippedGear, data.setBonuses, activeChar.name), weapon: weaponOf(activeWeaponId), weaponRefine: activeWeaponRefine, sequence: activeSequence, isActive: true },
    ];
    for (const t of party.teammates) {
        const c = data.characters.find((x) => x.id === t.characterId);
        if (!c) continue;
        const loadout = getLoadout(t.characterId);
        const gear = loadout.gearIds.map((gid) => ownedGear.find((g) => g.id === gid)).filter(Boolean) as GearEntry[];
        members.push({ id: t.id, character: c, gear, setBonuses: activeSetBonuses(gear, data.setBonuses, c.name), weapon: weaponOf(loadout.weaponId), weaponRefine: loadout.weaponRefine, sequence: getSequence?.(t.characterId) });
    }
    const effects = partyEffects(data, members);
    return { members, effects, enabledBuffs: enabledPartyBuffs(effects, party.disabled, targetStatuses) };
}
