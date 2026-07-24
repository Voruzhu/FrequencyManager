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
