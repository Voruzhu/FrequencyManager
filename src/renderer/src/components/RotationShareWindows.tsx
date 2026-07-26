import { useState } from 'react';
import { Button, toast } from './ui';
import { decodeRotationShareCode } from '@/lib/rotationShare';
import { useRotationStore, type SavedRotation } from '../stores/rotationStore';
import { useWindowStore } from '../stores/windowStore';

let importSeq = 0;
const nextImportId = () => `rot-import-${Date.now()}-${++importSeq}`;

/** Paste box → decode → save directly (no inventory-collision risk like gear has — a
 * rotation is just steps/waves/mode, always safe to add as a new saved rotation). */
export function ImportRotationWindow({ gameId }: { gameId: string }) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const closeWindow = useWindowStore((s) => s.closeWindow);

    const doImport = () => {
        const result = decodeRotationShareCode(text);
        if (!result.ok) { setError(result.error); return; }
        const rotation: SavedRotation = { id: nextImportId(), ...result.payload };
        useRotationStore.getState().save(gameId, rotation);
        toast.success(`Imported "${rotation.name}"`);
        closeWindow();
    };

    return (
        <div className="space-y-3">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a rotation code here…"
                className="h-28 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground scrollbar-thin"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={doImport} disabled={!text.trim()}>Import rotation</Button>
        </div>
    );
}
