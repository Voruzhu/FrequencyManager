/**
 * Browser-side OCR scanning — the web build's replacement for the Electron
 * `ocr-scanner` module (which uses Node's filesystem + tesseract.js's Node
 * worker; neither exists in a browser). Uses tesseract.js's BROWSER worker
 * (the same npm package — its package.json `browser` field swaps the worker
 * implementation when bundled for a browser target) against a `File`/`Blob`
 * the user picked via a plain `<input type="file">`, since there's no
 * hotkey/live-capture path on web (see docs/WEB_VERSION.md).
 *
 * Reuses the EXACT SAME parsing logic as the Electron module
 * (`shared/ocr/parseEchoData.ts`) — only the image-recognition step differs.
 *
 * `eng.traineddata` (~5MB) is bundled with the web build itself
 * (src/renderer/public/tessdata/) so repeat scans don't re-download it —
 * same reasoning as the Electron build's own bundled copy. tesseract.js's
 * worker/core engine files are NOT bundled (left at the library's own
 * jsDelivr CDN defaults) — fetching those needs internet access the first
 * time OCR runs in a session; the browser caches them after that.
 */
import { createWorker, PSM, OEM, type Worker } from 'tesseract.js';
import { parseEchoData } from '@shared/ocr/parseEchoData';
import type { OcrRules } from '@shared/types/game-definition';
import type { ScannedEcho } from '@shared/types/ocr';

export interface BrowserScanResult {
    success: boolean;
    echo?: ScannedEcho;
    error?: string;
    confidence: number;
    rawText?: string;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 35; // matches the Electron module's own default — see its scanImage doc comment

let workerPromise: Promise<Worker> | null = null;

/** Lazily spins up ONE shared worker for the session (matches the Electron
 * module's own "initialized once, reused for every scan" lifecycle) rather
 * than paying tesseract's ~1-2s init cost on every single scan. */
function getWorker(): Promise<Worker> {
    if (!workerPromise) {
        workerPromise = (async () => {
            const worker = await createWorker('eng', 1, {
                // Relative to the current page URL (tesseract.js resolves it
                // via `new URL(langPath, window.location.href)` internally),
                // so this works unchanged whether served from a domain root
                // or a GitHub Pages project subpath (https://user.github.io/repo/).
                langPath: './tessdata',
                gzip: false, // the bundled file is a raw .traineddata, not .traineddata.gz
            });
            // Same PSM/OEM tuning as the Electron module (see its own doc
            // comment on tessedit_pageseg_mode for why SINGLE_COLUMN, not
            // AUTO or SINGLE_BLOCK, is the structurally-correct mode here).
            await worker.setParameters({
                tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
                tessedit_oem: OEM.LSTM_ONLY,
            });
            return worker;
        })();
    }
    return workerPromise;
}

/** Scans an uploaded screenshot (from `<input type="file">`) against the
 * active game's real OCR rules — the web equivalent of the Electron
 * module's `scanImage(imagePath)`, taking a `File`/`Blob` instead of a
 * filesystem path. */
export async function scanImageInBrowser(
    file: File | Blob,
    ocrRules: OcrRules,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
): Promise<BrowserScanResult> {
    try {
        const worker = await getWorker();
        const { data } = await worker.recognize(file);
        const confidence = data.confidence;

        if (confidence < confidenceThreshold) {
            return {
                success: false,
                error: `OCR confidence too low: ${confidence}% (threshold: ${confidenceThreshold}%)`,
                confidence,
                rawText: data.text,
            };
        }

        const echo = parseEchoData(data.text, confidence, ocrRules);
        if (!echo) {
            return { success: false, error: 'Failed to parse echo data from OCR text', confidence, rawText: data.text };
        }

        return { success: true, echo, confidence };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown OCR error', confidence: 0 };
    }
}
