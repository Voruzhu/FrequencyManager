// scripts/verify-character-wiki-art.cjs
//
// For every entry in character-wiki-art.ts, asks MediaWiki what IT considers
// the canonical "page image" for that character's own wiki page (the same
// image an infobox/og:image would show — a curated, editor-maintained
// choice, not just "any file with a matching name"). Compares it against
// the file this project's generator picked. A mismatch doesn't always mean
// the mapped file is wrong (the page image can legitimately be a crop or an
// alternate of the same official art), but it's the single strongest
// automated signal available for "this might not be the right/official
// image" — flagged here for manual review, not auto-corrected blindly.
//
// Run AFTER `npm run build:main` (reads compiled character lists from dist/).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Known wiki page-name overrides — a character's own wiki article title can
// differ from this project's display name (redirects, shared pages).
const PAGE_NAME_OVERRIDES = {
    'genshin-impact': {
        'traveler-anemo': 'Traveler', 'traveler-geo': 'Traveler', 'traveler-electro': 'Traveler',
        'traveler-dendro': 'Traveler', 'traveler-hydro': 'Traveler',
        'childe': 'Tartaglia',
        'yunjin': 'Yun Jin',
    },
    'wuthering-waves': {
        'rover-spectro': 'Rover', 'rover-havoc': 'Rover', 'rover-aero': 'Rover', 'rover-electro': 'Rover',
    },
};

function normalize(title) {
    return decodeURIComponent(title).replace(/_/g, ' ').replace(/^File:/, '').trim().toLowerCase();
}

async function pageImage(host, pageName) {
    const url = `https://${host}/api.php?action=query&titles=${encodeURIComponent(pageName)}&prop=pageimages&piprop=original&redirects&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const json = await res.json();
    const page = Object.values(json?.query?.pages ?? {})[0];
    const src = page?.original?.source;
    if (!src) return null;
    return decodeURIComponent(src.split('/revision/')[0].split('/').pop());
}

async function main() {
    const wikiArtSrc = fs.readFileSync(path.join(ROOT, 'shared/game-data/character-wiki-art.ts'), 'utf8');
    // Small hand-rolled parse (no ts-node available) — the file is a flat
    // generated object literal, safe to regex out id/host/fileTitle triples.
    const entries = [];
    const re = /'([\w-]+)':\s*\{\s*host:\s*'([^']+)',\s*fileTitle:\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(wikiArtSrc))) entries.push({ id: m[1], host: m[2], fileTitle: m[3].replace(/\\'/g, "'") });

    const gameOf = (id, host) => (host.includes('genshin') ? 'genshin-impact' : 'wuthering-waves');
    const nameById = {};
    for (const gameId of ['genshin-impact', 'wuthering-waves']) {
        const { CHARACTERS } = require(path.join(ROOT, 'dist/adapters/game-definitions', gameId, 'characters.js'));
        for (const c of CHARACTERS) nameById[c.id] = c.name.replace(/\s*\([^()]*\)\s*/g, ' ').trim();
    }

    const mismatches = [];
    const matches = [];
    const noPageImage = [];

    for (const entry of entries) {
        const gameId = gameOf(entry.id, entry.host);
        const pageName = PAGE_NAME_OVERRIDES[gameId]?.[entry.id] ?? nameById[entry.id];
        if (!pageName) continue;
        const canonical = await pageImage(entry.host, pageName);
        if (!canonical) { noPageImage.push({ id: entry.id, pageName }); continue; }
        if (normalize(canonical) === normalize(entry.fileTitle)) {
            matches.push(entry.id);
        } else {
            mismatches.push({ id: entry.id, mapped: entry.fileTitle, canonical, pageName });
        }
    }

    console.log(`Matches: ${matches.length}/${entries.length}`);
    console.log(`\nNo page image at all (${noPageImage.length}):`);
    noPageImage.forEach((x) => console.log(`  ${x.id} (page: ${x.pageName})`));
    console.log(`\nMISMATCHES needing review (${mismatches.length}):`);
    mismatches.forEach((x) => console.log(`  ${x.id}: mapped="${x.mapped}" vs canonical="${x.canonical}" (page: ${x.pageName})`));
}

main().catch((e) => { console.error(e); process.exit(1); });
