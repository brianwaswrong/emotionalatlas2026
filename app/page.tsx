'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '@/lib/types';
import { makeMockEntries } from '@/lib/simulate';
import { ensureViewportCentered, type Viewport } from '@/canvas/viewport';
import { clamp, hashColor, fmtDateShort } from '@/lib/utils';
import { drawScene, entryAnchorWorld } from '@/canvas/draw';
import { pickEntryAtPoint } from '@/canvas/hitTest';
import { DetailPanel } from '@/components/DetailPanel';
import { SubmitModal } from '@/components/SubmitModal';
import { DbModal } from '@/components/DbModal';
import { fetchEntries, insertEntry, fetchEntryById} from '@/lib/db';
import { EMOTIONS_32, PLUTCHIK_8, TIER1_BY_TIER2 } from "@/lib/emotions";
import {emotionColor, emotionBg} from '@/lib/colors'
import Link from "next/link";
import { Crimson_Pro } from 'next/font/google';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  type NodeState = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ax: number; // anchor x
    ay: number; // anchor y
  };
  
  const nodeStateRef = useRef<Map<string, NodeState>>(new Map());
  const relaxRafRef = useRef<number | null>(null);  

  // Modal state for the About page
  const [aboutOpen, setAboutOpen] = useState(false);

  const ensureNodeStates = (list: Entry[]) => {
    const m = nodeStateRef.current;
  
    for (const e of list) {
      // anchor in world space (already scaled)
      const a = entryAnchorWorld(e);
  
      const prev = m.get(e.id);
      if (!prev) {
        // start exactly at anchor (no jump)
        // m.set(e.id, { x: a.x, y: a.y, vx: 0, vy: 0, ax: a.x, ay: a.y });
        const jitter = 0.35; // try 0.25–0.8 in world units
        m.set(e.id, {
          x: a.x + (Math.random() - 0.5) * jitter,
          y: a.y + (Math.random() - 0.5) * jitter,
          vx: 0,
          vy: 0,
          ax: a.x,
          ay: a.y,
        });
      } else {
        // keep current x/y, but update anchor (in case data changed)
        prev.ax = a.x;
        prev.ay = a.y;
      }
    }
  
    // optional: prune states not in list (keeps map small)
    const ids = new Set(list.map((e) => e.id));
    for (const id of m.keys()) {
      if (!ids.has(id)) m.delete(id);
    }
  };
  
  const getPos = (e: Entry) => {
    const st = nodeStateRef.current.get(e.id);
    if (st) return { x: st.x, y: st.y };
    return entryAnchorWorld(e);
  };  

  const tickPhysics = (dt: number) => {
    const spring = 8.0;
    const damping = 0.82;
    const maxSpeed = 6.0;
  
    const Z_TIER2 = 180;
    const GRAVITY_TIER1 = 0.010;
    const GRAVITY_TIER2 = 0.014;
  
    // -----------------------------
    // REPULSION TUNING
    // -----------------------------
    const REPULSION_STRENGTH = 0.05; // start 0.01–0.05
    const REPULSION_RADIUS = 0.28;    // in WORLD units (not px). start 0.12–0.30
    const SOFTENING = 1e-4;           // avoid divide-by-zero
    const MAX_REPULSION = 0.12;       // clamps insane forces
  
    const m = nodeStateRef.current;
    const vp = vpRef.current;
    const useTier2 = vp.scale >= Z_TIER2;
  
    const entries = entriesRef.current;
  
    // Build a compact list of active nodes (id + state) to avoid repeated Map lookups
    const nodes: Array<{ id: string; st: NodeState; e: Entry }> = [];
    for (const e of entries) {
      const st = m.get(e.id);
      if (!st) continue;
      nodes.push({ id: e.id, st, e });
    }
  
    // --------------------------------------------------
    // A) Repulsion (pairwise)
    // --------------------------------------------------
    const r2 = REPULSION_RADIUS * REPULSION_RADIUS;
  
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i].st;
  
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j].st;
  
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + SOFTENING;
  
        // Only repel if within radius (keeps it cheap-ish)
        if (d2 > r2) continue;
  
        const d = Math.sqrt(d2);
  
        // Smooth falloff: stronger when closer, 0 at radius
        const t = 1 - d / REPULSION_RADIUS; // 0..1
        let f = REPULSION_STRENGTH * t * t; // quadratic falloff
  
        // Convert into acceleration-ish push (normalized direction)
        const nx = dx / d;
        const ny = dy / d;
  
        // clamp
        if (f > MAX_REPULSION) f = MAX_REPULSION;
  
        // push apart equally (Newton smiles somewhere)
        a.vx -= nx * f;
        a.vy -= ny * f;
        b.vx += nx * f;
        b.vy += ny * f;
      }
    }
  
    // --------------------------------------------------
    // B) Spring + cluster gravity + damping + integrate (your existing loop)
    // --------------------------------------------------
    for (const { st, e } of nodes) {
      // 1) Spring back toward base anchor
      st.vx += (st.ax - st.x) * spring * dt;
      st.vy += (st.ay - st.y) * spring * dt;
  
      // 2) Cluster gravity
      let target: { x: number; y: number } | undefined;
  
      if (useTier2) {
        if (e.emotion) target = centroidTier2ByName.get(e.emotion);
      } else {
        if (e.emotion) {
          const tier1 = TIER1_BY_TIER2[e.emotion];
          if (tier1) target = centroidTier1ByName.get(tier1);
        }
      }
  
      if (target) {
        const g = useTier2 ? GRAVITY_TIER2 : GRAVITY_TIER1;
        st.vx += (target.x - st.x) * g;
        st.vy += (target.y - st.y) * g;
      }
  
      // 3) Damping
      st.vx *= damping;
      st.vy *= damping;
  
      // 4) Clamp speed
      const sp = Math.hypot(st.vx, st.vy);
      if (sp > maxSpeed) {
        const k = maxSpeed / sp;
        st.vx *= k;
        st.vy *= k;
      }
  
      // 5) Integrate
      st.x += st.vx * dt;
      st.y += st.vy * dt;
    }
  };  
  
  
  const runRelaxation = (ms = 450) => {
    // cancel any existing run
    if (relaxRafRef.current != null) {
      cancelAnimationFrame(relaxRafRef.current);
      relaxRafRef.current = null;
    }
  
    const start = performance.now();
    let last = start;
  
    const step = (now: number) => {
      const elapsed = now - start;
      const dt = Math.min(0.033, (now - last) / 1000); // cap dt ~33ms
      last = now;
  
      // a few substeps makes it smoother without needing huge spring
      tickPhysics(dt);
      // tickPhysics(dt);
  
      requestDraw();
  
      if (elapsed < ms) {
        relaxRafRef.current = requestAnimationFrame(step);
      } else {
        relaxRafRef.current = null;
      }
    };
  
    relaxRafRef.current = requestAnimationFrame(step);
  };
  
  const zoomRelaxTimeoutRef = useRef<number | null>(null);

  // Small Debounce that fires after scrolling stops
  const scheduleZoomRelax = () => {
    if (zoomRelaxTimeoutRef.current) window.clearTimeout(zoomRelaxTimeoutRef.current);
    zoomRelaxTimeoutRef.current = window.setTimeout(() => {
      runRelaxation(220);
      zoomRelaxTimeoutRef.current = null;
    }, 90);
  };

  // Const definitions for 3D tilt
  const [tilt, setTilt] = useState({ x: 0, y: 0 }); // degrees
  const tiltTargetRef = useRef({ x: 0, y: 0 });

  // Theme Definitions
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
          fg: 'rgba(24,22,18,0.92)',         // warm ink
          fg2: 'rgba(24,22,18,0.70)',
          border: 'rgba(24,22,18,0.14)',
          card: 'rgba(24,22,18,0.045)',
          card2: 'rgba(24,22,18,0.030)',
          panel: 'rgba(242,240,233,0.92)',   // warm paper glass
          shadow: 'rgba(10,8,6,0.14)',
          overlay: 'rgba(24,22,18,0.16)',    // slightly warmer overlay
        }
        ;

  const [dbEntries, setDbEntries] = useState<Entry[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(true);

  const didLoadRef = useRef(false);

  useEffect(() => {
    console.log("LOAD EFFECT FIRED", Date.now());

    // Meant to prevent Strict Mode by only allowing it to run once, but it malfunctioned
    // if (didLoadRef.current) return;
    // didLoadRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        setDbLoading(true);
        setDbError(null);

        const rows = await fetchEntries();
        if (cancelled) return;

        setDbEntries(rows);
        setTimeout(() => {
          requestDraw();
          requestAnimationFrame(() => requestDraw());
        }, 0);
        
        ensureNodeStates(rows);
        runRelaxation(600);
      } catch (e: any) {
        if (cancelled) return;
        setDbError(e?.message ?? "Failed to load entries");
        setDbEntries([]);
      } finally {
        if (cancelled) return;
        setDbLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
      (e.title + '\n' + e.body + '\n' + e.emotion + '\n'+ (e.location ?? ''))
        .toLowerCase()
        .includes(q)
    );
  }, [dbEntries, search]);

  //1.10.26 New centroids
  const centroidsTier2 = useMemo(() => {
    // group by tier2 emotion
    const acc = new Map<string, { x: number; y: number; n: number }>();
    for (const e of entries) {
      if (!e.emotion || e.valence == null || e.arousal == null) continue;
      const cur = acc.get(e.emotion) ?? { x: 0, y: 0, n: 0 };
      cur.x += e.valence;
      cur.y += e.arousal;
      cur.n += 1;
      acc.set(e.emotion, cur);
    }
  
    const out: Array<{ label: string; tier1?: string; x: number; y: number }> = [];
    acc.forEach((v, emotion) => {
      out.push({
        label: emotion,
        tier1: TIER1_BY_TIER2[emotion], // import mapping
        x: v.x / v.n,
        y: v.y / v.n,
      });
    });
    return out;
  }, [entries]);
  
  const centroidsTier1 = useMemo(() => {
    // group by tier1
    const acc = new Map<string, { x: number; y: number; n: number }>();
    for (const e of entries) {
      if (!e.emotion || e.valence == null || e.arousal == null) continue;
      const tier1 = TIER1_BY_TIER2[e.emotion];
      if (!tier1) continue;
  
      const cur = acc.get(tier1) ?? { x: 0, y: 0, n: 0 };
      cur.x += e.valence;
      cur.y += e.arousal;
      cur.n += 1;
      acc.set(tier1, cur);
    }
  
    const out: Array<{ label: string; tier1?: string; x: number; y: number }> = [];
    acc.forEach((v, tier1) => {
      out.push({
        label: tier1,
        tier1,
        x: v.x / v.n,
        y: v.y / v.n,
      });
    });
    return out;
  }, [entries]);
  
  function makeCentroidMap(
    centroids: Array<{ label: string; tier1?: string; x: number; y: number }>
  ) {
    const m = new Map<string, { x: number; y: number }>();
    for (const c of centroids) m.set(c.label, { x: c.x, y: c.y });
    return m;
  }  

  const centroidTier1ByName = useMemo(
    () => makeCentroidMap(centroidsTier1),
    [centroidsTier1]
  );
  
  const centroidTier2ByName = useMemo(
    () => makeCentroidMap(centroidsTier2),
    [centroidsTier2]
  );  

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
  const lockUntilRef = useRef(0);
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

      if (!entriesRef.current || entriesRef.current.length === 0) {
        // optional: clear + draw a tiny “Loading…” indicator
        ctx.clearRect(0, 0, c.width, c.height);
        return;
      }

      // console.log("DRAW", { entries: entriesRef.current.length, scale: vpRef.current.scale, tx: vpRef.current.tx, ty: vpRef.current.ty });

      drawScene(
        ctx,
        c,
        vpRef.current,
        entriesRef.current,
        centroidsTier1Ref.current,
        centroidsTier2Ref.current,
        themeRef.current,
        getPos);
    });
  };

  const entriesRef = useRef(entries);
  // const entriesRef = useRef<Entry[]>([]);
  const centroidsTier1Ref = useRef(centroidsTier1);
  const centroidsTier2Ref = useRef(centroidsTier2);
  const themeRef = useRef(theme);

useEffect(() => { entriesRef.current = entries; }, [entries]);
useEffect(() => { centroidsTier1Ref.current = centroidsTier1; }, [centroidsTier1]);
useEffect(() => { centroidsTier2Ref.current = centroidsTier2; }, [centroidsTier2]);
useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

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
  }, [entries, centroidsTier1, centroidsTier2, theme]);  

  useEffect(() => {
    if (!selected) return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const stillExists = entries.some((e) => e.id === selected.id);
    if (!stillExists) setSelected(null);
  }, [search, entries, selected]);

  useEffect(() => {
    if (!selected?.id) return;
  
    let cancelled = false;
  
    (async () => {
      try {
        // If it's already hydrated, don’t refetch
        if (selected.imageUrl || (selected.body && selected.body.length > 0)) return;
  
        const full = await fetchEntryById(selected.id);
        if (cancelled) return;
  
        setSelected(full); // replace light selected with full selected
      } catch (e) {
        console.error("fetchEntryById failed", e);
      }
    })();
  
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);
  
  useEffect(() => {
    ensureNodeStates(entries);
    // runRelaxation(250); // optional
  }, [entries.length]);
  
  useEffect(() => {
    requestDraw();
    const id1 = requestAnimationFrame(() => requestDraw());
    const id2 = requestAnimationFrame(() => requestDraw());
    const t = setTimeout(() => requestDraw(), 50);
  
    const onResize = () => requestDraw();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  

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

      // tilt target based on pointer delta (pure illusion, looks 3D)
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;

      // clamp to keep it classy, not nauseating
      const clampTilt = (v: number) => Math.max(-7, Math.min(7, v));
      tiltTargetRef.current = {
        x: clampTilt((-dy / 180) * 6),
        y: clampTilt((dx / 180) * 6),
      };
      setTilt(tiltTargetRef.current);


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

    if (isDragging || Date.now() < lockUntilRef.current) {
      setHovered(null);
      return;
    }
    
    ensureViewportCentered(c, vpRef.current);
    const hit = pickEntryAtPoint(
      ev.clientX,
      ev.clientY,
      c,
      vpRef.current,
      entriesRef.current,
      hitRadiusPx(),
      getPos
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
    lockUntilRef.current = Date.now() + 140;
    c.style.cursor = 'grab';

    if (!drag) return;

    // If we actually panned, don't click-select
    if (drag.moved) return;


    // New code to support tilt / release functionality
    setTilt({ x: 0, y: 0 });
    tiltTargetRef.current = { x: 0, y: 0 };

    ensureViewportCentered(c, vpRef.current);
    const hit = pickEntryAtPoint(
      ev.clientX,
      ev.clientY,
      c,
      vpRef.current,
      entriesRef.current,
      hitRadiusPx(),
      getPos
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
    // ev.preventDefault();
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

    // after zoom math
    scheduleZoomRelax();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: theme === 'dark' ? '#050608' : '#f3f2ff',
      }}
    >
      {/* Top Bar */}
      <header
        style={{
          position: "relative",
          top: 0,
          zIndex: 20,
          padding: "8px 16px",
          background: "transparent",
          backdropFilter: "none",
          boxShadow: 'none',
          // WebkitBackdropFilter: "blur(4px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            margin: "0 auto",
            background: "transparent",
          }}
        >
          {/* LEFT: Title */}
          <div style={{ justifySelf: "start", minWidth: 0,background: "transparent", }}>
            <div style={{ color: ui.fg, fontWeight: 600, fontFamily: `"Crimson Pro", Georgia, Times New Roman, sans-serif`, letterSpacing: 0.2, lineHeight: 1.1 }}>
              The Socha Project
            </div>
            <div style={{ color: ui.fg, fontSize: 12, fontStyle: 'italic', fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`, opacity: 0.72, marginTop: 2 }}>
              How we talk to AI &amp; ourselves
            </div>
          </div>

          {/* CENTER: Log + Search + Toggle */}
          <div
            style={{
              justifySelf: "center",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
            }}
          >
            <div
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'right',
                  textAlign: 'right',
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
                      color: ui.fg,
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
                    width: 108,
                    height: 36,
                    borderRadius: 999,
                    border: `1px solid ${ui.border}`,
                    background: ui.card,
                    color: ui.fg,
                    cursor: 'pointer',
                    boxShadow: '0 10px 26px rgba(0,0,0,0.28)',
                    backdropFilter: 'blur(14px)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? '☼  Light Mode' : '☾⋆ Dark Mode'}
                </button>
              </div>
          </div>

          {/* RIGHT: About */}
          <div style={{ justifySelf: "end",background: "transparent",}}>
          <button
            onClick={() => setAboutOpen(true)}
            style={{
              color: ui.fg,
              fontSize: 13,
              padding: "8px 10px",
              borderRadius: 10,
              // border: `1px solid ${ui.border}`,
              background: "transparent",
              backdropFilter: "blur(10px)",
              cursor: "pointer",
            }}
          >
            About
          </button>
          </div>
        </div>

        {/* MOBILE: stack center controls on a second row */}
        <div
          style={{
            display: "none",
            marginTop: 10,
          }}
          className="topbar-mobile"
        >
          {/* optional: put Search + Toggle here on mobile */}
        </div>

        <style jsx>{`
          @media (max-width: 720px) {
            header > div > div {
              grid-template-columns: 1fr auto;
              grid-template-areas:
                "left right"
                "center center";
            }
            header > div > div > :nth-child(1) {
              grid-area: left;
            }
            header > div > div > :nth-child(2) {
              grid-area: center;
              justify-self: stretch;
            }
            header > div > div > :nth-child(3) {
              grid-area: right;
            }
          }
        `}</style>
      </header>

      {/* <div
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
      
        

        <div style={{ pointerEvents: 'auto', opacity: 0.0 }}>.</div>
      </div> */}

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
            bottom: 74,
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
      <div
        style={{
          width: "100%",
          height: "100%",
          // transformStyle: "preserve-3d",
          // transform: `perspective(2400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          // transition: isDragging ? "none" : "transform 220ms ease",
          // willChange: "transform",
          position: 'absolute',
          inset: 0,
          backgroundColor: theme === 'dark' ? '#050608' : '#f3f2ff',
          backgroundImage:
            theme === 'dark'
              ? `
                radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px),
                radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)
              `
              : `
                radial-gradient(rgba(0,0,0,0.10) 1px, transparent 1px),
                radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)
              `,
          backgroundSize: '22px 22px, 44px 44px',
          backgroundPosition: '0 0, 11px 11px',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onPointerLeave={() => setHovered(null)}
          onPointerCancel={onPointerCancel}
        />
      </div>


      {/* Hover Tooltip for Each Node*/}
      {hovered &&
        !isDragging &&
        (() => {
          const c = emotionColor(
            hovered.classification?.plutchikPrimary,
            hovered.emotion
          );
        
          const b = emotionBg(
            hovered.classification?.plutchikPrimary,
            hovered.emotion
          );

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
                    color: c,
                    background: b,
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
        onSubmit={(entry: any) => {
          // SubmitModal already inserted + classified + updated in Supabase.
          // This handler should ONLY update UI state.
          setDbEntries((prev) => [entry, ...prev]);
          setSelected(entry);
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

      {aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(820px, 94vw)",
              maxHeight: "min(95vh, 900px)",
              overflow: "auto",
              borderRadius: 18,
              border: `1px solid ${ui.border}`,
              background: ui.panel,
              color: ui.fg,
              boxShadow: "0 30px 120px rgba(0,0,0,0.55)",
              padding: 32,
              fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, fontFamily: `"Crimson Pro", Georgia, Times New Roman, sans-serif`, letterSpacing: 0.2 }}>About the Project</div>
                <div style={{ fontSize: 12, opacity: 0.72, marginTop: 3,fontStyle:'italic' }}>
                  An emotional atlas mapping how we talk to AI and ourselves.
                </div>
              </div>
              
              <button
                onClick={() => setAboutOpen(false)}
                aria-label="Close"
                style={{
                  top: 12,
                  right: 12,
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  border: `1px solid ${ui.border}`,
                  background: ui.card,
                  color: ui.fg,
                  backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              boxShadow:
                theme === 'dark'
                  ? '0 10px 30px rgba(0,0,0,0.35)'
                  : '0 10px 30px rgba(0,0,0,0.14)',
              zIndex: 100,
                }}
              >
                ✕
              </button>
            </div>
            <hr style={{ marginTop: 16, marginBottom: 16,opacity:0.4 }}></hr>

            {/* SECTION 1 */}
            <section style={{ marginTop: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                Background
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.9 }}>
                <p>~52% of adults use chatbots for psychological support, with <b><i>1M (of 800m ChatGPT) weekly users discussing suicide</i></b>. 
                These tools <i>feel so useful</i> they&apos;ve elicited likely more expressed strife, introspection, insecurity, and agita in the last 
                3 years than all prior periods combined, when a pen and paper or Reddit thread was our best tool. In turn, the model companies have 
                inadvertently collected the <b><i>greatest recorded distillation of human&apos;s psychological condition ever</i></b>, yet similar to analog 
                journals, it all remains siloed (understandably). </p>
                <br></br>
                <p>There&apos;s likely some unknown risk to so much of humanity deferring emotional support to chatbots and AI companions lacking nervous systems yet that 
                  never misunderstand, feel burdened, disclose, or critique. There&apos;s no indication this phenomenon will undo itself. </p>
                <br></br>
                <p>While we build tools or AI systems that may actually improve intra-human connection - <b>The Socha Project</b> was created as a 
                central repository to make it as easy  &amp; rewarding as possible to unearth these emotional entries for others to experience 
                &amp; benefit from in the meantime, rather than sit idly  &amp; underutilized in a data center.</p>
              </div>
            </section>

            <section style={{ marginTop: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Valence &amp; Arousal Circumplex (the 2D space)
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.9 }}>
              To map thousands of journal entries and AI chatbot messages in a coherent, navigable way, 
              we designed a model to score each submission first using James Russell&apos;s <b>Valence-Arousal Circumplex Model</b>, 
              a two-dimensional framework plotting all entries on an x/y axis based on <i><b>Valence </b> (pleasant vs. unpleasant)</i> and 
              <i><b>Arousal (intensity/activation).</b></i>
              </div>
            </section>

            {/* SECTION 2 */}
            <section style={{ marginTop: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Plutchik&apos;s Wheel of Emotions (8 Primary → 32 emotions)
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.9 }}>
                Next, every submission is classified  &amp; coded using psychologist <b>Robert Plutchik&apos;s Wheel of Emotions</b>, 
                which distills the human experience into 8 primary emotions, and 24 to 32 nested, secondaries representing combinations, 
                deviations, or various intensities within the primary emotion.
              </div>
            </section>

            {/* SECTION 3 */}
            <section style={{ marginTop: 20, paddingBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Classification  &amp; visualization
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.9 }}>
              Lastly, we project all entries on a force directed graph, using a physics simulation where emotionally resonant 
              entries or conversations exert some attraction and dissimilar entries exert some repulsion against each other, 
              arranging disparate nodes from thousands of people in some sensible fashion.
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
