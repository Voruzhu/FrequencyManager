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

export const CARD_WIDTH = 520;
export const CARD_HEIGHT = 900;

const IMAGE_COL_WIDTH = 180;
const PAD = 16;
const RIGHT_X = IMAGE_COL_WIDTH + PAD;
const RIGHT_W = CARD_WIDTH - RIGHT_X - PAD;

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

/** Cuts `text` down with a trailing "…" if it doesn't fit `maxWidth` at the
 * context's CURRENT font — the right column is narrow enough (squeezed next
 * to the image column) that long gear/set names would otherwise silently
 * overrun into the margin or overlap the next line's text. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo) + '…';
}

export async function drawBuildCard(canvas: HTMLCanvasElement, data: BuildCardData, theme: BuildCardTheme): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;

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

    // Left column: a full-height vertical portrait strip — the point is to
    // frame the character tightly (a tall narrow crop reads as "portrait",
    // not "banner"), not to leave room for text on top of it. No image
    // resolved -> the column just stays the plain surface color.
    ctx.save();
    roundRect(ctx, 0, 0, IMAGE_COL_WIDTH, CARD_HEIGHT, 12);
    ctx.clip();
    if (charImg) {
        const scale = Math.max(IMAGE_COL_WIDTH / charImg.width, CARD_HEIGHT / charImg.height);
        const dw = charImg.width * scale;
        const dh = charImg.height * scale;
        // Bias the crop toward the top third (faces/portraits sit there far
        // more often than a character's feet), rather than centering blindly.
        const dy = Math.min(0, -(dh - CARD_HEIGHT) * 0.25);
        ctx.drawImage(charImg, (IMAGE_COL_WIDTH - dw) / 2, dy, dw, dh);
        // A left-edge-to-right gradient fade into the surface color, so the
        // seam between image and right column reads as intentional, not a
        // hard cut.
        const grad = ctx.createLinearGradient(IMAGE_COL_WIDTH - 40, 0, IMAGE_COL_WIDTH, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, theme.surface);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, IMAGE_COL_WIDTH, CARD_HEIGHT);
    }
    ctx.restore();
    ctx.strokeStyle = theme.border;
    ctx.beginPath();
    ctx.moveTo(IMAGE_COL_WIDTH, 0);
    ctx.lineTo(IMAGE_COL_WIDTH, CARD_HEIGHT);
    ctx.stroke();

    let y = PAD + 8;
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = theme.accent;
    ctx.font = `600 10px ${MONO}`;
    ctx.fillText(data.gameId === 'genshin-impact' ? 'GENSHIN IMPACT BUILD' : 'WUTHERING WAVES BUILD', RIGHT_X, y);
    y += 20;

    ctx.fillStyle = theme.text;
    ctx.font = `600 21px ${SANS}`;
    ctx.fillText(truncate(ctx, data.characterName, RIGHT_W), RIGHT_X, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.font = `10px ${MONO}`;
    ctx.fillText('★'.repeat(Math.max(0, data.rarity)), CARD_WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += 18;

    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.element, RIGHT_X, y);
    const elemWidth = ctx.measureText(data.element).width;
    ctx.fillStyle = theme.muted;
    ctx.fillText(`  ·  ${data.weaponType}`, RIGHT_X + elemWidth, y);
    if (data.sequenceLabel && data.sequenceValue != null) {
        ctx.textAlign = 'right';
        ctx.fillStyle = theme.accent;
        ctx.fillText(`${data.sequenceLabel} ${data.sequenceValue}/${data.sequenceMax ?? 6}`, CARD_WIDTH - PAD, y);
        ctx.textAlign = 'left';
    }
    y += 16;

    ctx.strokeStyle = theme.border;
    ctx.beginPath();
    ctx.moveTo(RIGHT_X, y);
    ctx.lineTo(CARD_WIDTH - PAD, y);
    ctx.stroke();
    y += 16;

    // Hero readout — the biggest single number on the card, sized DOWN from
    // the original top-banner layout since the right column is now narrower.
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = theme.muted;
    ctx.fillText(truncate(ctx, data.heroLabel.toUpperCase(), RIGHT_W), RIGHT_X, y);
    y += 30;
    ctx.font = `600 34px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.heroValue, RIGHT_X, y);
    y += 12;

    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(RIGHT_X, y);
    ctx.lineTo(CARD_WIDTH - PAD, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    y += 18;

    // Stat list — single column (the right column is too narrow for 2), each
    // row tighter than the original layout.
    const rowHeight = 19;
    data.stats.forEach((row) => {
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(row.label, RIGHT_X, y);
        ctx.font = `600 11px ${MONO}`;
        ctx.fillStyle = relevanceColor(theme, row.relevance);
        ctx.textAlign = 'right';
        ctx.fillText(row.value, CARD_WIDTH - PAD, y);
        ctx.textAlign = 'left';
        y += rowHeight;
    });
    y += 10;

    // Per-gear-piece rows: icon + set + main/substats, tightened.
    if (data.gearPieces.length > 0) {
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText('LOADOUT', RIGHT_X, y);
        y += 15;
        const iconSize = 24;
        const gearRowHeight = 46;
        data.gearPieces.forEach((piece, i) => {
            const rowY = y + i * gearRowHeight;
            const img = gearImgs[i];
            if (img) ctx.drawImage(img, RIGHT_X, rowY - 10, iconSize, iconSize);
            const textX = RIGHT_X + (img ? iconSize + 8 : 0);
            const textW = RIGHT_W - (img ? iconSize + 8 : 0);
            ctx.font = `600 11px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(truncate(ctx, piece.name, textW), textX, rowY);
            ctx.font = `9px ${MONO}`;
            ctx.fillStyle = theme.muted;
            ctx.fillText(truncate(ctx, `${piece.setName} — ${piece.mainStat.label} ${piece.mainStat.value}`, textW), textX, rowY + 12);
            ctx.fillText(truncate(ctx, piece.subStats.map((s) => `${s.label} ${s.value}`).join(' · '), textW), textX, rowY + 24);
        });
        y += data.gearPieces.length * gearRowHeight + 8;
    }

    // Footer strip: weapon + active set bonus + branding, confined to the
    // right column (the image column stays undisturbed to the very bottom).
    const footerRowCount = (data.weaponLine ? 1 : 0) + (data.activeSetLine ? 1 : 0);
    const footerHeight = footerRowCount * 18 + 34;
    const footerTop = CARD_HEIGHT - footerHeight;
    {
        ctx.strokeStyle = theme.border;
        ctx.beginPath();
        ctx.moveTo(RIGHT_X, footerTop);
        ctx.lineTo(CARD_WIDTH - PAD, footerTop);
        ctx.stroke();

        let fy = footerTop + 18;
        if (data.weaponLine) {
            ctx.font = `600 11px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(truncate(ctx, data.weaponLine, RIGHT_W - 40), RIGHT_X, fy);
            if (data.weaponDetail) {
                ctx.font = `9px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.weaponDetail, CARD_WIDTH - PAD, fy);
                ctx.textAlign = 'left';
            }
            fy += 18;
        }
        if (data.activeSetLine) {
            ctx.font = `600 11px ${SANS}`;
            ctx.fillStyle = theme.accent;
            ctx.fillText(truncate(ctx, data.activeSetLine, RIGHT_W - 40), RIGHT_X, fy);
            if (data.activeSetDetail) {
                ctx.font = `9px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.activeSetDetail, CARD_WIDTH - PAD, fy);
                ctx.textAlign = 'left';
            }
            fy += 18;
        }

        ctx.font = `9px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText('[ FrequencyManager ]', RIGHT_X, CARD_HEIGHT - PAD + 2);
        if (data.critValue != null) {
            ctx.textAlign = 'right';
            ctx.fillText(`CV ${data.critValue.toFixed(1)}`, CARD_WIDTH - PAD, CARD_HEIGHT - PAD + 2);
            ctx.textAlign = 'left';
        }
    }
}
