/**
 * Target enemies for damage calculation, sourced from the active game's bundle
 * (backend-served, embedded fallback). Each carries a defense value and a
 * resistance % that reduce final damage; the Training Dummy (prepended here, as
 * it's universal rather than game data) has zero of both so it reflects raw
 * output. Damage math lives in `enemyMultiplier`.
 */
import type { EnemyEntry } from '@shared/types/game-bundle';
import { getGameData } from './gameData';

export type Enemy = EnemyEntry;

// Damage math lives in the shared engine so the renderer and backend agree.
export { enemyMultiplier } from '@shared/calc/optimizer';

export const DUMMY: Enemy = { id: 'dummy', name: 'Training Dummy', level: 0, def: 0, res: 0 };

export function getEnemies(gameId: string): Enemy[] {
    return [DUMMY, ...getGameData(gameId).enemies];
}
