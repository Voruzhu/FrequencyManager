/* Genshin skill-multiplier importer — Project Amber (gi.yatta.moe).
 * Uses the LABELED promote[level].description to pick the representative DMG
 * param per skill, then reads all 10 talent levels. Emits accurate multipliers
 * + a confidence/diff report vs our authored tables. Does NOT write source. */
// Run from repo root after `npm run build:main`:
//   node scripts/import-gi-multipliers.mjs
// Regenerates adapters/game-definitions/genshin-impact/skill-multipliers.generated.ts
// (unambiguous, ATK-scaled NA/single-hit skill/burst multipliers from Project Amber).
//
// !!! DO NOT re-run this and blindly accept its output (2026-07-11 finding) !!!
// A "recheck all data" pass re-ran this fresh and it proposed ~88 "corrections",
// several wildly different (up to +237%). Cross-verified via genshin-db (an
// independent source) and found the CURRENT data is actually correct — the fresh
// pull is the one that's wrong: it reads a single {paramN} value even when the raw
// label is duplicated/multiplied, e.g. genshin-db's own labels show Ayaka's Charged
// Attack as "{param8}×3" (three hits) and Venti's 1-Hit DMG as "{param1}+{param1}"
// (two arrows) — this script's parser doesn't detect either pattern and would have
// silently HALVED or worse several characters' real per-cast damage if applied.
// Verified: Ayaka's current 1.86-3.39 ≈ genshin-db param8×3 (1.65-3.27, close
// match); the "corrected" 0.55-1.09 is just the bare per-hit value. If re-running
// this for a specific character, manually cross-check every proposed change
// against genshin-db's own labels for a "×N" or repeated "{paramX}+{paramX}"
// pattern first — do not trust the diff-percentage alone as a signal of which
// direction is correct.
const fs = require('fs');
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/genshin-impact';
const { CHARACTER_SKILLS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/skills.js');
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/characters.js');

const NAME_ALIAS = {
  'traveler-anemo': 'Anemo Traveler', 'traveler-geo': 'Geo Traveler', 'traveler-electro': 'Electro Traveler',
  'traveler-dendro': 'Dendro Traveler', 'traveler-hydro': 'Hydro Traveler',
  childe: 'Tartaglia', yunjin: 'Yun Jin', wanderer: 'Wanderer',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(12000) }); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(400);
  }
  return null;
}

// Parse a promote-level description array into [{label, idx}] where idx = params index.
function labelMap(descArr) {
  const out = [];
  (descArr || []).forEach((entry) => {
    if (!entry) return;
    const label = entry.split('|')[0].trim();
    const m = entry.match(/\{param(\d+)[:}]/);
    if (label && m) out.push({ label, idx: +m[1] - 1 });
  });
  return out;
}

// Character-specific representative labels the generic rules can't match (e.g.
// Ganyu's charged IS Frostflake Arrow, Lyney's aimed IS Prop Arrow). key = charId/skillId.
const SPECIAL = {
  'ganyu/charged': /^frostflake arrow dmg$/i,
  'lyney/aimed': /^prop arrow dmg$/i,
};

// Choose the representative param index for one of our skill ids, from a node's label map.
function pickIndex(skillId, labels, charId) {
  const has = (re) => labels.find((l) => re.test(l.label));
  const special = SPECIAL[`${charId}/${skillId}`];
  if (special) { const h = has(special); if (h) return { idx: h.idx, label: h.label, special: true }; }
  let hit;
  switch (skillId) {
    case 'na': hit = has(/^1-?Hit DMG/i) || has(/^1st.*DMG/i) || has(/Normal Attack.*DMG/i) || has(/DMG/i); break;
    case 'charged': hit = has(/Charged Attack DMG/i) || has(/Charged Attack Final/i) || has(/Charged Attack.*DMG/i) || has(/Charged.*DMG/i); break;
    case 'plunge': hit = has(/low\/high plunge dmg/i) || has(/high plunge dmg/i) || has(/^plunge dmg/i) || has(/plunge.*dmg/i); break;
    case 'aimed': hit = has(/Fully-?Charged Aimed Shot/i) || has(/Aimed Shot.*DMG/i) || has(/Aimed.*DMG/i); break;
    case 'skill': hit = has(/^Skill DMG/i) || has(/Press DMG/i) || has(/^Inheritance/i) || has(/DMG/i); break;
    case 'burst': hit = has(/Burst DMG/i) || has(/^Skill DMG/i) || has(/DMG/i); break;
    default: hit = has(/DMG/i);
  }
  return hit ? { idx: hit.idx, label: hit.label } : null;
}

// Node roles: first two type-0 nodes = NA, Skill; the type-1 node = Burst.
function nodeRoles(talent) {
  const nodes = Object.values(talent);
  const t0 = nodes.filter((n) => n.type === 0);
  const t1 = nodes.filter((n) => n.type === 1);
  return { na: t0[0], skill: t0[1], burst: t1[0] };
}

function extractSkill(node, skillId, charId) {
  if (!node || !node.promote) return null;
  const p1 = node.promote['1'];
  if (!p1) return null;
  const labels = labelMap(p1.description);
  const dmgCount = labels.filter((l) => /dmg/i.test(l.label) && !/(shield|absorb|heal|additional|regen)/i.test(l.label)).length;
  const pick = pickIndex(skillId, labels, charId);
  if (!pick) return null;
  pick.dmgCount = dmgCount;
  const vals = [];
  for (let l = 1; l <= 10; l++) {
    const pr = node.promote[String(l)];
    const v = pr && pr.params ? pr.params[pick.idx] : null;
    vals.push(v == null ? null : +(+v).toFixed(4));
  }
  if (vals.some((v) => v == null)) return null;
  return { multipliers: vals, label: pick.label, dmgCount: pick.dmgCount, special: pick.special };
}

(async () => {
  const list = await getJSON('https://gi.yatta.moe/api/v2/en/avatar');
  const nameToId = {};
  for (const [id, v] of Object.entries(list.data.items)) nameToId[v.name.toLowerCase()] = id;
  const result = {}; const report = []; const safeSet = []; const safeCorrections = []; const generated = {};
  for (const c of CHARACTERS) {
    const ours = CHARACTER_SKILLS[c.id];
    if (!ours) continue;
    const amberId = nameToId[(NAME_ALIAS[c.id] || c.name).toLowerCase()];
    if (!amberId) { report.push(`${c.id}: NO AMBER ID (name '${c.name}')`); continue; }
    const d = await getJSON('https://gi.yatta.moe/api/v2/en/avatar/' + amberId);
    if (!d || !d.data || !d.data.talent) { report.push(`${c.id}: fetch failed`); continue; }
    const roles = nodeRoles(d.data.talent);
    result[c.id] = {};
    for (const s of ours) {
      const node = s.id === 'burst' ? roles.burst : (['skill'].includes(s.id) ? roles.skill : roles.na);
      const ex = extractSkill(node, s.id, c.id);
      if (!ex) { report.push(`${c.id}/${s.id}: no label match`); continue; }
      // Confidence: only auto-apply ATK-scaled skills whose label is CANONICAL and
      // clearly a DMG param (not shield/heal/additional/absorption). HP/DEF/EM
      // scalers keep our authored values (the ATK param would be wrong).
      const scaling = s.scaling ?? 'atk';
      const L = ex.label.toLowerCase();
      const badLabel = /(shield|absorb|heal|additional|regen|cd|duration|stamina|energy)/.test(L);
      // EXACT canonical labels only — the official per-instance DMG. Anything
      // fuzzier (Press/Cyclic/named-ability/Additional) stays authored.
      const canonical =
        (s.id === 'na' && /^1-?hit dmg$/.test(L)) ||
        (s.id === 'charged' && /^charged attack dmg$/.test(L)) ||
        (s.id === 'plunge' && /^(low\/high plunge dmg|high plunge dmg)$/.test(L)) ||
        (s.id === 'aimed' && /^(fully-?charged aimed shot dmg|aimed shot dmg)$/.test(L)) ||
        (s.id === 'skill' && /^skill dmg$/.test(L)) ||
        (s.id === 'burst' && /^burst dmg$/.test(L));
      // Auto-apply any exact-canonical (or character-specific SPECIAL) ATK-scaled
      // entry — the labeled value is authoritative. HP/DEF/EM scalers stay authored.
      const safe = scaling === 'atk' && !badLabel && (canonical || ex.special);
      result[c.id][s.id] = { real: ex.multipliers, ours: s.multipliers, label: ex.label, scaling, safe, dmgCount: ex.dmgCount };
      if (safe) { safeSet.push(`${c.id}/${s.id}`); (generated[c.id] ??= {})[s.id] = ex.multipliers; }
      const dev = (a, b) => (b === 0 ? (a === 0 ? 0 : 1) : Math.abs(a - b) / Math.abs(b));
      const maxDev = Math.max(dev(s.multipliers[0], ex.multipliers[0]), dev(s.multipliers[9], ex.multipliers[9]));
      result[c.id][s.id].maxDev = +(maxDev * 100).toFixed(1);
      if (safe && maxDev > 0.05) safeCorrections.push(`${c.id}/${s.id}: ${(maxDev*100).toFixed(0)}%  ours[${s.multipliers[0]}..${s.multipliers[9]}]→real[${ex.multipliers[0]}..${ex.multipliers[9]}]`);
    }
    await sleep(120);
  }
  // Emit the .generated.ts override module.
  const gcount = Object.values(generated).reduce((n, s) => n + Object.keys(s).length, 0);
  let bodyTs = '';
  for (const [cid, skills] of Object.entries(generated)) {
    const inner = Object.entries(skills).map(([sid, arr]) => `        ${/^[a-z][a-z0-9_]*$/.test(sid) ? sid : JSON.stringify(sid)}: [${arr.join(', ')}]`).join(',\n');
    bodyTs += `    ${JSON.stringify(cid)}: {\n${inner},\n    },\n`;
  }
  const ts = `/**\n * @fileoverview AUTO-GENERATED accurate skill multipliers (Genshin Impact)\n * @module adapters/game-definitions/genshin-impact/skill-multipliers.generated\n *\n * Per-level (1-10) talent multipliers imported from Project Amber (gi.yatta.moe)\n * via scripts/import-gi-multipliers.cjs, using the labeled promote-level\n * descriptions. Only UNAMBIGUOUS, ATK-scaled entries: Normal-Attack 1-Hit DMG and\n * single-hit Skill/Burst DMG. HP/DEF/EM scalers and multi-hit skills are omitted\n * (they keep their curated values in skills.ts). Overrides the authored\n * \\\`multipliers\\\` in bundle.ts. DO NOT edit by hand — re-run the importer.\n * ${gcount} entries across ${Object.keys(generated).length} characters.\n */\n\nexport const SKILL_MULTIPLIER_OVERRIDES: Record<string, Record<string, number[]>> = {\n${bodyTs}};\n\nexport default SKILL_MULTIPLIER_OVERRIDES;\n`;
  fs.writeFileSync(OUT + '/skill-multipliers.generated.ts', ts);
  let entries = 0; for (const c of Object.values(result)) entries += Object.keys(c).length;
  console.log(`Wrote skill-multipliers.generated.ts: ${gcount} overrides.`);
  const naSafe = safeSet.filter((k) => k.endsWith('/na')).length;
  console.log(`Extracted ${entries} entries across ${Object.keys(result).length} chars.`);
  console.log(`UNAMBIGUOUS auto-apply set: ${safeSet.length}  (na: ${naSafe}, skill/burst single-hit: ${safeSet.length - naSafe})`);
  console.log(`  of those, correcting our value >5%: ${safeCorrections.length}`);
  console.log('\n--- corrections being applied (>5%) ---');
  safeCorrections.slice(0, 45).forEach((r) => console.log('  ' + r));
  if (safeCorrections.length > 45) console.log(`  ...and ${safeCorrections.length - 45} more`);
})();
