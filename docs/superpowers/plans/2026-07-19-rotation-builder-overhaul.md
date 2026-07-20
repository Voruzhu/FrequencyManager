# Rotation Builder Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Rotation Builder a reusable named party system, real per-skill Cooldown data with reuse warnings, automatic temporal buff/debuff uptime for timed self-buffs, and enemy HP with Wave/Boss modes.

**Architecture:** Four independently-testable phases, each touching a small new file plus surgical additions to `RotationScreen.tsx`. Phases 2-4 add optional fields to existing data shapes (nothing breaks for entries that don't have them) and land their simulation logic in one new pure-function module, `src/renderer/src/lib/rotationEngine.ts`, kept separate from the UI for isolated unit testing.

**Tech Stack:** TypeScript, React, Zustand (new `namedPartyStore.ts`, mirrors existing `rotationStore.ts`), Jest (`testEnvironment: 'node'` — this repo has no component/DOM tests; UI wiring is verified manually via CDP).

## Global Constraints

- WW only, throughout (party size 3, WW skill/buff data, WW roster sourcing passes) — GI is explicitly out of scope, a future spec. (Spec: "Out of scope")
- Party members always resolve from their OWN current loadout/Sequence — never a separately hand-picked build. (Spec: Section 1)
- Real per-skill cast/animation-TIME is out of scope permanently — no source exists. Duration stays a manual per-step number. (Spec: Section 2)
- `autoTrigger` data is added ONLY for the clean "N seconds after casting skill X" pattern. Stance/stack/HP-threshold-gated buffs keep today's manual toggle forever, not as a placeholder. (Spec: Section 3)
- Wave/overflow detection is per-STEP granularity, not per-hit — a stated, permanent simplification, not a placeholder for finer tracking later. (Spec: Section 4)
- Every new warning (cooldown reuse) is non-blocking — matches this app's universal warn-don't-block convention. (Spec: Section 2)

---

## Phase 1: Named Party System

### Task 1: `namedPartyStore.ts` + tests

**Files:**
- Create: `src/renderer/src/stores/namedPartyStore.ts`
- Test: `tests/renderer/namedPartyStore.test.ts`

**Interfaces:**
- Consumes: `userStorage` from `../lib/userStorage` (same persistence helper `rotationStore.ts` uses), zustand's `create`/`persist`/`createJSONStorage`.
- Produces: `NamedParty { id: string; name: string; memberCharacterIds: string[]; disabled: string[] }`, `useNamedPartyStore` with `save(gameId, party)`, `remove(gameId, partyId)`, `list(gameId): NamedParty[]`, `addMember(gameId, partyId, characterId)` (no-op past 3), `removeMember(gameId, partyId, characterId)`, `toggleEffect(gameId, partyId, effectId)`. Consumed by Task 2 (windows) and Task 3 (RotationScreen wiring).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/namedPartyStore.test.ts
import { useNamedPartyStore } from '../../src/renderer/src/stores/namedPartyStore';

const GAME = 'wuthering-waves';

beforeEach(() => {
    useNamedPartyStore.setState({ byGame: {} });
});

describe('namedPartyStore', () => {
    it('saves and lists a party', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Main DPS', memberCharacterIds: ['jinhsi'], disabled: [] });
        expect(useNamedPartyStore.getState().list(GAME)).toEqual([{ id: 'p1', name: 'Main DPS', memberCharacterIds: ['jinhsi'], disabled: [] }]);
    });

    it('caps membership at 3 via addMember, but allows saving fewer directly', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'b'], disabled: [] });
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'c');
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'd'); // 4th — no-op
        expect(useNamedPartyStore.getState().list(GAME)[0].memberCharacterIds).toEqual(['a', 'b', 'c']);
    });

    it('removeMember drops a character from an existing party', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'b', 'c'], disabled: [] });
        useNamedPartyStore.getState().removeMember(GAME, 'p1', 'b');
        expect(useNamedPartyStore.getState().list(GAME)[0].memberCharacterIds).toEqual(['a', 'c']);
    });

    it('remove deletes the whole party', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a'], disabled: [] });
        useNamedPartyStore.getState().remove(GAME, 'p1');
        expect(useNamedPartyStore.getState().list(GAME)).toEqual([]);
    });

    it('toggleEffect adds then removes an id from disabled', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a'], disabled: [] });
        useNamedPartyStore.getState().toggleEffect(GAME, 'p1', 'eff-1');
        expect(useNamedPartyStore.getState().list(GAME)[0].disabled).toEqual(['eff-1']);
        useNamedPartyStore.getState().toggleEffect(GAME, 'p1', 'eff-1');
        expect(useNamedPartyStore.getState().list(GAME)[0].disabled).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/namedPartyStore.test.ts`
Expected: FAIL — cannot find module `../../src/renderer/src/stores/namedPartyStore`.

- [ ] **Step 3: Implement the store**

```typescript
// src/renderer/src/stores/namedPartyStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

const MAX_MEMBERS = 3;

/** A reusable, named party for the Rotation Builder — independent of the
 * Calculator's per-active-character teammate system (`partyStore.ts`),
 * which this does not touch. A member always resolves from their OWN
 * current loadout/Sequence — no loadout is stored here. */
export interface NamedParty {
    id: string;
    name: string;
    memberCharacterIds: string[]; // up to 3; can be saved with fewer
    /** Party-effect ids toggled OFF, same convention as `partyStore.ts`'s `Party.disabled`. */
    disabled: string[];
}

interface NamedPartyState {
    byGame: Record<string, Record<string, NamedParty>>;
    save: (gameId: string, party: NamedParty) => void;
    remove: (gameId: string, partyId: string) => void;
    list: (gameId: string) => NamedParty[];
    addMember: (gameId: string, partyId: string, characterId: string) => void;
    removeMember: (gameId: string, partyId: string, characterId: string) => void;
    toggleEffect: (gameId: string, partyId: string, effectId: string) => void;
}

const write = (
    byGame: NamedPartyState['byGame'],
    gameId: string,
    partyId: string,
    fn: (p: NamedParty) => NamedParty,
): NamedPartyState['byGame'] => {
    const game = byGame[gameId] ?? {};
    const current = game[partyId];
    if (!current) return byGame;
    return { ...byGame, [gameId]: { ...game, [partyId]: fn(current) } };
};

export const useNamedPartyStore = create<NamedPartyState>()(
    persist(
        (set, get) => ({
            byGame: {},
            save: (gameId, party) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [party.id]: party } },
            })),
            remove: (gameId, partyId) => set((s) => {
                const forGame = { ...s.byGame[gameId] };
                delete forGame[partyId];
                return { byGame: { ...s.byGame, [gameId]: forGame } };
            }),
            list: (gameId) => Object.values(get().byGame[gameId] ?? {}),
            addMember: (gameId, partyId, characterId) => set((s) => ({
                byGame: write(s.byGame, gameId, partyId, (p) =>
                    p.memberCharacterIds.length >= MAX_MEMBERS || p.memberCharacterIds.includes(characterId)
                        ? p
                        : { ...p, memberCharacterIds: [...p.memberCharacterIds, characterId] }),
            })),
            removeMember: (gameId, partyId, characterId) => set((s) => ({
                byGame: write(s.byGame, gameId, partyId, (p) => ({ ...p, memberCharacterIds: p.memberCharacterIds.filter((id) => id !== characterId) })),
            })),
            toggleEffect: (gameId, partyId, effectId) => set((s) => ({
                byGame: write(s.byGame, gameId, partyId, (p) => ({
                    ...p,
                    disabled: p.disabled.includes(effectId) ? p.disabled.filter((id) => id !== effectId) : [...p.disabled, effectId],
                })),
            })),
        }),
        { name: 'fm-named-parties', storage: createJSONStorage(() => userStorage) }
    )
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/namedPartyStore.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/stores/namedPartyStore.ts tests/renderer/namedPartyStore.test.ts
git commit -m "feat: add namedPartyStore for reusable Rotation Builder parties"
```

---

### Task 2: `resolveNamedParty` in `lib/party.ts`

**Files:**
- Modify: `src/renderer/src/lib/party.ts` (add after `resolveParty`, end of file)
- Test: create `tests/renderer/party.test.ts` if it doesn't already exist, else extend it — check first with `find tests -iname "party.test.ts"`.

**Interfaces:**
- Consumes: `NamedParty` (Task 1), `partyEffects`, `enabledPartyBuffs` (already in this file, unchanged), `activeSetBonuses` (already imported), `ResolvedLoadout` (already defined in this file).
- Produces: `resolveNamedParty(data, party, ownedGear, getLoadout, getSequence?, targetStatuses?): { members: PartyMemberResolved[]; effects: PartyEffect[]; enabledBuffs: BuffEntry[] }`. Consumed by Task 3 (RotationScreen wiring).

- [ ] **Step 1: Check for an existing party.ts test file**

Run: `find tests -iname "party.test.ts"`

If it exists, read it first to match its existing test style before adding to it. If not, the test file below is new.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/renderer/party.test.ts (add this describe block; create the file with this content if it doesn't exist yet)
import { resolveNamedParty } from '../../src/renderer/src/lib/party';
import type { CharacterEntry, GearEntry, WeaponEntry } from '../../shared/types/game-bundle';

const makeChar = (id: string): CharacterEntry => ({
    kind: 'character', id, name: id, element: 'Spectro', weaponType: 'Sword', rarity: 5,
    stats: { atk: 100 }, skills: [], equipped: { gearIds: [] },
});

describe('resolveNamedParty', () => {
    const data = { id: 'wuthering-waves', characters: [makeChar('a'), makeChar('b'), makeChar('c')], weapons: [] as WeaponEntry[], buffs: { character: [] }, setBonuses: [], statCatalog: [] };
    const getLoadout = () => ({ gearIds: [] });

    it('resolves every member uniformly, no special-cased first slot', () => {
        const party = { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'b', 'c'], disabled: [] };
        const { members } = resolveNamedParty(data, party, [] as GearEntry[], getLoadout);
        expect(members.map((m) => m.character.id)).toEqual(['a', 'b', 'c']);
        expect(members.every((m) => m.isActive === undefined)).toBe(true);
    });

    it('skips a memberCharacterId that no longer resolves to a real character', () => {
        const party = { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'ghost', 'c'], disabled: [] };
        const { members } = resolveNamedParty(data, party, [] as GearEntry[], getLoadout);
        expect(members.map((m) => m.character.id)).toEqual(['a', 'c']);
    });

    it('resolves a 1-member party fine', () => {
        const party = { id: 'p1', name: 'Solo', memberCharacterIds: ['a'], disabled: [] };
        const { members } = resolveNamedParty(data, party, [] as GearEntry[], getLoadout);
        expect(members.length).toBe(1);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/renderer/party.test.ts`
Expected: FAIL — `resolveNamedParty` is not exported from `lib/party.ts`.

- [ ] **Step 4: Implement `resolveNamedParty`**

Append to `src/renderer/src/lib/party.ts`, after `resolveParty`'s closing `}`:

```typescript
/**
 * Resolve a `NamedParty` (Rotation Builder's reusable party — see
 * `namedPartyStore.ts`) into the same `{members, effects, enabledBuffs}`
 * shape `resolveParty` produces for the Calculator, but WITHOUT an implicit
 * "active character" slot — every member is resolved uniformly, since a
 * named party has no anchor character, just up to 3 equal members.
 */
export function resolveNamedParty(
    data: Pick<GameBundle, 'id' | 'characters' | 'weapons' | 'buffs' | 'setBonuses' | 'statCatalog'>,
    party: { memberCharacterIds: string[]; disabled: string[] },
    ownedGear: GearEntry[],
    getLoadout: (characterId: string) => ResolvedLoadout,
    getSequence?: (characterId: string) => number,
    targetStatuses?: Record<string, boolean>,
): { members: PartyMemberResolved[]; effects: PartyEffect[]; enabledBuffs: BuffEntry[] } {
    const weaponOf = (id?: string) => (id ? data.weapons.find((w) => w.id === id) : undefined);
    const members: PartyMemberResolved[] = party.memberCharacterIds
        .map((characterId, i): PartyMemberResolved | null => {
            const c = data.characters.find((x) => x.id === characterId);
            if (!c) return null;
            const loadout = getLoadout(characterId);
            const gear = loadout.gearIds.map((gid) => ownedGear.find((g) => g.id === gid)).filter(Boolean) as GearEntry[];
            return { id: `member-${i}`, character: c, gear, setBonuses: activeSetBonuses(gear, data.setBonuses, c.name), weapon: weaponOf(loadout.weaponId), weaponRefine: loadout.weaponRefine, sequence: getSequence?.(characterId) };
        })
        .filter((m): m is PartyMemberResolved => m != null);
    const effects = partyEffects(data, members);
    return { members, effects, enabledBuffs: enabledPartyBuffs(effects, party.disabled, targetStatuses) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/renderer/party.test.ts`
Expected: PASS, 3 tests (plus any pre-existing ones in the file, if it already existed).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/lib/party.ts tests/renderer/party.test.ts
git commit -m "feat: add resolveNamedParty for uniform (no-anchor) party resolution"
```

---

### Task 3: `PartyWindows.tsx`

**Files:**
- Create: `src/renderer/src/components/PartyWindows.tsx`

**Interfaces:**
- Consumes: `useNamedPartyStore` (Task 1), `useWindowStore` (existing, `openWindow`/`closeWindow`), `RotationCharacterPickerWindow` (existing, `src/renderer/src/components/CharacterWindows.tsx` — reused directly for member search, per its existing `onPick: (characterId: string) => void` prop), `useGameStore`/`useGameData` (existing), `Button`/`Input`/`Badge` UI primitives (existing, `src/renderer/src/components/ui`).
- Produces: `PartyPickerWindow({ onSelect }: { onSelect: (partyId: string) => void })`, `CreatePartyWindow()`. Consumed by Task 4 (RotationScreen wiring).

This task has no pure logic to unit-test (it's UI wiring over an already-tested store) — verified manually via CDP in Task 4's verification step, matching this project's established convention for window components.

- [ ] **Step 1: Write the component file**

```typescript
// src/renderer/src/components/PartyWindows.tsx
import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button, Input, Badge, EmptyState } from './ui';
import { useWindowStore } from '../stores/windowStore';
import { useGameStore } from '../stores/gameStore';
import { useGameData } from '../data/gameData';
import { useNamedPartyStore, type NamedParty } from '../stores/namedPartyStore';
import { RotationCharacterPickerWindow } from './CharacterWindows';

let partySeq = 0;
const nextPartyId = () => `party-${Date.now()}-${++partySeq}`;

/** "Party" button popup — lists saved named parties for the active game, plus Create. */
export function PartyPickerWindow({ onSelect }: { onSelect: (partyId: string) => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const parties = useNamedPartyStore((s) => s.list(gameId));
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const nameOf = (characterId: string) => data.characters.find((c) => c.id === characterId)?.name ?? characterId;

    const pick = (id: string) => { onSelect(id); closeWindow(); };
    const openCreate = () => useWindowStore.getState().openWindow('Create Party', <CreatePartyWindow />);

    return (
        <div className="space-y-3">
            {parties.length === 0 ? (
                <EmptyState icon={Users} title="No parties yet" description="Create a party to sequence its members' turns in the Rotation Builder." />
            ) : (
                <ul className="space-y-1.5">
                    {parties.map((p) => (
                        <li key={p.id}>
                            <button
                                onClick={() => pick(p.id)}
                                className="flex w-full items-center gap-2 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:bg-surface-2"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-foreground">{p.name}</div>
                                    <div className="truncate text-xs text-muted-foreground">{p.memberCharacterIds.map(nameOf).join(', ') || 'No members'}</div>
                                </div>
                                <Badge variant="muted">{p.memberCharacterIds.length}/3</Badge>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <Button className="w-full" variant="secondary" onClick={openCreate}><Plus /> Create Party</Button>
        </div>
    );
}

/** Self-contained party creation form — name + up to 3 members, all in one
 * window (no cross-window state lifting: `useWindowStore` only holds ONE
 * window's content at a time, so a nested picker would replace this form
 * and lose its state; an inline search list avoids that entirely). */
export function CreatePartyWindow() {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const [name, setName] = useState('');
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [query, setQuery] = useState('');

    const nameOf = (id: string) => data.characters.find((c) => c.id === id)?.name ?? id;
    const q = query.trim().toLowerCase();
    const results = q
        ? data.characters.filter((c) => c.name.toLowerCase().includes(q) && !memberIds.includes(c.id)).slice(0, 8)
        : [];

    const addMember = (id: string) => { if (memberIds.length < 3) { setMemberIds((ids) => [...ids, id]); setQuery(''); } };
    const removeMember = (id: string) => setMemberIds((ids) => ids.filter((x) => x !== id));

    const save = () => {
        const trimmed = name.trim();
        if (!trimmed || memberIds.length === 0) return;
        useNamedPartyStore.getState().save(gameId, { id: nextPartyId(), name: trimmed, memberCharacterIds: memberIds, disabled: [] });
        closeWindow();
    };

    return (
        <div className="space-y-3">
            <Input placeholder="Party name…" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

            {memberIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {memberIds.map((id) => (
                        <Badge key={id} variant="secondary" className="gap-1">
                            {nameOf(id)}
                            <button onClick={() => removeMember(id)} className="ml-0.5 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </Badge>
                    ))}
                </div>
            )}

            {memberIds.length < 3 && (
                <div className="space-y-1.5">
                    <Input placeholder="Search characters to add…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    {results.length > 0 && (
                        <ul className="max-h-48 space-y-1 overflow-auto">
                            {results.map((c) => (
                                <li key={c.id}>
                                    <button onClick={() => addMember(c.id)} className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-2">
                                        {c.name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <Button className="w-full" onClick={save} disabled={!name.trim() || memberIds.length === 0}>Save Party</Button>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors. (If `EmptyState`, `Badge` with a `className` prop, or `Input` don't match this project's actual `components/ui` exports, adjust imports/props to match what's really exported — check `src/renderer/src/components/ui/index.ts` or equivalent barrel file first if this fails.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/PartyWindows.tsx
git commit -m "feat: add PartyPickerWindow/CreatePartyWindow for named parties"
```

---

### Task 4: Wire party selection into `RotationScreen.tsx`, drop the active-character gate

**Files:**
- Modify: `src/renderer/src/screens/RotationScreen.tsx`
- Modify: `src/renderer/src/stores/rotationStore.ts` (`anchorCharacterId` → `partyId`)

**Interfaces:**
- Consumes: `resolveNamedParty` (Task 2), `PartyPickerWindow` (Task 3), `useNamedPartyStore` (Task 1).
- Produces: `RotationScreen` no longer requires `calc.characterId`; `SavedRotation.partyId?: string` replaces `anchorCharacterId`.

- [ ] **Step 1: Update `rotationStore.ts`'s `SavedRotation`**

In `src/renderer/src/stores/rotationStore.ts`, change:
```typescript
export interface SavedRotation {
    id: string;
    name: string;
    /** Whose party this rotation was built against — informational, the steps carry their own characterId. */
    anchorCharacterId: string;
    steps: RotationStepSpec[];
    enabledSelfBuffIds: Record<string, string[]>;
}
```
to:
```typescript
export interface SavedRotation {
    id: string;
    name: string;
    /** Which named party (`namedPartyStore.ts`) this rotation's turn-picker is
     * restricted to. Undefined for a rotation saved before this field existed,
     * or one never assigned a party — it still loads fine, just without a
     * turn-picker restriction until a party is explicitly selected. */
    partyId?: string;
    steps: RotationStepSpec[];
    enabledSelfBuffIds: Record<string, string[]>;
}
```

- [ ] **Step 2: Typecheck to find every call site that needs updating**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: FAIL — `RotationScreen.tsx` still constructs `{ ...anchorCharacterId: activeChar.id... }` and reads `activeChar` before it's guaranteed to exist. Use these errors as the exact list of lines to fix in the next step.

- [ ] **Step 3: Remove the active-character gate and wire party selection**

In `src/renderer/src/screens/RotationScreen.tsx`, replace the party-resolution block:
```typescript
    const partyTeammates = usePartyStore((s) => (activeChar ? s.byGame[activeGameId]?.[activeChar.id]?.teammates.length ?? 0 : 0));
    // Re-resolve whenever the active character, their party, or owned gear changes.
    const { partyMembers, partyDisabled } = useMemo(() => {
        if (!activeChar) return { partyMembers: [] as PartyMemberResolved[], partyDisabled: [] as string[] };
        const equippedGear = calc.equipped.gearIds.map((id) => owned.gear.find((g) => g.id === id)).filter(Boolean) as typeof owned.gear;
        const party = usePartyStore.getState().getParty(activeGameId, activeChar.id);
        const getLoadout = (charId: string) => useLoadoutStore.getState().getLoadout(activeGameId, charId);
        const getSequence = (charId: string) => useSequenceStore.getState().getSequence(activeGameId, charId);
        const resolved = resolveParty(data, party, activeChar, equippedGear, calc.equipped.weaponId, owned.gear, getLoadout, calc.sequence, getSequence, calc.targetStatuses);
        return { partyMembers: resolved.members, partyDisabled: party.disabled };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChar, activeGameId, calc.equipped.gearIds, calc.equipped.weaponId, calc.sequence, owned.gear, partyTeammates, data, calc.targetStatuses]);
```
with:
```typescript
    const [activePartyId, setActivePartyId] = useState<string | undefined>(undefined);
    const partyMemberCount = useNamedPartyStore((s) => (activePartyId ? s.byGame[activeGameId]?.[activePartyId]?.memberCharacterIds.length ?? 0 : 0));
    // Re-resolve whenever the selected party or owned gear changes. No longer
    // depends on the Calculator's active character at all — a named party has
    // no anchor slot (see `resolveNamedParty`).
    const { partyMembers, partyDisabled } = useMemo(() => {
        if (!activePartyId) return { partyMembers: [] as PartyMemberResolved[], partyDisabled: [] as string[] };
        const party = useNamedPartyStore.getState().byGame[activeGameId]?.[activePartyId];
        if (!party) return { partyMembers: [] as PartyMemberResolved[], partyDisabled: [] as string[] };
        const getLoadout = (charId: string) => useLoadoutStore.getState().getLoadout(activeGameId, charId);
        const getSequence = (charId: string) => useSequenceStore.getState().getSequence(activeGameId, charId);
        const resolved = resolveNamedParty(data, party, owned.gear, getLoadout, getSequence, calc.targetStatuses);
        return { partyMembers: resolved.members, partyDisabled: party.disabled };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePartyId, activeGameId, owned.gear, partyMemberCount, data, calc.targetStatuses]);
```

- [ ] **Step 4: Update imports**

Change:
```typescript
import { usePartyStore } from '../stores/partyStore';
```
to:
```typescript
import { useNamedPartyStore } from '../stores/namedPartyStore';
```
Change:
```typescript
import { resolveParty, partyEffects, enabledPartyBuffs, type PartyMemberResolved } from '@/lib/party';
```
to:
```typescript
import { resolveNamedParty, partyEffects, enabledPartyBuffs, type PartyMemberResolved } from '@/lib/party';
```
Add:
```typescript
import { PartyPickerWindow } from '../components/PartyWindows';
import { useWindowStore } from '../stores/windowStore';
```
(check whether `useWindowStore` is already imported in this file first — it may already be, since `useWindowStore.getState().openWindow` patterns are common; if so, don't duplicate the import.)

- [ ] **Step 5: Restrict the turn/character picker to the selected party**

Find `RotationBuilder`'s usage inside `RotationScreen.tsx`'s `field` construction (the `useMemo` building `characters`/`skills` from `members`) — this already only includes `members` (which now already means "the selected party's members," since `members = [...partyMembers, ...extraMembers]` and `extraMembers` is derived from `steps`, not the full roster). The restriction happens naturally IF `RotationCharacterPickerWindow`'s "Add Character" flow (inside `RotationBuilder.tsx`) is changed to only offer `field.rotationConfig.characters` instead of the full roster. In `src/renderer/src/components/modules/RotationBuilder.tsx`, find:
```typescript
                <button
                    onClick={() => useWindowStore.getState().openWindow('Add Character', <RotationCharacterPickerWindow onPick={handleAddStep} />)}
                    disabled={disabled || totalTime >= maxTime}
```
Leave this AS-IS when no party is selected (falls back to full-roster search, per the spec's explicit fallback rule), but when a party IS selected, replace the full-roster picker with a simple restricted list. Add a new prop to `RotationBuilderProps`:
```typescript
interface RotationBuilderProps {
    field: FieldSpec;
    value: RotationStepSpec[];
    onChange: (value: RotationStepSpec[]) => void;
    disabled?: boolean;
    /** When set, "Add Character" only offers these — no full-roster search override. Undefined = today's full-roster picker (no party selected yet). */
    restrictToCharacterIds?: string[];
}
```
Then change the `RotationBuilder` function signature to destructure it: `export function RotationBuilder({ field, value, onChange, disabled, restrictToCharacterIds }: RotationBuilderProps) {`. Replace the "Add Character" button block with:
```typescript
            <div>
                {restrictToCharacterIds && restrictToCharacterIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {restrictToCharacterIds.map((id) => {
                            const c = characters.find((ch) => ch.id === id);
                            return (
                                <button
                                    key={id}
                                    onClick={() => handleAddStep(id)}
                                    disabled={disabled || totalTime >= maxTime}
                                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {c?.label ?? id}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <button
                        onClick={() => useWindowStore.getState().openWindow('Add Character', <RotationCharacterPickerWindow onPick={handleAddStep} />)}
                        disabled={disabled || totalTime >= maxTime}
                        className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm text-fg">Add Character</span>
                    </button>
                )}
            </div>
```
In `RotationScreen.tsx`'s JSX where `<RotationBuilder field={field} value={steps} onChange={setSteps} />` is rendered, add the new prop: `<RotationBuilder field={field} value={steps} onChange={setSteps} restrictToCharacterIds={activePartyId ? partyMembers.map((m) => m.character.id) : undefined} />`.

- [ ] **Step 6: Add the Party button and empty-state changes**

In `RotationScreen.tsx`'s returned JSX, replace:
```typescript
            <PageHeader title="Rotation Builder" description="Sequence character actions from your party — or add any character — and see real damage totals." />
            {!activeChar ? (
                <EmptyState icon={TargetIcon} title="Select a character in the Calculator first" description="The rotation builder sequences whatever party you've already set up for your active Calculator character." />
            ) : members.length === 0 ? (
                <EmptyState icon={TargetIcon} title="No party members resolved" description="Something went wrong resolving your active character — try reselecting it in the Calculator." />
            ) : (
```
with:
```typescript
            <PageHeader
                title="Rotation Builder"
                description="Pick a party, sequence turns, and see real damage totals."
                actions={<Button variant="secondary" onClick={() => useWindowStore.getState().openWindow('Party', <PartyPickerWindow onSelect={setActivePartyId} />)}>Party{activePartyId ? ` (${partyMembers.length}/3)` : ''}</Button>}
            />
            {!activePartyId ? (
                <EmptyState icon={TargetIcon} title="Select a party" description="Pick a saved party (or create one) to start building a rotation." />
            ) : members.length === 0 ? (
                <EmptyState icon={TargetIcon} title="No party members resolved" description="This party has no members left, or they couldn't be resolved — check it in the Party picker." />
            ) : (
```
Remove the now-unused `activeChar`/`calc.characterId` lookup near the top of the component (the line `const activeChar = data.characters.find((c) => c.id === calc.characterId) ?? null;`) and the `calc` destructure fields that are no longer read because of this removal — check with the typecheck in the next step which specific `calc.*` reads (if any beyond `calc.equipped`/`calc.sequence`, both now unused too since they were only for the old `activeChar`-based resolution) become dead and remove them. `calc.critMode`, `calc.enemy`, `calc.targetStatuses` are still used elsewhere in this file (damage computation) — keep those.

- [ ] **Step 7: Update save/load to use `partyId`**

In `handleSave`, change:
```typescript
    const handleSave = () => {
        if (!activeChar || steps.length === 0) return;
        const name = rotationName.trim();
        if (!name) return;
        const id = loadedRotationId ?? nextRotationId();
        const rotation: SavedRotation = { id, name, anchorCharacterId: activeChar.id, steps, enabledSelfBuffIds };
        useRotationStore.getState().save(activeGameId, rotation);
        setLoadedRotationId(id);
        toast.success(`Saved "${name}"`);
    };
```
to:
```typescript
    const handleSave = () => {
        if (steps.length === 0) return;
        const name = rotationName.trim();
        if (!name) return;
        const id = loadedRotationId ?? nextRotationId();
        const rotation: SavedRotation = { id, name, partyId: activePartyId, steps, enabledSelfBuffIds };
        useRotationStore.getState().save(activeGameId, rotation);
        setLoadedRotationId(id);
        toast.success(`Saved "${name}"`);
    };
```
In `handleLoad`, change:
```typescript
    const handleLoad = (r: SavedRotation) => {
        setSteps(r.steps);
        setEnabledSelfBuffIds(r.enabledSelfBuffIds);
        setRotationName(r.name);
        setLoadedRotationId(r.id);
    };
```
to:
```typescript
    const handleLoad = (r: SavedRotation) => {
        setSteps(r.steps);
        setEnabledSelfBuffIds(r.enabledSelfBuffIds);
        setRotationName(r.name);
        setLoadedRotationId(r.id);
        setActivePartyId(r.partyId);
    };
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors. Fix any remaining dead-code/unused-import errors surfaced (e.g. `usePartyStore`, `resolveParty`, `TargetIcon` still used — keep icon import, only the store/function names changed).

- [ ] **Step 9: Full test suite**

Run: `npx jest`
Expected: PASS except the pre-existing, unrelated `tests/core/event-bus.test.ts` flake.

- [ ] **Step 10: Manual verification via CDP**

Per this project's established technique (launch with `env -u ELECTRON_RUN_AS_NODE ELECTRON_ENABLE_LOGGING=1 npx electron . --remote-debugging-port=<port>`, use `Runtime.evaluate` with `textContent`-based element lookup + synthetic `MouseEvent`/`.click()` dispatch if the window's `document.hidden` stays true — see this session's own notes on this). Confirm:
1. Rotation Builder screen shows "Select a party" empty state with no character pre-selected in the Calculator.
2. Party button opens the popup; Create Party works (name + up to 3 members); the new party appears in the list.
3. Selecting a party resolves its members and restricts "Add Character" to just those members.
4. Saving and reloading a rotation preserves its party selection.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/screens/RotationScreen.tsx src/renderer/src/stores/rotationStore.ts src/renderer/src/components/modules/RotationBuilder.tsx
git commit -m "feat: wire named-party selection into Rotation Builder, drop Calculator-character gate"
```

---

## Phase 2: Cooldown Data

### Task 5: `cooldown` field — types + bundle plumbing

**Files:**
- Modify: `shared/types/game-definition.ts` (`CharacterSkill`)
- Modify: `shared/types/game-bundle.ts` (`SkillDef`)
- Modify: `shared/game-data/derive.ts` (`characterSkills()`)

**Interfaces:**
- Produces: `CharacterSkill.cooldown?: number` (seconds), `SkillDef.cooldown?: number`, forwarded through bundle assembly. Consumed by Task 6 (data sourcing) and Task 7 (engine + UI).

- [ ] **Step 1: Add `cooldown` to `CharacterSkill`**

In `shared/types/game-definition.ts`, inside `interface CharacterSkill { ... }`, immediately after the `element?: string;` line, add:
```typescript
    /** Reuse timer in seconds — how long before this skill can be cast again, NOT how long casting it takes (no cast-time data exists anywhere in this project's sources). Undefined for skills with no real cooldown (most Basic Attacks). */
    cooldown?: number;
```

- [ ] **Step 2: Add `cooldown` to `SkillDef`**

In `shared/types/game-bundle.ts`, inside `interface SkillDef { ... }`, immediately after its `element?: string;` line, add the same field:
```typescript
    /** Reuse timer in seconds — see `CharacterSkill.cooldown` for the full doc. */
    cooldown?: number;
```

- [ ] **Step 3: Forward it in `characterSkills()`**

In `shared/game-data/derive.ts`, inside `characterSkills()`'s returned object (the one with `stackMultipliers2: s.stackMultipliers2,` as its last line before the closing brace), add:
```typescript
            cooldown: s.cooldown,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors — this is purely additive, nothing consumes the field yet.

- [ ] **Step 5: Commit**

```bash
git add shared/types/game-definition.ts shared/types/game-bundle.ts shared/game-data/derive.ts
git commit -m "feat: add cooldown field to skill types and bundle assembly"
```

---

### Task 6: Source WW roster Cooldown data

**Files:**
- Modify: `adapters/game-definitions/wuthering-waves/skills.ts`

This is a full-roster data-sourcing pass, not a hand-enumerable code diff — dispatch it as a research task (matches how every prior full-roster WW data pass in this project has been done, per this session's own established pattern). Do NOT attempt to write this task's diff inline; dispatch it with the exact brief below.

- [ ] **Step 1: Dispatch the sourcing pass**

Prompt for the dispatched agent (adjust wording as needed for whichever dispatch mechanism is in use — subagent-driven-development or a direct Agent call):

> Add real, sourced `cooldown` (seconds) values to WW character skill entries in `adapters/game-definitions/wuthering-waves/skills.ts`. The `CharacterSkill` type (`shared/types/game-definition.ts`) now has an optional `cooldown?: number` field (already plumbed through to `SkillDef` — no other code changes needed, purely a data-entry pass on `skills.ts`).
>
> Source: `https://api.encore.moe/en/character/<roleId>` (fetch the full roleId→name map via `GET /en/character` with no id first, same as this project's established audit pattern this session). Each skill object's `SkillAttributes` array has an entry with `attributeName: "Cooldown"` when the skill has one (most Basic Attacks don't — leave `cooldown` undefined for those, don't write `0`). Use the `values` array's first entry as the cooldown in seconds; if a skill's cooldown value visibly differs across its `values` array entries (most won't — confirmed flat `["3","3"]`-style for at least one sampled skill), flag it in your final report rather than guessing which to use.
>
> Cover the full 55-56 character WW roster (same roster this session's earlier full-roster audits covered). For each character, only touch `skills.ts` — add `cooldown: <value>,` to the matching skill entry (match by name/id, the file already has extensive per-character comments to orient by). Cross-check any surprising value (e.g. an Ultimate with a very short cooldown) against a second source (wuthering.gg/wuthering.wiki) before committing to it, same discipline as this session's other data passes. Don't fabricate a value for a skill you can't confidently match against the API's skill list — leave `cooldown` unset and note the gap in your report rather than guessing.
>
> Report: total skills updated, any flagged multi-value cooldowns, any skills you couldn't confidently match/source.

- [ ] **Step 2: Typecheck the result**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Spot-check a handful of values**

Pick 3-4 characters from the dispatched report and manually verify their `cooldown` values against `https://api.encore.moe/en/character/<roleId>` yourself (don't just trust the report — same "verify before acting" discipline as the rest of this project).

- [ ] **Step 4: Full test suite**

Run: `npx jest`
Expected: PASS except the known `event-bus.test.ts` flake — this data-only change shouldn't affect any existing test, but confirms nothing broke.

- [ ] **Step 5: Commit**

```bash
git add adapters/game-definitions/wuthering-waves/skills.ts
git commit -m "feat: source real Cooldown data for the WW roster"
```

---

### Task 7: Cooldown display + reuse-warning engine + UI wiring

**Files:**
- Create: `src/renderer/src/lib/rotationEngine.ts`
- Test: `tests/renderer/rotationEngine.test.ts`
- Modify: `src/renderer/src/screens/RotationScreen.tsx` (pass `cooldown` through the `field` useMemo)
- Modify: `src/renderer/src/components/modules/RotationBuilder.tsx` (show CD badge + warning)

**Interfaces:**
- Consumes: `RotationStepSpec` (existing, `src/renderer/src/types/index.ts`), `cooldown` (Tasks 5-6).
- Produces: `elapsedTimes(steps: RotationStepSpec[]): number[]` (prefix-sum helper, also used by Phase 3/4), `cooldownWarningFor(steps, elapsed, index, cooldownsBySkillId: Record<string, number>): string | undefined` (returns a warning message or undefined). Consumed by Phase 3 (Task 8, reuses `elapsedTimes`) and Phase 4.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/rotationEngine.test.ts
import { elapsedTimes, cooldownWarningFor } from '../../src/renderer/src/lib/rotationEngine';
import type { RotationStepSpec } from '../../src/renderer/src/types';

const step = (characterId: string, skillId: string, duration: number): RotationStepSpec =>
    ({ characterId, actionType: 'skill', skillId, duration });

describe('elapsedTimes', () => {
    it('returns cumulative elapsed time BEFORE each step starts', () => {
        const steps = [step('a', 's1', 2), step('a', 's2', 3), step('a', 's3', 1)];
        expect(elapsedTimes(steps)).toEqual([0, 2, 5]);
    });

    it('returns an empty array for no steps', () => {
        expect(elapsedTimes([])).toEqual([]);
    });
});

describe('cooldownWarningFor', () => {
    const cooldowns = { ult: 24 };

    it('no warning for a skill with no known cooldown', () => {
        const steps = [step('a', 'basic', 1), step('a', 'basic', 1)];
        const elapsed = elapsedTimes(steps);
        expect(cooldownWarningFor(steps, elapsed, 1, cooldowns)).toBeUndefined();
    });

    it('no warning on first use', () => {
        const steps = [step('a', 'ult', 2)];
        expect(cooldownWarningFor(steps, elapsedTimes(steps), 0, cooldowns)).toBeUndefined();
    });

    it('warns when reused before cooldown elapsed', () => {
        const steps = [step('a', 'ult', 2), step('a', 'basic', 5), step('a', 'ult', 1)];
        const elapsed = elapsedTimes(steps); // [0, 2, 7] — 2nd 'ult' starts at t=7, 1st completed at t=2, CD=24 -> not up until t=26
        expect(cooldownWarningFor(steps, elapsed, 2, cooldowns)).toMatch(/CD not up/);
    });

    it('no warning once cooldown has genuinely elapsed', () => {
        const steps = [step('a', 'ult', 2), step('a', 'basic', 30), step('a', 'ult', 1)];
        const elapsed = elapsedTimes(steps); // [0, 2, 32] — 1st completed at t=2, CD up at t=26, 2nd starts at t=32
        expect(cooldownWarningFor(steps, elapsed, 2, cooldowns)).toBeUndefined();
    });

    it('only compares against the SAME character\'s prior use of the SAME skill', () => {
        const steps = [step('a', 'ult', 2), step('b', 'ult', 1)]; // different character, same skillId
        expect(cooldownWarningFor(steps, elapsedTimes(steps), 1, cooldowns)).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/rotationEngine.test.ts`
Expected: FAIL — cannot find module `lib/rotationEngine`.

- [ ] **Step 3: Implement**

```typescript
// src/renderer/src/lib/rotationEngine.ts
/**
 * Pure rotation-timeline simulation helpers — cooldown-reuse warnings
 * (this file), auto-triggered buff windows, and wave/overflow simulation
 * (added by later tasks in the same feature). Kept separate from
 * `RotationScreen.tsx`/`RotationBuilder.tsx` so each piece of logic is
 * unit-testable in isolation.
 */
import type { RotationStepSpec } from '../types';

/** Cumulative elapsed time BEFORE each step starts (prefix sum of prior
 * steps' `duration`). `elapsedTimes(steps)[i]` is when step `i` begins. */
export function elapsedTimes(steps: RotationStepSpec[]): number[] {
    const out: number[] = [];
    let t = 0;
    for (const s of steps) {
        out.push(t);
        t += s.duration ?? 0;
    }
    return out;
}

/**
 * A non-blocking warning if step `index` reuses a skill before its
 * cooldown (seconds) has elapsed since the SAME character's last use of
 * the SAME skill earlier in the rotation. Only compares against the same
 * character — a different character with the same `skillId` (unlikely,
 * but not impossible with shared generic ids) never counts. Cooldown
 * starts counting once the triggering cast COMPLETES (its elapsed start
 * time + its own duration), not when it starts.
 */
export function cooldownWarningFor(
    steps: RotationStepSpec[],
    elapsed: number[],
    index: number,
    cooldownsBySkillId: Record<string, number>,
): string | undefined {
    const step = steps[index];
    if (!step.skillId) return undefined;
    const cooldown = cooldownsBySkillId[step.skillId];
    if (cooldown == null) return undefined;
    const tNow = elapsed[index];
    for (let j = index - 1; j >= 0; j--) {
        const prior = steps[j];
        if (prior.characterId !== step.characterId || prior.skillId !== step.skillId) continue;
        const readyAt = elapsed[j] + (prior.duration ?? 0) + cooldown;
        if (tNow < readyAt) return `⚠ CD not up — ${(readyAt - tNow).toFixed(1)}s left`;
        return undefined; // found the most recent prior use, it's already off cooldown
    }
    return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/rotationEngine.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire `cooldown` through `RotationScreen.tsx`'s `field` useMemo**

In `src/renderer/src/screens/RotationScreen.tsx`, find:
```typescript
            skills: Object.fromEntries(members.map((m) => [
                m.character.id,
                m.character.skills.map((s) => ({ id: s.id, label: s.name, type: coarseSkillType(s.type), stackMax: s.stackMax })),
            ])),
```
Change to:
```typescript
            skills: Object.fromEntries(members.map((m) => [
                m.character.id,
                m.character.skills.map((s) => ({ id: s.id, label: s.name, type: coarseSkillType(s.type), stackMax: s.stackMax, cooldown: s.cooldown })),
            ])),
```

- [ ] **Step 6: Show a CD badge and reuse warning in `RotationBuilder.tsx`**

In `src/renderer/src/components/modules/RotationBuilder.tsx`, add the import at the top:
```typescript
import { elapsedTimes, cooldownWarningFor } from '../../lib/rotationEngine';
```
In the main `RotationBuilder` function, after the existing `getSkillsForCharacter` function definition, add:
```typescript
    const elapsed = elapsedTimes(value);
    const cooldownsBySkillId: Record<string, number> = {};
    for (const list of Object.values(skills)) for (const s of list) if (s.cooldown != null) cooldownsBySkillId[s.id] = s.cooldown;
```
In the `value.map((step, index) => (...))` block that renders each `RotationStepCard`, pass two new props:
```typescript
                        <RotationStepCard
                            key={`${step.characterId}-${index}`}
                            index={index}
                            step={step}
                            isExpanded={expandedStep === index}
                            character={characters.find(c => c.id === step.characterId)}
                            availableSkills={getSkillsForCharacter(step.characterId)}
                            cooldownWarning={cooldownWarningFor(value, elapsed, index, cooldownsBySkillId)}
                            onToggleExpand={() => setExpandedStep(expandedStep === index ? null : index)}
                            onUpdate={(updates) => handleUpdateStep(index, updates)}
                            onRemove={() => handleRemoveStep(index)}
                            onMoveUp={() => index > 0 && handleMoveStep(index, index - 1)}
                            onMoveDown={() => index < value.length - 1 && handleMoveStep(index, index - 1)}
                            disabled={disabled}
                        />
```
In `RotationStepCardProps`, add:
```typescript
    cooldownWarning?: string;
```
and destructure it in the function signature: `function RotationStepCard({ index, step, isExpanded, character, availableSkills, cooldownWarning, onToggleExpand, onUpdate, onRemove, onMoveUp, onMoveDown, disabled }: RotationStepCardProps) {`. Also add, right after the existing `const selectedSkillStackMax = ...` line:
```typescript
    const selectedSkillCooldown = availableSkills.find((s) => s.id === step.skillId)?.cooldown;
```
In the collapsed header row, right after the existing `{step.skillLabel && (...)}` block, add:
```typescript
                {selectedSkillCooldown != null && (
                    <span className="text-xs text-muted-foreground">CD {selectedSkillCooldown}s</span>
                )}
                {cooldownWarning && (
                    <span className="text-xs text-yellow-400" title={cooldownWarning}>{cooldownWarning}</span>
                )}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Manual verification via CDP**

Confirm a step using a skill with a known cooldown shows a "CD Ns" label, and reusing that same skill (same character) sooner than its cooldown shows the "⚠ CD not up" warning without blocking anything.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/lib/rotationEngine.ts tests/renderer/rotationEngine.test.ts src/renderer/src/screens/RotationScreen.tsx src/renderer/src/components/modules/RotationBuilder.tsx
git commit -m "feat: show real Cooldown data + non-blocking reuse warning in Rotation Builder"
```

---

## Phase 3: Buff/Debuff Auto-Apply

### Task 8: `autoTrigger` field — types

**Files:**
- Modify: `shared/types/game-bundle.ts` (extract shared `ConditionalSelfBuff` type, add `autoTrigger`)
- Modify: `adapters/game-definitions/wuthering-waves/sequences.generated.ts` (its own separate inline type)

**Interfaces:**
- Produces: `ConditionalSelfBuff { stat, label, value, conditional?, appliesTo?, scaleOff?, stacksMax?, autoTrigger?: { skillIds: string[]; durationSeconds: number } }` (new named type, `shared/types/game-bundle.ts`), used by `ConstellationNode.selfBuffs`, `CharacterEntry.selfBuffs`, `WeaponEntry.selfBuffs`, `GearEntry.selfBuffs`. `SEQUENCE_OVERRIDES`'s own `selfBuffs`/`buffs` inline types gain the same `autoTrigger` field independently (kept separate — already structurally different from the shared type, not worth forcing into it). Consumed by Task 9 (forwarding fix) and Task 10 (data sourcing).

- [ ] **Step 1: Extract the shared type and add `autoTrigger`**

In `shared/types/game-bundle.ts`, immediately before `export interface ConstellationNode {` (the first of the 4 identical occurrences), add:
```typescript
/**
 * A self-buff entry that may be unconditional (`conditional:false`, auto-
 * applies) or opt-in (`conditional:true`, a manual Calculator/Rotation
 * Builder toggle) — shared shape used by `ConstellationNode.selfBuffs`,
 * `CharacterEntry.selfBuffs`, `WeaponEntry.selfBuffs`, and
 * `GearEntry.selfBuffs`.
 */
export interface ConditionalSelfBuff {
    stat: string;
    label: string;
    value: number;
    conditional?: boolean;
    appliesTo?: string[];
    scaleOff?: BuffEntry['scaleOff'];
    stacksMax?: number;
    /**
     * Present ONLY for the clean "N seconds after casting skill X" pattern —
     * lets the Rotation Builder auto-compute this buff's uptime instead of
     * requiring a manual toggle. Absent for stance/stack/HP-threshold-gated
     * buffs (permanently manual-toggle-only, not a placeholder — see
     * `docs/superpowers/specs/2026-07-19-rotation-builder-overhaul-design.md`
     * Section 3 for the full scoping rationale).
     */
    autoTrigger?: { skillIds: string[]; durationSeconds: number };
}
```
Then replace each of the 4 identical occurrences:
```typescript
    selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff']; stacksMax?: number }>;
```
with:
```typescript
    selfBuffs?: ConditionalSelfBuff[];
```
(All 4 occurrences are byte-identical — verify with `grep -n "conditional?: boolean; appliesTo?: string\[\]" shared/types/game-bundle.ts` before and after: 4 matches before, 0 after.)

- [ ] **Step 2: Add `autoTrigger` to `SEQUENCE_OVERRIDES`'s own inline type**

In `adapters/game-definitions/wuthering-waves/sequences.generated.ts`, the `export const SEQUENCE_OVERRIDES: Record<...>` type declaration on line 12 currently reads:
```typescript
export const SEQUENCE_OVERRIDES: Record<string, Array<{ level: number; name: string; description: string; selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; stacksMax?: number }>; buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[]; stacksMax?: number; requiresTargetStatus?: string[]; scaleOff?: BuffEntry['scaleOff'] }> }>> = {
```
Change to (adding `autoTrigger?: { skillIds: string[]; durationSeconds: number };` to both the `selfBuffs` and `buffs` element types):
```typescript
export const SEQUENCE_OVERRIDES: Record<string, Array<{ level: number; name: string; description: string; selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; stacksMax?: number; autoTrigger?: { skillIds: string[]; durationSeconds: number } }>; buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[]; stacksMax?: number; requiresTargetStatus?: string[]; scaleOff?: BuffEntry['scaleOff']; autoTrigger?: { skillIds: string[]; durationSeconds: number } }> }>> = {
```
This is a pure type-level addition — verified assignable to `ConstellationNode.selfBuffs`/`buffs` (`shared/game-data/bundle.ts`'s `const constellations = SEQUENCE_OVERRIDES[c.id];` does a direct passthrough assignment, no remapping — see plan research notes; confirmed no bundle.ts changes needed).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors — purely additive/renamed-in-place, no behavior change yet.

- [ ] **Step 4: Full test suite**

Run: `npx jest`
Expected: PASS except the known `event-bus.test.ts` flake.

- [ ] **Step 5: Commit**

```bash
git add shared/types/game-bundle.ts adapters/game-definitions/wuthering-waves/sequences.generated.ts
git commit -m "feat: add autoTrigger field to conditional self-buff types"
```

---

### Task 9: Forward `autoTrigger` through the buff-candidate pipeline

**Files:**
- Modify: `src/renderer/src/lib/selfBuffs.ts` (`conditionalWeaponBuffs`, `conditionalCharacterBuffs`, `conditionalConstellationBuffs`, `conditionalGearBuffs`)
- Modify: `src/renderer/src/lib/party.ts` (`enabledPartyBuffs` — exclude auto-triggered team buffs from the always-on flatten)

**Interfaces:**
- Consumes: `autoTrigger` (Task 8).
- Produces: every `conditional*` function in `selfBuffs.ts` now includes `autoTrigger` in its returned candidate objects when present. `enabledPartyBuffs` skips any buff carrying `autoTrigger` (it becomes windowed-only, resolved by Task 11 instead of always-on). Consumed by Task 10 (data sourcing, needs this to have any effect) and Task 11 (the resolver that actually uses these candidates).

**Why this task exists:** each `conditional*` function reconstructs a narrow literal object today (e.g. `{ id, name, source, stat, label, stacksMax, value, ...(sb.appliesTo ? {appliesTo:...} : {}) }`) — it does NOT spread the source buff, so `autoTrigger` would be silently dropped even after Task 8's type addition, without this fix.

- [ ] **Step 1: Write the failing test**

Check first whether `tests/renderer/selfBuffs.test.ts` already exists (`find tests -iname "selfBuffs.test.ts"`) and read it to match style if so. Add this case (to the existing file, or create it with just this if none exists):

```typescript
// tests/renderer/selfBuffs.test.ts (add to existing describe blocks, matching whatever this file's current structure is)
import { conditionalWeaponBuffs, conditionalCharacterBuffs, conditionalGearBuffs } from '../../src/renderer/src/lib/selfBuffs';

describe('autoTrigger forwarding', () => {
    const catalog: never[] = [];

    it('conditionalCharacterBuffs forwards autoTrigger when present on the source buff', () => {
        const character = {
            id: 'c1', name: 'Test Char', stats: { atk: 100 },
            selfBuffs: [{ stat: 'critRate', label: 'Test', value: 10, conditional: true, autoTrigger: { skillIds: ['skill'], durationSeconds: 15 } }],
        };
        const [candidate] = conditionalCharacterBuffs(character as never, [], undefined, catalog);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toEqual({ skillIds: ['skill'], durationSeconds: 15 });
    });

    it('conditionalWeaponBuffs forwards autoTrigger', () => {
        const weapon = {
            id: 'w1', name: 'Test Weapon', baseAtk: 500,
            selfBuffs: [{ stat: 'atkPct', value: 15, conditional: true, autoTrigger: { skillIds: ['ult'], durationSeconds: 20 } }],
        };
        const character = { id: 'c1', name: 'Test Char', stats: { atk: 100 } };
        const [candidate] = conditionalWeaponBuffs(weapon as never, character as never, [], catalog);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toEqual({ skillIds: ['ult'], durationSeconds: 20 });
    });

    it('conditionalGearBuffs forwards autoTrigger', () => {
        const gear = [{ id: 'g1', name: 'Test Echo', selfBuffs: [{ stat: 'atk', value: 5, conditional: true, autoTrigger: { skillIds: ['skill'], durationSeconds: 10 } }] }];
        const [candidate] = conditionalGearBuffs(gear as never);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toEqual({ skillIds: ['skill'], durationSeconds: 10 });
    });

    it('a candidate with no autoTrigger on the source buff has none on the output either', () => {
        const character = { id: 'c1', name: 'Test Char', stats: { atk: 100 }, selfBuffs: [{ stat: 'critRate', label: 'Test', value: 10, conditional: true }] };
        const [candidate] = conditionalCharacterBuffs(character as never, [], undefined, catalog);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/selfBuffs.test.ts -t "autoTrigger forwarding"`
Expected: FAIL — `candidate.autoTrigger` is `undefined` in the first 3 cases (dropped by the current narrow-literal reconstruction).

- [ ] **Step 3: Fix each `conditional*` function**

In `src/renderer/src/lib/selfBuffs.ts`, for each of the 4 functions, add `...(sb.autoTrigger ? { autoTrigger: sb.autoTrigger } : {})` to the returned object literal, matching the existing `...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {})` spread style exactly. Also widen each function's inline parameter type to include `autoTrigger` (TypeScript will otherwise reject reading `sb.autoTrigger` — add `autoTrigger?: { skillIds: string[]; durationSeconds: number }` alongside the existing `conditional?: boolean; appliesTo?: string[]; scaleOff?: SelfBuffScaleOff; stacksMax?: number` in each function's narrowed parameter type).

`conditionalWeaponBuffs` (around line 121):
```typescript
export function conditionalWeaponBuffs(weapon: { id: string; name: string; baseAtk: number; selfBuffs?: Array<{ stat: string; label?: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: SelfBuffScaleOff; stacksMax?: number; autoTrigger?: { skillIds: string[]; durationSeconds: number } }> } | undefined, c: CharacterData | null, gear: GearData[], catalog: GameData['statCatalog'], stacks: Record<string, number> = {}, refineMultiplier = 1) {
    if (!weapon || !c) return [];
    return (weapon.selfBuffs ?? [])
        .map((sb, i) => ({ sb, i }))
        .filter(({ sb }) => sb.conditional !== false)
        .map(({ sb, i }) => { const id = selfBuffId(weapon.id, sb, i); return { id, name: `${weapon.name} passive`, source: weapon.name, stat: sb.stat, label: sb.label, stacksMax: sb.stacksMax, value: resolveStackedValue(id, { value: (sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, catalog) : sb.value) * refineMultiplier, stacksMax: sb.stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}), ...(sb.autoTrigger ? { autoTrigger: sb.autoTrigger } : {}) }; });
}
```

`conditionalCharacterBuffs` (around line 130) — `c.selfBuffs` is now typed as `ConditionalSelfBuff[]` via `CharacterData`'s underlying type (from Task 8's change), so no parameter-type widening needed here, just add the forwarding:
```typescript
export function conditionalCharacterBuffs(c: CharacterData | null, gear: GearData[], weapon: { baseAtk: number } | undefined, catalog: GameData['statCatalog'], stacks: Record<string, number> = {}) {
    if (!c?.selfBuffs) return [];
    return c.selfBuffs
        .map((sb, i) => ({ sb, i }))
        .filter(({ sb }) => sb.conditional !== false)
        .map(({ sb, i }) => { const id = passiveBuffId(c.id, sb, i); return { id, name: `${c.name} passive`, source: c.name, stat: sb.stat, label: sb.label, stacksMax: sb.stacksMax, value: resolveStackedValue(id, { value: sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, catalog) : sb.value, stacksMax: sb.stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}), ...(sb.autoTrigger ? { autoTrigger: sb.autoTrigger } : {}) }; });
}
```
(If `CharacterData`'s type doesn't automatically pick up `ConditionalSelfBuff` — check where `CharacterData` is defined/imported in this file; if it's a locally-narrowed inline type rather than importing `CharacterEntry` directly, widen it the same way as `conditionalWeaponBuffs` above.)

`conditionalConstellationBuffs` (around line 139) — reads `node.selfBuffs` where `node: ConstellationNode` (now using `ConditionalSelfBuff[]` per Task 8), and casts `(sb as { scaleOff?... })` today because the loop variable isn't fully typed — add the same forwarding:
```typescript
export function conditionalConstellationBuffs(character: CharacterData | null, sequence: number, gear: GearData[], weapon: { baseAtk: number } | undefined, catalog: GameData['statCatalog'], stacks: Record<string, number> = {}) {
    if (!character?.constellations) return [];
    const out: Array<{ id: string; name: string; source: string; stat: string; label?: string; value: number; appliesTo?: string[]; stacksMax?: number; autoTrigger?: { skillIds: string[]; durationSeconds: number } }> = [];
    for (const node of character.constellations) {
        if (sequence < node.level) continue;
        (node.selfBuffs ?? [])
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional !== false)
            .forEach(({ sb, i }) => { const id = constBuffId(character.id, node.level, sb, i); const scaleOff = (sb as { scaleOff?: SelfBuffScaleOff }).scaleOff; const stacksMax = (sb as { stacksMax?: number }).stacksMax; const autoTrigger = (sb as { autoTrigger?: { skillIds: string[]; durationSeconds: number } }).autoTrigger; out.push({ id, name: `${node.name} (L${node.level})`, source: character.name, stat: sb.stat, label: sb.label, stacksMax, value: resolveStackedValue(id, { value: scaleOff ? resolveSelfScaleOff(character, gear, weapon, scaleOff, catalog) : sb.value, stacksMax }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}), ...(autoTrigger ? { autoTrigger } : {}) }); });
    }
    return out;
}
```

`conditionalGearBuffs` (around line 169) — `gearSelfBuffs(g)` return type needs checking; add the same `autoTrigger` widening/forwarding pattern as `conditionalWeaponBuffs` if it's inline-typed there too:
```typescript
export function conditionalGearBuffs(gear: GearData[], stacks: Record<string, number> = {}) {
    const out: Array<{ id: string; name: string; source: string; stat: string; label?: string; value: number; appliesTo?: string[]; autoTrigger?: { skillIds: string[]; durationSeconds: number } }> = [];
    for (const g of gear) {
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional !== false)
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, label: sb.label, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}), ...((sb as { autoTrigger?: { skillIds: string[]; durationSeconds: number } }).autoTrigger ? { autoTrigger: (sb as { autoTrigger?: { skillIds: string[]; durationSeconds: number } }).autoTrigger } : {}) }); });
    }
    return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/selfBuffs.test.ts -t "autoTrigger forwarding"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for `enabledPartyBuffs` excluding auto-triggered team buffs**

Check first whether `tests/renderer/party.test.ts` (created/extended in Task 2) already has an `enabledPartyBuffs` describe block; add to it or create one:
```typescript
import { enabledPartyBuffs, type PartyEffect } from '../../src/renderer/src/lib/party';

describe('enabledPartyBuffs — autoTrigger exclusion', () => {
    it('excludes a buff carrying autoTrigger from the always-on flatten', () => {
        const effects: PartyEffect[] = [{
            id: 'eff-1', name: 'Test', source: 'Char', category: 'kit',
            buffs: [{ stat: 'atkPct', value: 20, autoTrigger: { skillIds: ['skill'], durationSeconds: 14 } } as never],
        }];
        expect(enabledPartyBuffs(effects, [])).toEqual([]);
    });

    it('still includes a buff with no autoTrigger, unchanged', () => {
        const effects: PartyEffect[] = [{ id: 'eff-1', name: 'Test', source: 'Char', category: 'kit', buffs: [{ stat: 'atkPct', value: 20 }] }];
        expect(enabledPartyBuffs(effects, [])).toHaveLength(1);
    });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest tests/renderer/party.test.ts -t "autoTrigger exclusion"`
Expected: FAIL — the first case currently returns 1 result, not 0 (nothing excludes `autoTrigger`-bearing buffs yet).

- [ ] **Step 7: Update `PartyEffect` and `enabledPartyBuffs`**

In `src/renderer/src/lib/party.ts`, change `PartyEffect`'s `buffs` field:
```typescript
    buffs: Array<{ stat: string; label?: string; value: number; appliesTo?: string[]; requiresTargetStatus?: string[] }>;
```
to:
```typescript
    buffs: Array<{ stat: string; label?: string; value: number; appliesTo?: string[]; requiresTargetStatus?: string[]; autoTrigger?: { skillIds: string[]; durationSeconds: number } }>;
```
Then in `enabledPartyBuffs`, add an `autoTrigger` skip alongside the existing `statusMet` check:
```typescript
export function enabledPartyBuffs(effects: PartyEffect[], disabled: string[], targetStatuses?: Record<string, boolean>): BuffEntry[] {
    const off = new Set(disabled);
    const statusMet = (statuses?: string[]) =>
        !statuses || statuses.length === 0 || statuses.some((s) => (targetStatuses?.[s] ?? true));
    const out: BuffEntry[] = [];
    for (const e of effects) {
        if (off.has(e.id)) continue;
        e.buffs.forEach((b, i) => {
            if (b.autoTrigger) return; // windowed — resolved separately by rotationEngine's team-wide resolver, never always-on
            if (!statusMet(b.requiresTargetStatus)) return;
            out.push({ id: `${e.id}#${i}`, name: e.name, source: e.source, stat: b.stat, value: b.value, appliesTo: b.appliesTo });
        });
    }
    return out;
}
```
`partyEffects` (the function that BUILDS `PartyEffect[]` from `ConstellationNode.buffs`/`WeaponEntry.buffs`) already spreads `{...b, value: ...}` when constructing each buff row (confirmed: `buffs: sb.buffs` direct-assigns for set bonuses, `m.weapon.buffs.map((b) => ({ ...b, value: ... }))` and `node.buffs.map((b) => ({ ...b, value: ... }))` both spread) — so `autoTrigger` already survives THAT step without changes. Only `enabledPartyBuffs`'s narrow reconstruction needed the fix just made.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest tests/renderer/party.test.ts`
Expected: PASS, all cases in the file.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 10: Full test suite**

Run: `npx jest`
Expected: PASS except the known `event-bus.test.ts` flake.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/lib/selfBuffs.ts src/renderer/src/lib/party.ts tests/renderer/selfBuffs.test.ts tests/renderer/party.test.ts
git commit -m "fix: forward autoTrigger through the buff-candidate pipeline, exclude it from always-on team buffs"
```

---

### Task 10: Source WW roster `autoTrigger` data

**Files:**
- Modify: `adapters/game-definitions/wuthering-waves/character-passives.generated.ts`
- Modify: `adapters/game-definitions/wuthering-waves/sequences.generated.ts`
- Modify: `adapters/game-definitions/wuthering-waves/weapons.ts`

Same shape as Task 6 — a full-roster data-entry pass over ALREADY-KNOWN information (existing label text), dispatched rather than hand-enumerated inline.

- [ ] **Step 1: Dispatch the sourcing pass**

> Add `autoTrigger` data to WW conditional (`conditional:true`) self-buffs that match the clean "N seconds after casting skill X" pattern, across `adapters/game-definitions/wuthering-waves/character-passives.generated.ts` (`CHARACTER_SELF_BUFFS`), `sequences.generated.ts` (`SEQUENCE_OVERRIDES`'s `selfBuffs` and `buffs` arrays), and `weapons.ts` (weapon `selfBuffs`). The type (`autoTrigger?: { skillIds: string[]; durationSeconds: number }`) already exists on all three (added by an earlier task in this same feature) — this is a pure data-entry pass, no code/type changes.
>
> **Scope, exactly** (per this feature's spec, Section 3 — do not go beyond this):
> - ONLY buffs whose label/description already states "N seconds after casting/triggering skill X" (or equivalent unambiguous phrasing) get `autoTrigger` populated. Many labels in this codebase already say exactly this, e.g. "ATK +18%, 27s after Res. Skill" — `durationSeconds` is the stated number, `skillIds` is the WW `skills.ts` id(s) matching "Res. Skill" (or whichever specific move is named) for that character.
> - Do NOT add `autoTrigger` to: stance/state-gated buffs ("while in X state"), stack-accumulating buffs ("+N% per cast, up to M stacks"), or non-time conditions (HP threshold, energy/resource threshold). These stay exactly as they are — permanently manual-toggle, not a gap to fill later.
> - When a label names a general category ("Res. Skill", "Heavy Attack") rather than one specific move, and the character has multiple skills of that category, resolve `skillIds` to ALL of that character's skills in `skills.ts` matching that category (check `type`/`scope` fields) — same category-matching logic already established this session for `appliesTo` scoping (see the WW full-roster audit's `appliesTo` scope-collision fixes for the exact reasoning pattern to follow: don't let a category-wide trigger silently miss a sibling move, but also don't let it wrongly include an unrelated move of a similar name).
> - Leave `conditional: true` unchanged on every buff you touch — `autoTrigger`'s presence supplements the manual toggle, it doesn't replace the field.
>
> Cover the full WW roster. Report: total buffs given `autoTrigger`, a representative sample of 5-10 with their exact before/after, and anything you found ambiguous enough to skip (don't guess on those — report them instead).

- [ ] **Step 2: Typecheck the result**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Spot-check a handful of entries**

Pick 3-4 of the reported changes and manually verify the `skillIds` actually match real skill ids in that character's `skills.ts` block (a typo'd id would silently never match anything at runtime — `grep` for each id to confirm it exists).

- [ ] **Step 4: Full test suite**

Run: `npx jest`
Expected: PASS except the known `event-bus.test.ts` flake.

- [ ] **Step 5: Commit**

```bash
git add adapters/game-definitions/wuthering-waves/character-passives.generated.ts adapters/game-definitions/wuthering-waves/sequences.generated.ts adapters/game-definitions/wuthering-waves/weapons.ts
git commit -m "feat: source autoTrigger data for timed WW conditional buffs"
```

---

### Task 11: Auto-trigger resolution engine + `RotationScreen.tsx` wiring

**Files:**
- Modify: `src/renderer/src/lib/rotationEngine.ts`
- Modify: `tests/renderer/rotationEngine.test.ts`
- Modify: `src/renderer/src/screens/RotationScreen.tsx`

**Interfaces:**
- Consumes: `elapsedTimes` (Task 7), buff candidates carrying `autoTrigger` (Tasks 9-10).
- Produces: `isAutoBuffActiveAtStep(steps, elapsed, stepIndex, autoTrigger, restrictToCharacterId?): boolean`. Consumed by `computeStepDamage` (existing, modified here) to add resolved auto-buffs alongside manually-toggled ones.

- [ ] **Step 1: Write the failing test**

Add to `tests/renderer/rotationEngine.test.ts`:
```typescript
import { isAutoBuffActiveAtStep } from '../../src/renderer/src/lib/rotationEngine';

describe('isAutoBuffActiveAtStep', () => {
    const trigger = { skillIds: ['skill'], durationSeconds: 15 };

    it('inactive before any trigger has been cast', () => {
        const steps = [step('a', 'basic', 1), step('a', 'ult', 1)];
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger, 'a')).toBe(false);
    });

    it('active within the window after the triggering skill completes', () => {
        const steps = [step('a', 'skill', 2), step('a', 'ult', 1)]; // skill completes at t=2, ult starts at t=2
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger, 'a')).toBe(true);
    });

    it('inactive once the window has passed', () => {
        const steps = [step('a', 'skill', 2), step('a', 'basic', 20), step('a', 'ult', 1)]; // ult starts at t=22, window ends at t=17
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 2, trigger, 'a')).toBe(false);
    });

    it('a self-buff (restrictToCharacterId set) ignores a different character\'s trigger cast', () => {
        const steps = [step('b', 'skill', 2), step('a', 'ult', 1)];
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger, 'a')).toBe(false);
    });

    it('a team-wide buff (no restrictToCharacterId) counts any character\'s trigger cast', () => {
        const steps = [step('b', 'skill', 2), step('a', 'ult', 1)];
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger)).toBe(true);
    });
});
```
(`step` and `elapsedTimes` are already imported/defined earlier in this test file from Task 7 — reuse them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/rotationEngine.test.ts -t "isAutoBuffActiveAtStep"`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/lib/rotationEngine.ts`:
```typescript
/**
 * True if an auto-triggered buff is active at `stepIndex`, given the
 * rotation's steps and their precomputed `elapsedTimes`. The buff becomes
 * active once its triggering skill COMPLETES (trigger step's elapsed start
 * + its own duration) and stays active for `durationSeconds` after that.
 * `restrictToCharacterId`: for a SELF buff, only that character's steps
 * count as valid triggers; omit for a TEAM-wide buff, where any party
 * member's step counts.
 */
export function isAutoBuffActiveAtStep(
    steps: RotationStepSpec[],
    elapsed: number[],
    stepIndex: number,
    autoTrigger: { skillIds: string[]; durationSeconds: number },
    restrictToCharacterId?: string,
): boolean {
    const tNow = elapsed[stepIndex];
    for (let j = 0; j < stepIndex; j++) {
        const s = steps[j];
        if (restrictToCharacterId && s.characterId !== restrictToCharacterId) continue;
        if (!s.skillId || !autoTrigger.skillIds.includes(s.skillId)) continue;
        const triggerCompletesAt = elapsed[j] + (s.duration ?? 0);
        if (tNow >= triggerCompletesAt && tNow - triggerCompletesAt <= autoTrigger.durationSeconds) return true;
    }
    return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/rotationEngine.test.ts`
Expected: PASS, all cases in the file (Task 7's 7 + this task's 5 = 12).

- [ ] **Step 5: Wire into `RotationScreen.tsx`'s damage computation**

This is the most involved wiring step — `computeStepDamage` currently takes a flat `enabledSelfBuffs: BuffEntry[]` per call and a single `teamBuffs: BuffEntry[]` shared across every step. Both need to become PER-STEP now, incorporating auto-triggered buffs alongside the existing manually-toggled ones.

In `src/renderer/src/screens/RotationScreen.tsx`, add the import:
```typescript
import { elapsedTimes, isAutoBuffActiveAtStep } from '@/lib/rotationEngine';
```

Find the `results` computation:
```typescript
    const reaction: SkillContext['reaction'] = data.supportsReactions ? calc.reaction : 'none';
    const results: StepResult[] = useMemo(() => steps.map((step, index) => {
        const member = members.find((m) => m.character.id === step.characterId);
        const enabledIds = new Set(enabledSelfBuffIds[step.characterId] ?? []);
        const enabledSelfBuffs = member && enabledIds.size > 0 ? conditionalBuffCandidates(member, data.statCatalog, activeGameId).filter((b) => enabledIds.has(b.id)) : [];
        const { skill, damage } = computeStepDamage(step, member, enabledBuffs, enabledSelfBuffs, calc.critMode, calc.enemy, reaction, data.statCatalog, activeGameId);
        return { step, index, member, skill, damage };
         
    }), [steps, members, enabledBuffs, enabledSelfBuffIds, calc.critMode, calc.enemy, reaction, data.statCatalog, activeGameId]);
```
Replace with:
```typescript
    const reaction: SkillContext['reaction'] = data.supportsReactions ? calc.reaction : 'none';
    const elapsed = useMemo(() => elapsedTimes(steps), [steps]);
    // Team-wide effects carrying `autoTrigger` are excluded from `enabledBuffs`
    // (Task 9's `enabledPartyBuffs` fix) — resolve them per-step here instead,
    // active for any step whose elapsed time falls in a trigger's window
    // regardless of which party member cast the trigger.
    const windowedTeamEffects = useMemo(
        () => partyEffects(data, members).flatMap((e) =>
            e.buffs
                .map((b, i) => ({ e, b, i }))
                .filter(({ b }) => !!b.autoTrigger)),
        [data, members],
    );
    const results: StepResult[] = useMemo(() => steps.map((step, index) => {
        const member = members.find((m) => m.character.id === step.characterId);
        const enabledIds = new Set(enabledSelfBuffIds[step.characterId] ?? []);
        const candidates = member ? conditionalBuffCandidates(member, data.statCatalog, activeGameId) : [];
        const manuallyToggled = enabledIds.size > 0 ? candidates.filter((b) => enabledIds.has(b.id) && !(b as { autoTrigger?: unknown }).autoTrigger) : [];
        const autoActive = candidates.filter((b) => {
            const at = (b as { autoTrigger?: { skillIds: string[]; durationSeconds: number } }).autoTrigger;
            return at && member && isAutoBuffActiveAtStep(steps, elapsed, index, at, member.character.id);
        });
        const windowedTeamBuffs: BuffEntry[] = windowedTeamEffects
            .filter(({ b }) => isAutoBuffActiveAtStep(steps, elapsed, index, b.autoTrigger!))
            .map(({ e, b, i }) => ({ id: `${e.id}#${i}`, name: e.name, source: e.source, stat: b.stat, value: b.value, appliesTo: b.appliesTo }));
        const stepTeamBuffs = [...enabledBuffs, ...windowedTeamBuffs];
        const { skill, damage } = computeStepDamage(step, member, stepTeamBuffs, [...manuallyToggled, ...autoActive], calc.critMode, calc.enemy, reaction, data.statCatalog, activeGameId);
        return { step, index, member, skill, damage };
    }), [steps, members, enabledBuffs, enabledSelfBuffIds, elapsed, windowedTeamEffects, calc.critMode, calc.enemy, reaction, data.statCatalog, activeGameId]);
```

- [ ] **Step 6: Show which self-buffs are auto vs manual in the "Conditional self-buffs" card**

In the same file's JSX, find the candidate-rendering block inside the "Conditional self-buffs" `Card`:
```typescript
                                            {candidates.map((b) => {
                                                const on = enabled.has(b.id);
                                                return (
                                                    <button
                                                        key={b.id}
                                                        onClick={() => toggleSelfBuff(m.character.id, b.id)}
                                                        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                        title={(b as { label?: string }).label ?? b.name}
                                                    >
                                                        {on ? '✓ ' : '+ '}{(b as { label?: string }).label ?? b.name} +{b.value}
                                                    </button>
                                                );
                                            })}
```
Replace with:
```typescript
                                            {candidates.map((b) => {
                                                const autoTrigger = (b as { autoTrigger?: unknown }).autoTrigger;
                                                if (autoTrigger) {
                                                    return (
                                                        <span
                                                            key={b.id}
                                                            className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-muted-foreground"
                                                            title="Auto-computed from rotation timing — active on whichever steps fall in its trigger window"
                                                        >
                                                            Auto: {(b as { label?: string }).label ?? b.name} +{b.value}
                                                        </span>
                                                    );
                                                }
                                                const on = enabled.has(b.id);
                                                return (
                                                    <button
                                                        key={b.id}
                                                        onClick={() => toggleSelfBuff(m.character.id, b.id)}
                                                        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                        title={(b as { label?: string }).label ?? b.name}
                                                    >
                                                        {on ? '✓ ' : '+ '}{(b as { label?: string }).label ?? b.name} +{b.value}
                                                    </button>
                                                );
                                            })}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Full test suite**

Run: `npx jest`
Expected: PASS except the known `event-bus.test.ts` flake.

- [ ] **Step 9: Manual verification via CDP**

Build a short rotation with a character known (from Task 10's report) to have an `autoTrigger` buff — confirm: before its trigger skill is cast, the buff shows as "Auto: ..." (not toggle-able) and does NOT affect early steps' damage; after the trigger step, confirm the buff DOES apply to steps within its window and stops applying once a step falls outside it (compare damage numbers before/within/after the window).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/lib/rotationEngine.ts tests/renderer/rotationEngine.test.ts src/renderer/src/screens/RotationScreen.tsx
git commit -m "feat: auto-resolve timed self/team buffs per rotation step"
```

---

## Phase 4: Enemy HP, Waves, Boss Mode

### Task 12: `WaveConfig` type + wave-overflow simulation engine

**Files:**
- Modify: `src/renderer/src/lib/rotationEngine.ts`
- Modify: `tests/renderer/rotationEngine.test.ts`

**Interfaces:**
- Produces: `WaveConfig { enemyId: string; hp?: number }`, `simulateWaves(stepDamages: number[], waves: WaveConfig[]): { waveIndexForStep: number[]; damageByWave: number[]; overflowDiscarded: number }`. Consumed by Task 13 (rotation types) and Task 14 (UI wiring).

- [ ] **Step 1: Write the failing test**

Add to `tests/renderer/rotationEngine.test.ts`:
```typescript
import { simulateWaves, type WaveConfig } from '../../src/renderer/src/lib/rotationEngine';

describe('simulateWaves', () => {
    it('single wave, no HP set — behaves like today, no tracking, all damage counted', () => {
        const waves: WaveConfig[] = [{ enemyId: 'boss-1' }];
        const result = simulateWaves([100, 200, 300], waves);
        expect(result.waveIndexForStep).toEqual([0, 0, 0]);
        expect(result.damageByWave).toEqual([600]);
        expect(result.overflowDiscarded).toBe(0);
    });

    it('single wave with HP, damage never exceeds it — no overflow', () => {
        const waves: WaveConfig[] = [{ enemyId: 'boss-1', hp: 1000 }];
        const result = simulateWaves([100, 200, 300], waves);
        expect(result.waveIndexForStep).toEqual([0, 0, 0]);
        expect(result.damageByWave).toEqual([600]);
        expect(result.overflowDiscarded).toBe(0);
    });

    it('two waves, a step overkills wave 1 — overflow discarded, wave advances', () => {
        const waves: WaveConfig[] = [{ enemyId: 'mob-1', hp: 150 }, { enemyId: 'mob-2', hp: 500 }];
        // step0: 100 dmg -> wave0 remaining 150-100=50. step1: 200 dmg > 50 remaining ->
        // wave0 gets only its last 50 (total wave0 = 100+50 = 150, exactly its own HP,
        // never more), overflow = 200-50 = 150 discarded, wave advances. step2: 300 dmg,
        // well within wave1's 500 HP -> wave1 gets the full 300.
        const result = simulateWaves([100, 200, 300], waves);
        expect(result.waveIndexForStep).toEqual([0, 0, 1]); // step1 is the killing blow, STILL attributed to wave 0 (the wave it killed); step2 is wave 1
        expect(result.overflowDiscarded).toBe(150);
        expect(result.damageByWave).toEqual([150, 300]); // wave0 capped at exactly its own HP (150); wave1 got step2's 300
        // Invariant worth re-checking on any future change to this function:
        // damageByWave.reduce(sum) + overflowDiscarded === stepDamages.reduce(sum).
        // Here: (150+300) + 150 === 100+200+300 === 600.
    });

    it('last wave exhausted — remaining steps still deal (uncapped) damage, just no further wave-transition tracking', () => {
        // Per this feature's spec (Section 4): "If no next wave exists, remaining
        // steps just deal full damage with no further tracking" — the damage still
        // COUNTS (toward the last wave's total, since there's no next wave to move
        // to), it just stops being capped/discarded against anything from here on.
        const waves: WaveConfig[] = [{ enemyId: 'mob-1', hp: 50 }];
        const result = simulateWaves([100, 200], waves);
        expect(result.waveIndexForStep).toEqual([0, 0]); // currentWave never advances past the last real wave
        expect(result.damageByWave).toEqual([250]); // 50 (capped portion of step0) + 200 (step1, uncapped post-exhaustion) = 250
        expect(result.overflowDiscarded).toBe(50); // ONLY step0's actual overkill (100-50); step1 has nothing left to overflow against, so all of it counts
        // Invariant: (250) + 50 === 100+200 === 300.
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/rotationEngine.test.ts -t "simulateWaves"`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/lib/rotationEngine.ts`:
```typescript
/** One enemy target in a rotation's Wave/Boss config. `hp` optional — when
 * unset, this wave never triggers an overflow/transition (damage just
 * applies with nothing to discard against), same as today's plain
 * single-target behavior. */
export interface WaveConfig {
    enemyId: string;
    hp?: number;
}

/**
 * Per-step-granularity overflow simulation (a stated, permanent
 * simplification — see this feature's spec, Section 4 — NOT per
 * individual hit within a multi-hit skill). Each step's total damage is
 * applied to the current wave's remaining HP; if it would go negative,
 * the excess is discarded and the next wave starts fresh. A step that
 * lands the killing blow is attributed to the wave IT KILLED, not the
 * next one — its own excess is what carries no further.
 */
export function simulateWaves(stepDamages: number[], waves: WaveConfig[]): { waveIndexForStep: number[]; damageByWave: number[]; overflowDiscarded: number } {
    const waveIndexForStep: number[] = [];
    const damageByWave: number[] = waves.map(() => 0);
    let overflowDiscarded = 0;
    let currentWave = 0;
    let remaining = waves[0]?.hp;

    for (const dmg of stepDamages) {
        waveIndexForStep.push(currentWave);
        if (remaining == null) {
            // No HP tracked for this wave — apply in full, nothing to discard.
            damageByWave[currentWave] += dmg;
            continue;
        }
        if (dmg <= remaining) {
            damageByWave[currentWave] += dmg;
            remaining -= dmg;
            continue;
        }
        // Overkill this step.
        damageByWave[currentWave] += remaining;
        const overflow = dmg - remaining;
        const nextWave = currentWave + 1;
        if (nextWave < waves.length) {
            currentWave = nextWave;
            remaining = waves[currentWave]?.hp;
            // The overflow does NOT carry to the next wave — it's simply lost, not re-applied.
            overflowDiscarded += overflow;
        } else {
            // No next wave — nothing left to discard into; the excess just never counts.
            overflowDiscarded += overflow;
            remaining = undefined; // no further tracking for any remaining steps
        }
    }
    return { waveIndexForStep, damageByWave, overflowDiscarded };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/rotationEngine.test.ts -t "simulateWaves"`
Expected: PASS, 4 tests. If the "two waves" case's exact numbers don't match your implementation's output on the first run, trust the test's inline arithmetic comments (they're worked out by hand above) over a first-pass implementation bug — recheck the implementation, not the test.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/lib/rotationEngine.ts tests/renderer/rotationEngine.test.ts
git commit -m "feat: add step-granularity wave/overflow simulation engine"
```

---

### Task 13: Extend `SavedRotation` with mode/waves

**Files:**
- Modify: `src/renderer/src/stores/rotationStore.ts`

**Interfaces:**
- Produces: `SavedRotation.mode?: 'boss' | 'waves'`, `SavedRotation.waves?: WaveConfig[]`.

- [ ] **Step 1: Update the type**

In `src/renderer/src/stores/rotationStore.ts`, add the import:
```typescript
import type { WaveConfig } from '../lib/rotationEngine';
```
Change `SavedRotation` (already modified by Task 4 to have `partyId`) to also include:
```typescript
export interface SavedRotation {
    id: string;
    name: string;
    partyId?: string;
    steps: RotationStepSpec[];
    enabledSelfBuffIds: Record<string, string[]>;
    /** 'boss' = single WaveConfig entry (HP optional). 'waves' = 2+ entries.
     * Undefined for a rotation saved before this field existed — treated as
     * 'boss' mode with no enemy config (falls back to the plain single-target
     * behavior every rotation had before this feature). */
    mode?: 'boss' | 'waves';
    waves?: WaveConfig[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors — purely additive optional fields.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/rotationStore.ts
git commit -m "feat: extend SavedRotation with Wave/Boss mode config"
```

---

### Task 14: Wave/Boss config UI + Results wiring

**Files:**
- Modify: `src/renderer/src/screens/RotationScreen.tsx`

**Interfaces:**
- Consumes: `WaveConfig`, `simulateWaves` (Task 12), `getEnemies` (existing, `src/renderer/src/data/enemies.ts`).

- [ ] **Step 1: Add local state and enemy-config UI**

In `RotationScreen.tsx`, add state near the other `useState` declarations:
```typescript
    const [mode, setMode] = useState<'boss' | 'waves'>('boss');
    const [waves, setWaves] = useState<WaveConfig[]>([{ enemyId: 'dummy' }]);
```
Add the import:
```typescript
import { getEnemies } from '../data/enemies';
import type { WaveConfig } from '@/lib/rotationEngine';
```
Add a new `Card` in the JSX, after the existing `RotationBuilder` card and before "Saved rotations":
```typescript
                    <Card>
                        <CardHeader><CardTitle>Enemy</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex gap-2">
                                <Button size="sm" variant={mode === 'boss' ? 'default' : 'secondary'} onClick={() => { setMode('boss'); setWaves((w) => w.slice(0, 1).length ? w.slice(0, 1) : [{ enemyId: 'dummy' }]); }}>Boss</Button>
                                <Button size="sm" variant={mode === 'waves' ? 'default' : 'secondary'} onClick={() => setMode('waves')}>Waves</Button>
                            </div>
                            {waves.map((w, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select
                                        value={w.enemyId}
                                        onChange={(e) => setWaves((ws) => ws.map((x, xi) => (xi === i ? { ...x, enemyId: e.target.value } : x)))}
                                        className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                                    >
                                        {getEnemies(activeGameId).map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                                    </select>
                                    <Input
                                        type="number"
                                        placeholder="HP (optional)"
                                        className="w-32"
                                        value={w.hp ?? ''}
                                        onChange={(e) => setWaves((ws) => ws.map((x, xi) => (xi === i ? { ...x, hp: e.target.value === '' ? undefined : Number(e.target.value) } : x)))}
                                    />
                                    {mode === 'waves' && waves.length > 1 && (
                                        <Button size="sm" variant="ghost" onClick={() => setWaves((ws) => ws.filter((_, xi) => xi !== i))}><Trash2 /></Button>
                                    )}
                                </div>
                            ))}
                            {mode === 'waves' && (
                                <Button size="sm" variant="secondary" onClick={() => setWaves((ws) => [...ws, { enemyId: 'dummy' }])}>Add wave</Button>
                            )}
                        </CardContent>
                    </Card>
```

- [ ] **Step 2: Wire `simulateWaves` into the Results computation**

Find where `totalDamage`/`totalDuration`/`dps` are computed:
```typescript
    const totalDamage = results.reduce((sum, r) => sum + r.damage, 0);
    const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
    const dps = totalDuration > 0 ? totalDamage / totalDuration : 0;
```
Add, right after:
```typescript
    const waveSim = useMemo(() => simulateWaves(results.map((r) => r.damage), waves), [results, waves]);
```

- [ ] **Step 3: Show per-wave subtotals and discarded overflow in the Results card**

In the "Results" `Card`, after the existing 3-stat grid (`Total DMG`/`DPS`/`Duration`), add:
```typescript
                                {mode === 'waves' && waveSim.damageByWave.length > 1 && (
                                    <div className="space-y-1.5">
                                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Per-wave damage</div>
                                        {waveSim.damageByWave.map((d, i) => (
                                            <div key={i} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
                                                <span className="text-foreground">Wave {i + 1} ({getEnemies(activeGameId).find((e) => e.id === waves[i]?.enemyId)?.name ?? waves[i]?.enemyId})</span>
                                                <span className="tabular-nums text-muted-foreground">{Math.round(d).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {waveSim.overflowDiscarded > 0 && (
                                    <div className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                                        {Math.round(waveSim.overflowDiscarded).toLocaleString()} damage discarded to overkill (per-step granularity — see this feature's spec for why)
                                    </div>
                                )}
```

- [ ] **Step 4: Persist mode/waves on save/load**

In `handleSave`, add `mode, waves` to the constructed `rotation` object:
```typescript
        const rotation: SavedRotation = { id, name, partyId: activePartyId, steps, enabledSelfBuffIds, mode, waves };
```
In `handleLoad`, restore them:
```typescript
    const handleLoad = (r: SavedRotation) => {
        setSteps(r.steps);
        setEnabledSelfBuffIds(r.enabledSelfBuffIds);
        setRotationName(r.name);
        setLoadedRotationId(r.id);
        setActivePartyId(r.partyId);
        setMode(r.mode ?? 'boss');
        setWaves(r.waves ?? [{ enemyId: 'dummy' }]);
    };
```
In `handleNewRotation`, reset them:
```typescript
    const handleNewRotation = () => {
        setSteps([]);
        setEnabledSelfBuffIds({});
        setRotationName('');
        setLoadedRotationId(null);
        setMode('boss');
        setWaves([{ enemyId: 'dummy' }]);
    };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Full test suite**

Run: `npx jest`
Expected: PASS except the known `event-bus.test.ts` flake.

- [ ] **Step 7: Manual verification via CDP**

Confirm: Boss mode (default) behaves exactly like the rotation builder did before this feature when HP is left blank. Switching to Waves mode, adding 2 waves with real HP values, and building a rotation whose damage exceeds the first wave's HP shows a 2-wave subtotal breakdown and a nonzero "discarded to overkill" figure. Saving and reloading a Waves-mode rotation preserves its wave config.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/screens/RotationScreen.tsx
git commit -m "feat: add Wave/Boss enemy config UI with per-wave subtotals"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (Party) → Tasks 1-4. Section 2 (Cooldown) → Tasks 5-7. Section 3 (Buff auto-apply) → Tasks 8-11. Section 4 (Waves/Boss) → Tasks 12-14. "Out of scope" items (cast-time, stance/stack/HP-gated automation, sub-hit overflow, GI, character HP) are simply not built by any task — confirmed no task attempts them.
- **Placeholder scan:** the two roster-wide data-sourcing tasks (6, 10) are dispatched-research tasks rather than hand-enumerated diffs — this is a deliberate, disclosed exception (explained inline in each task), not a vague "add appropriate data" placeholder: each has an exact source, exact field semantics, exact scope boundary, and a verification step. Every other task has complete, runnable code.
- **Type consistency:** `NamedParty` (Task 1) used identically in Tasks 2-4. `WaveConfig` (Task 12) used identically in Tasks 13-14. `autoTrigger: { skillIds: string[]; durationSeconds: number }` uses the exact same shape everywhere it appears (Tasks 8, 9, 10, 11) — verified no drift (e.g. no `triggerSkillIds` vs `skillIds` naming mismatch across tasks). `resolveNamedParty`'s signature (Task 2) matches its call site in Task 4 exactly (same param order/types). `cooldownWarningFor`/`isAutoBuffActiveAtStep`/`simulateWaves` signatures (Phase 2/3/4) match their call sites in the corresponding UI-wiring tasks.
