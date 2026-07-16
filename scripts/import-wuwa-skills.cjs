/* WuWa skill-multiplier importer from the Dimbreath datamine.
 * Run from repo root after `npm run build:main`:
 *   node --max-old-space-size=2048 scripts/import-wuwa-skills.cjs
 * Chain: RoleInfo -> SkillTree(NodeGroup) -> Skill(SkillType) -> SkillDescription
 * (SkillLevelGroupId) -> primary DMG AttributeName -> per-level ArrayString.
 * SkillType 1=Basic 2=Resonance-Skill 3=Liberation(ult) 6=Forte Circuit. Multi-hit
 * "X%*N" is summed to a per-cast total. Emits skill-multipliers.generated.ts.
 *
 * CORRECTED 2026-07-11 (user: "Fix the WW Forte SkillType bug"): SkillType 4 is
 * actually "Inherent Skill" (see character-passives.generated.ts /
 * curate-ww-character-passives.cjs), not Forte — confirmed by direct inspection:
 * type-4 records have almost zero DamageList/BuffList (pure passive text, always
 * exactly 2 per character), while the REAL Forte (type 6) carries a proper
 * multi-hit DamageList. The old `4:'forte'` mapping had been silently returning
 * WRONG numbers for 24/44 characters (either genuinely wrong values sourced via
 * an accidental SkillLevelGroupId collision, or entirely fabricated for 10
 * characters whose real Forte turned out to have NO standalone damage row at
 * all — their Forte-state damage is explicitly re-categorized as Basic/Skill
 * DMG in the source text, e.g. Chixia's "Thermobaric Bullets ... considered as
 * Resonance Skill DMG" — a separate `forte` entry for these would double-count
 * against their own basic/skill multiplier). Re-deriving via the correct type
 * ALSO surfaced 20 more characters with real Forte damage data that the old
 * bug's search had missed entirely (previously assumed "genuinely no Forte
 * data" — that conclusion was itself a byproduct of searching the wrong type).
 * See DATA_PROGRESS.md and the ww-character-selfbuffs memory for the full story. */
const fs = require('fs');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/wuthering-waves';
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/wuthering-waves/characters.js');
const { CHARACTER_SKILLS } = require(ROOT + '/dist/adapters/game-definitions/wuthering-waves/skills.js');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };
const ALIAS = { 'Rover (Spectro)': 'Rover', Shorekeeper: 'Shorekeeper' };

const TYPE_TO_ID = { 1: 'basic', 2: 'skill', 3: 'ult', 6: 'forte' };
// primary DMG label per skill type
const PICK = {
  basic: [/^stage 1 dmg$/i, /^basic attack.*dmg$/i, /dmg/i],
  skill: [/^skill dmg$/i, /^resonance skill.*dmg$/i, /dmg/i],
  ult: [/^resonance liberation.*dmg$/i, /^stage 1 dmg$/i, /dmg/i],
  forte: [/forte.*dmg/i, /^stage 1 dmg$/i, /dmg/i],
};
// "16.88%*4" -> 0.675 total ; "117.00%" -> 1.17
function parseVal(s) {
  const m = String(s).match(/([\d.]+)%(?:\*(\d+))?/);
  if (!m) return null;
  return +((parseFloat(m[1]) / 100) * (m[2] ? +m[2] : 1)).toFixed(4);
}

(async () => {
  console.log('fetching datamine...');
  // WW_CACHE=<dir with ww-multitext.json> reuses the already-downloaded 23MB TextMap
  // (slow/flaky to re-fetch) — the other 4 config files are small and always fetched fresh.
  const cacheDir = process.env.WW_CACHE;
  const tmPromise = cacheDir
    ? Promise.resolve(JSON.parse(fs.readFileSync(cacheDir + '/ww-multitext.json', 'utf8')))
    : get('TextMap/en/MultiText.json');
  const [role, tree, skill, desc, tm] = await Promise.all([
    get('ConfigDB/RoleInfo.json'), get('ConfigDB/SkillTree.json'), get('ConfigDB/Skill.json'),
    get('ConfigDB/SkillDescription.json'), tmPromise,
  ]);
  const R = (Array.isArray(role) ? role : Object.values(role)).filter((x) => x.Id >= 1000 && x.Id < 2000);
  const T = Array.isArray(tree) ? tree : Object.values(tree);
  const S = Array.isArray(skill) ? skill : Object.values(skill);
  const D = Array.isArray(desc) ? desc : Object.values(desc);
  const nm = (k) => tm[k] || String(k);
  const byName = {}; for (const x of R) byName[norm(nm(x.Name))] = x;

  const gen = {}; const rows = []; let notFound = 0;
  for (const c of CHARACTERS) {
    const ours = CHARACTER_SKILLS[c.id]; if (!ours) continue;
    const want = norm(ALIAS[c.name] || c.name);
    const ri = byName[want] || R.find((x) => norm(nm(x.Name)).includes(want) || want.includes(norm(nm(x.Name))));
    if (!ri) { rows.push(`  NOT FOUND: ${c.id}`); notFound++; continue; }
    const nodeSkillIds = new Set(T.filter((x) => x.NodeGroup === ri.SkillTreeGroupId).map((n) => n.SkillId).filter(Boolean));
    for (const [type, sid] of Object.entries(TYPE_TO_ID)) {
      if (!ours.find((s) => s.id === sid)) continue;
      const sk = S.find((x) => nodeSkillIds.has(x.Id) && x.SkillType === +type);
      if (!sk) continue;
      const descs = D.filter((x) => x.SkillLevelGroupId === sk.SkillLevelGroupId && x.SkillDetailNum && /dmg/i.test(nm(x.AttributeName)));
      if (!descs.length) continue;
      // A "dmg"-labeled row can still be a FLAT, non-percentage proc/coordinated-
      // attack instance (e.g. Galbrena's "Hellstride DMG": ["666","666",...],
      // literally a fixed number, not a %-multiplier) — parseVal would silently
      // turn every one of those into `null`. Require every value in the row to be
      // %-formatted BEFORE accepting it as a candidate, so the PICK chain falls
      // through to the next (real) %-based row instead of failing the whole skill.
      const isPercentRow = (x) => { const a = x.SkillDetailNum[0] && x.SkillDetailNum[0].ArrayString; return a && a.length >= 10 && a.slice(0, 10).every((v) => /%/.test(v)); };
      let chosen = null;
      for (const re of PICK[sid]) { chosen = descs.find((x) => re.test(nm(x.AttributeName)) && isPercentRow(x)); if (chosen) break; }
      if (!chosen) continue;
      const arr = chosen.SkillDetailNum[0] && chosen.SkillDetailNum[0].ArrayString;
      if (!arr) continue;
      const vals = arr.slice(0, 10).map(parseVal);
      if (vals.length !== 10 || vals.some((v) => v == null)) continue;
      (gen[c.id] ??= {})[sid] = vals;
      const auth = ours.find((s) => s.id === sid);
      rows.push(`  ${c.id}/${sid}: ${auth.multipliers[0]}..${auth.multipliers[9]} -> ${vals[0]}..${vals[9]}  ("${nm(chosen.AttributeName)}")`);
    }
  }

  const body = Object.entries(gen).map(([cid, sk]) => {
    const inner = Object.entries(sk).map(([sid, arr]) => `        ${sid}: [${arr.join(', ')}]`).join(',\n');
    return `    ${JSON.stringify(cid)}: {\n${inner},\n    },`;
  }).join('\n');
  const total = Object.values(gen).reduce((n, s) => n + Object.keys(s).length, 0);
  const ts = `/**
 * @fileoverview AUTO-GENERATED WuWa skill multipliers (Dimbreath datamine)
 * @module adapters/game-definitions/wuthering-waves/skill-multipliers.generated
 *
 * Per-level (1-10) skill multipliers from SkillDescription. For each skill type
 * (Basic/Resonance-Skill/Liberation/Forte) the primary DMG component is used;
 * multi-hit "X%*N" is summed to a per-cast total. Overrides authored tables in
 * bundle.ts. DO NOT edit by hand — re-run scripts/import-wuwa-skills.cjs.
 * ${total} entries across ${Object.keys(gen).length} resonators.
 */

export const SKILL_MULTIPLIER_OVERRIDES: Record<string, Record<string, number[]>> = {
${body}
};

export default SKILL_MULTIPLIER_OVERRIDES;
`;
  fs.writeFileSync(OUT + '/skill-multipliers.generated.ts', ts);
  console.log(`WuWa skill overrides: ${total} across ${Object.keys(gen).length} resonators | not-found: ${notFound}`);
  rows.slice(0, 50).forEach((r) => console.log(r));
  if (rows.length > 50) console.log(`  ...and ${rows.length - 50} more`);
})();
