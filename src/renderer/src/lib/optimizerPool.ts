/**
 * @fileoverview Orchestrates a pool of `optimizerWorker.ts` Web Workers to
 * run the loadout search off the main/renderer thread, spread across
 * `threadCount` threads (Settings > Calculator > "Optimizer threads"),
 * reporting live progress so the Calculator can show a progress bar instead
 * of freezing with no feedback until it either finishes or (for large gear
 * pools) throws — see `shared/calc/optimizer.ts`'s `targetRanges` doc
 * comment for the crash this whole thing was originally built to survive.
 *
 * Work is split by gear-combination "first pick" (see `subtreeSize`), load-
 * balanced across threads with a simple LPT (Longest Processing Time first)
 * heuristic — sort candidate first-indices by their estimated subtree size
 * descending, greedily assign each to whichever thread currently has the
 * least assigned work. Scoring needs the TRUE min/max of each maximize
 * target across ALL combos (not just one thread's slice) to normalize
 * correctly, so this runs in two rounds: every worker reports its own local
 * range, the pool merges them into the global range and sends it back, THEN
 * every worker scores against the correct global range and returns just its
 * own top-N (see `optimizerWorker.ts`'s file doc for the full protocol).
 */
import type { CharacterEntry, GearEntry } from '@shared/types/game-bundle';
import {
    subtreeSize, gearSlotsFor, mergeRanges,
    type OptimizeConfig, type Loadout, type TargetRange,
} from '@shared/calc/optimizer';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '../workers/optimizerWorker';

/** Greedy LPT assignment of every valid "first pick" index (0..poolSize-k) to `threadCount` buckets, balanced by estimated subtree size. */
function assignFirstIndices(poolSize: number, k: number, threadCount: number): number[][] {
    const maxFirst = poolSize - k;
    const indices = Array.from({ length: maxFirst + 1 }, (_, i) => i);
    indices.sort((a, b) => subtreeSize(poolSize, k, b) - subtreeSize(poolSize, k, a));
    const buckets: number[][] = Array.from({ length: threadCount }, () => []);
    const loads = new Array(threadCount).fill(0);
    for (const idx of indices) {
        let minI = 0;
        for (let i = 1; i < threadCount; i++) if (loads[i] < loads[minI]) minI = i;
        buckets[minI].push(idx);
        loads[minI] += subtreeSize(poolSize, k, idx);
    }
    return buckets;
}

// Spaced far enough apart that no two workers' internal combo indices could
// ever collide, without needing to precompute each worker's exact combo
// count up front — ids only need to be unique for React keys, not ordered.
const ID_OFFSET_STRIDE = 10_000_000;

export interface OptimizePoolProgress { done: number; total: number }

/**
 * Run the loadout search across `threadCount` Web Workers and resolve with
 * the merged, globally-correct top-`config.topN` loadouts — same result
 * `optimize()` (single-threaded) would produce, just parallelized.
 * `onProgress` fires as workers report chunks processed (summed across all
 * threads); `signal` (optional) lets a caller abort — workers are
 * terminated immediately and the returned promise rejects.
 */
export function runOptimizerPool(
    character: CharacterEntry,
    pool: GearEntry[],
    config: OptimizeConfig,
    threadCount: number,
    onProgress?: (p: OptimizePoolProgress) => void,
    signal?: AbortSignal,
): Promise<Loadout[]> {
    return new Promise((resolve, reject) => {
        const k = gearSlotsFor(pool.length);
        const effectiveThreads = Math.max(1, Math.min(threadCount, pool.length - k + 1));
        const buckets = assignFirstIndices(pool.length, k, effectiveThreads);

        const workers: Worker[] = [];
        const perWorkerDone = new Array(effectiveThreads).fill(0);
        const perWorkerTotal = new Array(effectiveThreads).fill(0);
        const perWorkerRanges: (TargetRange[] | null)[] = new Array(effectiveThreads).fill(null);
        const perWorkerTop: (Loadout[] | null)[] = new Array(effectiveThreads).fill(null);
        let settled = false;

        const cleanup = () => { for (const w of workers) w.terminate(); };
        const fail = (err: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err instanceof Error ? err : new Error(String(err)));
        };
        const reportProgress = () => {
            if (!onProgress) return;
            const done = perWorkerDone.reduce((a, b) => a + b, 0);
            const total = perWorkerTotal.reduce((a, b) => a + b, 0);
            onProgress({ done, total });
        };

        if (signal) {
            if (signal.aborted) { fail(new Error('Optimization cancelled')); return; }
            signal.addEventListener('abort', () => fail(new Error('Optimization cancelled')), { once: true });
        }

        for (let i = 0; i < effectiveThreads; i++) {
            let worker: Worker;
            try {
                worker = new Worker(new URL('../workers/optimizerWorker.ts', import.meta.url), { type: 'module' });
            } catch (err) {
                fail(err);
                return;
            }
            workers.push(worker);

            worker.onerror = (ev) => fail(new Error(ev.message || 'Optimizer worker error'));
            worker.onmessage = (ev: MessageEvent<WorkerOutboundMessage>) => {
                const msg = ev.data;
                if (msg.type === 'progress') {
                    perWorkerDone[i] = msg.done;
                    perWorkerTotal[i] = msg.total;
                    reportProgress();
                    return;
                }
                if (msg.type === 'ranges') {
                    perWorkerDone[i] = msg.total;
                    perWorkerTotal[i] = msg.total;
                    perWorkerRanges[i] = msg.ranges;
                    reportProgress();
                    if (perWorkerRanges.every((r) => r !== null)) {
                        const globalRanges = mergeRanges(perWorkerRanges as TargetRange[][]);
                        for (const w of workers) {
                            w.postMessage({ type: 'score', ranges: globalRanges } satisfies WorkerInboundMessage);
                        }
                    }
                    return;
                }
                if (msg.type === 'done') {
                    perWorkerTop[i] = msg.top;
                    if (perWorkerTop.every((t) => t !== null)) {
                        if (settled) return;
                        settled = true;
                        const merged = (perWorkerTop as Loadout[][])
                            .flat()
                            .sort((a, b) => (Number(b.meets) - Number(a.meets)) || (b.score - a.score))
                            .slice(0, Math.max(1, config.topN));
                        cleanup();
                        resolve(merged);
                    }
                }
            };

            const idOffset = i * ID_OFFSET_STRIDE;
            worker.postMessage({
                type: 'init',
                character, pool, k,
                firstIndices: buckets[i],
                idOffset,
                config,
            } satisfies WorkerInboundMessage);
        }
    });
}
