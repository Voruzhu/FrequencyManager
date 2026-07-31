/**
 * Renders a shareable build-summary card to a <canvas> using the Canvas 2D
 * API directly — no html-to-image library, no new dependency. Colors are
 * passed in as resolved CSS color strings (read from the live theme's
 * computed style by the caller) so the card matches whichever theme —
 * light or dark — the user actually has active, instead of a fixed palette.
 *
 * Layout: full-bleed character art behind the ENTIRE card (not a column —
 * the point is that the art IS the background, like an official in-game
 * character-showcase screen), with a dark gradient wash for legibility and
 * floating panels for the actual build info on top of it.
 */

export interface BuildCardTheme {
    surface: string;
    surface2: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentSoft: string;
    /** Same semantic tokens the Inventory screen's roll-quality badge
     * already uses (--success/--warning/--destructive) — reused here, not
     * reinvented, so a build card's roll-quality color means the same thing
     * an Inventory badge's color does. */
    success: string;
    warning: string;
    destructive: string;
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
    /** `rollRatio` (0-1, actual/max at this piece's rarity — see
     * shared/calc/gearEfficiency.ts's subStatRollRatio) grades this ONE
     * substat's own roll quality; undefined when no catalog range exists
     * for it (falls back to a neutral color, never a fabricated grade). */
    subStats: Array<{ label: string; value: string; rollRatio?: number }>;
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

// Fixed landscape dimensions (16:9-ish, matches the reference's proportions
// and doubles as a standard social/Discord-embed-friendly aspect ratio).
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

const PAD = 24;

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

/** Parses a theme color string — always `rgb(r g b)`, this module's own
 * convention (see BuildCardWindow's readTheme) — into its 3 components, for
 * interpolation. Falls back to opaque black on anything unparseable rather
 * than throwing mid-render over a cosmetic color. */
function parseRgb(color: string): [number, number, number] {
    const m = color.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function lerpColor(a: string, b: string, t: number): string {
    const [ar, ag, ab] = parseRgb(a);
    const [br, bg, bb] = parseRgb(b);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r} ${g} ${bl})`;
}

/**
 * 5-tier roll-quality gradient (red -> orange -> yellow -> lime -> green),
 * built from ONLY the app's existing 3 semantic colors (destructive/warning/
 * success — same tokens the Inventory roll badge uses) by interpolating the
 * 2 in-between tiers, rather than inventing new fixed hex colors that could
 * clash with a custom theme. Bands are even fifths of `ratio` (0-1);
 * undefined (no catalog range for this stat) reads as neutral, not a
 * fabricated grade.
 */
function rollGradeColor(theme: BuildCardTheme, ratio: number | undefined): string {
    if (ratio == null) return theme.muted;
    const r = Math.max(0, Math.min(1, ratio));
    if (r < 0.2) return theme.destructive;
    if (r < 0.4) return lerpColor(theme.destructive, theme.warning, (r - 0.2) / 0.2);
    if (r < 0.6) return theme.warning;
    if (r < 0.8) return lerpColor(theme.warning, theme.success, (r - 0.6) / 0.2);
    return theme.success;
}

/** Cuts `text` down with a trailing "…" if it doesn't fit `maxWidth` at the
 * context's CURRENT font — panel widths are fixed, so a long gear/set name
 * needs to degrade gracefully instead of overrunning the panel edge. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo) + '…';
}

/** A floating opaque-ish panel — the reference image's cards (weapon, QR,
 * echoes) read as distinct UI floating over the background art, not
 * see-through onto it, so this panel fill is deliberately near-opaque
 * (0.88) rather than a light translucent glass effect. */
function panel(ctx: CanvasRenderingContext2D, theme: BuildCardTheme, x: number, y: number, w: number, h: number) {
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = theme.surface2;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
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

    // Base card + full-bleed background art (cover-fit across the ENTIRE
    // canvas, cropped toward the top third — faces/portraits sit there far
    // more often than a character's feet). No image resolved -> plain
    // surface color, same as before.
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 16);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.save();
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 16);
    ctx.clip();
    if (charImg) {
        const scale = Math.max(CARD_WIDTH / charImg.width, CARD_HEIGHT / charImg.height);
        const dw = charImg.width * scale;
        const dh = charImg.height * scale;
        const dx = (CARD_WIDTH - dw) / 2;
        const dy = Math.min(0, -(dh - CARD_HEIGHT) * 0.3);
        ctx.drawImage(charImg, dx, dy, dw, dh);

        // Dark wash for legibility everywhere, layered with two directional
        // gradients so panels stay readable regardless of where the crop
        // happened to place the character: a left-to-right darkening (name/
        // header sits top-left, directly over the art, no panel behind it)
        // and a top-to-bottom darkening (the gear row sits at the very
        // bottom, which needs the strongest wash of all).
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        const vGrad = ctx.createLinearGradient(0, CARD_HEIGHT * 0.45, 0, CARD_HEIGHT);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        const hGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH * 0.5, 0);
        hGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
        hGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hGrad;
        // Full card height, NOT just the top half — the gradient's own
        // right-side stop already fades to fully transparent, so bounding
        // this fillRect to a fraction of the height left a hard rectangular
        // seam where the extra tint abruptly stopped (visible as a "weird
        // border" partway down the left side).
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }
    ctx.restore();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, 16);
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';

    // Header — name/element/weapon/rarity/sequence directly over the art, no
    // panel behind it (matches the reference: plain light text over a dark-
    // enough wash reads fine, and keeps the character unobscured). Flows
    // forward from a generous top margin (HEADER_TOP), well clear of both
    // the card's top edge and its rounded corner, rather than backward
    // offsets from a single anchor line — those had crept close enough to
    // the top edge to look clipped.
    const HEADER_TOP = PAD + 20;
    let hy = HEADER_TOP;
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.gameId === 'genshin-impact' ? 'GENSHIN IMPACT BUILD' : 'WUTHERING WAVES BUILD', PAD, hy);
    hy += 32;

    let hx = PAD;
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText(data.characterName, hx, hy);
    hx += ctx.measureText(data.characterName).width + 14;
    if (data.sequenceLabel && data.sequenceValue != null) {
        ctx.font = `600 13px ${MONO}`;
        ctx.fillStyle = theme.accent;
        ctx.fillText(`${data.sequenceLabel} ${data.sequenceValue}/${data.sequenceMax ?? 6}`, hx, hy);
    }
    hy += 26;

    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`${data.element}  ·  ${data.weaponType}  ·  ${'★'.repeat(Math.max(0, data.rarity))}`, PAD, hy);
    hy += 26;

    // Branding + CV — a final header line, still over the art in the same
    // top-left block (NOT the bottom corner: the gear strip already claims
    // the full-width bottom edge when any gear is equipped).
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('[ FrequencyManager ]', PAD, hy);
    if (data.critValue != null) {
        ctx.fillStyle = theme.accent;
        ctx.fillText(`CV ${data.critValue.toFixed(1)}`, PAD + 150, hy);
    }

    // Stats panel — top-right, floating over the art.
    const statPanelW = 340;
    const statPanelX = CARD_WIDTH - PAD - statPanelW;
    const statRowH = 22;
    // Content below actually starts 90px into the panel (22 to the hero
    // label + 30 to the hero value + 18 to the divider + 20 to the first
    // stat row's baseline) — the old formula assumed only 56px of header
    // space, so the last row's text sat right at the bottom border with
    // ~0 real margin. +16 past the last row's baseline covers descenders.
    const statRows = Math.max(1, Math.ceil(data.stats.length / 2));
    const statPanelH = 90 + (statRows - 1) * statRowH + 16;
    const statPanelY = PAD;
    panel(ctx, theme, statPanelX, statPanelY, statPanelW, statPanelH);
    {
        const px = statPanelX + 16;
        let py = statPanelY + 22;
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(truncate(ctx, data.heroLabel.toUpperCase(), statPanelW - 32), px, py);
        py += 30;
        ctx.font = `600 28px ${MONO}`;
        ctx.fillStyle = theme.accent;
        ctx.fillText(data.heroValue, px, py);
        py += 18;
        ctx.strokeStyle = theme.border;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(statPanelX + statPanelW - 16, py);
        ctx.stroke();
        py += 20;
        const colW = (statPanelW - 32 - 12) / 2;
        data.stats.forEach((row, i) => {
            const col = i % 2;
            const rowIdx = Math.floor(i / 2);
            const x = px + col * (colW + 12);
            const rowY = py + rowIdx * statRowH;
            ctx.font = `600 11px ${MONO}`;
            const valueWidth = ctx.measureText(row.value).width;
            ctx.fillStyle = relevanceColor(theme, row.relevance);
            ctx.textAlign = 'right';
            ctx.fillText(row.value, x + colW, rowY);
            ctx.textAlign = 'left';
            ctx.font = `9px ${MONO}`;
            ctx.fillStyle = theme.muted;
            ctx.fillText(truncate(ctx, row.label, colW - valueWidth - 8), x, rowY);
        });
    }

    // Weapon panel — below the stats panel, same width.
    if (data.weaponLine) {
        const wpY = statPanelY + statPanelH + 14;
        const wpH = 60;
        panel(ctx, theme, statPanelX, wpY, statPanelW, wpH);
        const px = statPanelX + 16;
        ctx.font = `600 14px ${SANS}`;
        ctx.fillStyle = theme.text;
        ctx.fillText(truncate(ctx, data.weaponLine, statPanelW - 100), px, wpY + 26);
        if (data.weaponDetail) {
            ctx.font = `10px ${MONO}`;
            ctx.fillStyle = theme.muted;
            ctx.textAlign = 'right';
            ctx.fillText(data.weaponDetail, statPanelX + statPanelW - 16, wpY + 26);
            ctx.textAlign = 'left';
        }
        if (data.activeSetLine) {
            ctx.font = `11px ${MONO}`;
            ctx.fillStyle = theme.accent;
            ctx.fillText(truncate(ctx, data.activeSetLine, statPanelW - 100), px, wpY + 44);
            if (data.activeSetDetail) {
                ctx.font = `9px ${MONO}`;
                ctx.fillStyle = theme.muted;
                ctx.textAlign = 'right';
                ctx.fillText(data.activeSetDetail, statPanelX + statPanelW - 16, wpY + 44);
                ctx.textAlign = 'left';
            }
        }
    }

    // Gear row — a full-width strip of per-piece panels along the bottom,
    // matching the reference's horizontal echo/artifact card row.
    if (data.gearPieces.length > 0) {
        // Tall enough for icon + name + set + main stat + 5 substats (WW's
        // real max) at this line spacing, with real margin to spare — the
        // previous height (150) fit that exactly with ~0 slack, which read
        // as "clipped" the moment any line ran a pixel past its estimate.
        const stripH = 180;
        const stripY = CARD_HEIGHT - PAD - stripH;
        const gap = 12;
        const pieceW = (CARD_WIDTH - PAD * 2 - gap * (data.gearPieces.length - 1)) / data.gearPieces.length;
        data.gearPieces.forEach((piece, i) => {
            const px = PAD + i * (pieceW + gap);
            panel(ctx, theme, px, stripY, pieceW, stripH);
            // Clip to the panel's own bounds as a hard backstop — text
            // should never need to escape it given the sizing above, but a
            // clip means a future content/line-count change degrades into
            // "cut off" rather than "spills past the border" if it ever
            // does run long.
            ctx.save();
            roundRect(ctx, px, stripY, pieceW, stripH, 10);
            ctx.clip();

            const img = gearImgs[i];
            const iconSize = 40;
            const tx = px + 12;
            let ty = stripY + 16;
            if (img) { ctx.drawImage(img, tx, ty, iconSize, iconSize); }
            const textX = img ? tx + iconSize + 8 : tx;
            const textW = pieceW - (img ? iconSize + 8 + 12 : 24);
            ctx.font = `600 11px ${SANS}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(truncate(ctx, piece.name, textW), textX, ty + 12);
            ctx.font = `9px ${MONO}`;
            ctx.fillStyle = theme.muted;
            ctx.fillText(truncate(ctx, piece.setName, textW), textX, ty + 26);
            ty += iconSize + 14;
            ctx.font = `600 10px ${MONO}`;
            ctx.fillStyle = theme.accent;
            ctx.fillText(truncate(ctx, `${piece.mainStat.label} ${piece.mainStat.value}`, pieceW - 24), tx, ty);
            ty += 16;
            ctx.font = `9px ${MONO}`;
            ctx.fillStyle = theme.muted;
            piece.subStats.forEach((s) => {
                // Label in muted text, value colored by this substat's OWN
                // roll quality (not the piece's blended average) — the
                // point is to see which specific rolls are good/bad.
                ctx.font = `9px ${MONO}`;
                ctx.fillStyle = theme.muted;
                const label = truncate(ctx, `${s.label} `, pieceW - 24 - 40);
                ctx.fillText(label, tx, ty);
                ctx.font = `600 9px ${MONO}`;
                ctx.fillStyle = rollGradeColor(theme, s.rollRatio);
                ctx.fillText(s.value, tx + ctx.measureText(label).width, ty);
                ty += 13;
            });

            ctx.restore();
        });
    }

}
