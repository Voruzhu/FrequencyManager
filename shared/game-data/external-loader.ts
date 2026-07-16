/**
 * @fileoverview Load community-authored game modules from disk
 * @module shared/game-data/external-loader
 *
 * A "game module" describes everything specific to one game (Wuthering Waves,
 * Genshin Impact, or a community-added one) — equipment rules, OCR patterns,
 * combat actions, set bonuses, and character/weapon rosters. The two built-in
 * games ship compiled into the app (`adapters/game-definitions/<id>/`); this
 * loader lets a THIRD PARTY add another game WITHOUT a new app release: drop
 * one JSON file into a user-writable directory (see `initExternalGameModules`
 * in `adapters/game-definitions/index.ts`, called from the Electron main
 * process before kernel boot) and restart the app.
 *
 * `GameDefinition` and `GameBundle` are both plain, 100%-serializable data —
 * no functions — so this is fundamentally "load a bigger data file," not
 * "run untrusted code." The one real risk is `OcrRules`' regex-source
 * strings: they're compiled with `new RegExp` and run against OCR text, so a
 * hostile module could ship a catastrophic-backtracking pattern. `isRegexSafe`
 * is a best-effort static guard against the well-known shapes, not a full
 * ReDoS analyzer — deliberately conservative (reject on doubt) rather than
 * silently accepting a risky pattern.
 *
 * Pure Node (`fs`/`path` only) — no Electron import — so it's usable from
 * tests and doesn't dictate where the caller's directory actually lives.
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { GameDefinition } from '../types/game-definition';
import type { GameBundle } from '../types/game-bundle';
import { buildGameBundle, type RawCharacter, type RawWeapon, type BackfillSlot } from './derive';

/** One community game module file's on-disk shape — everything `buildGameBundle` needs, as JSON instead of hand-authored TypeScript. */
export interface ExternalGameModuleFile {
    definition: GameDefinition;
    charDB: RawCharacter[];
    weaponDB: RawWeapon[];
    supplements: {
        gearRanges: Record<string, unknown>;
        statCatalog: Array<{ key: string; label: string; percent?: boolean }>;
        enemies: Array<Record<string, unknown>>;
        buffs: { basic: Array<Record<string, unknown>>; character: Array<Record<string, unknown>> };
        passives: Array<Record<string, unknown>>;
        /** Optional set-name -> icon-path lookup, merged into gearCatalog.sets by buildGameBundle. */
        setIcons?: Record<string, string>;
    };
    buildOptions: {
        defaultElement: string;
        defaultWeapon: string;
        hasElementalMastery: boolean;
        supportsReactions: boolean;
        setPieces: number;
        partyTeammates: number;
        starterCharacterId: string;
        sequenceLabel: string;
        sequenceMax: number;
        backfillSkillIds?: BackfillSlot[];
    };
}

export interface LoadedExternalGame {
    definition: GameDefinition;
    bundle: GameBundle;
    sourceFile: string;
    /** Absolute path to this module's `icons/` folder, if it has one — only
     * possible for a SUBDIRECTORY-based package (see `loadExternalGameBundles`
     * doc comment); a loose top-level `.json` file has nowhere to put icons. */
    iconsDir?: string;
}

export interface ExternalLoadResult {
    loaded: LoadedExternalGame[];
    errors: Array<{ file: string; error: string }>;
}

// ── Regex safety ────────────────────────────────────────────────────────────

// Nested-quantifier shapes are the classic catastrophic-backtracking triggers:
// (x+)+, (x*)*, (x+)*, (x*)+ — each can go exponential on a crafted input,
// because the inner and outer quantifiers can both match the SAME repeated
// content, making the split between iterations ambiguous. That ambiguity is
// the actual danger — NOT merely "a quantified group followed by another
// quantifier," which also matches plenty of ordinary, safe patterns like
// `(?:['-][a-zA-Z]+)*` (a suffix clause repeated after a REQUIRED leading
// punctuation character — WuWa's own real namePattern, which handles names
// like "Xiangli Yao" / "Rover: Spectro"). Requiring the group's content to be
// a SINGLE quantified atom (one char class or literal, nothing else) keeps
// the classic dangerous shapes flagged while no longer rejecting a safe
// multi-atom sequence just because it also ends in `+`/`*`. Still
// intentionally conservative — not a full proof a pattern IS exponential
// (a much harder, unsolved-in-general problem) — a community module with a
// rejected-but-actually-fine single-atom pattern can simply add another atom
// to the group (e.g. an explicit anchor) to change its shape.
const NESTED_QUANTIFIER = /\(\??:?\s*(?:\[[^\]]*\]|\\.|.)[+*]\s*\)[+*]/;
const MAX_PATTERN_LENGTH = 500;

export function isRegexSafe(source: string): boolean {
    if (source.length > MAX_PATTERN_LENGTH) return false;
    if (NESTED_QUANTIFIER.test(source)) return false;
    try {
        new RegExp(source);
    } catch {
        return false;
    }
    return true;
}

function ocrPatternsSafe(def: GameDefinition): boolean {
    const patterns = [
        def.ocr.namePattern, def.ocr.costPattern, def.ocr.mainStatPattern, def.ocr.subStatPattern,
        def.ocr.levelPattern, def.ocr.equippedByPattern,
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);
    return patterns.every(isRegexSafe);
}

// ── Validation ───────────────────────────────────────────────────────────────
//
// Pragmatic, not exhaustive: strictly checks the scalar fields the loader
// itself depends on (ids, required numbers/strings), but accepts richer
// nested structures (skills, constellations, buffs, conversions) permissively
// via `z.record`/`z.unknown` rather than transcribing every optional field of
// `CharacterSkill`/`ConstellationNode`/etc. A malformed nested field surfaces
// as a runtime error from `buildGameBundle` (caught and reported per-file
// below), not a silent corruption — this schema's job is to catch "this
// isn't even the right shape" before that point, not to prove every field
// is perfect.

const statDefSchema = z.object({ key: z.string(), label: z.string(), percent: z.boolean().optional() });

const rawCharacterSchema = z.object({
    id: z.string(), name: z.string(), element: z.string(), weapon: z.string(),
    rarity: z.number().optional(),
    baseAtk: z.number(), baseHp: z.number(), baseDef: z.number(),
    baseCritRate: z.number(), baseCritDmg: z.number(), baseEnergyRegen: z.number(),
    baseElementalMastery: z.number().optional(),
    icon: z.string().optional(),
}).passthrough();

const rawWeaponSchema = z.object({
    id: z.string(), name: z.string(), weaponType: z.string(), rarity: z.number(),
    baseAtk: z.number(), secondaryStat: z.string(), secondaryValue: z.number(),
    icon: z.string().optional(),
}).passthrough();

const gameDefinitionSchema = z.object({
    id: z.string().min(1),
    displayName: z.string(),
    description: z.string(),
    version: z.string(),
    minAppVersion: z.string().optional(),
    equipment: z.object({
        slotLabel: z.string(), slotLabelPlural: z.string(),
        maxSubStats: z.number(), maxLevel: z.number(),
        allowedMainStatTypes: z.array(z.string()),
        allowedCosts: z.array(z.number()),
    }).passthrough(),
    character: z.object({
        elements: z.array(z.string()), weapons: z.array(z.string()),
        maxLevel: z.number(), maxAscension: z.number(),
        ascensionBonus: z.array(z.object({ atk: z.number(), hp: z.number(), def: z.number() })),
    }).passthrough(),
    combat: z.object({
        actions: z.array(z.record(z.unknown())),
        defaultRotationLength: z.number(),
    }).passthrough(),
    ocr: z.object({
        namePattern: z.string(), costPattern: z.string(),
        mainStatPattern: z.string(), subStatPattern: z.string(),
        setNames: z.array(z.string()),
        levelPattern: z.string().optional(),
        equippedByPattern: z.string().optional(),
        windowTitleHint: z.string().optional(),
    }).passthrough(),
    sets: z.array(z.record(z.unknown())),
    statAliases: z.record(z.string()).optional(),
    uiOptions: z.record(z.unknown()).optional(),
}).passthrough();

const externalFileSchema = z.object({
    definition: gameDefinitionSchema,
    charDB: z.array(rawCharacterSchema),
    weaponDB: z.array(rawWeaponSchema),
    supplements: z.object({
        gearRanges: z.record(z.unknown()),
        statCatalog: z.array(statDefSchema),
        enemies: z.array(z.record(z.unknown())),
        buffs: z.object({ basic: z.array(z.record(z.unknown())), character: z.array(z.record(z.unknown())) }),
        passives: z.array(z.record(z.unknown())),
        // Set-name -> icon-path lookup, merged into gearCatalog.sets by
        // buildGameBundle. Without this key, zod silently strips any setIcons
        // a module file provides (bare z.object() drops unknown keys) — this
        // bit the official WW/GI packages too, since 2026-07-13 they load
        // through this exact same external-module path.
        setIcons: z.record(z.string()).optional(),
    }),
    buildOptions: z.object({
        defaultElement: z.string(),
        defaultWeapon: z.string(),
        hasElementalMastery: z.boolean(),
        supportsReactions: z.boolean(),
        setPieces: z.number(),
        partyTeammates: z.number(),
        starterCharacterId: z.string(),
        sequenceLabel: z.string(),
        sequenceMax: z.number(),
        backfillSkillIds: z.array(z.object({ id: z.string(), actionId: z.string(), weaponTypes: z.array(z.string()).optional() })).optional(),
    }),
});

/** Validate one parsed JSON value against the external game module contract. */
export function validateExternalGameModule(data: unknown): { ok: true; value: ExternalGameModuleFile } | { ok: false; error: string } {
    const result = externalFileSchema.safeParse(data);
    if (!result.success) {
        return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    }
    return { ok: true, value: result.data as unknown as ExternalGameModuleFile };
}

/** Parse, validate, safety-check, and derive ONE game-module JSON file's raw
 * text into a `GameBundle`. Shared by both the flat-file and subdirectory
 * scan paths below — `label` is what shows up in error reports (the
 * filename for a loose file, `<subdir>/<filename>` for a packaged one). */
function loadOneModuleFile(raw: string, label: string): { ok: true; value: LoadedExternalGame } | { ok: false; error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }

    const validated = validateExternalGameModule(parsed);
    if (!validated.ok) return { ok: false, error: validated.error };
    const mod = validated.value;

    if (!ocrPatternsSafe(mod.definition)) {
        return { ok: false, error: 'One or more OCR regex patterns were rejected as unsafe (too long, or a known catastrophic-backtracking shape)' };
    }

    const bundle = buildGameBundle({
        def: mod.definition,
        charDB: mod.charDB,
        weaponDB: mod.weaponDB,
        supplements: mod.supplements as unknown as Parameters<typeof buildGameBundle>[0]['supplements'],
        ...mod.buildOptions,
    });

    return { ok: true, value: { definition: mod.definition, bundle, sourceFile: label } };
}

/**
 * Scan `dir` for game modules, validate + derive each into a `GameBundle`,
 * and return the ones that succeeded plus a per-file error report for the
 * ones that didn't. Never throws — a missing directory or a single broken/
 * malicious module must never block app boot or the OTHER, valid modules in
 * the same directory.
 *
 * Two module shapes are supported side by side:
 *  - **Loose file**: `dir/<anything>.json` — a single self-contained module,
 *    no icons (nowhere for a lone JSON file to put art). This is the
 *    community "just drop one file" path documented in docs/GAME_MODULES.md.
 *  - **Packaged (one level of subdirectories)**: `dir/<pkg>/*.json` (exactly
 *    one JSON file) plus an optional sibling `dir/<pkg>/icons/` folder — the
 *    result of extracting a distributed .zip into place. This is how an
 *    "official" game package with real character/weapon art ships. The
 *    caller (see `initExternalGameModules`) is responsible for wiring
 *    `iconsDir` into the `fm-icon://` protocol's search path.
 */
export function loadExternalGameBundles(dir: string): ExternalLoadResult {
    const loaded: LoadedExternalGame[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    let entries: fs.Dirent[];
    try {
        entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
    } catch (err) {
        errors.push({ file: dir, error: `Could not read directory: ${err instanceof Error ? err.message : String(err)}` });
        return { loaded, errors };
    }

    // Loose top-level JSON files — no icons.
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
        try {
            const raw = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
            const result = loadOneModuleFile(raw, entry.name);
            if (result.ok) loaded.push(result.value);
            else errors.push({ file: entry.name, error: result.error });
        } catch (err) {
            errors.push({ file: entry.name, error: err instanceof Error ? err.message : String(err) });
        }
    }

    // Packaged subdirectories — exactly one JSON file + an optional icons/ folder.
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subdir = path.join(dir, entry.name);
        let subEntries: string[];
        try {
            subEntries = fs.readdirSync(subdir).filter((f) => f.toLowerCase().endsWith('.json'));
        } catch (err) {
            errors.push({ file: entry.name, error: `Could not read package directory: ${err instanceof Error ? err.message : String(err)}` });
            continue;
        }
        if (subEntries.length === 0) continue; // not a game package (e.g. an unrelated folder) — silently skip
        if (subEntries.length > 1) {
            errors.push({ file: entry.name, error: `Expected exactly one .json file in this package, found ${subEntries.length}: ${subEntries.join(', ')}` });
            continue;
        }
        const jsonName = subEntries[0];
        const label = `${entry.name}/${jsonName}`;
        try {
            const raw = fs.readFileSync(path.join(subdir, jsonName), 'utf-8');
            const result = loadOneModuleFile(raw, label);
            if (!result.ok) { errors.push({ file: label, error: result.error }); continue; }
            const iconsDir = path.join(subdir, 'icons');
            if (fs.existsSync(iconsDir)) result.value.iconsDir = iconsDir;
            loaded.push(result.value);
        } catch (err) {
            errors.push({ file: label, error: err instanceof Error ? err.message : String(err) });
        }
    }

    return { loaded, errors };
}
