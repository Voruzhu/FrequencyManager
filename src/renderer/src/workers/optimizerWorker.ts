/**
 * @fileoverview Optimizer worker — runs one slice of the loadout search
 * (a subset of gear-combination "first picks", see `subtreeSize` in
 * `shared/calc/optimizer.ts`) off the main/renderer thread, so a large gear
 * pool's combinatorial search doesn't freeze the UI. Orchestrated by
 * `lib/optimizerPool.ts`, which spawns one of these per configured thread.
 *
 * Two-phase protocol (both directions structured-clone plain data only —
 * every type involved, `CharacterEntry`/`GearEntry`/`OptimizeConfig`/etc.,
 * is plain serializable data, no functions/class instances):
 *   1. `init` → worker STREAMS its assigned combos (see `combinationsIter` /
 *      `cartesianCombosIter` — never materializes the whole list), computing
 *      each base loadout on the fly, reporting `progress`, and folding it
 *      into its LOCAL min/max per maximize-target (`ranges`) before discarding
 *      it — scoring needs the TRUE GLOBAL min/max across every worker's
 *      combos, which only the pool orchestrator can compute once every worker
 *      has reported in. This keeps memory O(1) instead of O(combos), so a
 *      3–4M-combo search no longer OOMs the renderer (the old
 *      materialize-everything path froze with a white screen on large gear
 *      pools).
 *   2. `score` (sent back once the orchestrator has merged everyone's local
 *      ranges into the true global range) → worker re-walks the SAME combos,
 *      recomputes each base loadout, scores it against those global ranges,
 *      and retains only its own running top-`topN` (not its full slice —
 *      keeping the postMessage payload small no matter how large this
 *      worker's combo slice was).
 */
import type { CharacterEntry, GearEntry } from '@shared/types/game-bundle';
import {
    streamCombos, computeBaseLoadouts,
    newTargetRanges, accumulateTargetRanges, scoreAndRankStreaming,
    type OptimizeConfig, type TargetRange, type Loadout,
} from '@shared/calc/optimizer';

export interface WorkerInitMessage {
    type: 'init';
    character: CharacterEntry;
    /** Ignored when `slotGroups` is set (see below) — the flat search path
     * uses this instead. */
    pool: GearEntry[];
    /** Ignored when `slotGroups` is set. */
    k: number;
    firstIndices: number[];
    idOffset: number;
    config: OptimizeConfig;
    /** Pieces held fixed in every combo this worker generates (see
     * `optimize`'s `lockedGear` param) — `pool`/`slotGroups` here already
     * describe only the SEARCHABLE remainder, so each generated combo just
     * needs this prefix restored before scoring. Omitted/empty for a normal
     * (nothing locked) search. */
    lockedGear?: GearEntry[];
    /** Set for slot-typed gear (GI artifacts) — combos come from
     * `cartesianCombos(slotGroups, firstIndices)` instead of
     * `combinations(pool, k, firstIndices)`. See `slotGroupsFor`'s doc
     * comment in shared/calc/optimizer.ts for why slotted gear needs a
     * fundamentally different search than flat (WuWa) gear. */
    slotGroups?: GearEntry[][];
    /** Abort flag for cancellation */
    abortFlag?: boolean;
}
export interface WorkerScoreMessage {
    type: 'score';
    ranges: TargetRange[];
}
export interface WorkerAbortMessage {
    type: 'abort';
}
export type WorkerInboundMessage = WorkerInitMessage | WorkerScoreMessage | WorkerAbortMessage;

export interface WorkerProgressMessage { type: 'progress'; done: number; total: number }
export interface WorkerRangesMessage { type: 'ranges'; ranges: TargetRange[]; total: number }
export interface WorkerDoneMessage { type: 'done'; top: Loadout[] }
export interface WorkerErrorMessage { type: 'error'; message: string }
export type WorkerOutboundMessage = WorkerProgressMessage | WorkerRangesMessage | WorkerDoneMessage | WorkerErrorMessage;

// Process combos in batches so `progress` messages land smoothly even when
// this worker's own slice is huge, instead of one giant blocking `.map()`.
const CHUNK_SIZE = 2000;
// Throttle progress messages to avoid flooding the main thread
const PROGRESS_THROTTLE_MS = 100;
// Safety cap: if a single worker gets more than this many combos, it will
// abort to prevent OOM. The pool should split work better, but this is a
// last-resort guard.
const MAX_COMBOS_PER_WORKER = 10_000_000;

let state: {
    character: CharacterEntry;
    config: OptimizeConfig;
    makeCombos: () => Generator<GearEntry[]>;
    idOffset: number;
} | null = null;

self.onmessage = (ev: MessageEvent<WorkerInboundMessage>) => {
    const msg = ev.data;
    if (msg.type === 'init') {
        const gen = streamCombos(msg.pool, msg.k, msg.firstIndices, msg.lockedGear ?? [], msg.config.maxTotalCost, msg.slotGroups);

        // Count this worker's combos up front (cheap — no damage math) so the
        // progress bar has a real total, and to enforce the OOM safety cap
        // before doing any expensive work.
        let total = 0;
        for (const _ of gen()) total++;

        if (total > MAX_COMBOS_PER_WORKER) {
            postMessage({ type: 'error', message: `Worker assigned ${total.toLocaleString()} combos (max ${MAX_COMBOS_PER_WORKER.toLocaleString()}). Reduce gear pool or increase thread count.` } as any);
            return;
        }

        state = { character: msg.character, config: msg.config, makeCombos: gen, idOffset: msg.idOffset };

        // Pass 1: accumulate this worker's LOCAL min/max per maximize-target,
        // streaming chunk-by-chunk and discarding each base loadout as it goes
        // (the O(1)-memory replacement for holding the whole `BaseLoadout[]`).
        const maxTargets = msg.config.targets.filter((t) => t.mode === 'max');
        const ranges = newTargetRanges(maxTargets);
        let done = 0;
        let batch: GearEntry[][] = [];
        let lastProgressTime = 0;
        for (const combo of gen()) {
            batch.push(combo);
            if (batch.length >= CHUNK_SIZE) {
                const base = computeBaseLoadouts(msg.character, batch, msg.config, msg.idOffset + done);
                accumulateTargetRanges(ranges, base, maxTargets);
                done += batch.length;
                batch = [];
                const now = performance.now();
                if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
                    postMessage({ type: 'progress', done, total } satisfies WorkerProgressMessage);
                    lastProgressTime = now;
                }
            }
        }
        if (batch.length) {
            const base = computeBaseLoadouts(msg.character, batch, msg.config, msg.idOffset + done);
            accumulateTargetRanges(ranges, base, maxTargets);
            done += batch.length;
        }
        postMessage({ type: 'ranges', ranges, total } satisfies WorkerRangesMessage);
        return;
    }
    if (msg.type === 'score') {
        if (!state) return;
        const topN = Math.max(1, state.config.topN);
        let top: Loadout[] = [];
        let done = 0;
        let batch: GearEntry[][] = [];
        // Pass 2: re-walk the same combos, recompute each base loadout, score
        // it against the (global) ranges, and keep only a running top-N.
        for (const combo of state.makeCombos()) {
            batch.push(combo);
            if (batch.length >= CHUNK_SIZE) {
                const base = computeBaseLoadouts(state.character, batch, state.config, state.idOffset + done);
                for (const b of base) top = scoreAndRankStreaming(top, b, msg.ranges, topN);
                done += batch.length;
                batch = [];
            }
        }
        if (batch.length) {
            const base = computeBaseLoadouts(state.character, batch, state.config, state.idOffset + done);
            for (const b of base) top = scoreAndRankStreaming(top, b, msg.ranges, topN);
        }
        postMessage({ type: 'done', top } satisfies WorkerDoneMessage);
    }
    if (msg.type === 'abort') {
        // Drop the combo factory + any retained top-N — frees memory.
        state = null;
    }
};
