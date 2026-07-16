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
 *   1. `init` → worker computes base loadouts (stats/damage, not yet scored)
 *      for its assigned combos, reporting `progress` as it goes, then its
 *      own LOCAL min/max per maximize-target (`ranges`) — scoring needs the
 *      TRUE GLOBAL min/max across every worker's combos, which only the
 *      pool orchestrator can compute once every worker has reported in.
 *   2. `score` (sent back once the orchestrator has merged everyone's local
 *      ranges into the true global range) → worker scores its held base
 *      loadouts against those global ranges and returns just its own
 *      top-`topN` (not its full slice — keeping the postMessage payload
 *      small no matter how large this worker's combo slice was).
 */
import type { CharacterEntry, GearEntry } from '@shared/types/game-bundle';
import {
    combinations, computeBaseLoadouts, targetRanges, scoreAndRank, withinCostBudget,
    type OptimizeConfig, type BaseLoadout, type TargetRange, type Loadout,
} from '@shared/calc/optimizer';

export interface WorkerInitMessage {
    type: 'init';
    character: CharacterEntry;
    pool: GearEntry[];
    k: number;
    firstIndices: number[];
    idOffset: number;
    config: OptimizeConfig;
}
export interface WorkerScoreMessage {
    type: 'score';
    ranges: TargetRange[];
}
export type WorkerInboundMessage = WorkerInitMessage | WorkerScoreMessage;

export interface WorkerProgressMessage { type: 'progress'; done: number; total: number }
export interface WorkerRangesMessage { type: 'ranges'; ranges: TargetRange[]; total: number }
export interface WorkerDoneMessage { type: 'done'; top: Loadout[] }
export type WorkerOutboundMessage = WorkerProgressMessage | WorkerRangesMessage | WorkerDoneMessage;

// Process combos in batches so `progress` messages land smoothly even when
// this worker's own slice is huge, instead of one giant blocking `.map()`.
const CHUNK_SIZE = 2000;

let heldBase: BaseLoadout[] = [];
let heldConfig: OptimizeConfig | null = null;

function computeInChunks(character: CharacterEntry, combos: GearEntry[][], config: OptimizeConfig, idOffset: number): BaseLoadout[] {
    const out: BaseLoadout[] = [];
    for (let i = 0; i < combos.length; i += CHUNK_SIZE) {
        const chunk = combos.slice(i, i + CHUNK_SIZE);
        out.push(...computeBaseLoadouts(character, chunk, config, idOffset + i));
        postMessage({ type: 'progress', done: Math.min(i + CHUNK_SIZE, combos.length), total: combos.length } satisfies WorkerProgressMessage);
    }
    return out;
}

self.onmessage = (ev: MessageEvent<WorkerInboundMessage>) => {
    const msg = ev.data;
    if (msg.type === 'init') {
        const combos = combinations(msg.pool, msg.k, new Set(msg.firstIndices))
            .filter((combo) => withinCostBudget(combo, msg.config.maxTotalCost));
        heldConfig = msg.config;
        heldBase = computeInChunks(msg.character, combos, msg.config, msg.idOffset);
        const maxTargets = msg.config.targets.filter((t) => t.mode === 'max');
        const ranges = targetRanges(heldBase, maxTargets);
        postMessage({ type: 'ranges', ranges, total: combos.length } satisfies WorkerRangesMessage);
        return;
    }
    if (msg.type === 'score') {
        const top = scoreAndRank(heldBase, msg.ranges, heldConfig?.topN ?? 5);
        postMessage({ type: 'done', top } satisfies WorkerDoneMessage);
    }
};
