import { hasElectronBridge } from './platform';

/** Public GitHub repo icon art lives under — same host already trusted for
 * tesseract.js's CDN fetches (see index.web.html's CSP). Pinned to the
 * release tag (not `@latest`/`@main`) so the URL is immutable and cacheable
 * forever — matches the web build's own "always the latest release" model,
 * since `__APP_VERSION__` is set from package.json at the same build step
 * that produces the deploy CI ships for that tag. */
const JSDELIVR_ICON_BASE = 'https://cdn.jsdelivr.net/gh/Voruzhu/FrequencyManager';

/**
 * Resolve an entity's game-relative icon path to a loadable URL.
 *
 * Electron: served by the main process's `fm-icon://` protocol (see
 * electron-main's `setupIconProtocol`), reading from the installed game
 * package on disk.
 *
 * Web: there's no main process, no protocol, no installed package — instead
 * this fetches the same icon file directly from this public repo's own
 * `adapters/game-definitions/<gameId>/icons/…` folder via jsDelivr's GitHub
 * CDN. No bundling, no build-time copying — the art already lives in the
 * repo either way (see `scripts/build-game-package.js`, which zips that same
 * folder for the Electron installer).
 *
 * Returns undefined when there's no icon, so `<ItemIcon>` shows its
 * placeholder either way.
 */
export function iconSrc(gameId: string, iconPath?: string): string | undefined {
    if (!iconPath) return undefined;
    const rel = iconPath.replace(/^\/+/, '');
    if (hasElectronBridge()) return `fm-icon://${gameId}/${rel}`;
    return `${JSDELIVR_ICON_BASE}@v${__APP_VERSION__}/adapters/game-definitions/${gameId}/${rel}`;
}
