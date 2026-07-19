# OCR Scanner: duplicate echo detection

## Context

The OCR scanner (`ScannerScreen.tsx`) already flags scans with unresolved
identity fields ("needs review", via `hasBlockingIssues`) and lets the user
batch-commit clean scans to inventory ("Auto import from latest"). It has no
concept of duplicates: scanning the same physical echo twice (e.g. an
accidental double-scan, or re-scanning something already in inventory)
produces two separate, indistinguishable entries with no warning.

## What counts as a duplicate

Two echoes are duplicates only when **every stat matches exactly**: same
set, same cost/slot, same rarity, same main-stat (key + value), and every
sub-stat (including the fixed base stat) matches on both key and value.
Echo *name* is deliberately excluded from the comparison — many echoes
(fodder/world-mob drops) have no specific catalogued identity, and an exact
match across every stat value is what actually signals "this is the same
physical echo," not the name. Two echoes of the same set/slot with
different rolls are NOT duplicates — that's the normal, expected case for
gear optimization, and must never be flagged.

Given real stat rolls are continuous random values, an accidental exact
match across every single stat between two genuinely different echoes is
treated as practically impossible.

## Duplicate sources and precedence

A scan can match against two different pools:
- **Inventory** — an echo already saved via `useInventoryStore`.
- **An earlier scan** — another entry in the same scan-history session.

If a scan matches both, **inventory wins** (more actionable — it's already
real, saved gear) and the row/badge reports "already owned" rather than
"duplicate scan".

Within the scan-history list itself, "earlier" means chronologically first.
Since new scans prepend to the `results` array (index 0 = newest), "earlier
scans" for the entry at index `i` is `results.slice(i + 1)`. The
chronologically-first occurrence of a given exact echo always displays
clean; only later re-scans of the identical echo get flagged.

## Data model / logic changes (`src/renderer/src/lib/ocrMapping.ts`)

```ts
export type DuplicateSource = 'inventory' | 'scan';

function gearIdentityKey(g: GearEntry): string;
// setName | cost | slot | rarity | mainStat.key | mainStat.value | sorted subStats "key:value" list

export function findDuplicateSource(
    draft: GearDraft,
    catalog: GearCatalog,
    gearKind: 'echo' | 'artifact',
    inventoryGear: GearEntry[],
    earlierGear: GearEntry[],
): DuplicateSource | undefined;
```

`findDuplicateSource` builds a throwaway `GearEntry` via the existing
`buildGearEntryFromDraft` (already returns `null` for a draft with blocking
issues — a scan that needs manual review can't be identity-checked, and
this requires no special-casing beyond that existing null check). Checks
`inventoryGear` first, then `earlierGear`, both by `gearIdentityKey` equality.

## UI changes (`src/renderer/src/screens/ScannerScreen.tsx`)

**History list row**: alongside the existing "needs review" computation, add
a duplicate check (skipped for rows that are already `autoImported`, failed,
or already blocked — nothing meaningful to compare in those cases). Status
label gains two new values, `duplicate scan` and `already owned`, styled
with the same warning treatment as `needs review`. Priority when a row could
show more than one state: `failed` > `auto-imported` > `needs review`
(blocked) > `already owned` / `duplicate scan` > `ready to import`.

**Detail panel**: a new warning `Badge` ("Duplicate scan" or "Already
owned") next to the existing Auto-imported / Needs review / Cost badges.
The "Add to inventory" button remains enabled — the user can still commit
it deliberately; the badge is informational, not blocking, per the earlier
decision that manual add should warn, not block.

## Auto-import batch behavior

Today's loop processes `results` in array order (newest-first). This
changes to **oldest-first** (`[...eligible].reverse()`), so that when
duplicates exist, the chronologically-first scan imports and any later
identical scan is recognized as a duplicate and skipped — exactly one copy
ends up in inventory, never zero, never two.

Implementation: maintain a running `Set<string>` of identity keys, seeded
from current inventory's `gearIdentityKey` values. For each eligible scan
(oldest first): skip on a blocking issue (existing behavior, counted as
`skippedReview`); else build the `GearEntry`, check its key against the
running set — if present, skip as `skippedDuplicate` (do NOT add it to
inventory); otherwise import it and add its key to the running set.

The completion toast breaks the two skip reasons out separately, e.g.:
"Imported 3 echoes" / description: "2 need manual review, 1 skipped as
duplicate." (Omit either clause when its count is 0; omit the description
entirely when both are 0, matching today's existing toast shape.)

## Out of scope

- No UI to manually resolve/merge a flagged duplicate beyond the existing
  Delete button on a scan-history row and the unaffected manual Add flow.
- No fuzzy/near-duplicate detection (e.g. "close but not exact" rolls) —
  exact match only, per the design decision above.
- Genshin Impact artifacts: the same logic applies unconditionally (nothing
  here is WW-specific), though OCR scanning itself is WW-only today per
  existing scope.

## Testing

- `ocrMapping.test.ts`: `gearIdentityKey`/`findDuplicateSource` unit cases —
  exact match across set/slot/rarity/main/subs is a duplicate; a single
  differing sub-stat value is not; inventory match takes precedence over a
  scan match; a blocked draft never reports a duplicate.
- No dedicated `ScannerScreen` test file exists today (only
  `ocrMapping.test.ts`) — the reversed auto-import iteration order and new
  toast description shape are verified manually via the CDP technique
  already used for this screen this session, not a new test file.
