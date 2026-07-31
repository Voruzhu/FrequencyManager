import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button, toast } from './ui';
import { catalogStatLabel, formatCatalogValue, formatGearStat, gearIcon, getSequenceLabel, SEQUENCE_MAX, type CharacterData, type GameData, type GearData, type WeaponData } from '../data/gameData';
import { activeSetBonuses, type BuildStats } from '../data/optimizer';
import { drawBuildCard, CARD_WIDTH, CARD_HEIGHT, type BuildCardTheme, type BuildCardData } from '@/lib/buildCard';
import { downloadBlob } from '@/lib/fileIO';
import { fetchCharacterArtUrl } from '@/lib/characterArt';
import { statRelevance } from '@/lib/statRelevance';
import { useBuildCardPrefsStore } from '../stores/buildCardPrefsStore';
import { useSequenceStore } from '../stores/sequenceStore';
import { iconSrc } from '@/lib/icons';

/** Reads the live theme's resolved colors straight off the document — so the
 * exported card matches whichever theme (light/dark) is actually active,
 * instead of a color palette hardcoded here going stale the next time the
 * app's theme tokens change. Tokens are "R G B" triplets (Tailwind's own
 * convention, see index.css), consumed as rgb(var(--x) / a). */
function readTheme(): BuildCardTheme {
    const style = getComputedStyle(document.documentElement);
    const v = (name: string) => style.getPropertyValue(name).trim() || '0 0 0';
    return {
        surface: `rgb(${v('--surface')})`,
        surface2: `rgb(${v('--surface-2')})`,
        border: `rgb(${v('--border')})`,
        text: `rgb(${v('--foreground')})`,
        muted: `rgb(${v('--muted-foreground')})`,
        accent: `rgb(${v('--primary')})`,
        accentSoft: `rgb(${v('--primary')} / 0.15)`,
    };
}

export function BuildCardWindow({
    character, data, gameId, stats, skillDamage, weapon, weaponRefine, gear, critValue,
}: {
    character: CharacterData;
    data: GameData;
    gameId: string;
    stats: BuildStats;
    skillDamage: Record<string, number>;
    weapon?: WeaponData;
    weaponRefine?: number;
    gear: GearData[];
    critValue?: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [wikiArtUrl, setWikiArtUrl] = useState<string | undefined>(undefined);
    const customImage = useBuildCardPrefsStore((s) => s.customImages[gameId]?.[character.id]);
    const lastAccentColor = useBuildCardPrefsStore((s) => s.lastAccentColor);
    const [accent, setAccent] = useState<string | undefined>(lastAccentColor);
    const sequence = useSequenceStore((s) => s.getSequence(gameId, character.id));

    useEffect(() => {
        let cancelled = false;
        void fetchCharacterArtUrl(character.id).then((url) => { if (!cancelled) setWikiArtUrl(url); });
        return () => { cancelled = true; };
    }, [character.id]);

    const topSkill = character.skills.reduce<{ id: string; value: number } | null>((best, s) => {
        const v = skillDamage[s.id] ?? 0;
        return !best || v > best.value ? { id: s.id, value: v } : best;
    }, null);
    const topSkillName = character.skills.find((s) => s.id === topSkill?.id)?.name ?? 'Damage';
    const setBonus = activeSetBonuses(gear, data.setBonuses, character.name)[0];

    const cardData: BuildCardData = {
        gameId,
        characterName: character.name,
        element: character.element,
        weaponType: character.weaponType,
        rarity: character.rarity,
        imageUrl: customImage ?? wikiArtUrl,
        sequenceLabel: getSequenceLabel(gameId),
        sequenceValue: sequence,
        sequenceMax: SEQUENCE_MAX,
        heroLabel: `${topSkillName} — peak hit`,
        heroValue: Math.round(topSkill?.value ?? 0).toLocaleString(),
        stats: data.statCatalog
            .filter((def) => (stats[def.key] ?? 0) !== 0)
            .slice(0, 8)
            .map((def) => ({ label: catalogStatLabel(def, character.element), value: formatCatalogValue(def, stats[def.key] ?? 0), relevance: statRelevance(character, def.key) })),
        weaponLine: weapon?.name,
        weaponDetail: weapon ? `R${weaponRefine ?? 1}` : undefined,
        gearPieces: gear.map((g) => ({
            iconUrl: iconSrc(gameId, gearIcon(data, g)),
            name: g.name,
            setName: g.setName,
            mainStat: { label: g.mainStat.label, value: formatGearStat(g.mainStat) },
            subStats: g.subStats.map((s) => ({ label: s.label, value: formatGearStat(s) })),
        })),
        activeSetLine: setBonus?.name,
        activeSetDetail: setBonus ? (setBonus.tier === 'full' ? 'Full set' : '2pc') : undefined,
        critValue,
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const theme = readTheme();
        if (accent) theme.accent = accent;
        void drawBuildCard(canvas, cardData, theme);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cardData), accent]);

    const download = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (!blob) { toast.error('Could not generate image'); return; }
            downloadBlob(`${character.name.toLowerCase().replace(/\s+/g, '-')}-build.png`, blob);
            toast.success('Build card downloaded');
        }, 'image/png');
    };

    const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') useBuildCardPrefsStore.getState().setCustomImage(gameId, character.id, reader.result);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-center rounded-md border border-border bg-surface-2 p-3">
                <canvas ref={canvasRef} width={CARD_WIDTH} height={CARD_HEIGHT} style={{ width: CARD_WIDTH / 2.6, height: CARD_HEIGHT / 2.6 }} />
            </div>
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Accent
                    <input
                        type="color"
                        value={accent ?? '#3b82f6'}
                        onChange={(e) => { setAccent(e.target.value); useBuildCardPrefsStore.getState().setLastAccentColor(e.target.value); }}
                        className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
                    />
                </label>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload /> Custom image
                </Button>
                {customImage && (
                    <Button variant="ghost" size="sm" onClick={() => useBuildCardPrefsStore.getState().setCustomImage(gameId, character.id, undefined)}>
                        Reset to wiki art
                    </Button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </div>
            <Button className="w-full" onClick={download}>
                <Download /> Download PNG
            </Button>
        </div>
    );
}
