'use client';
import { useEffect, useState } from 'react';
import type { Entry } from '../lib/types';
import { simulateClassification, simulateOCR } from '../lib/simulate';
import { uid } from '../lib/utils';

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

function IconUpload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 8l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3h7l3 3v15a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M14 3v4a1 1 0 001 1h4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

type Mode = 'pick' | 'image' | 'text';

export function SubmitModal({
  open,
  onClose,
  onSubmit,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: Entry) => Promise<void> | void;
  theme: 'dark' | 'light';
}) {
  const [mode, setMode] = useState<Mode>('pick');

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [ocrText, setOcrText] = useState('');
  const [textBody, setTextBody] = useState('');
  const [location, setLocation] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const ui =
    theme === 'dark'
      ? {
          fg: 'rgba(255,255,255,0.90)',
          fg2: 'rgba(255,255,255,0.72)',
          border: 'rgba(255,255,255,0.10)',
          card: 'rgba(255,255,255,0.06)',
          card2: 'rgba(255,255,255,0.04)',
          panel: 'rgba(10,12,16,0.92)',
          overlay: 'rgba(0,0,0,0.45)',
          shadow: 'rgba(0,0,0,0.45)',
        }
      : {
          fg: 'rgba(18,19,24,0.92)',
          fg2: 'rgba(18,19,24,0.72)',
          border: 'rgba(18,19,24,0.12)',
          card: 'rgba(18,19,24,0.06)',
          card2: 'rgba(18,19,24,0.04)',
          panel: 'rgba(255,255,255,0.92)',
          overlay: 'rgba(18,19,24,0.20)',
          shadow: 'rgba(0,0,0,0.18)',
        };

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!open) return;
    setMode('pick');
    setImageFile(null);
    setOcrText('');
    setTextBody('');
    setLocation('');
    setIsProcessing(false);
  }, [open]);

  if (!open) return null;

  const submitFromText = async (text: string, img?: string) => {
    const clean = text.trim();
    if (!clean) return;

    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 350));

    const cls = simulateClassification(clean);
    const createdAt = new Date().toISOString().slice(0, 10);

    const entry: Entry = {
      id: uid(),
      title: cls.title,
      body: clean,
      createdAt,
      valence: cls.valence,
      arousal: cls.arousal,
      emotion: cls.emotion,
      location: location.trim() || undefined,
      imageUrl: img,
      source: img ? 'image' : 'text',
      ocrText: img ? clean : undefined,
      classification: {
        emotion: cls.emotion,
        valence: cls.valence,
        arousal: cls.arousal,
        plutchikPrimary: cls.plutchikPrimary,
        confidence: cls.confidence,
      },
    };

    onSubmit(entry);
    setIsProcessing(false);
    onClose();
  };

  const onPickFile = async (f: File) => {
    setImageFile(f);
    setIsProcessing(true);
    const simulated = simulateOCR(f);
    await new Promise((r) => setTimeout(r, 550));
    setOcrText(simulated);
    setIsProcessing(false);
  };

  const onDrop = async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const f = ev.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return;
    await onPickFile(f);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background: ui.overlay,
        fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(840px, 96vw)',
          maxHeight: '86vh',
          overflow: 'hidden',
          borderRadius: 22,
          background: ui.panel,
          border: `1px solid ${ui.border}`,
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
            borderBottom: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <div style={{ fontWeight: 760 }}>New submission</div>
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
            padding: 16,
            overflow: 'auto',
            maxHeight: 'calc(86vh - 60px)',
          }}
        >
          {mode === 'pick' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div
                onClick={() => setMode('image')}
                style={{
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 18,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconUpload />
                </div>
                <div>
                  <div style={{ fontWeight: 760 }}>Upload Image</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    OCR extracts text for editing
                  </div>
                </div>
              </div>

              <div
                onClick={() => setMode('text')}
                style={{
                  background: ui.panel,
                  border: `1px solid ${ui.border}`,
                  borderRadius: 18,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    background: ui.panel,
                    border: `1px solid ${ui.border}`,
                    color: ui.fg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconDoc />
                </div>
                <div>
                  <div style={{ fontWeight: 760 }}>Paste Text</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    Copy from journal or LLM
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'image' && (
            <div
              style={{
                marginTop: 14,
                borderRadius: 18,
                background: ui.panel,
                border: `1px solid ${ui.border}`,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    style={{
                      borderRadius: 16,
                      background: ui.panel,
                      border: `1px solid ${ui.border}`,
                      padding: 14,
                      minHeight: 160,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      color: ui.fg,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 760, marginBottom: 6 }}>
                        Drag & drop an image
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        or choose a file
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) await onPickFile(f);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {imagePreviewUrl && (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 16,
                        border: `1px solid ${ui.border}`,
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={imagePreviewUrl}
                        alt="Preview"
                        style={{ width: '100%', display: 'block' }}
                      />
                    </div>
                  )}

                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>
                    OCR + classification are simulated in this prototype.
                  </div>
                </div>

                <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                  <textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder={
                      imageFile
                        ? 'Waiting for OCR…'
                        : 'Upload an image to simulate OCR'
                    }
                    style={{
                      width: '100%',
                      minHeight: 180,
                      borderRadius: 16,
                      background: ui.panel,
                      border: `1px solid ${ui.border}`,
                      color: ui.fg,
                      padding: 12,
                      fontSize: 13,
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />

                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Location (optional)"
                    style={{
                      width: '100%',
                      height: 46,
                      marginTop: 10,
                      borderRadius: 16,
                      background: ui.panel,
                      border: `1px solid ${ui.border}`,
                      color: ui.fg,
                      padding: '0 12px',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      onClick={() => setMode('pick')}
                      disabled={isProcessing}
                      style={{
                        background: ui.panel,
                        border: `1px solid ${ui.border}`,
                        color: ui.fg,
                        borderRadius: 999,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        opacity: isProcessing ? 0.6 : 1,
                      }}
                    >
                      Back
                    </button>
                    <button
                      onClick={() =>
                        submitFromText(ocrText, imagePreviewUrl ?? undefined)
                      }
                      disabled={!ocrText.trim() || isProcessing}
                      style={{
                        background: ui.panel,
                        border: `1px solid ${ui.border}`,
                        color: ui.fg,
                        borderRadius: 999,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        opacity: !ocrText.trim() || isProcessing ? 0.6 : 1,
                      }}
                    >
                      {isProcessing ? 'Processing' : 'Submit'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'text' && (
            <div
              style={{
                marginTop: 14,
                background: ui.panel,
                border: `1px solid ${ui.border}`,
                borderRadius: 16,
                padding: 14,
              }}
            >
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="Paste text here…"
                style={{
                  width: '100%',
                  minHeight: 220,
                  borderRadius: 16,
                  background: ui.panel,
                  border: `1px solid ${ui.border}`,
                  color: ui.fg,
                  padding: 12,
                  fontSize: 13,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />

              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (optional)"
                style={{
                  width: '100%',
                  height: 46,
                  marginTop: 10,
                  borderRadius: 16,
                  background: ui.panel,
                  border: `1px solid ${ui.border}`,
                  color: ui.fg,
                  padding: '0 12px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  onClick={() => setMode('pick')}
                  disabled={isProcessing}
                  style={{
                    background: ui.panel,
                    border: `1px solid ${ui.border}`,
                    color: ui.fg,
                    borderRadius: 999,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    opacity: isProcessing ? 0.6 : 1,
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => submitFromText(textBody)}
                  disabled={!textBody.trim() || isProcessing}
                  style={{
                    background: ui.panel,
                    border: `1px solid ${ui.border}`,
                    color: ui.fg,
                    borderRadius: 999,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    opacity: !textBody.trim() || isProcessing ? 0.6 : 1,
                  }}
                >
                  {isProcessing ? 'Processing' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
