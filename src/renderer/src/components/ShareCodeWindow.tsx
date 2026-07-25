import { Button, toast } from './ui';

/** Generic "here's your code" window — a read-only textarea + copy button, reused by every share-code feature (builds, optimization targets). */
export function ShareCodeWindow({ code, description }: { code: string; description: string }) {
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{description}</p>
            <textarea
                readOnly
                value={code}
                onFocus={(e) => e.currentTarget.select()}
                className="h-28 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground scrollbar-thin"
            />
            <Button onClick={() => { void navigator.clipboard.writeText(code); toast.success('Copied'); }}>Copy code</Button>
        </div>
    );
}
