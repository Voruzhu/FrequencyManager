import type { CharacterData, GearData, GameData } from '../data/gameData';
import { gearEfficiency } from '@shared/calc/gearEfficiency';

export interface RosterRow {
    character: CharacterData;
    stats: Record<string, number>;
    avgRollPct: number;
    gearCount: number;
}

/** Average roll% across a character's own equipped gear (0 for no gear — matches
 * `gearEfficiency`'s own "nothing rolled yet" convention). */
export function averageRollPct(gear: GearData[], data: GameData): number {
    if (gear.length === 0) return 0;
    const total = gear.reduce((sum, g) => sum + gearEfficiency(g, data.gearCatalog).rollPct, 0);
    return total / gear.length;
}

export type SortDir = 'asc' | 'desc';

export function sortRows(rows: RosterRow[], key: string | null, dir: SortDir): RosterRow[] {
    if (!key) return rows;
    const value = (r: RosterRow) => (key === 'name' ? r.character.name : key === 'avgRollPct' ? r.avgRollPct : (r.stats[key] ?? 0));
    const sorted = [...rows].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv));
        return av - bv;
    });
    return dir === 'asc' ? sorted : sorted.reverse();
}
