import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button, Input, toast } from './ui';
import { useNamedLoadoutStore, type SavedLoadout } from '../stores/namedLoadoutStore';
import { useCalcStore } from '../stores/calcStore';
import type { CharacterLoadout } from '../stores/loadoutStore';

let seq = 0;
const nextLoadoutId = () => `ld-${Date.now()}-${++seq}`;

/** Save the character's CURRENT working loadout under a name, or apply/delete a
 * previously-saved one. Applying overwrites `calcStore.equipped` (and the
 * per-character `loadoutStore` entry it stays in sync with) the same way manually
 * equipping gear does. */
export function LoadoutLibraryWindow({ gameId, characterId, current }: { gameId: string; characterId: string; current: CharacterLoadout }) {
    const [name, setName] = useState('');
    const saved = useNamedLoadoutStore((s) => s.byGame[gameId]);
    const list = Object.values(saved ?? {}).filter((l) => l.characterId === characterId);
    const setEquipped = useCalcStore((s) => s.setEquipped);

    const saveCurrent = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        useNamedLoadoutStore.getState().save(gameId, { id: nextLoadoutId(), name: trimmed, characterId, loadout: current });
        toast.success(`Saved "${trimmed}"`);
        setName('');
    };
    const apply = (l: SavedLoadout) => {
        setEquipped(l.loadout);
        toast.success(`Applied "${l.name}"`);
    };
    const remove = (l: SavedLoadout) => {
        useNamedLoadoutStore.getState().remove(gameId, l.id);
        toast.success(`Deleted "${l.name}"`);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" placeholder="Loadout name…" value={name} onChange={(e) => setName(e.target.value)} />
                <Button size="sm" onClick={saveCurrent} disabled={name.trim().length === 0}><Save /> Save current as…</Button>
            </div>
            {list.length === 0 ? (
                <p className="text-xs text-muted-foreground">No saved loadouts for this character yet.</p>
            ) : (
                <div className="space-y-1.5">
                    {list.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
                            <span className="min-w-0 flex-1 truncate text-foreground">{l.name}</span>
                            <span className="text-xs text-muted-foreground">{l.loadout.gearIds.length} piece{l.loadout.gearIds.length === 1 ? '' : 's'}</span>
                            <Button size="sm" variant="secondary" onClick={() => apply(l)}>Apply</Button>
                            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(l)} aria-label="Delete"><Trash2 /></Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
