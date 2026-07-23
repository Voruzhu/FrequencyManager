import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button, Input, Badge, EmptyState } from './ui';
import { useWindowStore } from '../stores/windowStore';
import { useGameStore } from '../stores/gameStore';
import { useGameData } from '../data/gameData';
import { useNamedPartyStore } from '../stores/namedPartyStore';

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
    // Creating a party also selects it — the new party is what the user was
    // building this rotation around, not just an addition to a list they now
    // have to reopen and pick from separately.
    const openCreate = () => useWindowStore.getState().openWindow('Create Party', <CreatePartyWindow onCreated={onSelect} />);

    return (
        <div className="space-y-3">
            {parties.length === 0 ? (
                <EmptyState icon={Users} title="No parties yet" description="Create a party to sequence its members' turns in the Rotation Builder." />
            ) : (
                <ul className="max-h-[70vh] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
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
                                <Badge variant="muted">{p.memberCharacterIds.length}/{data.partyTeammates + 1}</Badge>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <Button className="w-full" variant="secondary" onClick={openCreate}><Plus /> Create Party</Button>
        </div>
    );
}

/** Self-contained party creation form — name + up to the active game's real
 * party size (`data.partyTeammates + 1` — WuWa 3, Genshin 4), all in one
 * window (no cross-window state lifting: `useWindowStore` only holds ONE
 * window's content at a time, so a nested picker would replace this form
 * and lose its state; an inline search list avoids that entirely). */
export function CreatePartyWindow({ onCreated }: { onCreated?: (partyId: string) => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const [name, setName] = useState('');
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [query, setQuery] = useState('');

    const nameOf = (id: string) => data.characters.find((c) => c.id === id)?.name ?? id;
    // Real per-game party size (WuWa: 3 total, Genshin: 4) — was hardcoded to
    // 3 everywhere in this window, silently capping Genshin a member short.
    const maxMembers = data.partyTeammates + 1;
    const q = query.trim().toLowerCase();
    const results = q
        ? data.characters.filter((c) => c.name.toLowerCase().includes(q) && !memberIds.includes(c.id)).slice(0, 8)
        : [];

    const addMember = (id: string) => { if (memberIds.length < maxMembers) { setMemberIds((ids) => [...ids, id]); setQuery(''); } };
    const removeMember = (id: string) => setMemberIds((ids) => ids.filter((x) => x !== id));

    const save = () => {
        const trimmed = name.trim();
        if (!trimmed || memberIds.length === 0) return;
        const id = nextPartyId();
        useNamedPartyStore.getState().save(gameId, { id, name: trimmed, memberCharacterIds: memberIds, disabled: [] });
        onCreated?.(id);
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

            {memberIds.length < maxMembers && (
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
