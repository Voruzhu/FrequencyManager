/**
 * @fileoverview Auto-scan orchestration — the "first sample" navigation
 * sequence: focus the game window, confirm the Terminal menu is open,
 * ESC → wait 2s → C (Character menu) → click the target sidebar icon.
 * @module src/main/autoScan
 *
 * Deliberately stops here (doesn't yet loop through echoes/OCR each one) —
 * this is step one of a multi-step build, verified live before the next
 * step (per-echo capture+OCR loop) gets added on top.
 *
 * Dependency-injected (capture/OCR/progress callbacks passed in, not
 * imported from electron-main.ts directly) so this file doesn't need to know
 * about the kernel/IPC wiring that owns those pieces.
 */

import { focusWindow, isWindowForeground, getWindowRect, sendKey, sendClick } from './windowAutomation';

export type AutoScanStep = 'focus' | 'detect-terminal' | 'esc' | 'character-menu' | 'click-icon' | 'sample-complete' | 'aborted';
export type AutoScanStatus = 'running' | 'done' | 'error';

export interface AutoScanDeps {
    /** Captures the game window, applies the given scan-type's crop/upscale, returns a temp PNG path (mirrors the existing `captureScreen` used by manual OCR). */
    captureScreen: (scanType?: string) => Promise<string | null>;
    /** Raw OCR text of an already-cropped image, no echo parsing (new `ocr:raw-text` request). */
    readRawText: (imagePath: string) => Promise<string>;
    onProgress: (step: AutoScanStep, status: AutoScanStatus, message?: string) => void;
}

const WINDOW_TITLE_HINT = 'Wuthering Waves';

/** Character-screen sidebar icon target, as a FRACTION of the game window's
 * on-screen bounding box — the 3rd icon down (lightning-in-diamond, per the
 * maintainer's own confirmation against a real screenshot, 2026-07-27).
 * First estimate; expect to recalibrate after the first live test, same as
 * every OCR crop region in this app needed early on. */
const CHARACTER_SIDEBAR_ICON_FRACTION = { x: 0.039, y: 0.426 };

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stillFocused(onProgress: AutoScanDeps['onProgress']): Promise<boolean> {
    if (await isWindowForeground(WINDOW_TITLE_HINT)) return true;
    onProgress('aborted', 'error', 'Stopped — the Wuthering Waves window lost focus (Alt+Tab detected).');
    return false;
}

export async function runAutoScanSample(deps: AutoScanDeps): Promise<void> {
    const { captureScreen, readRawText, onProgress } = deps;

    onProgress('focus', 'running');
    const focused = await focusWindow(WINDOW_TITLE_HINT);
    if (!focused) {
        onProgress('focus', 'error', `Couldn't find the "${WINDOW_TITLE_HINT}" window — make sure the game is running.`);
        return;
    }
    onProgress('focus', 'done');
    await delay(300); // let the OS actually finish switching focus before capturing

    onProgress('detect-terminal', 'running');
    const imagePath = await captureScreen('terminal-check');
    const text = imagePath ? await readRawText(imagePath) : '';
    if (!/terminal/i.test(text)) {
        onProgress('detect-terminal', 'error', 'Doesn\'t look like the Terminal menu is open — press Escape in-game (or navigate there manually), then try again.');
        return;
    }
    onProgress('detect-terminal', 'done');

    if (!(await stillFocused(onProgress))) return;
    onProgress('esc', 'running');
    await sendKey('ESC');
    onProgress('esc', 'done');

    await delay(2000);

    if (!(await stillFocused(onProgress))) return;
    onProgress('character-menu', 'running');
    await sendKey('C');
    onProgress('character-menu', 'done');

    await delay(800); // let the character screen finish opening before clicking into it

    if (!(await stillFocused(onProgress))) return;
    onProgress('click-icon', 'running');
    const rect = await getWindowRect(WINDOW_TITLE_HINT);
    if (!rect) {
        onProgress('click-icon', 'error', 'Lost track of the game window before clicking.');
        return;
    }
    await sendClick(rect.x + rect.width * CHARACTER_SIDEBAR_ICON_FRACTION.x, rect.y + rect.height * CHARACTER_SIDEBAR_ICON_FRACTION.y);
    onProgress('click-icon', 'done');

    onProgress('sample-complete', 'done', 'First sample finished — check the game to see whether it landed on the right screen.');
}
