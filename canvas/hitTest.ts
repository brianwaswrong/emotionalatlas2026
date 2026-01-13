import type { Entry } from '../lib/types';
import type { Viewport } from './viewport';
import { ensureViewportCentered, screenToWorld } from './viewport';
import { entryAnchorWorld } from './draw';

export function pickEntryAtPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  vp: Viewport,
  entries: Entry[],
  radiusPx: number,
  getPos?: (e: Entry) => { x: number; y: number }
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
    const p = getPos ? getPos(e) : entryAnchorWorld(e);
    const ex = p.x;
    const ey = p.y;


    const dx = ex - world.x;
    const dy = ey - world.y;
    const d2 = dx * dx + dy * dy;

    if (d2 <= r2) {
      if (!best || d2 < best.d2) best = { e, d2 };
    }
  }

  return best?.e ?? null;
}
