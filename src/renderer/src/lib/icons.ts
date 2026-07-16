/**
 * Resolve an entity's game-relative icon path to a loadable URL served by the
 * main process's `fm-icon://` protocol (see electron-main `setupIconProtocol`).
 * Returns undefined when there's no icon, so <ItemIcon> shows its placeholder.
 *
 * Icon files live under `adapters/game-definitions/<gameId>/icons/…`; drop the
 * art in there and it appears automatically — no code changes needed.
 */
export function iconSrc(gameId: string, iconPath?: string): string | undefined {
    if (!iconPath) return undefined;
    return `fm-icon://${gameId}/${iconPath.replace(/^\/+/, '')}`;
}
