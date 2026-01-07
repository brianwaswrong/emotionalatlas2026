'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '/lib/types';
import { makeMockEntries } from '/lib/simulate';
import { ensureViewportCentered, type Viewport } from '/canvas/viewport';
import { clamp, hashColor, fmtDateShort } from '/lib/utils';
import { drawScene } from '/canvas/draw';
import { pickEntryAtPoint } from '/canvas/hitTest';
import { DetailPanel } from '/components/DetailPanel';
import { SubmitModal } from '/components/SubmitModal';
import { DbModal } from '/components/DbModal';
import { fetchEntries, insertEntry } from '/lib/db';

function computeCentroids(entries: Entry[]) {
  const acc = new Map<string, { x: number; y: number; n: number }>();
  for (const e of entries) {
    const cur = acc.get(e.emotion) ?? { x: 0, y: 0, n: 0 };
    cur.x += e.valence;
    cur.y += e.arousal;
    cur.n += 1;
    acc.set(e.emotion, cur);
  }

  const out: Array<{ emotion: string; x: number; y: number }> = [];
  acc.forEach((v, emotion) => {
    out.push({ emotion, x: v.x / v.n, y: v.y / v.n });
  });
  return out;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const ui =
    theme === 'dark'
      ? {
          fg: 'rgba(255,255,255,0.92)',
          fg2: 'rgba(255,255,255,0.72)',
          border: 'rgba(255,255,255,0.10)',
          card: 'rgba(255,255,255,0.06)',
          card2: 'rgba(255,255,255,0.04)',
          panel: 'rgba(10,12,16,0.92)',
          shadow: 'rgba(0,0,0,0.38)',
          overlay: 'rgba(0,0,0,0.45)',
        }
      : {
          fg: 'rgba(18,19,24,0.92)',
          fg2: 'rgba(18,19,24,0.72)',
          border: 'rgba(18,19,24,0.12)',
          card: 'rgba(18,19,24,0.06)',
          card2: 'rgba(18,19,24,0.04)',
          panel: 'rgba(255,255,255,0.92)',
          shadow: 'rgba(0,0,0,0.18)',
          overlay: 'rgba(18,19,24,0.20)',
        };

  const [dbEntries, setDbEntries] = useState<Entry[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setDbLoading(true);
        const rows = await fetchEntries();
        setDbEntries(rows.length ? rows : makeMockEntries(40)); // optional seed fallback
      } catch (e: any) {
        setDbError(e?.message ?? 'Failed to load entries');
        setDbEntries(makeMockEntries(40)); // fallback for now
      } finally {
        setDbLoading(false);
      }
    })();
  }, []);

  const [search, setSearch] = useState('');
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isDbOpen, setIsDbOpen] = useState(false);
  const [hovered, setHovered] = useState<Entry | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dbEntries;
    return dbEntries.filter((e) =>
      (e.title + '\n' + e.body + '\n' + (e.location ?? ''))
        .toLowerCase()
        .includes(q)
    );
  }, [dbEntries, search]);

  const centroids = useMemo(() => computeCentroids(entries), [entries]);

  const [selected, setSelected] = useState<Entry | null>(null);

  const vpRef = useRef<Viewport>({ scale: 92, tx: 0, ty: 0 });
  type DragState = {
    active: boolean;
    moved: boolean;
    x: number;
    y: number;
    tx: number;
    ty: number;
  };
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const hitRadiusPx = () => clamp(vpRef.current.scale / 18, 14, 80);

  const requestDraw = () => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      // const rect = c.getBoundingClientRect();
      // const dpr = Math.max(1, window.devicePixelRatio || 1);

      // // if (vpRef.current.tx === 0 && vpRef.current.ty === 0) {
      // //   vpRef.current.tx = (rect.width * dpr) / 2;
      // //   vpRef.current.ty = (rect.height * dpr) / 2;
      // // }

      ensureViewportCentered(c, vpRef.current);
      drawScene(ctx, c, vpRef.current, entries, centroids, theme);
    });
  };

  useEffect(() => {
    requestDraw();
    const onResize = () => requestDraw();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    requestDraw();
  }, [entries, centroids, theme]);

  useEffect(() => {
    if (!selected) return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const stillExists = entries.some((e) => e.id === selected.id);
    if (!stillExists) setSelected(null);
  }, [search, entries, selected]);

  const interactionLocked = isDragging || Date.now() < lockUntil;

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;

    c.setPointerCapture(ev.pointerId);

    dragRef.current = {
      active: true,
      moved: false,
      x: ev.clientX,
      y: ev.clientY,
      tx: vpRef.current.tx,
      ty: vpRef.current.ty,
    };

    setIsDragging(false);
    setHovered(null);
    c.style.cursor = 'grab';
  };

  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;

    const drag = dragRef.current;

    if (drag?.active) {
      const dist = Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y);

      if (dist > 6) {
        // treat as pan only after a real movement
        if (!drag.moved) {
          drag.moved = true;
          setIsDragging(true);
        }

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const dx = (ev.clientX - drag.x) * dpr;
        const dy = (ev.clientY - drag.y) * dpr;
        vpRef.current.tx = drag.tx + dx;
        vpRef.current.ty = drag.ty + dy;

        setHovered(null);
        c.style.cursor = 'grabbing';
        requestDraw();
        return;
      }
    }

    if (interactionLocked) {
      setHovered(null);
      return;
    }

    ensureViewportCentered(c, vpRef.current);
    const hit = pickEntryAtPoint(
      ev.clientX,
      ev.clientY,
      c,
      vpRef.current,
      entries,
      hitRadiusPx()
    );
    setHovered(hit);
    setHoverPos({ x: ev.clientX, y: ev.clientY });
    c.style.cursor = hit ? 'pointer' : 'grab';
  };

  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;

    try {
      c.releasePointerCapture(ev.pointerId);
    } catch {}

    const drag = dragRef.current;
    dragRef.current = null;

    setIsDragging(false);
    setLockUntil(Date.now() + 140);
    c.style.cursor = 'grab';

    if (!drag) return;

    // If we actually panned, don't click-select
    if (drag.moved) return;

    ensureViewportCentered(c, vpRef.current);
    const hit = pickEntryAtPoint(
      ev.clientX,
      ev.clientY,
      c,
      vpRef.current,
      entries,
      hitRadiusPx()
    );
    setSelected(hit); // IMPORTANT: allows click-empty to dismiss
  };

  const onPointerCancel = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;

    try {
      c.releasePointerCapture(ev.pointerId);
    } catch {}

    dragRef.current = null;
    setIsDragging(false);
    setHovered(null);
    c.style.cursor = 'grab';
  };

  const onWheel = (ev: React.WheelEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    ensureViewportCentered(c, vpRef.current);

    const rect = c.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const px = (ev.clientX - rect.left) * dpr;
    const py = (ev.clientY - rect.top) * dpr;

    const vp = vpRef.current;

    const worldX = (px - vp.tx) / vp.scale;
    const worldY = (py - vp.ty) / vp.scale;

    const zoom = Math.exp(-ev.deltaY * 0.0012);
    vp.scale = clamp(vp.scale * zoom, 22, 1400);

    const nextPx = worldX * vp.scale + vp.tx;
    const nextPy = worldY * vp.scale + vp.ty;
    vp.tx += px - nextPx;
    vp.ty += py - nextPy;

    requestDraw();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: theme === 'dark' ? '#050608' : '#f3f2ff',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 14,
          left: 14,
          right: 14,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 5,
          pointerEvents: 'none',
          fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            onClick={() => setIsDbOpen(true)}
            style={{
              border: `1px solid ${ui.border}`,
              background: ui.card,
              color: ui.fg,
              borderRadius: 999,
              padding: '8px 12px',
              cursor: 'pointer',
              fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
              fontSize: 13,
              boxShadow: `0 10px 26px ${ui.shadow}`,
              backdropFilter: 'blur(14px)',
            }}
          >
            Log
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.38)',
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries via emotion, city, time…"
              style={{
                width: 'min(420px, 48vw)',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'rgba(255,255,255,0.90)',
                fontSize: 13,
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {entries.length}/{dbEntries.length}
            </div>
          </div>
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            style={{
              margin: 5,
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.10)',
              background:
                theme === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(18,19,24,0.06)',
              color:
                theme === 'dark'
                  ? 'rgba(255,255,255,0.9)'
                  : 'rgba(18,19,24,0.9)',
              cursor: 'pointer',
              boxShadow: '0 10px 26px rgba(0,0,0,0.28)',
              backdropFilter: 'blur(14px)',
              fontSize: 14,
            }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀︎' : '☾'}
          </button>
        </div>

        <div style={{ pointerEvents: 'auto', opacity: 0.0 }}>.</div>
      </div>

      {/* Axes Titles */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 6,
          fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 74,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 12,
            letterSpacing: '0.14em',
            color:
              theme === 'dark'
                ? 'rgba(255,255,255,0.38)'
                : 'rgba(18,19,24,0.40)',
            textTransform: 'uppercase',
          }}
        >
          HIGH ENERGY
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 12,
            letterSpacing: '0.14em',
            color:
              theme === 'dark'
                ? 'rgba(255,255,255,0.38)'
                : 'rgba(18,19,24,0.40)',
            textTransform: 'uppercase',
          }}
        >
          LOW ENERGY
        </div>

        <div
          style={{
            position: 'absolute',
            left: 22,
            top: '50%',
            transform: 'translateY(-50%) rotate(-90deg)',
            transformOrigin: 'left top',
            fontSize: 12,
            letterSpacing: '0.14em',
            color:
              theme === 'dark'
                ? 'rgba(255,255,255,0.38)'
                : 'rgba(18,19,24,0.40)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          UNPLEASANT
        </div>

        <div
          style={{
            position: 'absolute',
            right: 22,
            top: '50%',
            transform: 'translateY(-50%) rotate(90deg)',
            transformOrigin: 'right top',
            fontSize: 12,
            letterSpacing: '0.14em',
            color:
              theme === 'dark'
                ? 'rgba(255,255,255,0.38)'
                : 'rgba(18,19,24,0.40)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          PLEASANT
        </div>
      </div>

      {/* Main Canvas Logic */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onPointerLeave={() => setHovered(null)}
        onPointerCancel={onPointerCancel}
      />

      {/* Hover Tooltip for Each Node*/}
      {hovered &&
        !isDragging &&
        (() => {
          const emotionColor = hashColor(hovered.emotion);
          const emotionBg = emotionColor.replace(')', ' / 0.16)');

          return (
            <div
              style={{
                position: 'fixed',
                left: hoverPos.x + 16,
                top: hoverPos.y - 18,
                zIndex: 20,
                pointerEvents: 'none',
                transform: 'translateY(-100%)',
                borderRadius: 14,
                padding: '10px 12px',
                background:
                  theme === 'dark'
                    ? 'rgba(10,12,16,0.78)'
                    : 'rgba(255,255,255,0.78)',
                border:
                  theme === 'dark'
                    ? '1px solid rgba(255,255,255,0.10)'
                    : '1px solid rgba(18,19,24,0.12)',
                backdropFilter: 'blur(14px)',
                boxShadow:
                  theme === 'dark'
                    ? '0 18px 50px rgba(0,0,0,0.45)'
                    : '0 18px 50px rgba(0,0,0,0.16)',
                minWidth: 220,
                maxWidth: 280,
              }}
            >
              <div
                style={{
                  fontWeight: 760,
                  fontSize: 14,
                  color:
                    theme === 'dark'
                      ? 'rgba(255,255,255,0.92)'
                      : 'rgba(18,19,24,0.92)',
                }}
              >
                {hovered.title}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 6,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: 5,
                    border: `0px solid ${emotionColor}`,
                    color: emotionColor,
                    background: emotionBg,
                    boxShadow: `0 0 18px ${emotionColor}55`,
                    fontSize: 12,
                  }}
                >
                  {hovered.emotion}
                </span>

                <div
                  style={{
                    fontSize: 12,
                    color:
                      theme === 'dark'
                        ? 'rgba(255,255,255,0.62)'
                        : 'rgba(18,19,24,0.62)',
                  }}
                >
                  {fmtDateShort(hovered.createdAt)}
                </div>
              </div>
            </div>
          );
        })()}

      {/* DetailPanel */}
      <DetailPanel
        entry={selected}
        onClose={() => setSelected(null)}
        theme={theme}
      />
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 18,
          transform: 'translateX(-50%)',
          zIndex: 8,
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() => setIsSubmitOpen(true)}
          style={{
            border: `1px solid ${ui.border}`,
            background: ui.card,
            color: ui.fg,
            borderRadius: 999,
            padding: '8px 12px',
            cursor: 'pointer',
            fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
            fontSize: 13,
            boxShadow: `0 10px 26px ${ui.shadow}`,
            backdropFilter: 'blur(14px)',
          }}
        >
          + Submission
        </button>
      </div>

      <SubmitModal
        open={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onSubmit={async (entry) => {
          try {
            const saved = await insertEntry(entry);
            setDbEntries((prev) => [saved, ...prev]);
            setSelected(saved);
          } catch (err: any) {
            console.error(err);
            setDbEntries((prev) => [entry, ...prev]); // fallback so UX still works
            setSelected(entry);
          }
        }}
        theme={theme}
      />

      <DbModal
        open={isDbOpen}
        onClose={() => setIsDbOpen(false)}
        entries={dbEntries}
        onPick={(e) => {
          setIsDbOpen(false);
          setSelected(e);
        }}
        theme={theme}
      />
    </div>
  );
}
