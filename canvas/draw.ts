import type { Entry } from '../lib/types';
import type { Viewport } from './viewport';
import { clamp, hashColor, dotRadiusPx } from '../lib/utils';
import { worldToScreen } from './viewport';

export function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  vp: Viewport,
  entries: Entry[],
  centroids: Array<{ emotion: string; x: number; y: number }>,
  theme: 'dark' | 'light'
) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();

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
  ctx.fillRect(0, 0, w, h);

  const showAxis = vp.scale > 34;
  const showEmotions = vp.scale > 92;

  if (showAxis) drawAxes(ctx, vp, w, h, theme);

  const baseR = dotRadiusPx(vp.scale);

  for (const e of entries) {
    const x = e.valence * 6.0;
    const y = -e.arousal * 3.8;
    const s = worldToScreen(x, y, vp);

    if (s.x < -60 || s.y < -60 || s.x > w + 60 || s.y > h + 60) continue;

    const color = hashColor(e.emotion);
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

  if (showEmotions) drawCentroidPills(ctx, vp, centroids, theme);
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
  centroids: Array<{ emotion: string; x: number; y: number }>,
  theme: 'dark' | 'light'
) {
  ctx.save();
  ctx.font = '600 12px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const c of centroids) {
    const x = c.x * 6.0;
    const y = -c.y * 3.8;
    const s = worldToScreen(x, y, vp);
    const label = c.emotion;
    const color = hashColor(label);

    const m = ctx.measureText(label);
    const padX = 10;
    const w = m.width + padX * 2;
    const h = 24;

    const rx = s.x - w / 2;
    const ry = s.y - 44;

    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle =
      theme === 'dark' ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.75)';
    roundRect(ctx, rx, ry, w, h, 999);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillText(label, s.x, ry + h / 2);

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.arc(rx + 10, ry + h / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
