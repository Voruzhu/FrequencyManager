/**
 * Whether this renderer is running inside Electron (the preload bridge is
 * present) versus a plain browser tab (the web build, or the Vite dev
 * server opened directly without Electron). Used to hide/replace UI that
 * only makes sense with Electron's native chrome/IPC — window controls,
 * auto-update, native file dialogs, the community game-package installer —
 * rather than showing a control that silently no-ops. See
 * docs/WEB_VERSION.md for the full list of what differs.
 */
export function hasElectronBridge(): boolean {
    return typeof window !== 'undefined' && !!(window as unknown as { frequencyManager?: unknown }).frequencyManager;
}

/**
 * Open an external URL (GitHub repo, donation link, etc.) the right way for
 * each platform: Electron's bridge opens it in the user's system browser
 * (never navigates the app window itself away); a plain browser has no such
 * bridge, so `window.open` in a new tab is the equivalent. Previously
 * call sites did `bridge()?.openExternal?.(url)` directly, which silently
 * no-op'd on web (optional-chaining swallowed the missing method) — e.g.
 * Settings > About's "Buy me a coffee" button did nothing on a web build.
 */
export function openExternalLink(url: string): void {
    const bridge = (window as unknown as { frequencyManager?: { openExternal?: (url: string) => void } }).frequencyManager;
    if (bridge?.openExternal) bridge.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
}
