/* Generate roster + skills + uiOptions blocks for GI characters missing from our
 * roster, from genshin-db. Requires `npm i -D genshin-db`. Outputs 3 files under
 * scripts/out/ that get inserted into characters.ts / skills.ts / definition.ts. */
const fs = require('fs');
const gdb = require('genshin-db');
const ROOT = process.cwd();
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/characters.js');
const OUTDIR = ROOT + '/scripts/out'; fs.mkdirSync(OUTDIR, { recursive: true });

const slug = (s) => s.toLowerCase().replace(/[''’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const ourNames = CHARACTERS.map((c) => c.name.toLowerCase().replace(/[^a-z]/g, ''));
const ourIds = new Set(CHARACTERS.map((c) => c.id));
const has = (n) => { const k = n.toLowerCase().replace(/[^a-z]/g, ''); return ourNames.some((o) => o.includes(k) || k.includes(o.replace(/scaramouche|tartaglia/, ''))); };

// scaling stat from a genshin-db attribute label
function scalingFrom(rest) { if (/Max HP/i.test(rest)) return 'hp'; if (/\bDEF\b/i.test(rest)) return 'def'; return 'atk'; }
// pick representative DMG component for a combat node -> {vals[10], scaling}
function skillFrom(node, kind) {
  if (!node || !node.attributes) return null;
  const A = node.attributes; const labels = A.labels || [];
  const canon = kind === 'na' ? /^1-?hit dmg/i : kind === 'skill' ? /^skill dmg$/i : /^burst dmg$/i;
  let pick = labels.find((l) => canon.test(l.split('|')[0].trim()));
  if (!pick) pick = labels.find((l) => { const lbl = l.split('|')[0]; const rest = l.slice(l.indexOf('|') + 1); return /dmg/i.test(lbl) && !/(shield|heal|absorb|regen|restore|bonus|per second|duration|\bcd\b)/i.test(lbl) && /param/.test(rest); });
  if (!pick) return null;
  const rest = pick.slice(pick.indexOf('|') + 1);
  const m = rest.match(/\{param(\d+)[:}]/); if (!m) return null;
  const arr = A.parameters['param' + m[1]]; if (!arr || arr.length < 10) return null;
  return { vals: arr.slice(0, 10).map((x) => +(+x).toFixed(4)), scaling: scalingFrom(rest), label: pick.split('|')[0].trim() };
}

const rosterLines = [], skillBlocks = [], uiLines = [], report = [];
const list = gdb.characters('names', { matchCategories: true });
for (const n of list) {
  const c = gdb.characters(n); if (!c) continue;
  if (['Aether', 'Lumine'].includes(c.name) || /traveler/i.test(c.name)) continue;
  if (!c.elementText || c.elementText === 'None') continue;
  if (has(c.name)) continue;
  let id = slug(c.name); if (ourIds.has(id)) id = id + '_c'; ourIds.add(id);
  const s = c.stats(90); if (!s) { report.push(`${c.name}: no stats`); continue; }
  const el = c.elementText, wt = c.weaponText;
  rosterLines.push(`    { id: '${id}', name: ${JSON.stringify(c.name)}, element: '${el}', weapon: '${wt}', rarity: ${c.rarity}, baseAtk: ${Math.round(s.attack)}, baseHp: ${Math.round(s.hp)}, baseDef: ${Math.round(s.defense)}, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, baseElementalMastery: 0, icon: 'icons/characters/${id}.png' },`);
  uiLines.push(`            { value: '${id}', label: ${JSON.stringify(c.name)} },`);
  // skills
  const t = gdb.talents(c.name);
  const sk = {};
  if (t) { const na = skillFrom(t.combat1, 'na'); const skill = skillFrom(t.combat2, 'skill'); const burst = skillFrom(t.combat3, 'burst');
    if (na) sk.na = na; if (skill) sk.skill = skill; if (burst) sk.burst = burst; }
  if (Object.keys(sk).length) {
    const naName = t.combat1 ? t.combat1.name : 'Normal Attack';
    const inner = Object.entries(sk).map(([sid, x]) => `        { id: '${sid}', name: ${JSON.stringify((sid === 'na' ? naName : (sid === 'skill' ? (t.combat2 && t.combat2.name) : (t.combat3 && t.combat3.name)) || sid))}, type: '${sid === 'na' ? 'Normal' : sid === 'skill' ? 'Skill' : 'Burst'}', scaling: '${x.scaling}', element: '${sid === 'na' && x.scaling === 'atk' ? (['Bow','Catalyst'].includes(wt) ? el : 'Physical') : el}',\n            multipliers: [${x.vals.join(', ')}] },`).join('\n');
    skillBlocks.push(`    ${id}: [\n${inner}\n    ],`);
  } else report.push(`${c.name}: no skills extracted`);
}
fs.writeFileSync(OUTDIR + '/gi-roster.txt', rosterLines.join('\n'));
fs.writeFileSync(OUTDIR + '/gi-skills.txt', skillBlocks.join('\n'));
fs.writeFileSync(OUTDIR + '/gi-ui.txt', uiLines.join('\n'));
console.log(`Generated ${rosterLines.length} roster, ${skillBlocks.length} skill blocks, ${uiLines.length} ui lines.`);
if (report.length) console.log('notes:\n  ' + report.join('\n  '));
