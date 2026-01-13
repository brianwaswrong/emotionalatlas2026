'use client';
import type { Entry } from '../lib/types';
import { fmtDate, hashColor } from '../lib/utils';
import { emotionColor, emotionBg } from "@/lib/colors";
import { useEffect, useMemo, useRef, useState } from 'react';

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 6L18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 22s7-4.5 7-12a7 7 0 10-14 0c0 7.5 7 12 7 12z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 13a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconCal() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3v3M17 3v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 5h12a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconPulse() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12h4l2-6 4 12 2-6h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DetailPanel({
  entry,
  onClose,
  theme,
}: {
  entry: Entry | null;
  onClose: () => void;
  theme: 'dark' | 'light';
}) {
  const open = !!entry;

  const ui =
    theme === 'dark'
      ? {
          fg: 'rgba(255,255,255,0.90)',
          fg2: 'rgba(255,255,255,0.72)',
          fg3: 'rgba(255,255,255,0.40)',
          border: 'rgba(255,255,255,0.10)',
          card: 'rgba(255,255,255,0.06)',
          card2: 'rgba(255,255,255,0.04)',
          panel: 'rgba(10,12,16,0.92)',
          shadow: 'rgba(0,0,0,0.35)',
          coverGrad:
            'radial-gradient(circle at 35% 15%, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.75) 100%), linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.75) 100%)',
          closeBg: 'rgba(0,0,0,0.28)',
          closeBorder: 'rgba(255,255,255,0.16)',
        }
      : {
          fg: 'rgba(18,19,24,0.92)',
          fg2: 'rgba(18,19,24,0.72)',
          fg3: 'rgba(18,19,24,0.48)',
          border: 'rgba(18,19,24,0.12)',
          card: 'rgba(18,19,24,0.06)',
          card2: 'rgba(18,19,24,0.04)',
          panel: 'rgba(255,255,255,0.92)',
          shadow: 'rgba(0,0,0,0.18)',
          coverGrad:
            'radial-gradient(circle at 35% 15%, rgba(255,255,255,0.00) 0%, rgba(246,245,255,0.55) 55%, rgba(246,245,255,0.88) 100%), linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, rgba(246,245,255,0.62) 70%, rgba(246,245,255,0.92) 100%)',
          closeBg: 'rgba(255,255,255,0.55)',
          closeBorder: 'rgba(18,19,24,0.16)',
        };

  const panelBg =
    theme === 'dark' ? 'rgba(10,12,16,0.92)' : 'rgba(255,255,255,0.92)';

  const [imgLoaded, setImgLoaded] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);

  if (!entry) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(420px, 92vw)',
          transform: open ? 'translateX(0%)' : 'translateX(105%)',
          transition: 'transform 240ms ease',
          zIndex: 10,
          background: ui.panel,
          backdropFilter: 'blur(18px)',
          borderLeft: `1px solid ${ui.border}`,
          color: ui.fg,
          boxShadow: `-18px 0 60px ${ui.shadow}`,
          fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
        }}
      />
    );
  }

  const color = emotionColor(
    entry.classification?.plutchikPrimary,
    entry.emotion
  );
  
  const bg = emotionBg(
    entry.classification?.plutchikPrimary,
    entry.emotion
  );
  
  const showImg = !!entry.imageUrl;
  const shouldShowRealImg = showImg && entry.imageUrl && imgLoaded;

  useEffect(() => {
    setImgLoaded(false);
    if (!entry?.imageUrl) return;

    const img = new Image();
    img.onload = () => setImgLoaded(true);
    img.onerror = () => setImgLoaded(true); // fail “open” so you don’t spinner forever
    img.src = entry.imageUrl;
  }, [entry?.id, entry?.imageUrl]);

  const EmotionPill = ({ label }: { label: string }) => {
    const c = emotionColor(
      entry.classification?.plutchikPrimary,
      label
    );
  
    const b = emotionBg(
      entry.classification?.plutchikPrimary,
      label
    );
  
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 999,
          border: `1px solid ${c}`,
          background:
            theme === "dark"
              ? b.replace("/ 0.16", "/ 0.22")
              : b.replace("/ 0.16", "/ 0.14"),
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 18px ${c}55`,
          color: c,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: c,
            boxShadow: `0 0 14px ${c}`,
          }}
        />
        {label}
      </span>
    );
  };  
  
  return (
  
    <div
      onClick={() => onClose?.()} // optional: only if you have onClose
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        background: open ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
        backdropFilter: open ? "blur(6px)" : "blur(0px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 220ms ease, backdrop-filter 220ms ease",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
  {/* Modal */}
  <div
    onClick={(e) => e.stopPropagation()}
    style={{
      width: "min(720px, 92vw)",
      maxHeight: "min(85vh, 820px)",
      overflow: "auto",
      transform: open ? "translateY(0px) scale(1)" : "translateY(18px) scale(0.98)",
      opacity: open ? 1 : 0,
      transition: "transform 240ms ease, opacity 240ms ease",
      background: ui.panel,
      backdropFilter: "blur(12px)",
      border: `1px solid ${ui.border}`,
      color: ui.fg,
      boxShadow: `0 24px 80px ${ui.shadow}`,
      borderRadius: 18,
      fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
    }}
  >
      <div style={{ height: '100%', overflow: 'auto' }}>
        <div
          style={{
            position: 'relative',
            height: 260,
            overflow: 'hidden',
            background: theme === 'dark' ? '#111' : '#f6f5ff',
          }}
        >
          <div
            onClick={() => {
              if (shouldShowRealImg) setShowImageViewer(true);
            }}
            style={{
              position: 'absolute',
              inset: 0,
              cursor: shouldShowRealImg ? 'zoom-in' : 'default',
              backgroundImage: shouldShowRealImg
                ? `url(${entry.imageUrl})`
                : `radial-gradient(circle at 50% 40%, ${color} 0%, transparent 60%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'saturate(1.1) contrast(1.05)',
              transform: 'scale(1.02)',
            }}
          >

          {/* Dark/Light tint over the image */}
          <div
            style={{ position: 'absolute', inset: 0, background: ui.coverGrad }}
          />

          {/* Bottom transition gradient */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 130,
              opacity: entry.source === 'image' ? 1 : 0, // ← this is the fix
              background: `linear-gradient(
                  to top,
                  ${panelBg} 0%,
                  ${panelBg} 34%,
                  ${
                    theme === 'dark'
                      ? 'rgba(10,12,16,0.55)'
                      : 'rgba(255,255,255,0.55)'
                  } 72%,
                  rgba(0,0,0,0.00) 100%
                )
              `,
              pointerEvents: 'none',
            }}
          />
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
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
            <IconX />
          </button>
        </div>

        <div style={{ padding: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: -34,
              position: 'relative',
              zIndex: 3,
            }}
          >
            <EmotionPill label={entry.emotion} />
            {entry.location ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: ui.fg2,
                  fontSize: 12,
                }}
              >
                <IconPin /> {entry.location}
              </span>
            ) : null}
          </div>

          <div
            style={{
              fontSize: 26,
              fontWeight: 760,
              letterSpacing: '-0.02em',
              margin: '10px 0',
            }}
          >
            {entry.title}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: ui.fg2,
              fontSize: 12,
              margin: '6px 0 12px 0',
            }}
          >
            <IconCal /> {fmtDate(entry.createdAt)}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div
              style={{
                flex: 1,
                borderRadius: 14,
                border: `1px solid ${ui.border}`,
                background: ui.card2,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: ui.fg2,
                }}
              >
                <IconPulse /> Valence
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 760,
                  marginTop: 6,
                  color: ui.fg,
                }}
              >
                {entry.valence.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: ui.fg2, marginTop: 4 }}>
                {entry.valence >= 0 ? 'Positive' : 'Negative'}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                borderRadius: 14,
                border: `1px solid ${ui.border}`,
                background: ui.card2,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 10,
                  color: ui.fg2,
                }}
              >
                <IconPulse /> Arousal
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 760,
                  marginTop: 6,
                  color: ui.fg,
                }}
              >
                {entry.arousal.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: ui.fg2, marginTop: 4 }}>
                {entry.arousal >= 0 ? 'High Energy' : 'Low Energy'}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: 12,
              letterSpacing: '0.14em',
              color: ui.fg3,
            }}
          >
            {entry.source === "image"
              ? "JOURNAL ENTRY"
              : "CHATGPT / AI CONVERSATION"}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 15,
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              color: ui.fg,
            }}
          >
            {entry.body}
          </div>
        </div>
      </div>
    </div>

    {showImageViewer && (
    <div
      onClick={() => setShowImageViewer(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={entry.imageUrl}
        alt=""
        style={{
          maxWidth: '92vw',
          maxHeight: '92vh',
          objectFit: 'contain',
          borderRadius: 12,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  )}


  </div>
  );
}
