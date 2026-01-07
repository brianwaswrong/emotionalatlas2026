import type { Entry } from '../lib/types';
import type { Viewport } from './viewport';
import { ensureViewportCentered, screenToWorld } from './viewport';

export function pickEntryAtPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  vp: Viewport,
  entries: Entry[],
  radiusPx: number
): Entry | null {
  ensureViewportCentered(canvas, vp);

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  const px = (clientX - rect.left) * dpr;
  const py = (clientY - rect.top) * dpr;

  const world = screenToWorld(px, py, vp);
  const radiusWorld = radiusPx / vp.scale;
  const r2 = radiusWorld * radiusWorld;

  let best: { e: Entry; d2: number } | null = null;

  for (const e of entries) {
    const ex = e.valence * 6.0;
    const ey = -e.arousal * 3.8;

    const dx = ex - world.x;
    const dy = ey - world.y;
    const d2 = dx * dx + dy * dy;

    if (d2 <= r2) {
      if (!best || d2 < best.d2) best = { e, d2 };
    }
  }

  return best?.e ?? null;
}
