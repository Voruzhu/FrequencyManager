/**
 * extend-gi-multipliers-to-15.cjs
 *
 * Extends the two GI skill-multiplier override files from 10 levels to 15 — needed
 * to model Constellation 3/5's universal "+3 to a skill's level, max 15" effect
 * (talent books only reach level 10; genshin-db's raw data goes to 15 since the
 * in-game formula/table always covers the constellation-extended range).
 *
 * WHY fingerprint-matching, not re-deriving from labels: our existing 10-level
 * tables were already carefully verified (Amber-labeled ATK entries + genshin-db
 * HP/DEF entries, see skill-multipliers.generated.ts / skill-multipliers-scaled.
 * generated.ts headers). Re-matching by label text again risks picking the wrong
 * genshin-db `parameters.paramN` array (a talent can have many params — hit-by-hit
 * breakdowns, stamina cost, radius, etc). Instead: for each already-verified 10-value
 * table, find the genshin-db param array whose FIRST 10 values equal ours (within
 * float tolerance) — that's provably the same underlying data — then take its
 * values 11-15. No re-interpretation of ambiguous labels.
 *
 * Run: NODE_PATH=<dir with genshin-db> node scripts/extend-gi-multipliers-to-15.cjs
 * Rewrites both files' arrays in place (10 -> 15 elements) where a match is found.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const gdb = require('genshin-db');

const ROOT = path.join(__dirname, '..');
const GI_DIR = path.join(ROOT, 'adapters', 'game-definitions', 'genshin-impact');
const { CHARACTERS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'genshin-impact', 'characters.js'));
const nameOf = (id) => CHARACTERS.find((c) => c.id === id)?.name;
const baseName = (name) => name.replace(/\s*\([^)]*\)\s*$/, '');

/** Find the genshin-db 15-length param array whose first 10 values match `tenVals`. */
function findExtended(charName, tenVals) {
    const t = gdb.talents(charName, { matchCategories: true }) || gdb.talents(baseName(charName), { matchCategories: true });
    if (!t) return null;
    for (const key of ['combat1', 'combat2', 'combat3']) {
        const c = t[key];
        if (!c?.attributes?.parameters) continue;
        for (const arr of Object.values(c.attributes.parameters)) {
            if (!Array.isArray(arr) || arr.length < 15) continue;
            const ok = tenVals.every((v, i) => Math.abs(arr[i] - v) < 0.001 * Math.max(1, Math.abs(v)));
            if (ok) return arr.slice(0, 15);
        }
    }
    return null;
}

function extendFile(filePath, exportName) {
    const src = fs.readFileSync(filePath, 'utf8');
    const m = src.match(new RegExp(`${exportName}[^=]*= (\\{[\\s\\S]*?\\n\\});\\n`));
    const overrides = eval('(' + m[1] + ')');
    let extended = 0, missing = 0, alreadyLong = 0;
    for (const [id, skills] of Object.entries(overrides)) {
        const name = nameOf(id);
        if (!name) { missing += Object.keys(skills).length; continue; }
        for (const [sid, vals] of Object.entries(skills)) {
            if (vals.length >= 15) { alreadyLong++; continue; }
            const arr15 = findExtended(name, vals);
            if (arr15) { skills[sid] = arr15.map((v) => Math.round(v * 10000) / 10000); extended++; }
            else missing++;
        }
    }
    return { overrides, extended, missing, alreadyLong };
}

function writeFile(filePath, exportName, overrides, headerNote) {
    const body = Object.entries(overrides).map(([id, skills]) => {
        const inner = Object.entries(skills).map(([sid, arr]) => `        ${sid}: [${arr.join(', ')}],`).join('\n');
        return `    ${JSON.stringify(id)}: {\n${inner}\n    },`;
    }).join('\n');
    const src = fs.readFileSync(filePath, 'utf8');
    const banner = src.slice(0, src.indexOf('export const'));
    const ts = `${banner}export const ${exportName}: Record<string, Record<string, number[]>> = {\n${body}\n};\n\nexport default ${exportName};\n`;
    fs.writeFileSync(filePath, ts);
}

const atkFile = path.join(GI_DIR, 'skill-multipliers.generated.ts');
const scaledFile = path.join(GI_DIR, 'skill-multipliers-scaled.generated.ts');

const atkResult = extendFile(atkFile, 'SKILL_MULTIPLIER_OVERRIDES');
writeFile(atkFile, 'SKILL_MULTIPLIER_OVERRIDES', atkResult.overrides);
console.log(`ATK-scaled: extended ${atkResult.extended}, missing ${atkResult.missing}, already-15 ${atkResult.alreadyLong}`);

const scaledResult = extendFile(scaledFile, 'SCALED_SKILL_MULTIPLIER_OVERRIDES');
writeFile(scaledFile, 'SCALED_SKILL_MULTIPLIER_OVERRIDES', scaledResult.overrides);
console.log(`HP/DEF-scaled: extended ${scaledResult.extended}, missing ${scaledResult.missing}, already-15 ${scaledResult.alreadyLong}`);
