import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { Button, toast } from './ui';
import { catalogStatLabel, formatCatalogValue, type CharacterData, type GameData, type GearData, type WeaponData } from '../data/gameData';
import { activeSetBonuses, type BuildStats } from '../data/optimizer';
import { drawBuildCard, CARD_WIDTH, CARD_HEIGHT, type BuildCardTheme, type BuildCardData } from '@/lib/buildCard';
import { downloadBlob } from '@/lib/fileIO';

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
        heroLabel: `${topSkillName} — peak hit`,
        heroValue: Math.round(topSkill?.value ?? 0).toLocaleString(),
        stats: data.statCatalog
            .filter((def) => (stats[def.key] ?? 0) !== 0)
            .slice(0, 8)
            .map((def) => ({ label: catalogStatLabel(def, character.element), value: formatCatalogValue(def, stats[def.key] ?? 0) })),
        weaponLine: weapon?.name,
        weaponDetail: weapon ? `R${weaponRefine ?? 1}` : undefined,
        setLine: setBonus?.name,
        setDetail: setBonus ? (setBonus.tier === 'full' ? 'Full set' : '2pc') : undefined,
        critValue,
    };

    useEffect(() => {
        if (canvasRef.current) drawBuildCard(canvasRef.current, cardData, readTheme());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cardData)]);

    const download = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (!blob) { toast.error('Could not generate image'); return; }
            downloadBlob(`${character.name.toLowerCase().replace(/\s+/g, '-')}-build.png`, blob);
            toast.success('Build card downloaded');
        }, 'image/png');
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-center rounded-md border border-border bg-surface-2 p-3">
                <canvas ref={canvasRef} width={CARD_WIDTH} height={CARD_HEIGHT} style={{ width: CARD_WIDTH / 1.4, height: CARD_HEIGHT / 1.4 }} />
            </div>
            <Button className="w-full" onClick={download}>
                <Download /> Download PNG
            </Button>
        </div>
    );
}
