/**
 * import-wuwa-weapon-scaling.cjs
 *
 * Bakes EXACT per-level (1-90) base-ATK/secondary scaling AND per-refinement (R1-R5)
 * passive multipliers for every Wuthering Waves weapon, so the Weapon Inspector's
 * level slider + R1-R5 selector show real in-game values.
 *
 * Level scaling source: the Dimbreath datamine `WeaponPropertyGrowth.json` — per
 * (CurveId, Level, BreachLevel) growth multipliers (Lv1/breach0 = 10000 = ×1.0,
 * Lv90/breach6 = ×12.5). Each weapon's ATK uses FirstCurve, its secondary uses
 * SecondCurve (from WeaponConf). The natural level→breach progression follows the
 * ascension caps below.
 *
 * Refinement source: `WeaponConf.DescParams` — the first percentage-formatted param
 * holds the exact R1-R5 passive values (e.g. "12.8%","16%","19.2%","22.4%","25.6%");
 * `refine` is each value's ratio to R1 (so R1 is always 1). Falls back to [1,1,1,1,1]
 * for weapons with no percentage DescParam (matches WW's near-universal
 * [1,1.25,1.5,1.75,2] refinement curve for the ones that do). Same compact format as
 * the GI bake: deduped normalized curves + per-weapon index.
 *
 * Run from repo root after `npm run build:main`: node scripts/import-wuwa-weapon-scaling.cjs
 * (accepts `WW_CACHE=<dir>` with ww-weaponconf.json + ww-multitext.json to skip the
 * slow 23MB TextMap fetch.) Emits: src/renderer/src/data/weapon-scaling.wuthering-waves.generated.ts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'weapon-scaling.wuthering-waves.generated.ts');
const { WEAPONS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'wuthering-waves', 'weapons.js'));

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };

// Breach (ascension) caps: breach b lets a weapon reach level CAPS[b].
const CAPS = [20, 40, 50, 60, 70, 80, 90];
const breachForLevel = (L) => { for (let b = 0; b < CAPS.length; b++) if (L <= CAPS[b]) return b; return 6; };

function makeCurveStore() {
    const list = [], bySig = new Map();
    return { add(v) { const sig = v.join(','); if (bySig.has(sig)) return bySig.get(sig); const i = list.length; list.push(v); bySig.set(sig, i); return i; }, list };
}

(async () => {
    console.log('loading WeaponConf + WeaponPropertyGrowth + TextMap…');
    // WW_CACHE=<dir> reads ww-weaponconf.json + ww-multitext.json locally (the 23MB
    // TextMap fetch is slow/flaky); WeaponPropertyGrowth is small and always fetched.
    const dir = process.env.WW_CACHE;
    const cached = (f) => JSON.parse(require('fs').readFileSync(require('path').join(dir, f), 'utf8'));
    const [wc, tm] = dir
        ? [cached('ww-weaponconf.json'), cached('ww-multitext.json')]
        : await Promise.all([get('ConfigDB/WeaponConf.json'), get('TextMap/en/MultiText.json')]);
    const wg = await get('ConfigDB/WeaponPropertyGrowth.json');
    const W = Array.isArray(wc) ? wc : Object.values(wc);
    const G = Array.isArray(wg) ? wg : Object.values(wg);

    // curveValue(cid, L): the growth multiplier at level L along its natural breach.
    const rowsByCurve = {};
    for (const r of G) (rowsByCurve[r.CurveId] ??= []).push(r);
    const valueAt = (cid, L) => {
        const rows = rowsByCurve[cid]; if (!rows) return null;
        const b = breachForLevel(L);
        const exact = rows.find((x) => x.Level === L && x.BreachLevel === b);
        if (exact) return exact.CurveValue;
        // Fallback: any row at this level (lowest breach = natural progression).
        const atL = rows.filter((x) => x.Level === L).sort((a, c) => a.BreachLevel - c.BreachLevel);
        return atL[0]?.CurveValue ?? null;
    };
    const normCurve = (cid) => {
        const denom = valueAt(cid, 90);
        if (!denom) return null;
        const out = [];
        for (let L = 1; L <= 90; L++) out.push(+((valueAt(cid, L) ?? denom) / denom).toFixed(5));
        return out;
    };

    const byName = {}; for (const w of W) byName[norm(tm[w.WeaponName] || '')] = w;
    const atkStore = makeCurveStore(), secStore = makeCurveStore();
    const flatIdx = secStore.add(new Array(90).fill(1)); // for weapons without a secondary curve
    const byId = {};
    let matched = 0, missing = [];

    for (const w of WEAPONS) {
        const dc = byName[norm(w.name)] || W.find((x) => norm(tm[x.WeaponName] || '').includes(norm(w.name)));
        if (!dc || !dc.FirstCurve) { missing.push(w.id); continue; }
        const atk = normCurve(dc.FirstCurve);
        if (!atk) { missing.push(w.id); continue; }
        const sec = dc.SecondCurve ? normCurve(dc.SecondCurve) : null;
        // Refinement (R1-R5) passive multiplier: from the first percentage DescParam
        // (its ArrayString holds the exact R1-R5 values; ratio to R1 = the multiplier).
        let refine = [1, 1, 1, 1, 1];
        const pctParam = (dc.DescParams || []).map((p) => p.ArrayString).find((a) => a && /%$/.test(a[0]));
        if (pctParam) { const r1 = parseFloat(pctParam[0]); if (r1) refine = pctParam.map((v) => +(parseFloat(v) / r1).toFixed(4)); }
        byId[w.id] = { a: atkStore.add(atk), s: sec ? secStore.add(sec) : flatIdx, refine };
        matched++;
    }

    const banner = `/**\n * Weapon level (1-90) + refinement (R1-R5) scaling for Wuthering Waves —\n * AUTO-GENERATED by scripts/import-wuwa-weapon-scaling.cjs (source: Dimbreath\n * datamine). Do not edit by hand.\n *\n * atkCurves/secCurves: deduped 90-length normalized curves (value at level L = base90 * curve[L-1]).\n * byId[weaponId] = { a: atkCurveIdx, s: secCurveIdx, refine: [R1..R5 passive multipliers] }.\n */\n`;
    const body =
        `export const atkCurves: number[][] = ${JSON.stringify(atkStore.list)};\n` +
        `export const secCurves: number[][] = ${JSON.stringify(secStore.list)};\n` +
        `export const byId: Record<string, { a: number; s: number; refine: number[] }> = ${JSON.stringify(byId)};\n`;
    fs.writeFileSync(OUT, banner + '\n' + body);
    console.log(`matched ${matched}/${WEAPONS.length} weapons; ${missing.length} without datamine data (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}).`);
    console.log(`deduped curves: ${atkStore.list.length} ATK, ${secStore.list.length} secondary.`);
    console.log(`wrote ${path.relative(ROOT, OUT)}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
