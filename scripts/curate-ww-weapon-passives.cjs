/**
 * curate-ww-weapon-passives.cjs
 *
 * Small hand-verified override layer on top of import-wuwa-weapon-passives.cjs's
 * auto-generated selfBuffs, for a handful of weapons whose real passive text has a
 * structure the regex parser genuinely can't handle:
 *   - "increases A and B by X%" (ONE placeholder value shared by TWO stat mentions
 *     joined by "and") — the parser only ever captures the FIRST stat match per
 *     placeholder, so the second stat is silently dropped (hollow-mirage's ATK half
 *     of "ATK and DEF by 3%", lumingloss's Basic half of "Basic... and Heavy... by
 *     20%").
 *   - a SECOND, independent trigger granting the SAME stat+scope+conditional as an
 *     already-captured entry (red-spring's Concerto-Energy-consumed 40% Basic DMG,
 *     on top of its already-captured 30%-at-3-stacks Basic DMG from a different
 *     trigger) — the generator's own dedup (by stat+scope+conditional) collapses
 *     these into one, keeping only the first.
 *   - a genuinely MISSED mechanic entirely (emerald-sentence's "Bamboo Cleaver" self
 *     Heavy DMG+60% at 2 stacks — present in the passive text but never matched by
 *     any {i} placeholder pattern the parser recognizes).
 * Run AFTER import-wuwa-weapon-passives.cjs (which fully regenerates weapons.ts and
 * would silently wipe anything appended only here). Idempotent — checks each
 * weapon's existing array before appending, never duplicates on re-run.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'adapters', 'game-definitions', 'wuthering-waves', 'weapons.ts');

/** id -> extra selfBuffs entries to append (only if not already present by exact match). */
const EXTRA = {
    'hollow-mirage': [{ stat: 'atkPct', label: 'ATK% · 3 stacks', value: 9, conditional: true }],
    'lumingloss': [{ stat: 'elemDmg', label: 'Basic DMG', value: 20, conditional: true, appliesTo: ['basic'] }],
    'red-spring': [{ stat: 'elemDmg', label: 'Basic DMG · Concerto Energy consumed', value: 40, conditional: true, appliesTo: ['basic'] }],
    // emerald-sentence's team-wide "20% Echo Skill DMG Bonus to all Resonators" is
    // NOT modeled — "Echo Skill" isn't an attack-type our appliesTo scope vocabulary
    // (basic/heavy/skill/ult/plunge/aimed/intro/outro/forte) can express.
    'emerald-sentence': [{ stat: 'elemDmg', label: 'Heavy DMG · Bamboo Cleaver, 2 stacks', value: 60, conditional: true, appliesTo: ['heavy'] }],
    // Woodland Aria's "Inflicting Aero Erosion... gives 24% Aero DMG Bonus" is a
    // clean self buff, but its trigger clause names the "Aero Erosion" status effect
    // right next to the placeholder — the parser's NOT_A_BUFF guard (which exists to
    // reject reaction/status-SCALED effects like "Amplifies ... Erosion DMG") false-
    // positived on the status NAME appearing in the trigger condition, not the
    // effect itself. Its second mention ("reduces their Aero RES by 10%") is a
    // genuine enemy RES-shred — same convention as GI's Zhongli/Citlali/Lisa
    // (modeled as effective elemDmg) — added as a separate always-different-trigger entry.
    'woodland-aria': [
        { stat: 'elemDmg', label: 'Aero DMG Bonus', value: 24, conditional: true },
        { stat: 'elemDmg', label: 'Aero DMG · RES shred', value: 10, conditional: true },
    ],
    // Luminous Hymn: "14% Basic Attack DMG Bonus AND 14% Heavy Attack DMG Bonus,
    // stacking up to 3 times" — same "A and B by X%" single-placeholder limitation
    // as hollow-mirage/lumingloss; real max is 14*3=42% for EACH scope.
    'luminous-hymn': [
        { stat: 'elemDmg', label: 'Basic DMG · 3 stacks', value: 42, conditional: true, appliesTo: ['basic'] },
        { stat: 'elemDmg', label: 'Heavy DMG · 3 stacks', value: 42, conditional: true, appliesTo: ['heavy'] },
    ],
};

let src = fs.readFileSync(FILE, 'utf8');
let added = 0, skipped = 0;
for (const [id, extras] of Object.entries(EXTRA)) {
    const lineRe = new RegExp(`(\\{ id: "${id}"[\\s\\S]*?selfBuffs: )(\\[.*?\\])(, icon:)`);
    const m = src.match(lineRe);
    if (!m) { console.log('NO MATCH:', id); continue; }
    const arr = JSON.parse(m[2]);
    const existingKeys = new Set(arr.map((b) => JSON.stringify(b)));
    const toAdd = extras.filter((e) => !existingKeys.has(JSON.stringify(e)));
    if (toAdd.length === 0) { skipped++; continue; }
    const next = [...arr, ...toAdd];
    src = src.replace(lineRe, `$1${JSON.stringify(next)}$3`);
    added += toAdd.length;
}
fs.writeFileSync(FILE, src);
console.log(`curate-ww-weapon-passives: added ${added} entries, ${skipped} weapons already up to date.`);
