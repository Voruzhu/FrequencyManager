import { create } from 'zustand';
import type { CharacterData, WeaponData, GearData } from '../data/gameData';

/** Anything the Inspector can show a detail view for. */
export type SelectedItem = CharacterData | WeaponData | GearData;

/**
 * What the right-hand Inspector is currently showing:
 *  - item:        detail of a selected character/weapon/gear
 *  - gear-picker: a list of all gear to equip onto the calculator character
 *  - buffs:       the buff catalog to toggle onto the calculator character
 */
export type InspectorContent =
    | { kind: 'item'; item: SelectedItem }
    | { kind: 'gear-picker' }
    | { kind: 'weapon-picker' }
    | { kind: 'buffs' }
    | { kind: 'enemy' }
    | { kind: 'party' }
    | { kind: 'set-bonus' };

interface InspectorState {
    content: InspectorContent | null;
    open: boolean;
    showItem: (item: SelectedItem) => void;
    showGearPicker: () => void;
    showWeaponPicker: () => void;
    showBuffs: () => void;
    showEnemy: () => void;
    showParty: () => void;
    showSetBonus: () => void;
    clear: () => void;
    toggle: () => void;
    setOpen: (open: boolean) => void;
}

export const useSelectionStore = create<InspectorState>((set) => ({
    content: null,
    open: true,
    showItem: (item) => set({ content: { kind: 'item', item }, open: true }),
    showGearPicker: () => set({ content: { kind: 'gear-picker' }, open: true }),
    showWeaponPicker: () => set({ content: { kind: 'weapon-picker' }, open: true }),
    showBuffs: () => set({ content: { kind: 'buffs' }, open: true }),
    showEnemy: () => set({ content: { kind: 'enemy' }, open: true }),
    showParty: () => set({ content: { kind: 'party' }, open: true }),
    showSetBonus: () => set({ content: { kind: 'set-bonus' }, open: true }),
    clear: () => set({ content: null }),
    toggle: () => set((s) => ({ open: !s.open })),
    setOpen: (open) => set({ open }),
}));
