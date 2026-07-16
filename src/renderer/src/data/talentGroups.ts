/**
 * Talent LEVELING groups — presentational only. Affects the Talents window's
 * "Skill levels" section, NOT the Calculator's optimization targets, which
 * always list every individual skill separately (Basic Attack and Heavy
 * Attack are still independently targetable damage instances even though
 * they level together).
 *
 * Real per-game talent structure (verified against official/documented
 * sources, not guessed):
 *   - Genshin Impact: exactly 3 level-able talents — Normal Attack (which
 *     bundles Normal/Charged/Plunging Attack, and Aimed Shot for Bow users),
 *     Elemental Skill, Elemental Burst.
 *   - Wuthering Waves: exactly 5 level-able Fortes — Normal Attack (bundles
 *     Basic + Heavy Attack), Resonance Skill, Resonance Liberation, Forte
 *     Circuit, Intro Skill. Outro Skill is NOT independently level-able (no
 *     talent-material upgrade path), so it's excluded from this list — it
 *     still appears as a full Calculator optimization target.
 *
 * Grouping matches by the skill's `type` field (normalized below), NOT by
 * skill id — a character can author any number of same-family damage
 * instances under arbitrary custom ids (e.g. Eula's `charged_spin` +
 * `charged_final`, or Zhongli's Skill CAST + Skill HOLD, or any character
 * with 2+ 'Burst'-type instances), and every one of them still shares
 * exactly one real in-game talent level. An id-based whitelist would only
 * ever catch the handful of ids it happened to list — matching on the type
 * family catches every variant automatically, present and future.
 */

/**
 * Canonical talent-family token for a skill's `type` field — handles both the
 * short per-character convention ('Normal'/'Charged'/'Skill'/'Burst'/…) and
 * the long backfilled-action label convention ('Basic Attack'/'Resonance
 * Skill'/'Elemental Burst'/…), since a character with no precise data at all
 * falls back to the game-wide action list, whose `type` is the action's
 * display label, not a short code.
 */
function canonFamily(type: string): string {
    const t = type.toLowerCase().replace(/[\s_-]/g, '');
    if (['basic', 'basicattack', 'normal', 'normalattack', 'na'].includes(t)) return 'basic';
    if (['heavy', 'heavyattack'].includes(t)) return 'heavy';
    if (['charged', 'chargedattack'].includes(t)) return 'charged';
    if (['plunge', 'plunging', 'plungingattack'].includes(t)) return 'plunge';
    if (['aimed', 'aimedshot', 'empoweredaimedshot'].includes(t)) return 'aimed';
    if (['skill', 'resonanceskill', 'elementalskill'].includes(t)) return 'skill';
    if (['ult', 'ultimate', 'liberation', 'resonanceliberation', 'burst', 'elementalburst'].includes(t)) return 'ult';
    if (['forte', 'fortecircuit'].includes(t)) return 'forte';
    if (['intro', 'introskill'].includes(t)) return 'intro';
    if (['outro', 'outroskill'].includes(t)) return 'outro';
    return t;
}

export interface TalentGroup {
    id: string;
    label: string;
    /** Canonical family tokens (see `canonFamily`) that share this row's level. */
    families: string[];
}

export const TALENT_GROUPS: Record<string, TalentGroup[]> = {
    'wuthering-waves': [
        { id: 'normal-attack', label: 'Normal Attack', families: ['basic', 'heavy'] },
        { id: 'resonance-skill', label: 'Resonance Skill', families: ['skill'] },
        { id: 'resonance-liberation', label: 'Resonance Liberation', families: ['ult'] },
        { id: 'forte-circuit', label: 'Forte Circuit', families: ['forte'] },
        { id: 'intro-skill', label: 'Intro Skill', families: ['intro'] },
    ],
    'genshin-impact': [
        { id: 'normal-attack', label: 'Normal Attack', families: ['basic', 'charged', 'plunge', 'aimed'] },
        { id: 'elemental-skill', label: 'Elemental Skill', families: ['skill'] },
        { id: 'elemental-burst', label: 'Elemental Burst', families: ['ult'] },
    ],
};

/** Talent-families that exist as Calculator targets but have no independent talent level. */
const EXCLUDE_FAMILIES: Record<string, string[]> = {
    'wuthering-waves': ['outro'],
    'genshin-impact': [],
};

export interface SkillLike { id: string; name: string; type: string; description: string; approx?: boolean }

export interface TalentRow {
    /** The group id, or the skill's own id when it isn't part of a group. */
    id: string;
    label: string;
    /** Skill ids that share this row's level (first entry is the canonical level key). */
    memberIds: string[];
    members: SkillLike[];
}

/**
 * Group a character's skills for the Talents window: skills whose `type`
 * belongs to the same real talent family merge into one row (leveling one
 * updates all of them together — see `TalentsWindow`'s `setLvl`); skills
 * with no independent talent level (e.g. WuWa's Outro Skill) are omitted
 * entirely; anything else gets its own row (label = the skill's own name).
 */
export function groupSkillsForTalents(gameId: string, skills: SkillLike[]): TalentRow[] {
    const groups = TALENT_GROUPS[gameId] ?? [];
    const excludedFamilies = new Set(EXCLUDE_FAMILIES[gameId] ?? []);
    const rows: TalentRow[] = [];
    const consumed = new Set<string>();

    for (const s of skills) {
        if (excludedFamilies.has(canonFamily(s.type))) consumed.add(s.id);
    }
    for (const g of groups) {
        const families = new Set(g.families);
        const members = skills.filter((s) => !consumed.has(s.id) && families.has(canonFamily(s.type)));
        if (members.length === 0) continue;
        members.forEach((m) => consumed.add(m.id));
        rows.push({ id: g.id, label: g.label, memberIds: members.map((m) => m.id), members });
    }
    for (const s of skills) {
        if (consumed.has(s.id)) continue;
        rows.push({ id: s.id, label: s.name, memberIds: [s.id], members: [s] });
    }
    return rows;
}
