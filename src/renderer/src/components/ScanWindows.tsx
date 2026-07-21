import { useRef } from 'react';
import { ScanLine, Swords, Users, AlertTriangle } from 'lucide-react';
import { Badge, Button } from './ui';
import { useWindowStore } from '../stores/windowStore';
import { useGameStore } from '../stores/gameStore';
import { useGameData } from '../data/gameData';
import { useOwnedInventory, useInventoryStore } from '../stores/inventoryStore';
import { useLoadoutStore } from '../stores/loadoutStore';
import { computeEquippedGearIds, useCalcStore } from '../stores/calcStore';
import { AddGearWindow } from './InventoryWindows';
import { mapScannedEchoToGearDraft } from '@/lib/ocrMapping';
import type { ScannedEcho } from '@shared/types/ocr';
import type { GearEntry } from '@shared/types/game-bundle';

/** "Scan" button popup — pick what to scan. Only Echoes/Artifacts is wired
 * this pass (user: "let's start with the echoes"); Weapons and Characters
 * are shown so the intended shape is clear, disabled rather than half-built. */
export function ScanTypeWindow({ onPickEchoes }: { onPickEchoes: () => void }) {
    const closeWindow = useWindowStore((s) => s.closeWindow);
    // Guards against a double-click (or any other re-entrant call) firing
    // two captures from what the user experienced as one press — closing
    // the window is a state update, not an instant DOM removal, so a fast
    // second click can land on this same button before React unmounts it.
    const pickedRef = useRef(false);

    const pickEchoes = () => {
        if (pickedRef.current) return;
        pickedRef.current = true;
        closeWindow();
        onPickEchoes();
    };

    return (
        <div className="space-y-2">
            <button
                onClick={pickEchoes}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-surface-2"
            >
                <ScanLine className="h-5 w-5 flex-shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">Echoes / Artifacts</div>
                    <div className="text-xs text-muted-foreground">Scan a gear piece's stats.</div>
                </div>
            </button>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg border border-dashed border-border bg-card p-3 text-left opacity-50">
                <Swords className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">Weapons</div>
                    <div className="text-xs text-muted-foreground">Scan a weapon's stats.</div>
                </div>
                <Badge variant="muted">Coming soon</Badge>
            </button>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg border border-dashed border-border bg-card p-3 text-left opacity-50">
                <Users className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">Characters</div>
                    <div className="text-xs text-muted-foreground">Scan a character's level/rarity.</div>
                </div>
                <Badge variant="muted">Coming soon</Badge>
            </button>
        </div>
    );
}

// ── Confirm-and-add: review a scanned echo's stats before committing ────────

/** Wraps the unmodified `AddGearWindow` (pre-filled from the OCR draft) with
 * the screenshot thumbnail + raw text + any unresolved-field warning — a
 * scanner-only concern kept OUT of `AddGearWindow` itself, which the manual
 * add flow also uses unchanged. Step 1 of 2: after a successful add, if the
 * echo names who it's equipped to, `EquipScannedGearWindow` opens as its own
 * separate follow-up (not merged into this same step, so the user can decide
 * to skip either half independently). */
/** Step 2 of 2: if the echo's "Equipped by X" text resolved to a real
 * roster character, open the equip-prompt follow-up. No match -> skip
 * silently (no nagging on a misread name). Shared by the manual
 * confirm-and-add flow and the Scanner's auto-import path so both offer
 * the same follow-up after a gear piece lands in inventory. */
export function openEquipPromptIfMatched(echo: ScannedEcho, gearId: string, characters: Array<{ id: string; name: string }>): void {
    if (!echo.equippedByCharacterName) return;
    const match = characters.find((c) => c.name.trim().toLowerCase() === echo.equippedByCharacterName!.trim().toLowerCase());
    if (!match) return;
    useWindowStore.getState().openWindow(
        'Equip scanned gear',
        <EquipScannedGearWindow characterId={match.id} characterName={match.name} gearId={gearId} />,
    );
}

export function ConfirmScannedGearWindow({ echo, previewUrl, onDone }: { echo: ScannedEcho; previewUrl: string | null; onDone: () => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const draft = mapScannedEchoToGearDraft(echo, data.gearCatalog);

    const handleGearAdded = (gear: GearEntry) => {
        openEquipPromptIfMatched(echo, gear.id, data.characters);
    };

    return (
        <div className="max-h-[80vh] space-y-3 overflow-y-auto scrollbar-thin pr-1">
            {previewUrl && <img src={previewUrl} alt="Scanned screenshot" className="max-h-48 w-full rounded-md border border-border object-contain" />}
            <div className="text-sm text-muted-foreground">
                {echo.name}{echo.level != null ? ` +${echo.level}` : ''} · confidence {Math.round(echo.confidence)}%
                {draft.echoName && <span className="ml-1 text-foreground">· identified as {draft.echoName}</span>}
            </div>
            {draft.unresolved.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <div>
                        <div className="font-medium">Couldn't auto-match everything — double-check before adding:</div>
                        <ul className="mt-1 list-disc pl-4">
                            {draft.unresolved.map((u, i) => (
                                <li key={i} className={u.severity === 'minor' ? 'text-muted-foreground' : undefined}>{u.message}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            <details className="rounded-md border border-border bg-surface p-2.5">
                <summary className="cursor-pointer text-xs text-muted-foreground">Raw OCR text</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-foreground">{echo.rawText}</pre>
            </details>
            <AddGearWindow initial={draft} onGearAdded={handleGearAdded} onDone={onDone} />
        </div>
    );
}

// ── Two-step equip: offer to equip the just-added gear to its scanned owner ─

export function EquipScannedGearWindow({ characterId, characterName, gearId }: { characterId: string; characterName: string; gearId: string }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const owned = useOwnedInventory(gameId);
    const addCharacter = useInventoryStore((s) => s.addCharacter);
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const isOwned = owned.characters.some((c) => c.id === characterId);

    const equip = () => {
        if (!isOwned) addCharacter(gameId, characterId);
        const current = useLoadoutStore.getState().getLoadout(gameId, characterId);
        if (!current.gearIds.includes(gearId)) {
            // Routes through the same exclusivity rules as the Calculator's
            // own equip action (one-cost-4-echo, one-artifact-per-slot,
            // maxGear cap) — see computeEquippedGearIds's doc comment.
            const gearIds = computeEquippedGearIds(gameId, current.gearIds, gearId);
            const equipped = { ...current, gearIds };
            useLoadoutStore.getState().setLoadout(gameId, characterId, equipped);
            // loadoutStore is per-character persisted state; the Calculator
            // screen reads its OWN separate `calcStore.equipped` snapshot,
            // only re-hydrated from loadoutStore when a character is
            // (re)selected (`pickCharacter`). If this scanned character
            // happens to already be the active one, sync it directly too —
            // otherwise the Calculator would keep showing the build without
            // this piece until the user reselects the character.
            if (useCalcStore.getState().characterId === characterId) {
                useCalcStore.setState({ equipped });
            }
        }
        closeWindow();
    };

    return (
        <div className="space-y-3">
            <p className="text-sm text-foreground">
                This echo was equipped to <span className="font-medium">{characterName}</span> in-game.
                {!isOwned && <span className="text-muted-foreground"> They're not in your roster yet.</span>}
            </p>
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeWindow}>Skip</Button>
                <Button onClick={equip}>{isOwned ? `Equip to ${characterName}` : `Add ${characterName} and equip`}</Button>
            </div>
        </div>
    );
}
