'use client';
import type { Entry } from '../lib/types';
import { fmtDate, hashColor } from '../lib/utils';

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

export function DbModal({
  open,
  onClose,
  entries,
  onPick,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  entries: Entry[];
  onPick: (e: Entry) => void;
  theme: 'dark' | 'light';
}) {
  if (!open) return null;

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
          overlay: 'rgba(0,0,0,0.45)',
          shadow: 'rgba(0,0,0,0.45)',
          rowHover: 'rgba(255,255,255,0.03)',
        }
      : {
          fg: 'rgba(18,19,24,0.92)',
          fg2: 'rgba(18,19,24,0.72)',
          fg3: 'rgba(18,19,24,0.48)',
          border: 'rgba(18,19,24,0.12)',
          card: 'rgba(18,19,24,0.06)',
          card2: 'rgba(18,19,24,0.04)',
          panel: 'rgba(255,255,255,0.92)',
          overlay: 'rgba(18,19,24,0.20)',
          shadow: 'rgba(0,0,0,0.18)',
          rowHover: 'rgba(18,19,24,0.04)',
        };

  const th: React.CSSProperties = {
    padding: '10px 10px',
    borderBottom: `1px solid ${ui.border}`,
    textAlign: 'left',
    color: ui.fg2,
    fontWeight: 760,
    background: ui.card,
  };

  const td: React.CSSProperties = {
    padding: '9px 10px',
    borderBottom: `1px solid ${ui.border}`,
    verticalAlign: 'top',
    color: ui.fg,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background: ui.overlay,
        fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
        color: ui.fg,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, 96vw)',
          maxHeight: '86vh',
          overflow: 'hidden',
          borderRadius: 22,
          background: ui.panel,
          border: `1px solid ${ui.border}`,
          backdropFilter: 'blur(18px)',
          boxShadow: `0 30px 80px ${ui.shadow}`,
          color: ui.fg,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${ui.border}`,
          }}
        >
          <div style={{ fontWeight: 760, color: ui.fg }}>Data log</div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: `1px solid ${ui.border}`,
              background: ui.card,
              color: ui.fg,
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <div
          style={{
            padding: 12,
            overflow: 'auto',
            maxHeight: 'calc(86vh - 60px)',
          }}
        >
          <div
            style={{
              border: `1px solid ${ui.border}`,
              borderRadius: 18,
              overflow: 'hidden',
              background: ui.card2,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Emotion</th>
                  <th style={th}>Title</th>
                  <th style={th}>Location</th>
                  <th style={th}>V</th>
                  <th style={th}>A</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const c = hashColor(e.emotion);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => onPick(e)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(ev) => {
                        (ev.currentTarget.style as any).background =
                          ui.rowHover;
                      }}
                      onMouseLeave={(ev) => {
                        (ev.currentTarget.style as any).background =
                          'transparent';
                      }}
                    >
                      <td style={td}>{fmtDate(e.createdAt)}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: `1px solid ${c}`,
                            background: ui.card,
                            color: ui.fg2,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 999,
                              background: c,
                              boxShadow: `0 0 12px ${c}`,
                            }}
                          />
                          {e.emotion}
                        </span>
                      </td>
                      <td style={td}>{e.title}</td>
                      <td style={td}>{e.location ?? ''}</td>
                      <td style={td}>{e.valence.toFixed(2)}</td>
                      <td style={td}>{e.arousal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: ui.fg2 }}>
            Click a row to open the entry.
          </div>
        </div>
      </div>
    </div>
  );
}
