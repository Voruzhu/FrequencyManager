/**
 * Build a downloadable external game-module package (see docs/GAME_MODULES.md)
 * from a game's already-compiled `bundle.js`.
 *
 * WHY: `adapters/game-definitions/<id>/bundle.ts` already assembles exactly
 * the pieces `buildGameBundle` needs (def/charDB/weaponDB/supplements/scalars)
 * — see `<id>ModuleInput`, a named export added specifically so this script
 * doesn't have to reverse-engineer that shape from anywhere else. This just
 * reshapes it into the external-module JSON contract
 * (`shared/game-data/external-loader.ts`'s `ExternalGameModuleFile`), copies
 * the game's icons/ folder alongside it, and zips the result as a single
 * `<gameId>/` folder (module.json + icons/ inside it) — extracting the zip
 * directly into `game-modules/` produces the correct
 * `game-modules/<gameId>/module.json` + `game-modules/<gameId>/icons/`
 * packaged-folder shape with no manual subfolder step required.
 *
 * Requires `npm run build:main` to have already run (reads compiled output
 * under dist/, not the TypeScript source, since this is a plain Node script).
 *
 * Usage:
 *   node scripts/build-game-package.js wuthering-waves
 *   node scripts/build-game-package.js genshin-impact
 *   node scripts/build-game-package.js            # both
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

const GAMES = {
    'wuthering-waves': { moduleInputExport: 'wutheringWavesModuleInput' },
    'genshin-impact': { moduleInputExport: 'genshinImpactModuleInput' },
};

function copyDirExcluding(src, dest, excludeNames) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (excludeNames.includes(entry.name)) continue;
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirExcluding(s, d, excludeNames);
        else fs.copyFileSync(s, d);
    }
}

function buildOnePackage(gameId) {
    const cfg = GAMES[gameId];
    if (!cfg) throw new Error(`Unknown game id: ${gameId}`);

    const bundlePath = path.join(root, 'dist', 'adapters', 'game-definitions', gameId, 'bundle.js');
    if (!fs.existsSync(bundlePath)) {
        throw new Error(`${bundlePath} not found — run "npm run build:main" first`);
    }
    // Bust require cache in case this script runs for both games in one process.
    delete require.cache[require.resolve(bundlePath)];
    const mod = require(bundlePath);
    const input = mod[cfg.moduleInputExport];
    if (!input) throw new Error(`${bundlePath} has no export "${cfg.moduleInputExport}"`);

    const externalFile = {
        definition: input.def,
        charDB: input.charDB,
        weaponDB: input.weaponDB,
        supplements: input.supplements,
        buildOptions: {
            defaultElement: input.defaultElement,
            defaultWeapon: input.defaultWeapon,
            hasElementalMastery: input.hasElementalMastery,
            supportsReactions: input.supportsReactions,
            setPieces: input.setPieces,
            partyTeammates: input.partyTeammates,
            starterCharacterId: input.starterCharacterId,
            sequenceLabel: input.sequenceLabel,
            sequenceMax: input.sequenceMax,
            ...(input.backfillSkillIds ? { backfillSkillIds: input.backfillSkillIds } : {}),
        },
    };

    const outDir = path.join(root, 'dist', 'game-packages', gameId);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'module.json'), JSON.stringify(externalFile, null, 2));

    const iconsSrc = path.join(root, 'adapters', 'game-definitions', gameId, 'icons');
    if (fs.existsSync(iconsSrc)) {
        copyDirExcluding(iconsSrc, path.join(outDir, 'icons'), ['README.md']);
    }

    const zipPath = path.join(root, 'dist', 'game-packages', `${gameId}.zip`);
    fs.rmSync(zipPath, { force: true });
    // Compress-Archive -Path <folder> (NO trailing \*) zips the folder ITSELF
    // as a single top-level entry named after it (outDir's basename IS
    // gameId) -- module.json/icons/ land at "<gameId>/module.json",
    // "<gameId>/icons/...". This is deliberate: a zip with no wrapping folder
    // relies on the user manually creating a "<gameId>/" subfolder during
    // extraction, which Explorer's default "Extract All..." into
    // game-modules/ does NOT do -- it silently drops module.json + icons/ as
    // orphaned top-level files (module.json still loads fine as a stand-alone
    // LOOSE module, but its icons/ folder is never associated with it, so
    // every icon falls back to the placeholder). A wrapping folder makes any
    // reasonable extraction -- Explorer, 7-Zip, or
    // `Expand-Archive -DestinationPath game-modules/` -- produce the correct
    // packaged-folder shape automatically.
    execFileSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path "${outDir}" -DestinationPath "${zipPath}" -Force`,
    ]);

    const charCount = externalFile.charDB.length;
    const weaponCount = externalFile.weaponDB.length;
    console.log(`[build-game-package] ${gameId}: ${charCount} characters, ${weaponCount} weapons -> ${zipPath}`);
}

const requested = process.argv[2];
const targets = requested ? [requested] : Object.keys(GAMES);
for (const id of targets) buildOnePackage(id);
