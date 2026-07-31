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
}

export interface BuildCardData {
    gameId: string;
    characterName: string;
    element: string;
    weaponType: string;
    rarity: number;
    heroLabel: string;
    heroValue: string;
    stats: BuildCardStatRow[];
    weaponLine?: string;
    weaponDetail?: string;
    setLine?: string;
    setDetail?: string;
    critValue?: number;
}

export const CARD_WIDTH = 480;
export const CARD_HEIGHT = 680;

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"IBM Plex Sans", "Segoe UI", ui-sans-serif, system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h); // ancient-fallback: a square corner is a cosmetic degradation, not a broken export
}

export function drawBuildCard(canvas: HTMLCanvasElement, data: BuildCardData, theme: BuildCardTheme): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const pad = 24;

    // Base card.
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 12);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    let y = pad;

    // Header: eyebrow + rarity, name, element/weapon/rarity meta.
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

    // Stat grid — 2 columns.
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
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.fillText(row.value, x + colWidth, rowY);
        ctx.textAlign = 'left';
    });
    y += Math.ceil(data.stats.length / 2) * rowHeight + 16;

    // Footer strip: weapon + set, background band sized to its actual content
    // (0-2 rows) rather than "whatever space is left" — an unequipped weapon
    // or empty set shouldn't leave a big blank band above the watermark.
    const footerRowCount = (data.weaponLine ? 1 : 0) + (data.setLine ? 1 : 0);
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
        if (data.setLine) {
            ctx.font = `600 13px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(data.setLine, pad, fy);
            if (data.setDetail) {
                ctx.font = `11px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.setDetail, CARD_WIDTH - pad, fy);
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
