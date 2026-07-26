import type { CharacterData } from '../data/gameData';

export type LucillaResonanceMode = 'chafe' | 'echo';

/**
 * Lucilla's Resonance Liberation ('ult'/'ultLettingItGo') and Forte Circuit
 * ('forte' -- this IS her "Oblivion" hit under this codebase's existing
 * generic naming; no separately-sourced multiplier table exists for a
 * distinct "Oblivion" entry, and adding one with the same numbers would
 * double-count it) are genuinely mode-conditional for buff-scope purposes
 * (encore.moe): in Resonance Mode - Glacio Chafe they count as Basic Attack
 * DMG, in Resonance Mode - Echo they count as Echo Skill DMG. Neither is
 * really "Ultimate"/"Forte" DMG-bonus-wise, which the static `scope` field
 * on a SkillDef can't express since it needs to flip at calc time.
 *
 * Applied as a narrow, single-character skill-scope patch rather than a
 * general engine "mode" primitive -- no other WW character has this exact
 * mechanic (confirmed 2026-07-25 research), so a generic primitive would be
 * speculative. Only used to build the damage-calc-facing character variant
 * (see CalculatorScreen's buildConfig) -- the original `character` object
 * (Talents window, skill list, etc.) is left untouched.
 */
export function applyLucillaMode(character: CharacterData, mode: LucillaResonanceMode): CharacterData {
    if (character.id !== 'lucilla') return character;
    const scope = mode === 'chafe' ? 'basic' : 'echo';
    return {
        ...character,
        skills: character.skills.map((s) => (s.id === 'ult' || s.id === 'ultLettingItGo' || s.id === 'forte' ? { ...s, scope } : s)),
    };
}
