import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CharacterData } from '../data/gameData';
import type { Buff } from '../data/buffs';
import type { Target, Loadout, CritMode, ReactionType } from '../data/optimizer';
import { DUMMY, type Enemy } from '../data/enemies';
import { getGameData, DEFAULT_MAX_GEAR } from '../data/gameData';
import { useGameStore } from './gameStore';
import { useInventoryStore } from './inventoryStore';
import { useLoadoutStore, type CharacterLoadout } from './loadoutStore';
import { useSequenceStore } from './sequenceStore';
import { userStorage } from '../lib/userStorage';

export const DEFAULT_SKILL_LEVEL = 10;
export const MAX_SKILL_LEVEL = 10;

/**
 * The calculator's working build. Lives in a store (not component state) so it
 * survives switching categories, and so the Inspector's gear/buff pickers can
 * mutate the same build the Calculator screen reads.
 */
interface CalcState {
    characterId: string;
    equipped: { weaponId?: string; gearIds: string[] };
    buffs: Buff[];
    targets: Target[];
    critMode: CritMode;
    enemy: Enemy;
    results: Loadout[] | null;
    /** Live progress of an in-flight `runOptimizerPool` call — combos
     * processed / total across every worker thread. `null` when no
     * optimization is currently running (drives the Calculator's progress
     * bar visibility). */
    optimizeProgress: { done: number; total: number } | null;
    /** Set name(s) the user has declared they want active for the NEXT
     * optimize() run (0-2 — a build realistically runs at most one 5pc, or
     * two 2pc, Sonata sets across 5 slots). When non-empty, `run()` narrows
     * the candidate gear pool to just these sets' pieces — a search-space
     * hint only. The resulting bonus itself is derived by
     * `computeBaseLoadouts` directly from each candidate combo's own real
     * gear (`activeSetBonuses`/`setBonusBuffEntries` in the shared engine),
     * not assumed from this selection — a combo drawn from the narrowed pool
     * can still land short of a set's real piece threshold (e.g. an uneven
     * 1pc/4pc split), so scoring always reflects what that specific combo
     * actually activates. */
    requiredSets: string[];
    /** When true, `run()` excludes gear currently equipped on any OTHER
     * character from the candidate pool before searching — gear equipped on
     * THIS character stays eligible (it's already theirs; re-selecting it
     * isn't taking it from anyone). Lets the optimizer search only the
     * "spare bench" without recommending a piece that'd have to be pulled
     * off another character's build first. */
    onlyUnequipped: boolean;

    // Talents (per selected character)
    skillLevels: Record<string, number>; // skillId -> level; default via DEFAULT_SKILL_LEVEL
    /** skillId -> user-chosen stack count, for skills with `SkillDef.stackMax` (e.g. Eula's Lightfall Sword). Absent means "assume max stacks", same convention as buffs. */
    skillStacks: Record<string, number>;
    /** buffId -> user-chosen stack count, for self/party buffs with `stacksMax` (e.g. Galbrena's Afterflame-scaled Crit DMG). Absent means "assume max stacks". */
    buffStacks: Record<string, number>;
    passives: Record<string, boolean>;   // passiveId -> unlocked
    sequence: number;                     // 0..6 constellation / sequence level
    reaction: ReactionType;               // elemental reaction applied to skill damage
    /** Which WW reaction/Negative-Status debuffs the user has marked as active on the current enemy — a reference toggle, not auto-wired to any buff yet. Defaults to all on (matches this project's existing "assume active" convention for target-conditional buffs). */
    targetStatuses: Record<string, boolean>;

    pickCharacter: (c: CharacterData) => void;
    setReaction: (r: ReactionType) => void;
    setEnemy: (e: Enemy) => void;
    setSkillLevel: (id: string, level: number) => void;
    setSkillStacks: (id: string, stacks: number, max: number) => void;
    setBuffStacks: (id: string, stacks: number, max: number) => void;
    toggleTargetStatus: (id: string) => void;
    togglePassive: (id: string) => void;
    setSequence: (n: number) => void;
    equipGear: (id: string) => void;
    unequipGear: (id: string) => void;
    equipWeapon: (id: string) => void;
    equipLoadout: (gearIds: string[]) => void;
    isEquipped: (id: string) => boolean;
    addBuff: (b: Buff) => void;
    removeBuff: (id: string) => void;
    updateBuffValue: (id: string, value: number) => void;
    hasBuff: (id: string) => boolean;
    addTarget: (t: Target) => void;
    updateTarget: (id: string, patch: Partial<Target>) => void;
    removeTarget: (id: string) => void;
    setCritMode: (m: CritMode) => void;
    setResults: (r: Loadout[] | null) => void;
    setOptimizeProgress: (p: { done: number; total: number } | null) => void;
    setRequiredSets: (sets: string[]) => void;
    setOnlyUnequipped: (v: boolean) => void;
}

export const useCalcStore = create<CalcState>()(
    persist(
        (set, get) => ({
    characterId: '',
    equipped: { gearIds: [] },
    buffs: [],
    targets: [],
    critMode: 'average',
    enemy: DUMMY,
    results: null,
    optimizeProgress: null,
    requiredSets: [],
    onlyUnequipped: false,
    skillLevels: {},
    skillStacks: {},
    buffStacks: {},
    passives: {},
    sequence: 0,
    reaction: 'none',
    targetStatuses: { frazzle: true, erosion: true, chafe: true, flare: true, bane: true, fusionburst: true },

    setReaction: (r) => set({ reaction: r }),
    setEnemy: (e) => set({ enemy: e }),
    setSkillLevel: (id, level) => set((s) => ({ skillLevels: { ...s.skillLevels, [id]: Math.max(1, Math.min(MAX_SKILL_LEVEL, level)) } })),
    setSkillStacks: (id, stacks, max) => set((s) => ({ skillStacks: { ...s.skillStacks, [id]: Math.max(0, Math.min(max, stacks)) } })),
    setBuffStacks: (id, stacks, max) => set((s) => ({ buffStacks: { ...s.buffStacks, [id]: Math.max(0, Math.min(max, stacks)) } })),
    toggleTargetStatus: (id) => set((s) => ({ targetStatuses: { ...s.targetStatuses, [id]: !s.targetStatuses[id] } })),
    togglePassive: (id) => set((s) => ({ passives: { ...s.passives, [id]: !s.passives[id] } })),
    setSequence: (n) => set((s) => {
        const level = Math.max(0, Math.min(6, n));
        useSequenceStore.getState().setSequence(useGameStore.getState().activeGameId, s.characterId, level);
        return { sequence: level };
    }),

    // Every mutation that changes `equipped` also mirrors it into the per-character
    // loadout store (keyed by game+character), so the build is remembered when you
    // switch characters — and so a Party teammate (who reads that same store) always
    // reflects exactly what that character has equipped, no separate pick needed.
    pickCharacter: (c) => {
        const gameId = useGameStore.getState().activeGameId;
        const loadout = useLoadoutStore.getState().getLoadout(gameId, c.id);
        set({
            characterId: c.id,
            equipped: { weaponId: loadout.weaponId, gearIds: [...loadout.gearIds] },
            buffs: [],
            targets: [],
            critMode: 'average',
            results: null,
            skillLevels: {},
            skillStacks: {},
            buffStacks: {},
            passives: {},
            sequence: useSequenceStore.getState().getSequence(gameId, c.id),
            reaction: 'none',
        });
    },

    equipGear: (id) =>
        set((s) => {
            if (s.equipped.gearIds.includes(id)) return s;
            const gameId = useGameStore.getState().activeGameId;
            const gd = getGameData(gameId);
            const maxGear = gd.maxGear ?? DEFAULT_MAX_GEAR;
            const owned = useInventoryStore.getState().getInventory(gameId).gear;
            const resolve = (gid: string) => owned.find((g) => g.id === gid) ?? gd.gear.find((g) => g.id === gid);
            let gearIds = s.equipped.gearIds;
            // GI artifacts are one-per-slot: equipping a piece unequips whatever else
            // occupies the same slot (Flower/Plume/Sands/Goblet/Circlet). WuWa echoes
            // have no per-slot exclusivity (cost-budget), so this only applies to artifacts.
            const incoming = resolve(id);
            if (gd.gearKind === 'artifact' && incoming?.slot) {
                gearIds = gearIds.filter((gid) => resolve(gid)?.slot !== incoming.slot);
            }
            const equipped = { ...s.equipped, gearIds: [...gearIds, id].slice(-maxGear) };
            useLoadoutStore.getState().setLoadout(gameId, s.characterId, equipped);
            return { equipped };
        }),
    unequipGear: (id) =>
        set((s) => {
            const equipped = { ...s.equipped, gearIds: s.equipped.gearIds.filter((g) => g !== id) };
            useLoadoutStore.getState().setLoadout(useGameStore.getState().activeGameId, s.characterId, equipped);
            return { equipped };
        }),
    equipWeapon: (id) =>
        set((s) => {
            const equipped = { ...s.equipped, weaponId: id };
            useLoadoutStore.getState().setLoadout(useGameStore.getState().activeGameId, s.characterId, equipped);
            return { equipped };
        }),
    equipLoadout: (gearIds) =>
        set((s) => {
            const equipped: CharacterLoadout = { ...s.equipped, gearIds: [...gearIds] };
            useLoadoutStore.getState().setLoadout(useGameStore.getState().activeGameId, s.characterId, equipped);
            return { equipped };
        }),
    isEquipped: (id) => get().equipped.gearIds.includes(id),

    addBuff: (b) => set((s) => (s.buffs.some((x) => x.id === b.id) ? s : { buffs: [...s.buffs, b] })),
    removeBuff: (id) => set((s) => ({ buffs: s.buffs.filter((b) => b.id !== id) })),
    updateBuffValue: (id, value) => set((s) => ({ buffs: s.buffs.map((b) => (b.id === id ? { ...b, value } : b)) })),
    hasBuff: (id) => get().buffs.some((b) => b.id === id),

    addTarget: (t) => set((s) => ({ targets: [...s.targets, t] })),
    updateTarget: (id, patch) => set((s) => ({ targets: s.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
    removeTarget: (id) => set((s) => ({ targets: s.targets.filter((t) => t.id !== id) })),

    setCritMode: (m) => set({ critMode: m }),

    setResults: (r) => set({ results: r }),
    setOptimizeProgress: (p) => set({ optimizeProgress: p }),
    setRequiredSets: (sets) => set({ requiredSets: sets.slice(0, 2) }),
    setOnlyUnequipped: (v) => set({ onlyUnequipped: v }),
        }),
        {
            name: 'fm-calc',
            storage: createJSONStorage(() => userStorage),
            // Persist the working build; `results` are derived and recomputed,
            // and the methods are re-created by the store on every load.
            partialize: (s) => ({
                characterId: s.characterId,
                equipped: s.equipped,
                buffs: s.buffs,
                targets: s.targets,
                critMode: s.critMode,
                enemy: s.enemy,
                skillLevels: s.skillLevels,
                skillStacks: s.skillStacks,
                buffStacks: s.buffStacks,
                passives: s.passives,
                sequence: s.sequence,
                reaction: s.reaction,
                requiredSets: s.requiredSets,
                onlyUnequipped: s.onlyUnequipped,
                targetStatuses: s.targetStatuses,
            }),
            version: 1,
            // v0→v1 (2026-07-13): dozens of weapon/character-passive self
            // buffs that are scoped to one attack type (`appliesTo` set)
            // were incorrectly authored with `stat: 'elemDmg'` instead of
            // `dmgBonus` (see the fix in `weapons.ts`/`character-passives
            // .generated.ts`) — cosmetic only, both feed the same scoped-
            // buff summation in `skillDamage()` identically — BUT the
            // persisted buff id encodes its stat key (`selfBuffId`/
            // `passiveBuffId`), so the fix changed those ids. Anyone who'd
            // toggled one of the affected buffs on before the fix now has
            // an ORPHANED entry under the old id: invisible to its toggle
            // button (which checks the new id and shows "off"), but still
            // silently contributing to every damage calc, and liable to be
            // DOUBLE-counted if the user re-toggles the (now-different-id)
            // button thinking it's a fresh toggle. Detected precisely: an
            // `elemDmg` buff with `appliesTo` set was never valid before
            // this fix either — only genuinely-global elemDmg buffs were
            // ever intentionally authored without a scope.
            migrate: (persisted, version) => {
                const s = persisted as (Partial<CalcState> & { buffs?: Buff[] }) | undefined;
                if (!s?.buffs || version >= 1) return s;
                return { ...s, buffs: s.buffs.filter((b) => !(b.stat === 'elemDmg' && b.appliesTo && b.appliesTo.length > 0)) };
            },
        }
    )
);
