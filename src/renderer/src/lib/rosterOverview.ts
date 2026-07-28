import type { CharacterData, GearData, GameData } from '../data/gameData';
import type { Enemy } from '../data/enemies';
import { gearEfficiency } from '@shared/calc/gearEfficiency';
import { skillDamage, isScopedBuff, gearScopedBuffs, type SkillContext } from '../data/optimizer';
import type { BuffEntry } from '@shared/types/game-bundle';

export interface RosterRow {
    character: CharacterData;
    stats: Record<string, number>;
    avgRollPct: number;
    avgSkillDmg: number;
    gearCount: number;
}

/** Average roll% across a character's own equipped gear (0 for no gear — matches
 * `gearEfficiency`'s own "nothing rolled yet" convention). */
export function averageRollPct(gear: GearData[], data: GameData): number {
    if (gear.length === 0) return 0;
    const total = gear.reduce((sum, g) => sum + gearEfficiency(g, data.gearCatalog).rollPct, 0);
    return total / gear.length;
}

/** Average per-skill damage against a reference enemy, using the character's own
 * SOLO stats — no party/reaction/rotation assumed (matches the rest of this
 * screen's "solo, no team assumed" scope), default-trained (talent level 10,
 * matching `DEFAULT_SKILL_LEVEL`), no stacks. A rough "how hard do they hit"
 * figure to rank the roster by, not a real rotation DPS number. */
export function averageSkillDamage(character: CharacterData, stats: Record<string, number>, buffs: BuffEntry[], gear: GearData[], enemy: Enemy): number {
    if (character.skills.length === 0) return 0;
    const ctx: SkillContext = {
        mode: 'average',
        enemy,
        defaultTalentLevel: 10,
        reaction: 'none',
        charLevel: 90,
        scopedBuffs: [...buffs.filter(isScopedBuff), ...gearScopedBuffs(gear)],
        characterElement: character.element,
    };
    const total = character.skills.reduce((sum, skill) => sum + skillDamage(stats, skill, ctx), 0);
    return total / character.skills.length;
}

export type SortDir = 'asc' | 'desc';

export function sortRows(rows: RosterRow[], key: string | null, dir: SortDir): RosterRow[] {
    if (!key) return rows;
    const value = (r: RosterRow) => (
        key === 'name' ? r.character.name
            : key === 'avgRollPct' ? r.avgRollPct
                : key === 'avgSkillDmg' ? r.avgSkillDmg
                    : (r.stats[key] ?? 0)
    );
    const sorted = [...rows].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv));
        return av - bv;
    });
    return dir === 'asc' ? sorted : sorted.reverse();
}
