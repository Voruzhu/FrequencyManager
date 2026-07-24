/**
 * Browser-native equivalents of Electron's save/open-file dialogs — used
 * when `window.frequencyManager` isn't present (the web build). Callers
 * check `hasElectronBridge()` themselves and use the native dialog bridge
 * methods when it's available; these are the fallback path, not a wrapper
 * around the bridge.
 */

/** Downloads a string as a file via a throwaway <a download> click — the
 * web equivalent of Electron's native "Save As" dialog. There's no
 * meaningful "did it save" signal in the browser (the download always
 * "succeeds" from the page's point of view), so callers should treat this
 * as fire-and-forget. */
export function downloadTextFile(filename: string, content: string, mimeType = 'application/json'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Prompts the user to pick a file via the browser's native file picker and
 * resolves with its contents — the web equivalent of Electron's native
 * "Open" dialog. Resolves `null` if the picker is dismissed with no file
 * chosen (relies on the `cancel` event, well-supported in current Chromium/
 * Firefox; on a browser without it, the promise simply doesn't settle until
 * a file is picked — a soft degradation, not a crash). */
export function pickTextFile(accept = '.json,application/json'): Promise<{ path: string; content: string } | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        let settled = false;
        const finish = (value: { path: string; content: string } | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) { finish(null); return; }
            const reader = new FileReader();
            reader.onload = () => finish({ path: file.name, content: String(reader.result ?? '') });
            reader.onerror = () => finish(null);
            reader.readAsText(file);
        });
        input.addEventListener('cancel', () => finish(null));
        input.click();
    });
}
