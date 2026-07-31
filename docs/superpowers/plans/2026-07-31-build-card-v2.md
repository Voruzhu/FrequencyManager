# Build Card v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the shareable build-card PNG export with a real character reference image (fetched live from Fandom wikis, never bundled), full loadout display (weapon + per-gear icons/stats), Sequence/Constellation level, kit-derived stat color grading, and an accent-color + custom-image override.

**Architecture:** A generated `character-wiki-art.ts` mapping (id → wiki file title) feeds a cached live-fetch module (`characterArt.ts`) for the character portrait. A pure `statRelevance.ts` heuristic grades each stat row using data already in the bundle (element, scaling stat, kit shape) — no new/fabricated data. `buildCard.ts`'s canvas draw becomes async to load the character image and each gear piece's icon before drawing. `BuildCardWindow.tsx` wires it all together plus a color picker and an upload override, persisted in a small new store.

**Tech Stack:** Plain Canvas 2D API (no new npm dependency), native `fetch`, Fandom's public MediaWiki `action=query&prop=imageinfo` API, existing zustand/userStorage persistence pattern.

## Global Constraints

- No character art is bundled into the repo or the Electron installer — always fetched live from the wiki CDN, cached client-side, falls back to the existing small icon on any failure (never throws, matches `fetchHotfixes`/`fetchEndgamePresets`).
- `statRelevance` only derives from data already present in `CharacterEntry`/`SkillDef` — no new per-character authored data.
- CSP (`index.html` and `index.web.html`) must allow the wiki API host and image CDN host, or the whole feature silently breaks (this exact class of bug happened once already this session with `raw.githubusercontent.com`).
- Every existing caller of `drawBuildCard` must be updated for its new async signature — do not leave a stale sync call in place.

---

### Task 1: Character-wiki-art mapping (generator script + generated data + CSP)

**Files:**
- Create: `scripts/generate-character-wiki-art.cjs`
- Create: `shared/game-data/character-wiki-art.ts` (generated output, committed)
- Modify: `src/renderer/index.html:23`, `src/renderer/index.web.html:53` (CSP)

**Interfaces:**
- Produces: `export const CHARACTER_WIKI_ART: Record<string, { host: 'genshin-impact.fandom.com' | 'wutheringwaves.fandom.com'; fileTitle: string }>` — consumed by Task 2's `characterArt.ts`.

- [ ] **Step 1: Write the generator script**

```js
// scripts/generate-character-wiki-art.cjs
//
// Builds shared/game-data/character-wiki-art.ts by guessing each character's
// Fandom file title (`{Name} Card.png` for GI, `{Name} Splash Art.png` for
// WW) and verifying it resolves via the wiki's own imageinfo API. Characters
// that don't resolve on the first guess are printed as a MISS list at the
// end for manual title correction (see OVERRIDES below) — this script does
// NOT assume 100% coverage, it reports the real gap.
//
// Run AFTER `npm run build:main` (reads compiled character lists from dist/).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Manual corrections for characters whose real wiki file title doesn't match
// the `{name} {suffix}.png` guess. Pre-seeded here only for cases predictable
// from the games' own known naming conventions (Travelers/Rover have
// parenthetical element/gender variants that never match a display-name
// guess) — these are still UNVERIFIED until Step 2 actually runs and
// confirms them; anything else that misses gets added here from the
// script's own MISS report, not guessed upfront.
const OVERRIDES = {
    'genshin-impact': {
        'traveler-anemo': 'Aether Card.png',
        'traveler-geo': 'Aether Card.png',
        'traveler-electro': 'Aether Card.png',
        'traveler-dendro': 'Aether Card.png',
        'traveler-hydro': 'Aether Card.png',
        'traveler-pyro': 'Aether Card.png',
    },
    'wuthering-waves': {
        'rover-spectro': 'Rover (Spectro) Male Splash Art.png',
        'rover-havoc': 'Rover (Havoc) Male Splash Art.png',
    },
};

const WIKIS = {
    'genshin-impact': { host: 'genshin-impact.fandom.com', suffix: 'Card' },
    'wuthering-waves': { host: 'wutheringwaves.fandom.com', suffix: 'Splash Art' },
};

async function resolveTitle(host, title) {
    const url = `https://${host}/api.php?action=query&titles=${encodeURIComponent('File:' + title)}&prop=imageinfo&iiprop=url&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const json = await res.json();
    const pages = json?.query?.pages ?? {};
    // A missing file resolves to a page with a negative pageid and no imageinfo.
    return Object.values(pages).some((p) => Array.isArray(p.imageinfo) && p.imageinfo.length > 0);
}

async function main() {
    const out = {};
    const misses = [];

    for (const [gameId, { host, suffix }] of Object.entries(WIKIS)) {
        const { CHARACTERS } = require(path.join(ROOT, 'dist/adapters/game-definitions', gameId, 'characters.js'));
        for (const c of CHARACTERS) {
            const override = OVERRIDES[gameId]?.[c.id];
            const title = override ?? `${c.name.replace(/\s*\([^()]*\)\s*/g, ' ').trim()} ${suffix}.png`;
            const ok = await resolveTitle(host, title);
            if (ok) {
                out[c.id] = { host, fileTitle: title };
            } else {
                misses.push(`${gameId}/${c.id} — tried "File:${title}"`);
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
```

- [ ] **Step 2: Build main and run the script**

Run: `npm run build:main && node scripts/generate-character-wiki-art.cjs`
Expected: prints `Resolved <N> characters.` where N is close to 297 (121 GI + 176 WW), plus a MISS list if any remain.

- [ ] **Step 3: Fix any misses**

For each printed miss, open the character's real Fandom page (`https://{host}/wiki/{CharacterName}`) or its Gallery subpage, find the actual splash/card file name, add it to `OVERRIDES` in the script, and re-run Step 2. Repeat until the miss list is empty or contains only characters with no sourced art on the wiki at all (rare — e.g. a just-released character faster than the wiki catalogued them; leave those out of `CHARACTER_WIKI_ART` entirely, `characterArt.ts` falls back to the icon for any id with no entry).

- [ ] **Step 4: Add the wiki hosts to CSP**

In `src/renderer/index.html:23`, change:
```
content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: fm-icon:; connect-src 'self' fm-icon: https://raw.githubusercontent.com;" />
```
to:
```
content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: fm-icon: https://static.wikia.nocookie.net; connect-src 'self' fm-icon: https://raw.githubusercontent.com https://genshin-impact.fandom.com https://wutheringwaves.fandom.com;" />
```

In `src/renderer/index.web.html`, change the CSP meta tag's content (currently ending `connect-src 'self' https://cdn.jsdelivr.net https://raw.githubusercontent.com data:;`) to also allow the same 3 hosts:
```
content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.jsdelivr.net https://static.wikia.nocookie.net; connect-src 'self' https://cdn.jsdelivr.net https://raw.githubusercontent.com https://genshin-impact.fandom.com https://wutheringwaves.fandom.com data:;" />
```

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-character-wiki-art.cjs shared/game-data/character-wiki-art.ts src/renderer/index.html src/renderer/index.web.html
git commit -m "feat: generate character-wiki-art mapping for build-card portraits"
```

---

### Task 2: `characterArt.ts` — live fetch + cache

**Files:**
- Create: `src/renderer/src/lib/characterArt.ts`
- Test: `tests/renderer/characterArt.test.ts`

**Interfaces:**
- Consumes: `CHARACTER_WIKI_ART` from Task 1.
- Produces: `fetchCharacterArtUrl(characterId: string): Promise<string | undefined>` — used by Task 5's `BuildCardWindow.tsx`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/characterArt.test.ts
(global as unknown as { window: unknown }).window = {};

import { fetchCharacterArtUrl } from '../../src/renderer/src/lib/characterArt';

describe('fetchCharacterArtUrl', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('returns the resolved CDN URL on a successful lookup', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ query: { pages: { '123': { imageinfo: [{ url: 'https://static.wikia.nocookie.net/x.png' }] } } } }),
        } as Response);
        const url = await fetchCharacterArtUrl('jinhsi');
        expect(url).toBe('https://static.wikia.nocookie.net/x.png');
    });

    it('returns undefined for a character with no wiki-art mapping', async () => {
        global.fetch = jest.fn();
        const url = await fetchCharacterArtUrl('some-unmapped-id');
        expect(url).toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns undefined (never throws) when the fetch fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
        const url = await fetchCharacterArtUrl('jinhsi');
        expect(url).toBeUndefined();
    });

    it('returns undefined when the API responds but the file is missing (no imageinfo)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ query: { pages: { '-1': { missing: '' } } } }),
        } as Response);
        const url = await fetchCharacterArtUrl('jinhsi');
        expect(url).toBeUndefined();
    });

    it('caches a successful result — a second call for the same id does not fetch again', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ query: { pages: { '123': { imageinfo: [{ url: 'https://static.wikia.nocookie.net/x.png' }] } } } }),
        } as Response);
        await fetchCharacterArtUrl('jinhsi');
        await fetchCharacterArtUrl('jinhsi');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/characterArt.test.ts`
Expected: FAIL with "Cannot find module '../../src/renderer/src/lib/characterArt'"

- [ ] **Step 3: Write the implementation**

```ts
// src/renderer/src/lib/characterArt.ts
import { CHARACTER_WIKI_ART } from '@shared/game-data/character-wiki-art';
import { userStorage } from './userStorage';

const CACHE_KEY = (characterId: string) => `fm-char-art-${characterId}`;

/** Resolves a character's real portrait art via the Fandom wiki's own
 * imageinfo API (see character-wiki-art.ts's generator for how the mapping
 * was built) — never bundled, fetched live and cached forever (art doesn't
 * change). Returns undefined on any failure (no mapping, network error,
 * malformed response, file genuinely missing) so callers fall back to the
 * existing small icon — mirrors fetchHotfixes/fetchEndgamePresets. */
export async function fetchCharacterArtUrl(characterId: string): Promise<string | undefined> {
    const entry = CHARACTER_WIKI_ART[characterId];
    if (!entry) return undefined;

    const cacheKey = CACHE_KEY(characterId);
    try {
        const cached = await userStorage.getItem(cacheKey);
        if (cached) return cached;
    } catch { /* corrupt cache entry — fall through to a fresh fetch */ }

    try {
        const url = `https://${entry.host}/api.php?action=query&titles=${encodeURIComponent('File:' + entry.fileTitle)}&prop=imageinfo&iiprop=url&format=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return undefined;
        const json = await res.json();
        const pages = Object.values(json?.query?.pages ?? {}) as Array<{ imageinfo?: Array<{ url: string }> }>;
        const resolvedUrl = pages.find((p) => Array.isArray(p.imageinfo) && p.imageinfo.length > 0)?.imageinfo?.[0]?.url;
        if (!resolvedUrl) return undefined;
        await userStorage.setItem(cacheKey, resolvedUrl);
        return resolvedUrl;
    } catch {
        return undefined;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/characterArt.test.ts`
Expected: PASS, all 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/characterArt.ts tests/renderer/characterArt.test.ts
git commit -m "feat: live-fetch character portrait art for build cards"
```

---

### Task 3: `statRelevance.ts` — kit-based stat relevance heuristic

**Files:**
- Create: `src/renderer/src/lib/statRelevance.ts`
- Test: `tests/renderer/statRelevance.test.ts`

**Interfaces:**
- Consumes: `CharacterEntry` (from `@shared/types/game-bundle`).
- Produces: `statRelevance(character: CharacterEntry, statKey: string): 'low' | 'medium' | 'high'` — used by Task 4's `buildCard.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/statRelevance.test.ts
import { statRelevance } from '../../src/renderer/src/lib/statRelevance';
import type { CharacterEntry } from '../../shared/types/game-bundle';

function char(overrides: Partial<CharacterEntry> = {}): CharacterEntry {
    return {
        kind: 'character', id: 'c1', name: 'Test', element: 'Havoc', weaponType: 'Sword', rarity: 5,
        stats: { atk: 1000, hp: 10000, def: 500 },
        skills: [{ id: 's1', name: 'Basic', type: 'normal', description: '', multiplier: 1.5 }],
        equipped: { gearIds: [] },
        ...overrides,
    };
}

describe('statRelevance', () => {
    it('the generic elemDmg slot is always high — it dynamically represents this character\'s own element', () => {
        expect(statRelevance(char(), 'elemDmg')).toBe('high');
    });

    it('the character\'s scaling stat is high; defaults to atk when no skill overrides scaling', () => {
        expect(statRelevance(char(), 'atk')).toBe('high');
    });

    it('a character whose skills scale off HP grades hp as high instead of atk', () => {
        const c = char({ skills: [{ id: 's1', name: 'Skill', type: 'normal', description: '', multiplier: 2, scaling: 'hp' }] });
        expect(statRelevance(c, 'hp')).toBe('high');
        expect(statRelevance(c, 'atk')).toBe('medium');
    });

    it('Crit Rate/DMG are high for a normal offensive kit', () => {
        expect(statRelevance(char(), 'critRate')).toBe('high');
        expect(statRelevance(char(), 'critDmg')).toBe('high');
    });

    it('Crit Rate/DMG drop to low, and Healing Bonus becomes high, for a kit with no offensive skills', () => {
        const healer = char({ skills: [{ id: 's1', name: 'Heal', type: 'normal', description: '', multiplier: 0 }] });
        expect(statRelevance(healer, 'critRate')).toBe('low');
        expect(statRelevance(healer, 'critDmg')).toBe('low');
        expect(statRelevance(healer, 'healingBonus')).toBe('high');
    });

    it('Healing Bonus is low for a normal offensive kit', () => {
        expect(statRelevance(char(), 'healingBonus')).toBe('low');
    });

    it('Elemental Mastery is high only when a self/team buff actually scales off it', () => {
        expect(statRelevance(char(), 'elementalMastery')).toBe('medium');
        const emChar = char({ selfBuffs: [{ stat: 'dmgBonus', label: 'x', value: 10, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.01 } }] });
        expect(statRelevance(emChar, 'elementalMastery')).toBe('high');
    });

    it('a WW scoped attack-type DMG stat is high when it matches the character\'s own highest-multiplier skill type', () => {
        const c = char({ skills: [
            { id: 's1', name: 'Basic', type: 'normal', description: '', multiplier: 1 },
            { id: 's2', name: 'Liberation', type: 'ultimate', description: '', multiplier: 9 },
        ] });
        expect(statRelevance(c, 'resonanceLiberationDmgBonus')).toBe('high');
        expect(statRelevance(c, 'basicAttackDmgBonus')).toBe('medium');
    });

    it('an unrecognized stat key defaults to medium, not a crash', () => {
        expect(statRelevance(char(), 'someFutureStat')).toBe('medium');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/statRelevance.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the implementation**

```ts
// src/renderer/src/lib/statRelevance.ts
import type { CharacterEntry } from '@shared/types/game-bundle';

/**
 * How relevant a stat is to THIS character's own kit — derived entirely from
 * data already in the bundle (element, skills' scaling/type/multiplier,
 * self/team buffs' scaleOff), never fabricated per-character knowledge.
 * Used to color-grade the build card's stat rows (low/medium/high).
 */

const SKILL_TYPE_TO_SCOPED_STAT: Record<string, string> = {
    normal: 'basicAttackDmgBonus',
    heavy: 'heavyAttackDmgBonus',
    skill: 'resonanceSkillDmgBonus',
    ultimate: 'resonanceLiberationDmgBonus',
};

function scalingStatKey(character: CharacterEntry): string {
    const first = character.skills.find((s) => s.scaling)?.scaling ?? 'atk';
    return first === 'em' ? 'elementalMastery' : first;
}

/** True when nothing in this character's kit deals real damage — the same
 * "no offensive skills" signal drives both the Crit Rate/DMG demotion and
 * the Healing Bonus promotion below (no dedicated "healer" flag exists
 * anywhere in SkillDef, so this multiplier check is the real available
 * signal, not an invented one). */
function hasNoOffensiveSkills(character: CharacterEntry): boolean {
    return character.skills.every((s) => (s.multiplier ?? 0) <= 0 && !(s.multipliers?.some((m) => m > 0)));
}

function highestMultiplierSkillType(character: CharacterEntry): string | undefined {
    let best: { type: string; mult: number } | undefined;
    for (const s of character.skills) {
        const mult = Math.max(s.multiplier ?? 0, ...(s.multipliers ?? [0]));
        if (!best || mult > best.mult) best = { type: s.type, mult };
    }
    return best?.type;
}

export function statRelevance(character: CharacterEntry, statKey: string): 'low' | 'medium' | 'high' {
    if (statKey === 'elemDmg') return 'high';

    if (statKey === scalingStatKey(character)) return 'high';

    const noOffense = hasNoOffensiveSkills(character);
    if (statKey === 'critRate' || statKey === 'critDmg') return noOffense ? 'low' : 'high';
    if (statKey === 'healingBonus') return noOffense ? 'high' : 'low';

    if (statKey === 'elementalMastery') {
        const scalesOffEM = [...(character.selfBuffs ?? []), ...(character.teamBuffs ?? [])]
            .some((b) => b.scaleOff?.sourceStat === 'elementalMastery');
        return scalesOffEM ? 'high' : 'medium';
    }

    const scopedStat = highestMultiplierSkillType(character) != null
        ? SKILL_TYPE_TO_SCOPED_STAT[highestMultiplierSkillType(character)!]
        : undefined;
    if (Object.values(SKILL_TYPE_TO_SCOPED_STAT).includes(statKey)) {
        return statKey === scopedStat ? 'high' : 'medium';
    }

    return 'medium';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/statRelevance.test.ts`
Expected: PASS, all 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/statRelevance.ts tests/renderer/statRelevance.test.ts
git commit -m "feat: kit-derived stat relevance heuristic for build-card color grading"
```

---

### Task 4: Extend `buildCard.ts` — image loading, per-gear rows, sequence badge, relevance coloring

**Files:**
- Modify: `src/renderer/src/lib/buildCard.ts`

**Interfaces:**
- Consumes: `statRelevance` (Task 3), a resolved character-art URL (Task 2, passed in by the caller — this module stays fetch-agnostic).
- Produces: `drawBuildCard` becomes `async`; `BuildCardData` gains `imageUrl?`, `gearPieces`, `sequence?`, and `stats[].relevance`.

- [ ] **Step 1: Update the data shape and add an image-loading helper**

In `src/renderer/src/lib/buildCard.ts`, replace the existing `BuildCardStatRow`/`BuildCardData` interfaces and add a loader:

```ts
export interface BuildCardStatRow {
    label: string;
    value: string;
    relevance: 'low' | 'medium' | 'high';
}

export interface BuildCardGearPiece {
    iconUrl?: string;
    name: string;
    setName: string;
    mainStat: { label: string; value: string };
    subStats: Array<{ label: string; value: string }>;
}

export interface BuildCardData {
    gameId: string;
    characterName: string;
    element: string;
    weaponType: string;
    rarity: number;
    imageUrl?: string;
    sequenceLabel?: string;
    sequenceValue?: number;
    sequenceMax?: number;
    heroLabel: string;
    heroValue: string;
    stats: BuildCardStatRow[];
    weaponLine?: string;
    weaponDetail?: string;
    gearPieces: BuildCardGearPiece[];
    /** The RESULTING active set bonus (e.g. "Crimson Witch of Flames — 4pc"),
     * distinct from each piece's own `setName` in `gearPieces` — this is the
     * actual game-mechanical payoff of the equipped combination, not just a
     * per-item label, so it's worth its own line. */
    activeSetLine?: string;
    activeSetDetail?: string;
    critValue?: number;
}

/** Loads an image for canvas drawing; resolves `null` instead of rejecting on
 * any failure (broken URL, CORS block, 404) so one bad icon never blocks the
 * rest of the card. */
function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function relevanceColor(theme: BuildCardTheme, relevance: BuildCardStatRow['relevance']): string {
    if (relevance === 'high') return theme.accent;
    if (relevance === 'low') return theme.muted;
    return theme.text;
}
```

- [ ] **Step 2: Make `drawBuildCard` async and draw the character image + relevance-colored stats**

Replace the function signature and the header/stat-grid sections:

```ts
export async function drawBuildCard(canvas: HTMLCanvasElement, data: BuildCardData, theme: BuildCardTheme): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const pad = 24;

    const [charImg, ...gearImgs] = await Promise.all([
        loadImage(data.imageUrl),
        ...data.gearPieces.map((g) => loadImage(g.iconUrl)),
    ]);

    // Base card.
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 12);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    let y = pad;

    // Character image — a fixed-height cover-fit band across the top, drawn
    // BEHIND the header text (a translucent scrim keeps the header legible
    // over any image). No image resolved -> just the plain surface color.
    const imgBandHeight = 200;
    if (charImg) {
        ctx.save();
        roundRect(ctx, 0, 0, CARD_WIDTH, imgBandHeight, 12);
        ctx.clip();
        const scale = Math.max(CARD_WIDTH / charImg.width, imgBandHeight / charImg.height);
        const dw = charImg.width * scale;
        const dh = charImg.height * scale;
        ctx.drawImage(charImg, (CARD_WIDTH - dw) / 2, (imgBandHeight - dh) / 2, dw, dh);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, CARD_WIDTH, imgBandHeight);
        ctx.restore();
        y = imgBandHeight + 16;
    }

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.accent;
    ctx.font = `600 11px ${MONO}`;
    ctx.fillText(data.gameId === 'genshin-impact' ? 'GENSHIN IMPACT BUILD' : 'WUTHERING WAVES BUILD', pad, y + 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.fillText('★'.repeat(Math.max(0, data.rarity)), CARD_WIDTH - pad, y + 11);
    ctx.textAlign = 'left';
    y += 34;

    ctx.fillStyle = theme.text;
    ctx.font = `600 26px ${SANS}`;
    ctx.fillText(data.characterName, pad, y);
    if (data.sequenceLabel && data.sequenceValue != null) {
        const nameWidth = ctx.measureText(data.characterName).width;
        ctx.font = `600 12px ${MONO}`;
        ctx.fillStyle = theme.accent;
        ctx.fillText(`${data.sequenceLabel} ${data.sequenceValue}/${data.sequenceMax ?? 6}`, pad + nameWidth + 12, y);
    }
    y += 22;

    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.element, pad, y);
    const elemWidth = ctx.measureText(data.element).width;
    ctx.fillStyle = theme.muted;
    ctx.fillText(`  ·  ${data.weaponType}`, pad + elemWidth, y);
    y += 20;

    ctx.strokeStyle = theme.border;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(CARD_WIDTH - pad, y);
    ctx.stroke();
    y += 22;

    // Hero readout.
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = theme.muted;
    ctx.fillText(data.heroLabel.toUpperCase(), pad, y);
    y += 40;
    ctx.font = `600 48px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.heroValue, pad, y);
    y += 16;

    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(CARD_WIDTH - pad, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    y += 26;

    // Stat grid — colored by kit relevance instead of a flat text color.
    const colWidth = (CARD_WIDTH - pad * 2 - 16) / 2;
    const rowHeight = 26;
    data.stats.forEach((row, i) => {
        const col = i % 2;
        const rowIdx = Math.floor(i / 2);
        const x = pad + col * (colWidth + 16);
        const rowY = y + rowIdx * rowHeight;
        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(row.label, x, rowY);
        ctx.font = `600 12px ${MONO}`;
        ctx.fillStyle = relevanceColor(theme, row.relevance);
        ctx.textAlign = 'right';
        ctx.fillText(row.value, x + colWidth, rowY);
        ctx.textAlign = 'left';
    });
    y += Math.ceil(data.stats.length / 2) * rowHeight + 16;

    // Per-gear-piece rows (icon + set + main/substats), each roughly 3 lines tall.
    const gearRowHeight = 58;
    data.gearPieces.forEach((piece, i) => {
        const rowY = y + i * gearRowHeight;
        const img = gearImgs[i];
        if (img) ctx.drawImage(img, pad, rowY, 32, 32);
        const textX = pad + (img ? 40 : 0);
        ctx.font = `600 12px ${SANS}`;
        ctx.fillStyle = theme.text;
        ctx.fillText(piece.name, textX, rowY + 12);
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(`${piece.setName} — ${piece.mainStat.label} ${piece.mainStat.value}`, textX, rowY + 26);
        ctx.fillText(piece.subStats.map((s) => `${s.label} ${s.value}`).join('  ·  '), textX, rowY + 40);
    });
    y += data.gearPieces.length * gearRowHeight + 12;

    // Footer strip: weapon + active set bonus + branding, sized to its actual content.
    const footerRowCount = (data.weaponLine ? 1 : 0) + (data.activeSetLine ? 1 : 0);
    const footerHeight = footerRowCount * 24 + 44;
    const footerTop = CARD_HEIGHT - footerHeight;
    {
        ctx.fillStyle = theme.surface2;
        ctx.fillRect(0, footerTop, CARD_WIDTH, footerHeight);
        ctx.strokeStyle = theme.border;
        ctx.beginPath();
        ctx.moveTo(0, footerTop);
        ctx.lineTo(CARD_WIDTH, footerTop);
        ctx.stroke();

        let fy = footerTop + 24;
        if (data.weaponLine) {
            ctx.font = `600 13px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(data.weaponLine, pad, fy);
            if (data.weaponDetail) {
                ctx.font = `11px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.weaponDetail, CARD_WIDTH - pad, fy);
                ctx.textAlign = 'left';
            }
            fy += 24;
        }
        if (data.activeSetLine) {
            ctx.font = `600 13px ${SANS}`;
            ctx.fillStyle = theme.accent;
            ctx.fillText(data.activeSetLine, pad, fy);
            if (data.activeSetDetail) {
                ctx.font = `11px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.activeSetDetail, CARD_WIDTH - pad, fy);
                ctx.textAlign = 'left';
            }
            fy += 24;
        }

        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText('[ FrequencyManager ]', pad, CARD_HEIGHT - pad + 4);
        if (data.critValue != null) {
            ctx.textAlign = 'right';
            ctx.fillText(`CV ${data.critValue.toFixed(1)}`, CARD_WIDTH - pad, CARD_HEIGHT - pad + 4);
            ctx.textAlign = 'left';
        }
    }
}
```

Note: `CARD_HEIGHT` (currently `680`) needs bumping to accommodate the image band + gear rows — change the constant to `1080`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no new errors (the pre-existing 3 `shared/types/index.ts` warnings are unrelated and predate this work).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/buildCard.ts
git commit -m "feat: build card draws character art, per-gear stats, sequence, relevance colors"
```

---

### Task 5: Extend `BuildCardWindow.tsx` — wire real data, accent picker, custom image, prefs store

**Files:**
- Create: `src/renderer/src/stores/buildCardPrefsStore.ts`
- Modify: `src/renderer/src/components/BuildCardWindow.tsx`

**Interfaces:**
- Consumes: `fetchCharacterArtUrl` (Task 2), `statRelevance` (Task 3), the async `drawBuildCard` (Task 4).

- [ ] **Step 1: Write the prefs store**

```ts
// src/renderer/src/stores/buildCardPrefsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

interface BuildCardPrefsState {
    /** byGame[gameId][characterId] = data URL of a user-uploaded override image. */
    customImages: Record<string, Record<string, string>>;
    lastAccentColor?: string;
    setCustomImage: (gameId: string, characterId: string, dataUrl: string | undefined) => void;
    setLastAccentColor: (color: string) => void;
}

export const useBuildCardPrefsStore = create<BuildCardPrefsState>()(
    persist(
        (set) => ({
            customImages: {},
            setCustomImage: (gameId, characterId, dataUrl) => set((s) => {
                const forGame = { ...s.customImages[gameId] };
                if (dataUrl) forGame[characterId] = dataUrl; else delete forGame[characterId];
                return { customImages: { ...s.customImages, [gameId]: forGame } };
            }),
            setLastAccentColor: (color) => set({ lastAccentColor: color }),
        }),
        { name: 'fm-build-card-prefs', storage: createJSONStorage(() => userStorage) },
    ),
);
```

- [ ] **Step 2: Rewrite `BuildCardWindow.tsx`**

```tsx
// src/renderer/src/components/BuildCardWindow.tsx
import { useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button, toast } from './ui';
import { catalogStatLabel, formatCatalogValue, formatGearStat, gearIcon, getSequenceLabel, SEQUENCE_MAX, type CharacterData, type GameData, type GearData, type WeaponData } from '../data/gameData';
import { activeSetBonuses, type BuildStats } from '../data/optimizer';
import { drawBuildCard, CARD_WIDTH, CARD_HEIGHT, type BuildCardTheme, type BuildCardData } from '@/lib/buildCard';
import { downloadBlob } from '@/lib/fileIO';
import { fetchCharacterArtUrl } from '@/lib/characterArt';
import { statRelevance } from '@/lib/statRelevance';
import { useBuildCardPrefsStore } from '../stores/buildCardPrefsStore';
import { useSequenceStore } from '../stores/sequenceStore';
import { iconSrc } from '@/lib/icons';

function readTheme(): BuildCardTheme {
    const style = getComputedStyle(document.documentElement);
    const v = (name: string) => style.getPropertyValue(name).trim() || '0 0 0';
    return {
        surface: `rgb(${v('--surface')})`,
        surface2: `rgb(${v('--surface-2')})`,
        border: `rgb(${v('--border')})`,
        text: `rgb(${v('--foreground')})`,
        muted: `rgb(${v('--muted-foreground')})`,
        accent: `rgb(${v('--primary')})`,
        accentSoft: `rgb(${v('--primary')} / 0.15)`,
    };
}

export function BuildCardWindow({
    character, data, gameId, stats, skillDamage, weapon, weaponRefine, gear, critValue,
}: {
    character: CharacterData;
    data: GameData;
    gameId: string;
    stats: BuildStats;
    skillDamage: Record<string, number>;
    weapon?: WeaponData;
    weaponRefine?: number;
    gear: GearData[];
    critValue?: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [wikiArtUrl, setWikiArtUrl] = useState<string | undefined>(undefined);
    const customImage = useBuildCardPrefsStore((s) => s.customImages[gameId]?.[character.id]);
    const lastAccentColor = useBuildCardPrefsStore((s) => s.lastAccentColor);
    const [accent, setAccent] = useState<string | undefined>(lastAccentColor);
    const sequence = useSequenceStore((s) => s.getSequence(gameId, character.id));

    useEffect(() => {
        let cancelled = false;
        void fetchCharacterArtUrl(character.id).then((url) => { if (!cancelled) setWikiArtUrl(url); });
        return () => { cancelled = true; };
    }, [character.id]);

    const topSkill = character.skills.reduce<{ id: string; value: number } | null>((best, s) => {
        const v = skillDamage[s.id] ?? 0;
        return !best || v > best.value ? { id: s.id, value: v } : best;
    }, null);
    const topSkillName = character.skills.find((s) => s.id === topSkill?.id)?.name ?? 'Damage';
    const setBonus = activeSetBonuses(gear, data.setBonuses, character.name)[0];

    const cardData: BuildCardData = {
        gameId,
        characterName: character.name,
        element: character.element,
        weaponType: character.weaponType,
        rarity: character.rarity,
        imageUrl: customImage ?? wikiArtUrl,
        sequenceLabel: getSequenceLabel(gameId),
        sequenceValue: sequence,
        sequenceMax: SEQUENCE_MAX,
        heroLabel: `${topSkillName} — peak hit`,
        heroValue: Math.round(topSkill?.value ?? 0).toLocaleString(),
        stats: data.statCatalog
            .filter((def) => (stats[def.key] ?? 0) !== 0)
            .slice(0, 8)
            .map((def) => ({ label: catalogStatLabel(def, character.element), value: formatCatalogValue(def, stats[def.key] ?? 0), relevance: statRelevance(character, def.key) })),
        weaponLine: weapon?.name,
        weaponDetail: weapon ? `R${weaponRefine ?? 1}` : undefined,
        gearPieces: gear.map((g) => ({
            iconUrl: iconSrc(gameId, gearIcon(data, g)),
            name: g.name,
            setName: g.setName,
            mainStat: { label: g.mainStat.label, value: formatGearStat(g.mainStat) },
            subStats: g.subStats.map((s) => ({ label: s.label, value: formatGearStat(s) })),
        })),
        activeSetLine: setBonus?.name,
        activeSetDetail: setBonus ? (setBonus.tier === 'full' ? 'Full set' : '2pc') : undefined,
        critValue,
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const theme = readTheme();
        if (accent) theme.accent = accent;
        void drawBuildCard(canvas, cardData, theme);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cardData), accent]);

    const download = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (!blob) { toast.error('Could not generate image'); return; }
            downloadBlob(`${character.name.toLowerCase().replace(/\s+/g, '-')}-build.png`, blob);
            toast.success('Build card downloaded');
        }, 'image/png');
    };

    const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') useBuildCardPrefsStore.getState().setCustomImage(gameId, character.id, reader.result);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-center rounded-md border border-border bg-surface-2 p-3">
                <canvas ref={canvasRef} width={CARD_WIDTH} height={CARD_HEIGHT} style={{ width: CARD_WIDTH / 1.6, height: CARD_HEIGHT / 1.6 }} />
            </div>
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Accent
                    <input
                        type="color"
                        value={accent ?? '#3b82f6'}
                        onChange={(e) => { setAccent(e.target.value); useBuildCardPrefsStore.getState().setLastAccentColor(e.target.value); }}
                        className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
                    />
                </label>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload /> Custom image
                </Button>
                {customImage && (
                    <Button variant="ghost" size="sm" onClick={() => useBuildCardPrefsStore.getState().setCustomImage(gameId, character.id, undefined)}>
                        Reset to wiki art
                    </Button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </div>
            <Button className="w-full" onClick={download}>
                <Download /> Download PNG
            </Button>
        </div>
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no new errors. Fix any import-path mismatches against this project's real export names (`iconSrc`/`gearIcon` locations, `getSequenceLabel`/`SEQUENCE_MAX` from `../data/gameData`, `useSequenceStore`'s `getSequence` signature) before moving on — these were written from memory of the codebase and must match exactly.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/buildCardPrefsStore.ts src/renderer/src/components/BuildCardWindow.tsx
git commit -m "feat: wire real loadout/sequence/relevance data into the build card, add accent + custom-image controls"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: all suites pass (existing 531 + the new characterArt/statRelevance tests).

- [ ] **Step 2: Typecheck and build all three targets**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json && npm run build:main && npm run build:renderer && npm run build:web`
Expected: all succeed (the 3 pre-existing `shared/types/index.ts` warnings are unrelated and predate this work).

- [ ] **Step 3: Live CDP verification**

Launch Electron with a remote debugging port (see this session's established technique — `env -u ELECTRON_RUN_AS_NODE npx electron . --remote-debugging-port=<port>`), open the Calculator, select a character with real gear/weapon equipped, click "Build card," and via `Runtime.evaluate`:
- confirm the canvas is non-blank and the correct size,
- confirm the character image band rendered (or, if the wiki lookup 404s for that specific test character, confirm the graceful fallback — no thrown error, card still renders),
- confirm per-gear rows show icons/stats,
- confirm the sequence badge shows the real value,
- change the accent color input and confirm the hero number's color updates,
- click "Custom image," pick a local file, confirm it overrides the wiki art,
- click "Download PNG" and confirm the download succeeds.

Save a screenshot via `Page.captureScreenshot` for the record, same as prior features this session.

- [ ] **Step 4: Update ROADMAP.md**

Add a short entry describing the v2 upgrade (character art source + coverage caveat, kit-based color grading, accent/custom-image controls), following this file's existing style.

- [ ] **Step 5: Final commit**

```bash
git add ROADMAP.md
git commit -m "docs: note build-card v2 upgrade in ROADMAP"
```
