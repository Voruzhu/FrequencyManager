/**
 * Self-buff assembly — pure logic shared by the Calculator and the Rotation
 * Builder. A character's unconditional weapon/passive/constellation self-buffs
 * always apply; conditional ones are opt-in toggles the caller assembles
 * separately (see the toggle-chip pattern in `CalculatorScreen.tsx`).
 */
import { computeBuildStats } from '../data/optimizer';
import { gearSelfBuffs } from '../data/gameData';
import type { CharacterData, GearData, GameData } from '../data/gameData';

export type SelfBuffScaleOff = { sourceStat: 'atk' | 'elementalMastery' | 'energyRegen' | 'hp' | 'def' | 'critRate' | 'critDmg'; basis: 'base' | 'total' | 'partyMax'; ratio: number; cap?: number; offset?: number };

/**
 * Resolve a self-buff's real magnitude when it carries a `stacksMax` (e.g.
 * Galbrena's "2% Crit DMG per Afterflame point, up to 80% at 40 stacks") —
 * `value` is the PER-STACK rate, `stacksMax` the ceiling. `stacks[id]`
 * defaults to `stacksMax` itself, same "assume best-case" convention already
 * used for skill-level stacks and unscoped buffs.
 */
function resolveStackedValue(id: string, sb: { value: number; stacksMax?: number }, stacks: Record<string, number>): number {
    if (sb.stacksMax == null) return sb.value;
    const count = stacks[id] ?? sb.stacksMax;
    return sb.value * count;
}

/**
 * Resolve a self-buff's real magnitude when it carries a `scaleOff` (e.g. a
 * weapon passive that grants "X% of the wielder's own EM as ATK") — mirrors
 * `resolveScaledValue` in `lib/party.ts`, but for the character's own equipped
 * build (no cross-party lookup needed; self-buffs never use 'partyMax').
 */
export function resolveSelfScaleOff(c: CharacterData, gear: GearData[], weapon: { baseAtk: number } | undefined, scaleOff: SelfBuffScaleOff, catalog: GameData['statCatalog']): number {
    const source =
        scaleOff.basis === 'base'
            ? (c.stats.atk ?? 0) + (weapon?.baseAtk ?? 0)
            : (computeBuildStats(c, gear, [], weapon as Parameters<typeof computeBuildStats>[3], catalog)[scaleOff.sourceStat] ?? 0);
    const raw = Math.max(0, source - (scaleOff.offset ?? 0)) * scaleOff.ratio;
    const capped = scaleOff.cap != null ? Math.min(raw, scaleOff.cap) : raw;
    return Math.round(capped * 10) / 10;
}

/** Stable per-selfBuff id (a weapon can carry several `elemDmg` buffs scoped to different attack types). */
export const selfBuffId = (weaponId: string, sb: { stat: string; appliesTo?: string[] }, i: number) =>
    `wpn-${weaponId}-${sb.stat}-${sb.appliesTo?.join('+') ?? 'all'}-${i}`;

/** Unconditional weapon-passive self-buffs (from the game's addProps) — always applied. `appliesTo` scopes a DMG% buff to specific attack types.
 * `refineMultiplier` scales the passive's magnitude for the weapon's actual refinement rank (R1 = 1, see `weaponScaling.ts`'s `refineMul`) — the
 * shipped `sb.value`/`scaleOff` result is always the R1 baseline. */
export function weaponAutoBuffs(weapon: { id: string; name: string; baseAtk: number; selfBuffs?: Array<{ stat: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: SelfBuffScaleOff; stacksMax?: number }> } | undefined, c: CharacterData | null, gear: GearData[], catalog: GameData['statCatalog'], stacks: Record<string, number> = {}, refineMultiplier = 1) {
    if (!weapon || !c) return [];
    return (weapon.selfBuffs ?? [])
        .map((sb, i) => ({ sb, i }))
        .filter(({ sb }) => sb.conditional === false)
        .map(({ sb, i }) => { const id = selfBuffId(weapon.id, sb, i); return { id, name: `${weapon.name} passive`, source: weapon.name, stat: sb.stat, value: resolveStackedValue(id, { value: (sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, catalog) : sb.value) * refineMultiplier, stacksMax: sb.stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }; });
}

/** Stable per-character-passive-selfBuff id. */
export const passiveBuffId = (charId: string, sb: { stat: string; appliesTo?: string[] }, i: number) =>
    `passive-${charId}-${sb.stat}-${sb.appliesTo?.join('+') ?? 'all'}-${i}`;

/** WW's "Skill Tree" stat nodes — a fixed "fully invested" assumption, gated
 * by ONE master switch (`calcStore.skillTreeInvested`) instead of the normal
 * per-buff conditional toggle. See `characterAutoBuffs`/`conditionalCharacterBuffs`. */
export const isSkillTreeBuff = (sb: { label: string }) => sb.label.startsWith('Skill Tree:');

/**
 * `calc.buffs` may still carry a Skill Tree entry a user manually toggled ON
 * before this master switch existed (it's a plain persisted buff, stable id,
 * survives an app update) — without stripping it out here, turning the
 * switch on would double-count that stat once from the stale manual toggle
 * and once from `characterAutoBuffs`'s automatic inclusion. Only matters
 * when the switch is ON; when OFF neither path includes it.
 */
export function stripAutoSkillTreeBuffs<T extends { id: string }>(buffs: T[], c: CharacterData | null, skillTreeInvested: boolean): T[] {
    if (!skillTreeInvested || !c?.selfBuffs) return buffs;
    const autoIds = new Set(c.selfBuffs.map((sb, i) => ({ sb, i })).filter(({ sb }) => isSkillTreeBuff(sb)).map(({ sb, i }) => passiveBuffId(c.id, sb, i)));
    return buffs.filter((b) => !autoIds.has(b.id));
}

/** Unconditional character passive-talent self-buffs (own kit, not weapon/constellation) — always applied.
 * `skillTreeInvested` additionally includes "Skill Tree: ..." buffs even though they're authored
 * `conditional: true` — see `isSkillTreeBuff`. Defaults to false (i.e. behaves exactly as before this
 * flag existed) so callers that don't know about the Talents window's master switch — Rotation Builder,
 * which still lets a Skill Tree buff be toggled per-member via `conditionalCharacterBuffs` instead —
 * don't silently start double-counting or auto-including them. Only the Calculator passes the real
 * `calcStore.skillTreeInvested` value (default true there). */
export function characterAutoBuffs(c: CharacterData | null, gear: GearData[], weapon: { baseAtk: number } | undefined, catalog: GameData['statCatalog'], stacks: Record<string, number> = {}, skillTreeInvested = false) {
    if (!c?.selfBuffs) return [];
    return c.selfBuffs
        .map((sb, i) => ({ sb, i }))
        .filter(({ sb }) => sb.conditional === false || (skillTreeInvested && isSkillTreeBuff(sb)))
        .map(({ sb, i }) => { const id = passiveBuffId(c.id, sb, i); return { id, name: `${c.name} passive`, source: c.name, stat: sb.stat, value: resolveStackedValue(id, { value: sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, catalog) : sb.value, stacksMax: sb.stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }; });
}

/** Stable per-constellation-selfBuff id. */
export const constBuffId = (charId: string, level: number, sb: { stat: string; appliesTo?: string[] }, i: number) =>
    `const-${charId}-L${level}-${sb.stat}-${sb.appliesTo?.join('+') ?? 'all'}-${i}`;

/** Unconditional Constellation/Sequence self-buffs, for nodes the character has actually unlocked (sequence >= node.level). Always applied. */
export function constellationAutoBuffs(character: CharacterData | null, sequence: number, gear: GearData[], weapon: { baseAtk: number } | undefined, catalog: GameData['statCatalog'], stacks: Record<string, number> = {}) {
    if (!character?.constellations) return [];
    const out: Array<{ id: string; name: string; source: string; stat: string; value: number; appliesTo?: string[] }> = [];
    for (const node of character.constellations) {
        if (sequence < node.level) continue;
        (node.selfBuffs ?? [])
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional === false)
            .forEach(({ sb, i }) => { const id = constBuffId(character.id, node.level, sb, i); const scaleOff = (sb as { scaleOff?: SelfBuffScaleOff }).scaleOff; out.push({ id, name: `${node.name} (L${node.level})`, source: character.name, stat: sb.stat, value: resolveStackedValue(id, { value: scaleOff ? resolveSelfScaleOff(character, gear, weapon, scaleOff, catalog) : sb.value, stacksMax: (sb as { stacksMax?: number }).stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }); });
    }
    return out;
}

/** Conditional (opt-in) weapon-passive self-buffs — mirrors `weaponAutoBuffs` but for the toggle-chip candidates instead of the always-on ones. `refineMultiplier` — see `weaponAutoBuffs`. */
export function conditionalWeaponBuffs(weapon: { id: string; name: string; baseAtk: number; selfBuffs?: Array<{ stat: string; label?: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: SelfBuffScaleOff; stacksMax?: number }> } | undefined, c: CharacterData | null, gear: GearData[], catalog: GameData['statCatalog'], stacks: Record<string, number> = {}, refineMultiplier = 1) {
    if (!weapon || !c) return [];
    return (weapon.selfBuffs ?? [])
        .map((sb, i) => ({ sb, i }))
        .filter(({ sb }) => sb.conditional !== false)
        .map(({ sb, i }) => { const id = selfBuffId(weapon.id, sb, i); return { id, name: `${weapon.name} passive`, source: weapon.name, stat: sb.stat, label: sb.label, stacksMax: sb.stacksMax, value: resolveStackedValue(id, { value: (sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, catalog) : sb.value) * refineMultiplier, stacksMax: sb.stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }; });
}

/** Conditional (opt-in) character passive-talent self-buffs — mirrors `characterAutoBuffs`. */
export function conditionalCharacterBuffs(c: CharacterData | null, gear: GearData[], weapon: { baseAtk: number } | undefined, catalog: GameData['statCatalog'], stacks: Record<string, number> = {}) {
    if (!c?.selfBuffs) return [];
    return c.selfBuffs
        .map((sb, i) => ({ sb, i }))
        .filter(({ sb }) => sb.conditional !== false)
        .map(({ sb, i }) => { const id = passiveBuffId(c.id, sb, i); return { id, name: `${c.name} passive`, source: c.name, stat: sb.stat, label: sb.label, stacksMax: sb.stacksMax, value: resolveStackedValue(id, { value: sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, catalog) : sb.value, stacksMax: sb.stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }; });
}

/** Conditional (opt-in) Constellation/Sequence self-buffs, for unlocked nodes — mirrors `constellationAutoBuffs`. */
export function conditionalConstellationBuffs(character: CharacterData | null, sequence: number, gear: GearData[], weapon: { baseAtk: number } | undefined, catalog: GameData['statCatalog'], stacks: Record<string, number> = {}) {
    if (!character?.constellations) return [];
    const out: Array<{ id: string; name: string; source: string; stat: string; label?: string; value: number; appliesTo?: string[]; stacksMax?: number }> = [];
    for (const node of character.constellations) {
        if (sequence < node.level) continue;
        (node.selfBuffs ?? [])
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional !== false)
            .forEach(({ sb, i }) => { const id = constBuffId(character.id, node.level, sb, i); const scaleOff = (sb as { scaleOff?: SelfBuffScaleOff }).scaleOff; const stacksMax = (sb as { stacksMax?: number }).stacksMax; out.push({ id, name: `${node.name} (L${node.level})`, source: character.name, stat: sb.stat, label: sb.label, stacksMax, value: resolveStackedValue(id, { value: scaleOff ? resolveSelfScaleOff(character, gear, weapon, scaleOff, catalog) : sb.value, stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }); });
    }
    return out;
}

/** Stable per-gear-piece-selfBuff id (a piece can carry several buffs). */
export const gearBuffId = (gearId: string, sb: { stat: string; appliesTo?: string[] }, i: number) =>
    `gear-${gearId}-${sb.stat}-${sb.appliesTo?.join('+') ?? 'all'}-${i}`;

/** Unconditional self-buffs from specific named equipped gear pieces' own "Echo Skill" (WW) — always applied. Iterates every equipped piece, not just one. */
export function gearAutoBuffs(gear: GearData[], stacks: Record<string, number> = {}) {
    const out: Array<{ id: string; name: string; source: string; stat: string; value: number; appliesTo?: string[] }> = [];
    for (const g of gear) {
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional === false)
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }); });
    }
    return out;
}

/** Conditional (opt-in) self-buffs from specific named equipped gear pieces' own "Echo Skill" — mirrors `gearAutoBuffs`. */
export function conditionalGearBuffs(gear: GearData[], stacks: Record<string, number> = {}) {
    const out: Array<{ id: string; name: string; source: string; stat: string; label?: string; value: number; appliesTo?: string[] }> = [];
    for (const g of gear) {
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional !== false)
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, label: sb.label, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }); });
    }
    return out;
}
