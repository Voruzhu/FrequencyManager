import type { CharacterEntry } from '@shared/types/game-bundle';

/**
 * How relevant a stat is to THIS character's own kit — derived entirely from
 * data already in the bundle (element, skills' scaling/type/multiplier,
 * self/team buffs' scaleOff), never fabricated per-character knowledge.
 * Used to color-grade the build card's stat rows (low/medium/high).
 */

const SKILL_TYPE_TO_SCOPED_STAT: Record<string, string> = {
    normal: 'basicAttackDmgBonus',
    heavy: 'heavyAttackDmgBonus',
    skill: 'resonanceSkillDmgBonus',
    ultimate: 'resonanceLiberationDmgBonus',
};

function scalingStatKey(character: CharacterEntry): string {
    const first = character.skills.find((s) => s.scaling)?.scaling ?? 'atk';
    return first === 'em' ? 'elementalMastery' : first;
}

function skillMaxMultiplier(s: CharacterEntry['skills'][number]): number {
    return Math.max(s.multiplier ?? 0, ...(s.multipliers ?? [0]));
}

/** True when nothing in this character's kit deals real damage — the same
 * "no offensive skills" signal drives both the Crit Rate/DMG demotion and
 * the Healing Bonus promotion below (no dedicated "healer" flag exists
 * anywhere in SkillDef, so this multiplier check is the real available
 * signal, not an invented one). */
function hasNoOffensiveSkills(character: CharacterEntry): boolean {
    return character.skills.every((s) => skillMaxMultiplier(s) <= 0);
}

function highestMultiplierSkillType(character: CharacterEntry): string | undefined {
    let best: { type: string; mult: number } | undefined;
    for (const s of character.skills) {
        const mult = skillMaxMultiplier(s);
        if (!best || mult > best.mult) best = { type: s.type, mult };
    }
    return best?.type;
}

export function statRelevance(character: CharacterEntry, statKey: string): 'low' | 'medium' | 'high' {
    if (statKey === 'elemDmg') return 'high';

    if (statKey === scalingStatKey(character)) return 'high';

    const noOffense = hasNoOffensiveSkills(character);
    if (statKey === 'critRate' || statKey === 'critDmg') return noOffense ? 'low' : 'high';
    if (statKey === 'healingBonus') return noOffense ? 'high' : 'low';

    if (statKey === 'elementalMastery') {
        const scalesOffEM = [...(character.selfBuffs ?? []), ...(character.teamBuffs ?? [])]
            .some((b) => b.scaleOff?.sourceStat === 'elementalMastery');
        return scalesOffEM ? 'high' : 'medium';
    }

    if (Object.values(SKILL_TYPE_TO_SCOPED_STAT).includes(statKey)) {
        const topType = highestMultiplierSkillType(character);
        const scopedStat = topType != null ? SKILL_TYPE_TO_SCOPED_STAT[topType] : undefined;
        return statKey === scopedStat ? 'high' : 'medium';
    }

    return 'medium';
}
