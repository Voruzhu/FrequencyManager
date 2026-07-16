import * as React from 'react';
import { User, Swords, Gem, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Item categories the app displays. Real art will replace these placeholders. */
export type ItemKind = 'character' | 'weapon' | 'echo' | 'artifact';

const KIND_ICON: Record<ItemKind, LucideIcon> = {
    character: User,
    weapon: Swords,
    echo: Gem,
    artifact: Sparkles,
};

// Standard gacha rarity-quality colors: 5★ gold, 4★ purple (Epic), 3★ blue,
// 2★ green. 1★ has no entry — falls back to the plain default border.
const RARITY_RING: Record<number, string> = {
    5: 'ring-2 ring-warning/60',
    4: 'ring-2 ring-purple-500/60',
    3: 'ring-2 ring-primary/50',
    2: 'ring-1 ring-success/40',
};

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
};

const BADGE_SIZE: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'h-3.5 w-3.5',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
};

export interface ItemIconProps extends React.HTMLAttributes<HTMLDivElement> {
    kind: ItemKind;
    size?: 'sm' | 'md' | 'lg';
    rarity?: number;
    /** Image URL (e.g. `fm-icon://…`). Falls back to the kind placeholder if it fails to load. */
    src?: string;
    /**
     * Small overlay image in the bottom-right corner (e.g. an echo's Set icon,
     * layered on top of the echo's own icon — matches the in-game convention
     * of showing the specific item with its category as a badge, not the
     * other way around). Omitted when there's nothing meaningful to badge.
     */
    badgeSrc?: string;
}

/**
 * Art tile for a game item (character / weapon / echo / artifact). Renders the
 * `src` image when present, falling back to a kind placeholder if there is no
 * src OR the image fails to load — so call sites can pass icon URLs today and
 * the real art appears whenever the files are added.
 */
export function ItemIcon({ kind, size = 'md', rarity, src, badgeSrc, className, ...props }: ItemIconProps) {
    const Icon = KIND_ICON[kind];
    const [failed, setFailed] = React.useState(false);
    const [badgeFailed, setBadgeFailed] = React.useState(false);
    React.useEffect(() => { setFailed(false); }, [src]);
    React.useEffect(() => { setBadgeFailed(false); }, [badgeSrc]);
    const showImg = src && !failed;
    const showBadge = badgeSrc && !badgeFailed;
    return (
        <div
            className={cn(
                'relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 text-muted-foreground',
                SIZE[size],
                rarity ? RARITY_RING[rarity] : '',
                className
            )}
            {...props}
        >
            {showImg ? (
                <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
            ) : (
                <Icon className="h-1/2 w-1/2" />
            )}
            {showBadge && (
                <img
                    src={badgeSrc}
                    alt=""
                    className={cn('absolute bottom-0 right-0 translate-x-[15%] translate-y-[15%] rounded-full border border-border bg-surface object-cover shadow-sm', BADGE_SIZE[size])}
                    onError={() => setBadgeFailed(true)}
                />
            )}
        </div>
    );
}
