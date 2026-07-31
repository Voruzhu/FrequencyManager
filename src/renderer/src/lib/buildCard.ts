/**
 * Renders a shareable build-summary card to a <canvas> using the Canvas 2D
 * API directly — no html-to-image library, no new dependency. Colors are
 * passed in as resolved CSS color strings (read from the live theme's
 * computed style by the caller) so the card matches whichever theme —
 * light or dark — the user actually has active, instead of a fixed palette.
 */

export interface BuildCardTheme {
    surface: string;
    surface2: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentSoft: string;
}

export interface BuildCardStatRow {
    label: string;
    value: string;
    relevance: 'low' | 'medium' | 'high';
}

export interface BuildCardGearPiece {
    iconUrl?: string;
    name: string;
    setName: string;
    mainStat: { label: string; value: string };
    subStats: Array<{ label: string; value: string }>;
}

export interface BuildCardData {
    gameId: string;
    characterName: string;
    element: string;
    weaponType: string;
    rarity: number;
    imageUrl?: string;
    sequenceLabel?: string;
    sequenceValue?: number;
    sequenceMax?: number;
    heroLabel: string;
    heroValue: string;
    stats: BuildCardStatRow[];
    weaponLine?: string;
    weaponDetail?: string;
    gearPieces: BuildCardGearPiece[];
    /** The RESULTING active set bonus (e.g. "Crimson Witch of Flames — 4pc"),
     * distinct from each piece's own `setName` in `gearPieces` — this is the
     * actual game-mechanical payoff of the equipped combination, not just a
     * per-item label, so it's worth its own line. */
    activeSetLine?: string;
    activeSetDetail?: string;
    critValue?: number;
}

export const CARD_WIDTH = 480;
export const CARD_HEIGHT = 1080;

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"IBM Plex Sans", "Segoe UI", ui-sans-serif, system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h); // ancient-fallback: a square corner is a cosmetic degradation, not a broken export
}

/** Loads an image for canvas drawing; resolves `null` instead of rejecting on
 * any failure (broken URL, CORS block, 404) so one bad icon never blocks the
 * rest of the card. */
function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function relevanceColor(theme: BuildCardTheme, relevance: BuildCardStatRow['relevance']): string {
    if (relevance === 'high') return theme.accent;
    if (relevance === 'low') return theme.muted;
    return theme.text;
}

export async function drawBuildCard(canvas: HTMLCanvasElement, data: BuildCardData, theme: BuildCardTheme): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const pad = 24;

    const [charImg, ...gearImgs] = await Promise.all([
        loadImage(data.imageUrl),
        ...data.gearPieces.map((g) => loadImage(g.iconUrl)),
    ]);

    // Base card.
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 12);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    let y = pad;

    // Character image — a fixed-height cover-fit band across the top, drawn
    // BEHIND the header text (a translucent scrim keeps the header legible
    // over any image). No image resolved -> just the plain surface color.
    const imgBandHeight = 200;
    if (charImg) {
        ctx.save();
        roundRect(ctx, 0, 0, CARD_WIDTH, imgBandHeight, 12);
        ctx.clip();
        const scale = Math.max(CARD_WIDTH / charImg.width, imgBandHeight / charImg.height);
        const dw = charImg.width * scale;
        const dh = charImg.height * scale;
        ctx.drawImage(charImg, (CARD_WIDTH - dw) / 2, (imgBandHeight - dh) / 2, dw, dh);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, CARD_WIDTH, imgBandHeight);
        ctx.restore();
        y = imgBandHeight + 16;
    }

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.accent;
    ctx.font = `600 11px ${MONO}`;
    ctx.fillText(data.gameId === 'genshin-impact' ? 'GENSHIN IMPACT BUILD' : 'WUTHERING WAVES BUILD', pad, y + 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.fillText('★'.repeat(Math.max(0, data.rarity)), CARD_WIDTH - pad, y + 11);
    ctx.textAlign = 'left';
    y += 34;

    ctx.fillStyle = theme.text;
    ctx.font = `600 26px ${SANS}`;
    ctx.fillText(data.characterName, pad, y);
    if (data.sequenceLabel && data.sequenceValue != null) {
        const nameWidth = ctx.measureText(data.characterName).width;
        ctx.font = `600 12px ${MONO}`;
        ctx.fillStyle = theme.accent;
        ctx.fillText(`${data.sequenceLabel} ${data.sequenceValue}/${data.sequenceMax ?? 6}`, pad + nameWidth + 12, y);
    }
    y += 22;

    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.element, pad, y);
    const elemWidth = ctx.measureText(data.element).width;
    ctx.fillStyle = theme.muted;
    ctx.fillText(`  ·  ${data.weaponType}`, pad + elemWidth, y);
    y += 20;

    ctx.strokeStyle = theme.border;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(CARD_WIDTH - pad, y);
    ctx.stroke();
    y += 22;

    // Hero readout — the biggest single number on the card.
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = theme.muted;
    ctx.fillText(data.heroLabel.toUpperCase(), pad, y);
    y += 40;
    ctx.font = `600 48px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.heroValue, pad, y);
    y += 16;

    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(CARD_WIDTH - pad, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    y += 26;

    // Stat grid — colored by kit relevance instead of a flat text color.
    const colWidth = (CARD_WIDTH - pad * 2 - 16) / 2;
    const rowHeight = 26;
    data.stats.forEach((row, i) => {
        const col = i % 2;
        const rowIdx = Math.floor(i / 2);
        const x = pad + col * (colWidth + 16);
        const rowY = y + rowIdx * rowHeight;
        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(row.label, x, rowY);
        ctx.font = `600 12px ${MONO}`;
        ctx.fillStyle = relevanceColor(theme, row.relevance);
        ctx.textAlign = 'right';
        ctx.fillText(row.value, x + colWidth, rowY);
        ctx.textAlign = 'left';
    });
    y += Math.ceil(data.stats.length / 2) * rowHeight + 16;

    // Per-gear-piece rows: icon + set + main/substats, each ~3 lines tall.
    if (data.gearPieces.length > 0) {
        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText('LOADOUT', pad, y);
        y += 18;
        const gearRowHeight = 58;
        data.gearPieces.forEach((piece, i) => {
            const rowY = y + i * gearRowHeight;
            const img = gearImgs[i];
            if (img) ctx.drawImage(img, pad, rowY, 32, 32);
            const textX = pad + (img ? 40 : 0);
            ctx.font = `600 12px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(piece.name, textX, rowY + 12);
            ctx.font = `10px ${MONO}`;
            ctx.fillStyle = theme.muted;
            ctx.fillText(`${piece.setName} — ${piece.mainStat.label} ${piece.mainStat.value}`, textX, rowY + 26);
            ctx.fillText(piece.subStats.map((s) => `${s.label} ${s.value}`).join('  ·  '), textX, rowY + 40);
        });
        y += data.gearPieces.length * gearRowHeight + 12;
    }

    // Footer strip: weapon + active set bonus + branding, sized to its actual content.
    const footerRowCount = (data.weaponLine ? 1 : 0) + (data.activeSetLine ? 1 : 0);
    const footerHeight = footerRowCount * 24 + 44;
    const footerTop = CARD_HEIGHT - footerHeight;
    {
        ctx.fillStyle = theme.surface2;
        ctx.fillRect(0, footerTop, CARD_WIDTH, footerHeight);
        ctx.strokeStyle = theme.border;
        ctx.beginPath();
        ctx.moveTo(0, footerTop);
        ctx.lineTo(CARD_WIDTH, footerTop);
        ctx.stroke();

        let fy = footerTop + 24;
        if (data.weaponLine) {
            ctx.font = `600 13px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(data.weaponLine, pad, fy);
            if (data.weaponDetail) {
                ctx.font = `11px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.weaponDetail, CARD_WIDTH - pad, fy);
                ctx.textAlign = 'left';
            }
            fy += 24;
        }
        if (data.activeSetLine) {
            ctx.font = `600 13px ${SANS}`;
            ctx.fillStyle = theme.accent;
            ctx.fillText(data.activeSetLine, pad, fy);
            if (data.activeSetDetail) {
                ctx.font = `11px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.activeSetDetail, CARD_WIDTH - pad, fy);
                ctx.textAlign = 'left';
            }
            fy += 24;
        }

        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText('[ FrequencyManager ]', pad, CARD_HEIGHT - pad + 4);
        if (data.critValue != null) {
            ctx.textAlign = 'right';
            ctx.fillText(`CV ${data.critValue.toFixed(1)}`, CARD_WIDTH - pad, CARD_HEIGHT - pad + 4);
            ctx.textAlign = 'left';
        }
    }
}
