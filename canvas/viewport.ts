export type Viewport = {
  scale: number; // pixels per world unit
  tx: number; // screen-space translation (px)
  ty: number; // screen-space translation (px)
};

export function worldToScreen(x: number, y: number, vp: Viewport) {
  return { x: x * vp.scale + vp.tx, y: y * vp.scale + vp.ty };
}

export function screenToWorld(x: number, y: number, vp: Viewport) {
  return { x: (x - vp.tx) / vp.scale, y: (y - vp.ty) / vp.scale };
}

export function ensureViewportCentered(
  canvas: HTMLCanvasElement,
  vp: Viewport
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = rect.width * dpr;
  const h = rect.height * dpr;

  if (
    !Number.isFinite(vp.tx) ||
    !Number.isFinite(vp.ty) ||
    (vp.tx === 0 && vp.ty === 0)
  ) {
    vp.tx = w / 2;
    vp.ty = h / 2;
  }
}
