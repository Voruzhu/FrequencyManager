# OCR Scanner Duplicate Echo Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an OCR scan of an echo exactly matches an already-owned inventory item or an earlier scan in the same session, flag it as a duplicate in the scan history list and detail panel, and have "Auto import from latest" skip it instead of adding a second copy.

**Architecture:** A pure comparison function (`gearIdentityKey`/`findDuplicateSource`) added to `ocrMapping.ts` builds a canonical identity string (set/slot/rarity/main-stat/all-sub-stats, name excluded) from a `GearEntry` and checks it against two pools: current inventory and earlier scans in the same history list. `ScannerScreen.tsx` wires this into the existing per-row status computation, the detail panel's badge row, and the auto-import batch loop (which changes from newest-first to oldest-first iteration so the chronologically-first copy of an exact duplicate is the one that survives).

**Tech Stack:** TypeScript, React, Zustand (`useInventoryStore`/`useOwnedInventory`), Jest (`testEnvironment: 'node'` — no component/DOM tests in this repo; UI changes are verified manually via CDP, matching this project's existing convention).

## Global Constraints

- Duplicate = exact match on set name, cost/slot, rarity, main-stat (key + value), and every sub-stat including the fixed base stat (key + value) — echo *name* is excluded from the comparison. (Spec: "What counts as a duplicate")
- Inventory match takes precedence over a scan-list match when both apply. (Spec: "Duplicate sources and precedence")
- Within scan history, the chronologically-first occurrence of an exact duplicate never shows a duplicate badge; only later re-scans of the identical echo do. (Spec: same section)
- The manual "Add to inventory" button stays enabled on a flagged duplicate — this is a warning, never a block. (Spec: "UI changes")
- Auto-import must end up with exactly one copy of an exact-duplicate cluster in inventory, never zero, never two. (Spec: "Auto-import batch behavior")
- No fuzzy/near-duplicate detection — exact match only. (Spec: "Out of scope")

---

### Task 1: `gearIdentityKey` + `findDuplicateSource` in `ocrMapping.ts`

**Files:**
- Modify: `src/renderer/src/lib/ocrMapping.ts` (add after `hasBlockingIssues`, before `buildGearEntryFromDraft` — both new functions are used by `buildGearEntryFromDraft`'s caller pattern, but `findDuplicateSource` itself calls `buildGearEntryFromDraft`, so it must come after that function is defined; place `gearIdentityKey` right after `hasBlockingIssues`, and `findDuplicateSource` at the end of the file, after `buildGearEntryFromDraft`)
- Test: `tests/renderer/ocrMapping.test.ts`

**Interfaces:**
- Consumes: `GearEntry`, `GearCatalog` (already imported in `ocrMapping.ts`), `GearDraft`, `buildGearEntryFromDraft` (already defined in the same file)
- Produces:
  - `export type DuplicateSource = 'inventory' | 'scan';`
  - `export function gearIdentityKey(g: GearEntry): string`
  - `export function findDuplicateSource(draft: GearDraft, catalog: GearCatalog, gearKind: 'echo' | 'artifact', inventoryGear: GearEntry[], earlierGear: GearEntry[]): DuplicateSource | undefined`
  - These are consumed by Task 2 (`ScannerScreen.tsx`).

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block at the end of `tests/renderer/ocrMapping.test.ts` (after the existing content — check the last line of the file first with `tail -n 5 tests/renderer/ocrMapping.test.ts` to confirm where the file currently ends before appending):

```typescript
import { gearIdentityKey, findDuplicateSource } from '../../src/renderer/src/lib/ocrMapping';

describe('gearIdentityKey / findDuplicateSource', () => {
    const baseEcho: ScannedEcho = {
        id: 'echo-1',
        name: 'Hecate',
        cost: 4,
        level: 25,
        mainStat: { type: 'CRIT RATE%', value: 22.0 },
        subStats: [
            { type: 'ATK', value: 150 },
            { type: 'ATK%', value: 7.9 },
            { type: 'BASIC ATTACK DMG BONUS%', value: 10.1 },
            { type: 'DEF', value: 50 },
            { type: 'CRIT RATE%', value: 7.5 },
            { type: 'HP%', value: 7.9 },
        ],
        setName: 'Void Thunder',
        equippedByCharacterName: 'Yinlin',
        confidence: 91,
        rawText: '...',
        scannedAt: Date.now(),
    };

    function buildEntry(echo: ScannedEcho) {
        const draft = mapScannedEchoToGearDraft(echo, WW_GEAR_CATALOG);
        const entry = buildGearEntryFromDraft(draft, WW_GEAR_CATALOG, 'echo', () => 'test-id');
        if (!entry) throw new Error('expected a buildable entry in this fixture');
        return entry;
    }

    it('gearIdentityKey ignores name — two echoes with the same stats but different names produce the same key', () => {
        const a = buildEntry(baseEcho);
        const b = buildEntry({ ...baseEcho, name: 'A Different Fodder Echo' });
        expect(gearIdentityKey(a)).toBe(gearIdentityKey(b));
    });

    it('gearIdentityKey differs when a single sub-stat value differs', () => {
        const a = buildEntry(baseEcho);
        const b = buildEntry({
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'CRIT RATE%' && s.value === 7.5 ? { ...s, value: 8.6 } : s)),
        });
        expect(gearIdentityKey(a)).not.toBe(gearIdentityKey(b));
    });

    it('findDuplicateSource returns undefined when nothing matches', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [], [])).toBeUndefined();
    });

    it('findDuplicateSource returns "inventory" when an inventory entry has an identical identity key', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const inventoryEntry = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [inventoryEntry], [])).toBe('inventory');
    });

    it('findDuplicateSource returns "scan" when an earlier scan has an identical identity key and inventory does not', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const earlierScanEntry = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [], [earlierScanEntry])).toBe('scan');
    });

    it('findDuplicateSource prefers "inventory" over "scan" when both match', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const match = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [match], [match])).toBe('inventory');
    });

    it('findDuplicateSource returns undefined for a draft with blocking issues (no set resolved)', () => {
        const unresolvableEcho: ScannedEcho = { ...baseEcho, name: 'Totally Unknown Fodder Name', setName: undefined };
        const draft = mapScannedEchoToGearDraft(unresolvableEcho, WW_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(true);
        const inventoryEntry = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [inventoryEntry], [])).toBeUndefined();
    });

    it('a different roll of the same set/slot/main is NOT a duplicate', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const differentRollEcho: ScannedEcho = {
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'ATK%' ? { ...s, value: 6.4 } : s)),
        };
        const differentRollEntry = buildEntry(differentRollEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [differentRollEntry], [])).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/renderer/ocrMapping.test.ts -t "gearIdentityKey"`
Expected: FAIL — `gearIdentityKey` and `findDuplicateSource` are not exported from `ocrMapping.ts` (TypeScript compile error / `undefined is not a function`).

- [ ] **Step 3: Implement `gearIdentityKey`**

In `src/renderer/src/lib/ocrMapping.ts`, immediately after the `hasBlockingIssues` function (after its closing `}`), add:

```typescript
/**
 * Canonical identity string for exact-duplicate comparison: set, cost/slot,
 * rarity, main-stat (key+value), and every sub-stat including the fixed
 * base stat (key+value, sorted by key so ordering never affects equality).
 * Echo NAME is deliberately excluded — many echoes (fodder/world-mob drops)
 * have no specific catalogued identity at all, and an exact match across
 * every stat VALUE is what actually signals "this is the same physical
 * echo" (random rolls make an accidental exact match across every stat
 * between two genuinely different echoes practically impossible), not the
 * name.
 */
export function gearIdentityKey(g: GearEntry): string {
    const subs = [...g.subStats]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((s) => `${s.key}:${s.value}`)
        .join(',');
    return [g.setName, g.cost ?? '', g.slot ?? '', g.rarity, g.mainStat.key, g.mainStat.value, subs].join('|');
}
```

- [ ] **Step 4: Run tests to verify the `gearIdentityKey` tests pass, `findDuplicateSource` tests still fail**

Run: `npx jest tests/renderer/ocrMapping.test.ts -t "gearIdentityKey"`
Expected: the 2 `gearIdentityKey` tests PASS; the `findDuplicateSource` tests still FAIL (not yet defined).

- [ ] **Step 5: Implement `findDuplicateSource`**

At the very end of `src/renderer/src/lib/ocrMapping.ts` (after `buildGearEntryFromDraft`'s closing `}`), add:

```typescript
export type DuplicateSource = 'inventory' | 'scan';

/**
 * Where (if anywhere) an exact duplicate of this draft already exists.
 * 'inventory' takes precedence over 'scan' when both match — it's already
 * real, saved gear, which is more actionable to know about than a same-
 * session re-scan. Returns undefined when the draft can't build a complete
 * entry (`buildGearEntryFromDraft` returns null for a draft with blocking
 * issues) — a scan that needs manual review can't be identity-checked.
 */
export function findDuplicateSource(
    draft: GearDraft,
    catalog: GearCatalog,
    gearKind: 'echo' | 'artifact',
    inventoryGear: GearEntry[],
    earlierGear: GearEntry[],
): DuplicateSource | undefined {
    const candidate = buildGearEntryFromDraft(draft, catalog, gearKind, () => 'dup-check');
    if (!candidate) return undefined;
    const key = gearIdentityKey(candidate);
    if (inventoryGear.some((g) => gearIdentityKey(g) === key)) return 'inventory';
    if (earlierGear.some((g) => gearIdentityKey(g) === key)) return 'scan';
    return undefined;
}
```

- [ ] **Step 6: Run tests to verify everything passes**

Run: `npx jest tests/renderer/ocrMapping.test.ts`
Expected: PASS, all tests including the new `gearIdentityKey / findDuplicateSource` describe block (9 new tests: 2 for `gearIdentityKey`, 7 for `findDuplicateSource`).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/lib/ocrMapping.ts tests/renderer/ocrMapping.test.ts
git commit -m "feat: add gearIdentityKey/findDuplicateSource for OCR duplicate-echo detection"
```

---

### Task 2: Scan history list — duplicate status label and icon

**Files:**
- Modify: `src/renderer/src/screens/ScannerScreen.tsx`

**Interfaces:**
- Consumes: `findDuplicateSource`, `DuplicateSource` (from Task 1's `@/lib/ocrMapping`), `useOwnedInventory` (from `../stores/inventoryStore` — already used elsewhere in this codebase, see `src/renderer/src/screens/InventoryScreen.tsx:22`, returns `{ characters, weapons, gear: GearEntry[] }`)
- Produces: no new exports — this task only changes what's rendered inside `ScannerScreen`'s history list `<li>` loop (lines ~304-337 today).

- [ ] **Step 1: Add the inventory-gear selector and import the new functions**

In `src/renderer/src/screens/ScannerScreen.tsx`, change the import block:

```typescript
import { useInventoryStore } from '../stores/inventoryStore';
```

to:

```typescript
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
```

and change:

```typescript
import { mapScannedEchoToGearDraft, buildGearEntryFromDraft, hasBlockingIssues } from '@/lib/ocrMapping';
```

to:

```typescript
import { mapScannedEchoToGearDraft, buildGearEntryFromDraft, hasBlockingIssues, findDuplicateSource, type DuplicateSource } from '@/lib/ocrMapping';
```

Then, inside the `ScannerScreen` component body, right after the existing line `const addGear = useInventoryStore((s) => s.addGear);`, add:

```typescript
    const inventoryGear = useOwnedInventory(gameId).gear;
```

- [ ] **Step 2: Add a helper to compute a scan's duplicate source given its position in `results`**

Directly below the `inventoryGear` line just added in Step 1 (i.e. still near the top of the component, well before the `return (` statement — this placement matters: Task 3 also reads this helper from the detail-panel section further down in the same component, so it must be declared before both use sites), add:

```typescript
    // `results` is newest-first (new scans prepend) — so "earlier scans" for
    // the entry at `index` are everything AFTER it in the array. Only scans
    // that are successful, not already imported, and not themselves blocked
    // are worth comparing against (an imported scan's stats already live in
    // `inventoryGear`; a blocked scan can't build a comparable GearEntry).
    const duplicateSourceFor = (index: number): DuplicateSource | undefined => {
        const r = results[index];
        if (r.status !== 'success' || !r.echo || r.autoImported) return undefined;
        const draft = mapScannedEchoToGearDraft(r.echo, data.gearCatalog);
        if (hasBlockingIssues(draft)) return undefined;
        const earlierGear = results
            .slice(index + 1)
            .filter((e) => e.status === 'success' && e.echo && !e.autoImported)
            .map((e) => {
                const d = mapScannedEchoToGearDraft(e.echo!, data.gearCatalog);
                return hasBlockingIssues(d) ? null : buildGearEntryFromDraft(d, data.gearCatalog, data.gearKind, () => 'dup-check');
            })
            .filter((g): g is NonNullable<typeof g> => g != null);
        return findDuplicateSource(draft, data.gearCatalog, data.gearKind, inventoryGear, earlierGear);
    };
```

- [ ] **Step 3: Use it in the history list row rendering**

In the `results.map((r) => { ... })` block (around line 304), the current code is:

```typescript
                                    {results.map((r) => {
                                        // For anything not yet auto-imported, check the SAME condition
                                        // "Auto import from latest" gates on — so the list shows, at a
                                        // glance, which entries actually NEED a manual look (a major
                                        // issue) versus which are just waiting for the next auto-import
                                        // click (no issue, will succeed automatically).
                                        const blocked = r.status === 'success' && r.echo && !r.autoImported
                                            && hasBlockingIssues(mapScannedEchoToGearDraft(r.echo, data.gearCatalog));
                                        const statusLabel = r.status === 'failed' ? 'failed'
                                            : r.autoImported ? 'auto-imported'
                                                : blocked ? 'needs review' : 'ready to import';
```

Replace it with:

```typescript
                                    {results.map((r, index) => {
                                        // For anything not yet auto-imported, check the SAME condition
                                        // "Auto import from latest" gates on — so the list shows, at a
                                        // glance, which entries actually NEED a manual look (a major
                                        // issue) versus which are just waiting for the next auto-import
                                        // click (no issue, will succeed automatically).
                                        const blocked = r.status === 'success' && r.echo && !r.autoImported
                                            && hasBlockingIssues(mapScannedEchoToGearDraft(r.echo, data.gearCatalog));
                                        const duplicateSource = blocked ? undefined : duplicateSourceFor(index);
                                        const statusLabel = r.status === 'failed' ? 'failed'
                                            : r.autoImported ? 'auto-imported'
                                                : blocked ? 'needs review'
                                                    : duplicateSource === 'inventory' ? 'already owned'
                                                        : duplicateSource === 'scan' ? 'duplicate scan'
                                                            : 'ready to import';
```

Then, still inside the same `.map`, the icon line currently reads:

```typescript
                                                    {r.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />}
                                                    {blocked && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning" />}
```

Replace it with:

```typescript
                                                    {r.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />}
                                                    {(blocked || duplicateSource) && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning" />}
```

And the status-line class currently reads:

```typescript
                                                        <div className={cn('truncate text-xs', blocked ? 'text-warning' : 'text-muted-foreground')}>{fmt(r.timestamp)} · {statusLabel}</div>
```

Replace it with:

```typescript
                                                        <div className={cn('truncate text-xs', (blocked || duplicateSource) ? 'text-warning' : 'text-muted-foreground')}>{fmt(r.timestamp)} · {statusLabel}</div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual verification via CDP**

Follow the CDP verification technique already established for this screen this session (screenshot/DOM-inspect the running Electron app). Concretely:
1. Launch the app, open the OCR Scanner screen.
2. Scan (or simulate via the file-picker "Browse…" path) the same saved screenshot twice.
3. Confirm the first history entry shows "ready to import" and the second shows "duplicate scan" with a warning-colored triangle icon.
4. Manually add the first scan to inventory, then scan the same screenshot a third time — confirm the new scan shows "already owned" (not "duplicate scan"), since it now matches inventory rather than only an earlier scan.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/ScannerScreen.tsx
git commit -m "feat: flag duplicate echoes in OCR scan history list"
```

---

### Task 3: Detail panel — duplicate badge

**Files:**
- Modify: `src/renderer/src/screens/ScannerScreen.tsx`

**Interfaces:**
- Consumes: `duplicateSourceFor` (from Task 2, defined in the same component — needs to be called with the selected entry's index in `results`, not just the entry itself, since the helper is index-based)
- Produces: no new exports.

- [ ] **Step 1: Compute the selected entry's duplicate source**

In `src/renderer/src/screens/ScannerScreen.tsx`, find the line (around where `selected` is derived, near the top of the component body):

```typescript
    const selected = results.find((r) => r.id === selectedId) ?? null;
```

Immediately after it, add:

```typescript
    const selectedIndex = results.findIndex((r) => r.id === selectedId);
    const selectedDuplicateSource = selectedIndex >= 0 ? duplicateSourceFor(selectedIndex) : undefined;
```

Note: this relies on `duplicateSourceFor` already being in scope — Task 2 Step 2 places it directly after `inventoryGear`, which (in the original file) comes before the `const selected = results.find(...)` line this step modifies, so no reordering is needed here.

- [ ] **Step 2: Render the badge in the detail panel**

Find this block (around line 372-381 today):

```typescript
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-foreground">{selected.echo.name}{selected.echo.level != null ? ` +${selected.echo.level}` : ''}</span>
                                                <div className="flex gap-1">
                                                    {selected.autoImported && <Badge variant="secondary">Auto-imported</Badge>}
                                                    {!selected.autoImported && hasBlockingIssues(mapScannedEchoToGearDraft(selected.echo, data.gearCatalog)) && (
                                                        <Badge variant="warning">Needs review</Badge>
                                                    )}
                                                    {selected.echo.cost > 0 && <Badge variant="secondary">Cost {selected.echo.cost}</Badge>}
                                                </div>
                                            </div>
```

Replace it with:

```typescript
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-foreground">{selected.echo.name}{selected.echo.level != null ? ` +${selected.echo.level}` : ''}</span>
                                                <div className="flex gap-1">
                                                    {selected.autoImported && <Badge variant="secondary">Auto-imported</Badge>}
                                                    {!selected.autoImported && hasBlockingIssues(mapScannedEchoToGearDraft(selected.echo, data.gearCatalog)) && (
                                                        <Badge variant="warning">Needs review</Badge>
                                                    )}
                                                    {selectedDuplicateSource === 'inventory' && <Badge variant="warning">Already owned</Badge>}
                                                    {selectedDuplicateSource === 'scan' && <Badge variant="warning">Duplicate scan</Badge>}
                                                    {selected.echo.cost > 0 && <Badge variant="secondary">Cost {selected.echo.cost}</Badge>}
                                                </div>
                                            </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification via CDP**

Using the same double-scan setup as Task 2 Step 5: select the second (duplicate) history entry and confirm the detail panel shows a "Duplicate scan" badge next to the Cost badge, and that the "Add to inventory" button below it is still enabled (not disabled/greyed out).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/screens/ScannerScreen.tsx
git commit -m "feat: show duplicate-echo badge in OCR scan detail panel"
```

---

### Task 4: Auto-import batch — skip duplicates, oldest-first order, toast breakdown

**Files:**
- Modify: `src/renderer/src/screens/ScannerScreen.tsx`

**Interfaces:**
- Consumes: `gearIdentityKey` (from Task 1's `@/lib/ocrMapping` — add to the existing import), `inventoryGear` (from Task 2, already selected in this component)
- Produces: no new exports — changes `autoImportFromLatest`'s internal behavior and its completion toast only.

- [ ] **Step 1: Add `gearIdentityKey` to the import**

Change:

```typescript
import { mapScannedEchoToGearDraft, buildGearEntryFromDraft, hasBlockingIssues, findDuplicateSource, type DuplicateSource } from '@/lib/ocrMapping';
```

to:

```typescript
import { mapScannedEchoToGearDraft, buildGearEntryFromDraft, hasBlockingIssues, findDuplicateSource, gearIdentityKey, type DuplicateSource } from '@/lib/ocrMapping';
```

- [ ] **Step 2: Replace `autoImportFromLatest`**

The current implementation:

```typescript
    const autoImportFromLatest = () => {
        const eligible = results.filter((r) => r.status === 'success' && r.echo && !r.autoImported);
        if (eligible.length === 0) {
            toast.info('Nothing to import', { description: 'No new scans since the last auto-import.' });
            return;
        }
        const importedIds = new Set<string>();
        let skipped = 0;
        for (const r of eligible) {
            const draft = mapScannedEchoToGearDraft(r.echo!, data.gearCatalog);
            if (hasBlockingIssues(draft)) { skipped++; continue; }
            const gear = buildGearEntryFromDraft(draft, data.gearCatalog, data.gearKind, () => newGearId(gameId));
            if (!gear) { skipped++; continue; }
            addGear(gameId, gear);
            importedIds.add(r.id);
        }
        if (importedIds.size > 0) {
            setResults((rs) => rs.map((r) => (importedIds.has(r.id) ? { ...r, autoImported: true } : r)));
            toast.success(`Imported ${importedIds.size} echo${importedIds.size === 1 ? '' : 's'}`, skipped > 0 ? { description: `${skipped} skipped — needs manual review` } : undefined);
        } else {
            toast.info('Nothing imported', { description: `${skipped} scan${skipped === 1 ? '' : 's'} need manual review` });
        }
    };
```

Replace the whole function with:

```typescript
    /** "Auto import from latest" button: batch-processes every successful
     * scan in history that hasn't already been auto-imported. Eligibility
     * is loose by design (user's spec) — a 'minor' issue (an auto-corrected
     * decimal point, a confidently-inferred cost) still imports; only a
     * 'major' one (an unresolved name, an out-of-bounds value with no
     * correction) blocks it, same bar as `hasBlockingIssues`. An exact
     * duplicate (of inventory OR of another eligible scan) is skipped too —
     * processed OLDEST FIRST (reversed from `results`' newest-first array
     * order) so that when duplicates exist, the chronologically-first one
     * imports and later identical scans are recognized as duplicates and
     * skipped, leaving exactly one copy in inventory. Skips the per-item
     * equip-prompt follow-up during a batch run — stacking several of those
     * windows at once would be more confusing than helpful, so a scan
     * naming an equipped owner is left to be equipped manually. */
    const autoImportFromLatest = () => {
        const eligible = results.filter((r) => r.status === 'success' && r.echo && !r.autoImported);
        if (eligible.length === 0) {
            toast.info('Nothing to import', { description: 'No new scans since the last auto-import.' });
            return;
        }
        const seenKeys = new Set(inventoryGear.map((g) => gearIdentityKey(g)));
        const importedIds = new Set<string>();
        let skippedReview = 0;
        let skippedDuplicate = 0;
        for (const r of [...eligible].reverse()) { // oldest first
            const draft = mapScannedEchoToGearDraft(r.echo!, data.gearCatalog);
            if (hasBlockingIssues(draft)) { skippedReview++; continue; }
            const gear = buildGearEntryFromDraft(draft, data.gearCatalog, data.gearKind, () => newGearId(gameId));
            if (!gear) { skippedReview++; continue; }
            const key = gearIdentityKey(gear);
            if (seenKeys.has(key)) { skippedDuplicate++; continue; }
            addGear(gameId, gear);
            seenKeys.add(key);
            importedIds.add(r.id);
        }
        if (importedIds.size > 0) {
            setResults((rs) => rs.map((r) => (importedIds.has(r.id) ? { ...r, autoImported: true } : r)));
            const parts: string[] = [];
            if (skippedReview > 0) parts.push(`${skippedReview} need${skippedReview === 1 ? 's' : ''} manual review`);
            if (skippedDuplicate > 0) parts.push(`${skippedDuplicate} skipped as duplicate${skippedDuplicate === 1 ? '' : 's'}`);
            toast.success(`Imported ${importedIds.size} echo${importedIds.size === 1 ? '' : 's'}`, parts.length > 0 ? { description: parts.join(', ') } : undefined);
        } else {
            const parts: string[] = [];
            if (skippedReview > 0) parts.push(`${skippedReview} need${skippedReview === 1 ? 's' : ''} manual review`);
            if (skippedDuplicate > 0) parts.push(`${skippedDuplicate} skipped as duplicate${skippedDuplicate === 1 ? '' : 's'}`);
            toast.info('Nothing imported', { description: parts.join(', ') });
        }
    };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification via CDP**

Using the same double-scan setup as Task 2 Step 5 (two history entries from the identical screenshot, neither yet imported): click "Auto import from latest". Confirm:
1. Exactly one new item appears in Inventory (not two).
2. Both scan-history entries end up marked, but only the OLDEST of the pair (the one lower in the list, since newest is at the top) shows "Auto-imported" — re-select the newest (duplicate) one and confirm it now shows "already owned" against the freshly-added inventory item, still with its "Add to inventory" button enabled (not auto-imported itself, since it was skipped as a duplicate).
3. The success toast reads "Imported 1 echo" with a description mentioning "1 skipped as duplicate" (assuming no other unrelated scans are present in history at the time).

- [ ] **Step 5: Full verification pass**

Run, in order:
```bash
npx jest
npx tsc --noEmit -p src/renderer/tsconfig.json
npm run build:main
npm run build:renderer
```
Expected: `npx jest` passes except the one pre-existing, unrelated `tests/core/event-bus.test.ts` flake (documented elsewhere in this project as a known flake, not a regression); both typecheck/build commands complete with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/ScannerScreen.tsx
git commit -m "feat: skip exact-duplicate echoes during OCR auto-import"
```

---

## Self-Review Notes

- **Spec coverage:** "What counts as a duplicate" → Task 1 (`gearIdentityKey`). "Duplicate sources and precedence" → Task 1 (`findDuplicateSource`'s inventory-then-scan check order) + Task 2 (`earlierGear` built from `results.slice(index + 1)`, matching the newest-first array order note in the spec). "UI changes" (history list) → Task 2. "UI changes" (detail panel) → Task 3. "Auto-import batch behavior" → Task 4. "Out of scope" items are simply not built by any task. "Testing" section → Task 1's test suite (unit) + each UI task's manual CDP verification step.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code; no "similar to Task N" references.
- **Type consistency:** `DuplicateSource` used consistently as `'inventory' | 'scan'` across Tasks 1-3; `findDuplicateSource`'s parameter order `(draft, catalog, gearKind, inventoryGear, earlierGear)` matches every call site in Tasks 2 and 4 (Task 4 doesn't call `findDuplicateSource` directly — it uses `gearIdentityKey` + a `Set` directly, which is a deliberate difference from Task 2's per-row check, documented inline in Task 4 Step 2's code comment).
