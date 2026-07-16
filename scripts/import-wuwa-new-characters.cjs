/* Generate roster + skills + uiOptions blocks for WuWa resonators missing from our
 * roster, from the Dimbreath datamine. Only includes resonators with COMPLETE data
 * (base stats + basic/skill/ult skills) — a released-vs-beta filter. Run:
 *   node --max-old-space-size=2048 scripts/import-wuwa-new-characters.cjs */
const fs = require('fs');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = process.cwd();
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/wuthering-waves/characters.js');
const OUTDIR = ROOT + '/scripts/out'; fs.mkdirSync(OUTDIR, { recursive: true });
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };
const slug = (s) => s.toLowerCase().replace(/[''’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ELEM = { 1: 'Glacio', 2: 'Fusion', 3: 'Electro', 4: 'Aero', 5: 'Spectro', 6: 'Havoc' };
const WEAP = { 1: 'Broadblade', 2: 'Sword', 3: 'Pistols', 4: 'Gauntlets', 5: 'Rectifier' };
const TYPE_ID = { 1: 'basic', 2: 'skill', 3: 'ult', 4: 'forte' };
const PICK = { basic: [/^stage 1 dmg$/i, /^basic attack.*dmg$/i, /dmg/i], skill: [/^skill dmg$/i, /dmg/i], ult: [/^resonance liberation.*dmg$/i, /^stage 1 dmg$/i, /dmg/i], forte: [/forte.*dmg/i, /dmg/i] };
const parseVal = (s) => { const m = String(s).match(/([\d.]+)%(?:\*(\d+))?/); return m ? +((parseFloat(m[1]) / 100) * (m[2] ? +m[2] : 1)).toFixed(4) : null; };

(async () => {
  console.log('fetching...');
  const [role, base, growth, tree, skill, desc, tm] = await Promise.all([
    get('ConfigDB/RoleInfo.json'), get('ConfigDB/BaseProperty.json'), get('ConfigDB/RolePropertyGrowth.json'),
    get('ConfigDB/SkillTree.json'), get('ConfigDB/Skill.json'), get('ConfigDB/SkillDescription.json'), get('TextMap/en/MultiText.json'),
  ]);
  const R = (Array.isArray(role) ? role : Object.values(role)).filter((x) => x.Id >= 1000 && x.Id < 2000);
  const B = Array.isArray(base) ? base : Object.values(base);
  const G = Array.isArray(growth) ? growth : Object.values(growth);
  const T = Array.isArray(tree) ? tree : Object.values(tree);
  const S = Array.isArray(skill) ? skill : Object.values(skill);
  const D = Array.isArray(desc) ? desc : Object.values(desc);
  const nm = (k) => tm[k] || '';
  const maxLv = Math.max(...G.map((x) => x.Level));
  const g = G.find((x) => x.Level === maxLv && x.BreachLevel === 6) || G.filter((x) => x.Level === maxLv).pop();
  const ours = new Set(CHARACTERS.map((c) => c.name.toLowerCase().replace(/[^a-z]/g, '')));

  const rosterLines = [], skillBlocks = [], uiLines = [], skipped = [];
  for (const x of R) {
    const name = nm(x.Name); if (!name || /rover|\{/i.test(name)) continue;
    if (ours.has(name.toLowerCase().replace(/[^a-z]/g, ''))) continue;
    const el = ELEM[x.ElementId], weap = WEAP[x.WeaponType]; if (!el || !weap) continue;
    const bp = B.find((b) => b.Id === x.PropertyId && b.Lv === 1); if (!bp) { skipped.push(name + ' (no base)'); continue; }
    const id = slug(name);
    // skills
    const nodeIds = new Set(T.filter((t) => t.NodeGroup === x.SkillTreeGroupId).map((n) => n.SkillId).filter(Boolean));
    const sk = {};
    for (const [type, sid] of Object.entries(TYPE_ID)) {
      const s = S.find((y) => nodeIds.has(y.Id) && y.SkillType === +type); if (!s) continue;
      const dm = D.filter((d) => d.SkillLevelGroupId === s.SkillLevelGroupId && d.SkillDetailNum && /dmg/i.test(nm(d.AttributeName)));
      if (!dm.length) continue;
      let chosen = null; for (const re of PICK[sid]) { chosen = dm.find((d) => re.test(nm(d.AttributeName))); if (chosen) break; }
      if (!chosen || !chosen.SkillDetailNum[0] || !chosen.SkillDetailNum[0].ArrayString) continue;
      const vals = chosen.SkillDetailNum[0].ArrayString.slice(0, 10).map(parseVal);
      if (vals.length === 10 && !vals.some((v) => v == null)) sk[sid] = vals;
    }
    // released filter: require basic + skill + ult
    if (!(sk.basic && sk.skill && sk.ult)) { skipped.push(name + ' (incomplete skills — likely beta)'); continue; }
    rosterLines.push(`    { id: '${id}', name: ${JSON.stringify(name)}, element: '${el}', weapon: '${weap}', baseAtk: ${Math.round(bp.Atk * g.AtkRatio / 10000)}, baseHp: ${Math.round(bp.LifeMax * g.LifeMaxRatio / 10000)}, baseDef: ${Math.round(bp.Def_ * g.DefRatio / 10000)}, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/${id}.png' },`);
    uiLines.push(`            { value: '${id}', label: ${JSON.stringify(name)} },`);
    const NAMES = { basic: 'Basic Attack', skill: 'Resonance Skill', ult: 'Resonance Liberation', forte: 'Forte Circuit' };
    const TYPES = { basic: 'Basic', skill: 'Skill', ult: 'Ultimate', forte: 'Forte' };
    const inner = Object.entries(sk).map(([sid, vals]) => `        { id: '${sid}', name: '${NAMES[sid]}', type: '${TYPES[sid]}', scaling: 'atk', element: '${el}',\n            multipliers: [${vals.join(', ')}] },`).join('\n');
    skillBlocks.push(`    '${id}': [\n${inner}\n    ],`);
  }
  fs.writeFileSync(OUTDIR + '/ww-roster.txt', rosterLines.join('\n'));
  fs.writeFileSync(OUTDIR + '/ww-skills.txt', skillBlocks.join('\n'));
  fs.writeFileSync(OUTDIR + '/ww-ui.txt', uiLines.join('\n'));
  console.log(`Added ${rosterLines.length} resonators. Skipped ${skipped.length} (likely beta/incomplete):`);
  skipped.forEach((s) => console.log('  ' + s));
})();
