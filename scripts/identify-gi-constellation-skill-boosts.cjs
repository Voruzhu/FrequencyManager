/**
 * identify-gi-constellation-skill-boosts.cjs
 *
 * Adds `boostsSkillId` to Constellation 3 and 5 nodes — GI's universal C3/C5 pattern
 * ("Increases the Level of <skill> by 3, max 15") — by parsing the skill name out of
 * the node's description and matching it against the character's authored skill
 * names (constellations.generated.ts already has c1-c6 text; this ADDS metadata to
 * the C3/C5 entries in place, doesn't touch the description text itself).
 *
 * Two extraction strategies (newer entries wrap the skill name in **bold**; older
 * ones don't): try bold-text extraction first (unambiguous), fall back to the
 * "Level of X by 3" / "X Level by 3" phrasing. Skipped (left without boostsSkillId,
 * not guessed) when: extraction fails (e.g. a locked/placeholder character), or the
 * extracted name doesn't match any of the character's authored skills (e.g. that
 * skill was never authored in skills.ts — a separate, pre-existing gap).
 *
 * Run: node scripts/identify-gi-constellation-skill-boosts.cjs (after npm run build:main
 * AND after import-gi-constellations.cjs has produced constellations.generated.ts)
 * Rewrites constellations.generated.ts in place.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GI_DIR = path.join(ROOT, 'adapters', 'game-definitions', 'genshin-impact');
const FILE = path.join(GI_DIR, 'constellations.generated.ts');
const { CHARACTERS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'genshin-impact', 'characters.js'));

function extractSkillName(desc) {
    const bold = desc.match(/\*\*(.+?)\*\*/);
    if (bold) return bold[1].trim();
    const m = desc.match(/Level of (.+?) by 3/i) || desc.match(/Increases? (?:Elemental (?:Skill|Burst) )?(.+?) Level by 3/i);
    return m ? m[1].trim() : null;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function matchSkill(skills, name) {
    if (!name) return null;
    const target = norm(name);
    let best = skills.find((s) => norm(s.name) === target);
    if (best) return best;
    best = skills.find((s) => norm(s.name).includes(target) || target.includes(norm(s.name)));
    return best || null;
}

// Load the character roster with real skill names (compiled dist, post accurateChar
// merge would be circular — use the RAW authored skills.ts + characters.ts directly).
const { CHARACTER_SKILLS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'genshin-impact', 'skills.js'));

const src = fs.readFileSync(FILE, 'utf8');
const body = src.match(/CONSTELLATION_OVERRIDES[^=]*= (\{[\s\S]*?\n\});\n/)[1];
const data = eval('(' + body + ')');

let boosted = 0, skippedNoExtract = 0, skippedNoMatch = 0;
for (const c of CHARACTERS) {
    const nodes = data[c.id];
    if (!nodes) continue;
    const skills = CHARACTER_SKILLS[c.id];
    if (!skills) continue; // no authored skills to match against
    for (const level of [3, 5]) {
        const node = nodes.find((n) => n.level === level);
        if (!node) continue;
        const name = extractSkillName(node.description);
        if (!name) { skippedNoExtract++; continue; }
        const skill = matchSkill(skills, name);
        if (!skill) { skippedNoMatch++; continue; }
        node.boostsSkillId = skill.id;
        boosted++;
    }
}

const outBody = Object.entries(data).map(([id, nodes]) => {
    const inner = nodes.map((n) => {
        // Preserve selfBuffs/buffs from curate-gi-constellations.cjs — this script only
        // OWNS boostsSkillId, but must round-trip any other hand-curated fields already
        // on the node instead of silently dropping them on a re-run.
        let extra = '';
        if (n.boostsSkillId) extra += `, boostsSkillId: ${JSON.stringify(n.boostsSkillId)}`;
        if (n.selfBuffs) extra += `, selfBuffs: ${JSON.stringify(n.selfBuffs)}`;
        if (n.buffs) extra += `, buffs: ${JSON.stringify(n.buffs)}`;
        return `        { level: ${n.level}, name: ${JSON.stringify(n.name)}, description: ${JSON.stringify(n.description)}${extra} }`;
    }).join(',\n');
    return `    ${JSON.stringify(id)}: [\n${inner},\n    ],`;
}).join('\n');

const banner = src.slice(0, src.indexOf('export const'));
const ts = `${banner}export const CONSTELLATION_OVERRIDES: Record<string, Array<{ level: number; name: string; description: string; boostsSkillId?: string; selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffScaleOff }>; buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[]; scaleOff?: BuffScaleOff }> }>> = {\n${outBody}\n};\n\nexport default CONSTELLATION_OVERRIDES;\n`;
fs.writeFileSync(FILE, ts);
console.log(`boostsSkillId set on ${boosted} nodes | skipped (no name extracted) ${skippedNoExtract} | skipped (no skill match) ${skippedNoMatch}`);
