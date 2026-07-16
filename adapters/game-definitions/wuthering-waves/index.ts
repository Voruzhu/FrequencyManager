/**
 * @fileoverview Wuthering Waves game package entry point
 * @module adapters/game-definitions/wuthering-waves
 *
 * Re-exports the base GameDefinition (definition.ts), stat rules, and all
 * per-game sub-modules (mechanics, characters, weapons, echoes) so consumers
 * can import everything from this single entry:
 *
 *   import { wutheringWaves, CHARACTERS, WEAPONS, ECHOES, SCALING } from
 *     '@adapters/game-definitions/wuthering-waves';
 *
 * The registry in `adapters/game-definitions/index.ts` imports the default
 * `GameDefinition` from here.
 */

export { wutheringWaves, wutheringWavesStatRules, default } from './definition';
export { SCALING, computeBaseDamage, STAT_ALIASES, USED_STATS } from './mechanics';
export { CHARACTERS, getCharacter, WUCharacter } from './characters';
export { WEAPONS, getWeapon, WUWeapon } from './weapons';
export { ECHOES, getEcho, getEchoesBySet, WUEcho } from './echoes';