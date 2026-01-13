import type { Entry } from '../lib/types';
import type { Viewport } from './viewport';
import { clamp, hashColor, dotRadiusPx } from '../lib/utils';
import { worldToScreen } from './viewport';
import {emotionColor, emotionBg} from '@/lib/colors'

export function entryAnchorWorld(e: Entry) {
  const v = e.valence ?? e.classification?.valence ?? 0;
  const a = e.arousal ?? e.classification?.arousal ?? 0;
  return { x: v * 6.0, y: -a * 6.0 };
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  vp: Viewport,
  entries: Entry[],
  centroidsTier1: Array<{ label: string; tier1?: string; x: number; y: number }>,
  centroidsTier2: Array<{ label: string; tier1?: string; x: number; y: number }>,
  theme: "dark" | "light",
  getPos?: (e: Entry) => { x: number; y: number }
) {


  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return; // layout not ready

  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.height * dpr);

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    0,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.7
  );
  bg.addColorStop(
    0,
    theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
  );
  bg.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = theme === 'dark' ? '#050608' : '#f3f2ff';
  // ctx.fillRect(0, 0, w, h);

  const showAxis = vp.scale > 34;
  const showEmotions = vp.scale > 92;

  if (showAxis) drawAxes(ctx, vp, w, h, theme);

  const baseR = dotRadiusPx(vp.scale);

  for (const e of entries) {
    if (e.valence == null || e.arousal == null) continue;
    const p = getPos ? getPos(e) : entryAnchorWorld(e);
    
    const s = worldToScreen(p.x, p.y, vp);

    if (s.x < -60 || s.y < -60 || s.x > w + 60 || s.y > h + 60) continue;

    const color = emotionColor(
      e.classification?.plutchikPrimary,
      e.emotion
    );    
    const r = baseR;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = color;
    ctx.shadowBlur = clamp(baseR * 1.6, 8, 36);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.shadowColor = color;
    ctx.shadowBlur = clamp(baseR * 2.4, 12, 50);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(s.x, s.y, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const Z_TIER1 = 50;   // show tier1 at/after this
  const Z_TIER2 = 180;  // switch to tier2 at/after this

  if (vp.scale >= Z_TIER1 && vp.scale < Z_TIER2) {
    drawTier1Fields(ctx, vp, centroidsTier1, theme);
  } else if (vp.scale >= Z_TIER2) {
    drawCentroidPills(ctx, vp, centroidsTier2, theme);
  } 
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  w: number,
  h: number,
  theme: 'dark' | 'light'
) {
  const axis = theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  ctx.save();
  ctx.strokeStyle = axis;
  ctx.lineWidth = 1;

  const o = worldToScreen(0, 0, vp);

  ctx.beginPath();
  ctx.moveTo(0, o.y);
  ctx.lineTo(w, o.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(o.x, 0);
  ctx.lineTo(o.x, h);
  ctx.stroke();

  ctx.restore();
}

function drawCentroidPills(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  centroids: Array<{ label: string; tier1?: string; x: number; y: number }>,
  theme: 'dark' | 'light'
) {
  ctx.save();
  ctx.font = '600 12px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const c of centroids) {
    const x = c.x * 6.0;
    const y = -c.y * 6.0;
    const s = worldToScreen(x, y, vp);

    const label = c.label;

    // IMPORTANT: tier1 drives hue; label (tier2) drives shade.
    const color = emotionColor(c.tier1, label);
    const bg = emotionBg(c.tier1, label);

    const m = ctx.measureText(label);
    const padX = 10;
    const w = m.width + padX * 2;
    const h = 24;

    const rx = s.x - w / 2;
    const ry = s.y - 44;

    // soft pill background
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle =
      theme === 'dark'
        ? bg.replace('/ 0.02', '/ 0.05') // slightly stronger in dark
        : bg.replace('/ 0.01', '/ 0.02');
    roundRect(ctx, rx, ry, w, h, 999);
    ctx.fill();

    // border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // text
    ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.92)' : 'rgba(18,19,24,0.88)';
    ctx.fillText(label, s.x, ry + h / 2);

    // left dot
    // ctx.beginPath();
    // ctx.fillStyle = color;
    // ctx.shadowColor = color;
    // ctx.shadowBlur = 12;
    // ctx.arc(rx + 10, ry + h / 2, 3.5, 0, Math.PI * 2);
    // ctx.fill();
    // ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawTier1Fields(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  centroids: Array<{ label: string; tier1?: string; x: number; y: number }>,
  theme: "dark" | "light"
) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Region size grows a bit as you zoom in (tune later)
  const worldRadius = clamp(1.15 + (vp.scale - 92) / 140, 1.15, 2.4);

  for (const c of centroids) {
    if (!c.tier1) continue;

    const x = c.x * 6.0;
    const y = -c.y * 6.0;
    const s = worldToScreen(x, y, vp);

    const label = c.tier1.toUpperCase();

    // Tier1 drives hue; pass tier1 for both args to keep it stable
    const color = emotionColor(c.tier1, c.tier1);

    // Convert world radius to pixels at this zoom
    const R = worldRadius * vp.scale;

    ctx.save();
    ctx.globalCompositeOperation = theme === "dark" ? "screen" : "source-over";
    ctx.fillStyle = color;

    // 1) Hot core
    ctx.globalAlpha = theme === "dark" ? 0.07 : 0.05;
    ctx.shadowColor = color;
    ctx.shadowBlur = R * 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // 2) Mid glow
    ctx.globalAlpha = theme === "dark" ? 0.07 : 0.05;
    ctx.shadowBlur = R * 0.45;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 0.70, 0, Math.PI * 2);
    ctx.fill();

    // 3) Outer haze
    ctx.globalAlpha = theme === "dark" ? 0.05 : 0.03;
    ctx.shadowBlur = R * 0.75;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 1.00, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Caps text (no pill)
    ctx.save();
    ctx.font = '700 12px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.42)";
    ctx.shadowColor = theme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";
    ctx.shadowBlur = 8;
    ctx.fillText(label, s.x, s.y);
    ctx.restore();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
