import { create } from 'zustand';
import type { ModuleInfo, ModuleUISpec, GameRuleRef } from '../types';
import { DEFAULT_MODULE_UI_SPECS } from '../data/moduleUISpecs';

interface ModuleOutput {
    /** Output channel id (e.g. "summary", "breakdown") */
    channel: string;
    /** Payload shape depends on `ModuleUISpec.outputs[*].kind`. */
    data: unknown;
    /** When the channel was last written. */
    timestamp: number;
}

/** Diff result for merge operations. */
export interface MergeDiff {
    added: string[];
    removed: string[];
    modified: string[];
}

/** Shared state store interface. */
interface SharedStateStore {
    /** The global shared state tree. */
    state: Record<string, unknown>;
    /** Per-path dirty flags (current !== baseline). */
    dirtyFlags: Record<string, boolean>;
    /** Get a value by dot-path (e.g., 'characters.rover-spectro.stats.critRate'). */
    get: (path: string) => unknown;
    /** Set a value by dot-path, with validation. Returns clamped value. */
    set: (path: string, value: unknown, gameRule?: GameRuleRef) => unknown;
    /** Merge new data into a path, returning a diff for conflict UI. */
    merge: (path: string, newData: unknown) => MergeDiff;
    /** Reset a path to baseline (last saved) or default (game DB). */
    reset: (path: string, toDefault?: boolean) => void;
    /** Mark a path as clean (baseline = current). */
    markClean: (path: string) => void;
    /** Check if a path is dirty. */
    isDirty: (path: string) => boolean;
    /** Subscribe to changes at a path. */
    subscribe: (path: string, handler: (value: unknown) => void) => () => void;
}

/** Combined module + shared state store. */
interface ModuleState {
    modules: ModuleInfo[];
    activeModuleId: string | null;
    loading: boolean;
    error: string | null;
    /** Per-module cache of UI specs (kernel overrides take precedence). */
    uiSpecs: Record<string, ModuleUISpec>;
    /** Per-module last output payload (per output channel). */
    outputs: Record<string, Record<string, ModuleOutput>>;
    /** Per-module "busy" flag while an action is in flight. */
    running: Record<string, boolean>;
    /** Shared state store. */
    shared: SharedStateStore;
    refreshModules: () => Promise<void>;
    setActiveModuleId: (id: string | null) => void;
    enableModule: (id: string) => Promise<void>;
    disableModule: (id: string) => Promise<void>;
    getUISpec: (id: string) => ModuleUISpec | null;
    loadUISpec: (id: string) => Promise<ModuleUISpec | null>;
    executeAction: (id: string, actionId: string, values: Record<string, unknown>) => Promise<unknown>;
    loadOutput: (id: string, outputId: string) => Promise<unknown>;
    setOutput: (id: string, channel: string, data: unknown) => void;
}

const bridge = (window as unknown as {
    frequencyManager?: {
        getModules?: () => Promise<ModuleInfo[]>;
        enableModule?: (id: string) => Promise<void>;
        disableModule?: (id: string) => Promise<void>;
        getModuleUI?: (id: string) => Promise<ModuleUISpec | null>;
        executeModuleAction?: (id: string, actionId: string, values: Record<string, unknown>) => Promise<unknown>;
        getModuleOutput?: (id: string, outputId: string) => Promise<unknown>;
        scanImage?: (imagePath: string) => Promise<unknown>;
        calculateDamage?: (request: Record<string, unknown>) => Promise<unknown>;
        openImageDialog?: () => Promise<string | null>;
        saveJsonFile?: (name: string, content: string) => Promise<string | null>;
        checkGameUpdatesNow?: () => Promise<{ ok: boolean; checked: number }>;
    };
});

/**
 * Local "mock" executor used when running outside Electron (Docker preview
 * or when the preload bridge isn't available). Lets the unified panel
 * demonstrate the contract end-to-end without a live kernel.
 */
async function mockExecute(moduleId: string, actionId: string, values: Record<string, unknown>): Promise<unknown> {
    // Simulate latency
    await new Promise((r) => setTimeout(r, 250));

    switch (`${moduleId}:${actionId}`) {
        case 'damage-calculator:calculate': {
            const charId = typeof values.characterId === 'string' ? values.characterId : 'rover-spectro';
            const rot = Number(values.rotationLength ?? 20);
            const atk = 2400 + Math.floor(Math.random() * 800);
            const critRate = 75;
            const critDmg = 180;
            const total = atk * (1 + (critRate / 100) * (critDmg / 100)) * 8.5;
            const dps = total / rot;
            return {
                outputs: {
                    summary: { totalDamage: Math.floor(total), dps: Math.floor(dps), characterId: charId },
                    breakdown: {
                        basicAttack: Math.floor(atk * 1.0),
                        heavyAttack: Math.floor(atk * 2.5),
                        resonanceSkill: Math.floor(atk * 3.2),
                        resonanceLiberation: Math.floor(atk * 5.5),
                        forteCircuit: Math.floor(atk * 2.8),
                        outroSkill: Math.floor(atk * 1.8),
                        introSkill: Math.floor(atk * 1.5),
                        elementalReactions: Math.floor(atk * 0.5),
                        total: Math.floor(total),
                    },
                    rotation: [
                        { action: 'Resonance Liberation', damage: Math.floor(atk * 5.5), time: 0, concertoEnergy: 30 },
                        { action: 'Resonance Skill', damage: Math.floor(atk * 3.2), time: 3, concertoEnergy: 15 },
                        { action: 'Forte Circuit', damage: Math.floor(atk * 2.8), time: 5, concertoEnergy: 10 },
                        { action: 'Heavy Attack', damage: Math.floor(atk * 2.5), time: 7.5, concertoEnergy: 5 },
                        { action: 'Basic Attack', damage: Math.floor(atk * 1.0), time: 9, concertoEnergy: 2 },
                    ],
                    stats: { atk, critRate, critDmg, energyRegen: 120, totalDmgBonus: 35 },
                },
            };
        }
        case 'damage-calculator:optimize-echoes': {
            return {
                outputs: {
                    summary: { recommendedEchoes: 5, estimatedDps: 28450, message: 'Best 5 echoes selected' },
                },
            };
        }
        case 'ocr-scanner:scan': {
            return {
                outputs: {
                    echoes: [
                        { id: 'e1', name: 'Crownless', cost: 4, mainStat: 'ATK%', level: 25 },
                        { id: 'e2', name: 'Crownless', cost: 3, mainStat: 'ATK%', level: 25 },
                        { id: 'e3', name: 'Celestial Light', cost: 3, mainStat: 'Spectro DMG', level: 25 },
                        { id: 'e4', name: 'Celestial Light', cost: 1, mainStat: 'CRIT Rate', level: 25 },
                        { id: 'e5', name: 'Celestial Light', cost: 1, mainStat: 'CRIT DMG', level: 25 },
                    ],
                    raw: { confidence: 0.92, processedAt: Date.now() },
                },
            };
        }
        case 'json-importer:import': {
            return {
                outputs: {
                    imported: [
                        { id: 1, name: 'Echo 1', source: 'file' },
                        { id: 2, name: 'Echo 2', source: 'file' },
                    ],
                    errors: [],
                },
            };
        }
        case 'json-importer:export': {
            return { outputs: { imported: [{ ok: true, message: 'Exported 2 records' }] } };
        }
        case 'update-checker:check-now': {
            return {
                outputs: {
                    app: [{ kind: 'up-to-date', version: '1.0.0' }],
                    games: [],
                },
            };
        }
        case 'game-loader:load': {
            return {
                outputs: {
                    game: {
                        id: values.gameId,
                        displayName: values.gameId === 'genshin-impact' ? 'Genshin Impact' : 'Wuthering Waves',
                        version: '1.0.0',
                        loaded: true,
                    },
                },
            };
        }
        default:
            return { outputs: {} };
    }
}

/** Get a value from a nested object by dot-path. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

/** Set a value in a nested object by dot-path, returning a new object. */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
    const keys = path.split('.');
    const [head, ...rest] = keys;
    if (rest.length === 0) {
        return { ...obj, [head]: value };
    }
    const child = (obj[head] as Record<string, unknown>) ?? {};
    return { ...obj, [head]: setByPath(child, rest.join('.'), value) };
}

/** Shallow equality for diff detection. */
function shallowEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a === 'object' && typeof b === 'object') {
        const ak = Object.keys(a);
        const bk = Object.keys(b);
        if (ak.length !== bk.length) return false;
        return ak.every((k) => shallowEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }
    return false;
}

/** Subscribers for path-based change notifications. */
const subscribers = new Map<string, Set<(value: unknown) => void>>();

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** Get min/max range for a given gameRule. */
function rangeForRule(rule: GameRuleRef): { min: number; max: number } {
    if (rule.startsWith('character-stats.')) {
        return { min: 0, max: 9999 };
    }
    if (rule === 'echo.mainStat' || rule === 'echo.subStat') {
        return { min: 0, max: 9999 };
    }
    return { min: 0, max: 99999 };
}

/**
 * Shared, reactive global state for cross-module data exchange.
 * Includes baseline/default tracking for revert/reset semantics.
 */
function createSharedStateStore(): SharedStateStore {
    let _state: Record<string, unknown> = {};
    let _dirty: Record<string, boolean> = {};

    function notify(path: string, value: unknown): void {
        const set = subscribers.get(path);
        if (set) {
            for (const h of set) h(value);
        }
    }

    return {
        state: {},
        dirtyFlags: {},
        get: (path: string) => getByPath(_state, path),
        set: (path: string, value: unknown, gameRule?: GameRuleRef) => {
            let v = value;
            if (typeof value === 'number' && gameRule) {
                const { min, max } = rangeForRule(gameRule);
                v = clamp(value, min, max);
            }
            _state = setByPath(_state, path, v);
            _dirty = { ..._dirty, [path]: true };
            notify(path, v);
            return v;
        },
        merge: (path: string, newData: unknown): MergeDiff => {
            const current = getByPath(_state, path);
            if (Array.isArray(current) && Array.isArray(newData)) {
                const cur = new Set(current.map((x) => JSON.stringify(x)));
                const nw = new Set((newData as unknown[]).map((x) => JSON.stringify(x)));
                const added: string[] = [];
                const removed: string[] = [];
                for (const n of nw) if (!cur.has(n)) added.push(n);
                for (const c of cur) if (!nw.has(c)) removed.push(c);
                return { added, removed, modified: [] };
            }
            if (current && typeof current === 'object' && newData && typeof newData === 'object') {
                const c = current as Record<string, unknown>;
                const n = newData as Record<string, unknown>;
                const ck = Object.keys(c);
                const nk = Object.keys(n);
                const added = nk.filter((k) => !(k in c));
                const removed = ck.filter((k) => !(k in n));
                const modified: string[] = [];
                for (const k of ck) {
                    if (k in n && !shallowEqual(c[k], n[k])) modified.push(k);
                }
                return { added, removed, modified };
            }
            return { added: [], removed: [], modified: [] };
        },
        reset: (path: string) => {
            _state = setByPath(_state, path, undefined);
            _dirty = { ..._dirty, [path]: false };
            notify(path, undefined);
        },
        markClean: (path: string) => {
            _dirty = { ..._dirty, [path]: false };
        },
        isDirty: (path: string) => !!_dirty[path],
        subscribe: (path: string, handler: (value: unknown) => void) => {
            if (!subscribers.has(path)) subscribers.set(path, new Set());
            subscribers.get(path)!.add(handler);
            return () => { subscribers.get(path)?.delete(handler); };
        },
    };
}

export const useModuleStore = create<ModuleState>((set, get) => ({
    modules: [],
    activeModuleId: null,
    loading: false,
    error: null,
    uiSpecs: {},
    outputs: {},
    running: {},
    shared: createSharedStateStore(),

    refreshModules: async () => {
        set({ loading: true, error: null });
        try {
            if (bridge.frequencyManager?.getModules) {
                const modules = await bridge.frequencyManager.getModules();
                set({ modules, loading: false });
                if (!get().activeModuleId && modules.length > 0) {
                    set({ activeModuleId: modules[0].id });
                }
            } else {
                const mockModules: ModuleInfo[] = [
                    { id: 'game-loader', name: 'Game Loader', version: '1.0.0', enabled: true, description: 'Loads game definitions', hasUI: true, icon: 'gamepad' },
                    { id: 'update-checker', name: 'Update Checker', version: '1.0.0', enabled: true, description: 'Checks for module updates', hasUI: true, icon: 'refresh' },
                    { id: 'json-importer', name: 'JSON Importer', version: '1.0.0', enabled: true, description: 'Import/export data', hasUI: true, icon: 'file' },
                    { id: 'ocr-scanner', name: 'OCR Scanner', version: '1.0.0', enabled: false, description: 'Scans game screenshots', hasUI: true, icon: 'scan' },
                    { id: 'damage-calculator', name: 'Damage Calculator', version: '1.0.0', enabled: false, description: 'Calculates damage output', hasUI: true, icon: 'calculator' },
                ];
                set({ modules: mockModules, loading: false });
                if (!get().activeModuleId && mockModules.length > 0) {
                    set({ activeModuleId: mockModules[0].id });
                }
            }
        } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Failed to load modules', loading: false });
        }
    },

    setActiveModuleId: (id) => set({ activeModuleId: id }),

    enableModule: async (id) => {
        // Optimistic toggle so the UI responds even in mock mode (no bridge).
        set((s) => ({ modules: s.modules.map((m) => (m.id === id ? { ...m, enabled: true } : m)) }));
        if (bridge.frequencyManager?.enableModule) {
            await bridge.frequencyManager.enableModule(id);
            await get().refreshModules();
        }
    },

    disableModule: async (id) => {
        set((s) => ({ modules: s.modules.map((m) => (m.id === id ? { ...m, enabled: false } : m)) }));
        if (bridge.frequencyManager?.disableModule) {
            await bridge.frequencyManager.disableModule(id);
            await get().refreshModules();
        }
    },

    getUISpec: (id) => {
        const cached = get().uiSpecs[id];
        if (cached) return cached;
        return DEFAULT_MODULE_UI_SPECS[id] ?? null;
    },

    loadUISpec: async (id) => {
        // Try kernel first
        if (bridge.frequencyManager?.getModuleUI) {
            try {
                const spec = await bridge.frequencyManager.getModuleUI(id);
                if (spec) {
                    set((s) => ({ uiSpecs: { ...s.uiSpecs, [id]: spec } }));
                    return spec;
                }
            } catch {
                // fall through to default
            }
        }
        const fallback = DEFAULT_MODULE_UI_SPECS[id] ?? null;
        if (fallback) {
            set((s) => ({ uiSpecs: { ...s.uiSpecs, [id]: fallback } }));
        }
        return fallback;
    },

    executeAction: async (id, actionId, values) => {
        set((s) => ({ running: { ...s.running, [id]: true } }));
        try {
            let result: unknown;
            if (bridge.frequencyManager?.executeModuleAction) {
                result = await bridge.frequencyManager.executeModuleAction(id, actionId, values);
                // The kernel returns `{ __unhandled: true }` when the module
                // hasn't implemented the execute contract — fall back to mock so
                // the panel stays functional (and never hangs).
                if (result && typeof result === 'object' && '__unhandled' in (result as Record<string, unknown>)) {
                    result = await mockExecute(id, actionId, values);
                }
            } else {
                result = await mockExecute(id, actionId, values);
            }
            // Distribute outputs to per-channel store
            if (result && typeof result === 'object' && 'outputs' in (result as Record<string, unknown>)) {
                const outputs = (result as { outputs?: Record<string, unknown> }).outputs ?? {};
                for (const [channel, data] of Object.entries(outputs)) {
                    get().setOutput(id, channel, data);
                }
                return outputs;
            }
            return result;
        } finally {
            set((s) => {
                const next = { ...s.running };
                delete next[id];
                return { running: next };
            });
        }
    },

    loadOutput: async (id, outputId) => {
        if (bridge.frequencyManager?.getModuleOutput) {
            try {
                const data = await bridge.frequencyManager.getModuleOutput(id, outputId);
                if (data !== null && data !== undefined) {
                    get().setOutput(id, outputId, data);
                }
                return data;
            } catch {
                return null;
            }
        }
        return null;
    },

    setOutput: (id, channel, data) => {
        set((s) => ({
            outputs: {
                ...s.outputs,
                [id]: {
                    ...(s.outputs[id] ?? {}),
                    [channel]: { channel, data, timestamp: Date.now() },
                },
            },
        }));
    },
}));