// scripts/generate-character-wiki-art.cjs
//
// Builds shared/game-data/character-wiki-art.ts by guessing each character's
// Fandom file title (see CANDIDATE_TEMPLATES per game below) and verifying
// it resolves via the wiki's own imageinfo API. Characters that don't
// resolve on ANY candidate are printed as a MISS list at the end for manual
// title correction (see OVERRIDES below) — this script does NOT assume 100%
// coverage, it reports the real gap.
//
// Run AFTER `npm run build:main` (reads compiled character lists from dist/).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Manual corrections for characters whose real wiki file title doesn't match
// ANY of the guessed candidates below — confirmed one-by-one against the
// real API during this script's development (Travelers/Rover have no
// per-variant art at all on the wiki; Childe/Yun Jin/Verina/Yangyang:
// Xuanling use names or punctuation that can't be derived from this
// project's own character.name field).
const OVERRIDES = {
    'genshin-impact': {
        // Never actually pulled from the gacha (story-obtained) — no Wish
        // splash art exists on the wiki for either Traveler at all.
        'traveler-anemo': 'Traveler Male Card.png',
        'traveler-geo': 'Traveler Male Card.png',
        'traveler-electro': 'Traveler Male Card.png',
        'traveler-dendro': 'Traveler Male Card.png',
        'traveler-hydro': 'Traveler Male Card.png',
        'childe': 'Character Tartaglia Full Wish.png',
        'yunjin': 'Character Yun Jin Full Wish.png',
    },
    'wuthering-waves': {
        'rover-spectro': 'Rover 1.png',
        'rover-havoc': 'Rover 1.png',
        'rover-aero': 'Rover 1.png',
        'rover-electro': 'Rover 1.png',
        'verina': "Verina's Card.jpg",
        'yangyang-xuanling': 'Yangyang Xuanling Card.jpg',
    },
};

// GI: the real in-game gacha "Wish" splash art — `Character_{Name}_Full_
// Wish.png` — is a COMPLETELY DIFFERENT asset from `{Name} Card.png` (a
// vertical poster/social-share graphic with the Genshin logo baked in) and
// is what this project actually wants: confirmed by direct visual
// comparison (Hu Tao) that "Card" is real official art too, but "Full Wish"
// is the recognizable transparent-background action-pose art used in the
// actual pull/showcase screen — the more correct choice for a build card.
// Spot-checked across 9 characters (old/new, 4-star/5-star) before
// committing to this as the primary template; only Traveler (never gacha-
// pulled) has no Wish art at all, hence the Card.png override above.
//
// WW's wiki has BOTH "Splash Art" and "Card" files for most characters —
// both are real official art, but a verification pass (comparing against
// MediaWiki's own canonical "page image" for each character's page) showed
// "Card" is the wiki's actual primary choice almost everywhere, AND "Card"
// files carry Kuro's own visible logo/copyright watermark baked into the
// image — the strongest available evidence of authenticity.
const CANDIDATE_TEMPLATES = {
    'genshin-impact': (baseName) => [
        `Character ${baseName} Full Wish.png`,
        `${baseName} Card.png`,
        `${baseName} Card.jpg`,
    ],
    'wuthering-waves': (baseName) => [
        `${baseName} Card.png`,
        `${baseName} Card.jpg`,
        `${baseName} Splash Art.png`,
        `${baseName} Splash Art.jpg`,
    ],
};

const WIKIS = {
    'genshin-impact': { host: 'genshin-impact.fandom.com' },
    'wuthering-waves': { host: 'wutheringwaves.fandom.com' },
};

async function resolveTitle(host, title) {
    const url = `https://${host}/api.php?action=query&titles=${encodeURIComponent('File:' + title)}&prop=imageinfo&iiprop=url&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const json = await res.json();
    const pages = json?.query?.pages ?? {};
    return Object.values(pages).some((p) => Array.isArray(p.imageinfo) && p.imageinfo.length > 0);
}

async function main() {
    const out = {};
    const misses = [];

    for (const [gameId, { host }] of Object.entries(WIKIS)) {
        const { CHARACTERS } = require(path.join(ROOT, 'dist/adapters/game-definitions', gameId, 'characters.js'));
        for (const c of CHARACTERS) {
            const override = OVERRIDES[gameId]?.[c.id];
            const baseName = c.name.replace(/\s*\([^()]*\)\s*/g, ' ').trim();
            const candidates = override ? [override] : CANDIDATE_TEMPLATES[gameId](baseName);
            let resolved;
            for (const title of candidates) {
                if (await resolveTitle(host, title)) { resolved = title; break; }
            }
            if (resolved) {
                out[c.id] = { host, fileTitle: resolved };
            } else {
                misses.push(`${gameId}/${c.id} — tried ${candidates.map((t) => `"File:${t}"`).join(', ')}`);
            }
        }
    }

    const body = Object.entries(out)
        .map(([id, v]) => `    '${id}': { host: '${v.host}', fileTitle: '${v.fileTitle.replace(/'/g, "\\'")}' },`)
        .join('\n');

    fs.writeFileSync(
        path.join(ROOT, 'shared/game-data/character-wiki-art.ts'),
        `/** Generated by scripts/generate-character-wiki-art.cjs — id -> Fandom wiki file, resolved to a\n` +
        ` * live CDN URL at export time by src/renderer/src/lib/characterArt.ts. Never bundled/committed\n` +
        ` * as actual image data — this is just a small text mapping. */\n` +
        `export interface CharacterWikiArt {\n    host: 'genshin-impact.fandom.com' | 'wutheringwaves.fandom.com';\n    fileTitle: string;\n}\n\n` +
        `export const CHARACTER_WIKI_ART: Record<string, CharacterWikiArt> = {\n${body}\n};\n`,
    );

    console.log(`Resolved ${Object.keys(out).length} characters.`);
    if (misses.length > 0) {
        console.log(`\n${misses.length} MISSES (add an OVERRIDES entry and re-run):`);
        misses.forEach((m) => console.log('  ' + m));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
