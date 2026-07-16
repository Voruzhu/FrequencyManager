/**
 * Buff catalog for the calculator, sourced from the active game's bundle
 * (backend-served, embedded fallback). "Basic" buffs are generic stat boosts;
 * character-sourced buffs stand in for team/kit buffs. A buff's `stat` key
 * matches the optimizer's stat vocabulary; the special key `elemDmg` applies to
 * the active character's element.
 */
import type { BuffEntry } from '@shared/types/game-bundle';
import { getGameData } from './gameData';

export type Buff = BuffEntry;

/** atkPct → atk, defPct → def, … so Pct buffs match their base catalog stat. */
const baseKey = (k: string) => (k.endsWith('Pct') ? k.slice(0, -3) : k);

/**
 * Buffs available for a game. Basic buffs are filtered by the game's stat
 * catalog, so a stat the game doesn't have (e.g. Elemental Mastery in WuWa)
 * never surfaces as a buff option.
 */
export function getBuffs(gameId: string): { basic: Buff[]; character: Buff[] } {
    const data = getGameData(gameId);
    const catalogKeys = new Set(data.statCatalog.map((s) => s.key));
    return {
        basic: data.buffs.basic.filter((b) => catalogKeys.has(baseKey(b.stat))),
        character: data.buffs.character,
    };
}
