import { CHARACTER_CARD_ART } from '@shared/game-data/character-card-art';
import { iconSrc } from './icons';

/** Resolves a character's bundled card art to a loadable src — the SAME
 * mechanism every other piece of game art already uses (fm-icon:// in
 * Electron, jsDelivr CDN on the web build — see iconSrc()). Synchronous: the
 * art ships with the game package, no runtime fetch to a third party (see
 * shared/game-data/character-wiki-art.ts for where each file was originally
 * sourced from, and scripts/download-character-wiki-art.cjs for how it got
 * bundled). Returns undefined for a character with no bundled art, so
 * callers fall back to the small icon — never throws. */
export function characterCardArtSrc(gameId: string, characterId: string): string | undefined {
    const relPath = CHARACTER_CARD_ART[characterId];
    if (!relPath) return undefined;
    return iconSrc(gameId, relPath);
}
