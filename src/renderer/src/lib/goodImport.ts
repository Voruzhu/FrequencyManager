/**
 * GOOD-format (Genshin Open Object Description) artifact import — lets a
 * Genshin player bring in gear from any third-party scanner that exports
 * this community-standard format (Inventory Kamera, Akasha Scanner) or any
 * tool that reads/writes it directly (Genshin Optimizer, SEELIE.me), instead
 * of only this app's own OCR scanner (which doesn't support Genshin at all —
 * see `ScanWindows.tsx`'s `ocrVerified` gate).
 *
 * Reuses the exact same `GearDraft` → `buildGearEntryFromDraft` pipeline the
 * OCR scanner already goes through (`ocrMapping.ts`) — a GOOD artifact record
 * is just a different RAW SHAPE feeding the same "resolve against the real
 * catalog, never fabricate, flag what didn't resolve" logic.
 *
 * Schema reference: frzyc/genshin-optimizer's `libs/gi/schema/src/artifact.ts`
 * (the de facto canonical GOOD spec — there is no separate standalone spec
 * repo). Confirmed slot ids (flower/plume/sands/goblet/circlet) match this
 * app's own `GearCatalog.slots` ids exactly, so no slot-name mapping table is
 * needed. Set names are matched by normalizing both GOOD's PascalCase
 * `setKey` (e.g. "GladiatorsFinale") and the catalog's spaced display name
 * (e.g. "Gladiators Finale") to bare lowercase alphanumerics — GOOD keys are,
 * by convention, just the English name with spaces/punctuation stripped, so
 * this needs no hand-maintained per-set table either.
 */
import type { GearCatalog } from '@shared/types/game-bundle';
import { type GearDraft, type UnresolvedIssue } from './ocrMapping';

export interface GoodArtifact {
    setKey: string;
    slotKey: string;
    level: number;
    rarity: number;
    mainStatKey: string;
    location?: string;
    lock?: boolean;
    substats?: Array<{ key: string; value: number }>;
}

export interface GoodFile {
    format?: string;
    source?: string;
    version?: number;
    artifacts?: GoodArtifact[];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** GOOD's fixed stat-key vocabulary (flat stats bare, percent stats with a
 * trailing underscore) → this catalog's own key naming. */
const GOOD_STAT_KEY_MAP: Record<string, string> = {
    hp: 'hp', atk: 'atk', def: 'def',
    hp_: 'hpPct', atk_: 'atkPct', def_: 'defPct',
    eleMas: 'elementalMastery', enerRech_: 'energyRegen',
    critRate_: 'critRate', critDMG_: 'critDmg', heal_: 'healingBonus',
    pyro_dmg_: 'pyroDmg', hydro_dmg_: 'hydroDmg', electro_dmg_: 'electroDmg',
    cryo_dmg_: 'cryoDmg', anemo_dmg_: 'anemoDmg', geo_dmg_: 'geoDmg',
    dendro_dmg_: 'dendroDmg', physical_dmg_: 'physicalDmg',
};

/** Maps one GOOD artifact record to a `GearDraft` — same shape the OCR
 * scanner's `mapScannedEchoToGearDraft` produces, so it can go straight
 * through the existing `buildGearEntryFromDraft`/`hasBlockingIssues`/
 * `gearIdentityKey` pipeline unchanged. GOOD gives no raw main-stat VALUE
 * (real Genshin main stats scale deterministically off rarity+level, and
 * every consuming tool is expected to compute it) — this catalog's `mains`
 * table only stores the MAX-level value per rarity, so an artifact below
 * max level imports at its max-level main-stat value with a flagged note;
 * its sub-stats are unaffected (GOOD gives their real accumulated values). */
export function mapGoodArtifactToDraft(a: GoodArtifact, catalog: GearCatalog): GearDraft {
    const unresolved: UnresolvedIssue[] = [];
    const major = (message: string) => unresolved.push({ message, severity: 'major' });
    const minor = (message: string) => unresolved.push({ message, severity: 'minor' });

    const setDef = catalog.sets.find((s) => normalize(s.name) === normalize(a.setKey));
    if (!setDef) major(`Set "${a.setKey}" isn't in the catalog — skipped`);

    const slot = catalog.slots.find((s) => s.id === a.slotKey);
    if (!slot) major(`Slot "${a.slotKey}" not recognized`);

    const mainKey = GOOD_STAT_KEY_MAP[a.mainStatKey];
    if (!mainKey) major(`Main stat "${a.mainStatKey}" not recognized`);
    else if (!catalog.mains.some((m) => m.key === mainKey)) major(`Main stat "${a.mainStatKey}" isn't a valid option for this catalog`);

    // Rarity is a structural/identity field (it drives which main-stat VALUE
    // gets looked up) — an out-of-range or non-finite value here (a garbled
    // export, or a hand-edited file) would otherwise silently fall through
    // to `buildGearEntryFromDraft`'s `?? 0` default instead of being caught,
    // producing a real-looking but wrong 0-value main stat.
    const validRarity = Number.isFinite(a.rarity) && catalog.rarities.includes(a.rarity);
    if (!validRarity) major(`Rarity "${a.rarity}" isn't valid for this catalog (expected one of ${catalog.rarities.join('/')})`);
    const rarity = validRarity ? a.rarity : undefined;

    const maxLevel = a.rarity >= 5 ? 20 : 16;
    if (Number.isFinite(a.level) && a.level < maxLevel) {
        minor(`Level ${a.level}/${maxLevel} — imported using the max-level main-stat value since per-level scaling isn't modeled; sub-stats are the real values from the file`);
    } else if (!Number.isFinite(a.level)) {
        minor(`Level "${a.level}" isn't a real number — ignored, imported at the max-level main-stat value`);
    }

    const subs: Array<{ key: string; value: number }> = [];
    for (const s of a.substats ?? []) {
        const key = GOOD_STAT_KEY_MAP[s.key];
        if (!key) { minor(`Sub-stat "${s.key}" not recognized — dropped`); continue; }
        if (!Number.isFinite(s.value)) { minor(`Sub-stat "${s.key}" has a non-numeric value (${s.value}) — dropped`); continue; }
        subs.push({ key, value: s.value });
    }

    return { setId: setDef?.id, rarity, slotId: slot?.id, mainKey, subs, unresolved };
}
