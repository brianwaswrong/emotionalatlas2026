'use client';
import { useEffect, useRef, useState } from 'react';
import type { Classification, Entry } from '@/lib/types';
import { simulateClassification, simulateOCR } from '../lib/simulate';
import { uid } from '../lib/utils';
import { insertEntry, updateEntryClassification, deleteEntry } from "@/lib/db";

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

  const [hoveredTile, setHoveredTile] = useState<"image" | "text" | null>(null);
  const isImageHovered = hoveredTile === "image";
  const isTextHovered = hoveredTile === "text";

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }


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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = () => {
    fileInputRef.current?.click();
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
  
    // Allow short entries, but block ultra-short noise (esp. OCR junk)
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    if (wordCount < 2 && clean.length < 8) {
      alert("Too short — add a little more detail.");
      return;
    }
  
    setIsProcessing(true);
  
    let insertedId: string | null = null;
  
    try {
      // 1) Insert first (with placeholders OR nullable fields depending on your schema)
      const createdAt = new Date().toISOString().slice(0, 10);
  
      // IMPORTANT: keep this aligned with what your DB currently accepts.
      // If your DB requires non-null fields, insert safe placeholders here.
      const entryToInsert: any = {
        id: "temp",
        body: clean,
        createdAt,
        location: location.trim() || undefined,
        imageUrl: img,
        source: img ? "image" : "text",
        ocrText: img ? clean : undefined,
  
        // placeholders (only needed if DB columns are NOT NULL)
        title: "…",
        emotion: "Pending",
        valence: 0,
        arousal: 0,
        classification: undefined,
      };
  
      const inserted = await insertEntry(entryToInsert);
      insertedId = inserted.id;
  
      // 2) Classify
      const r = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
  
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("CLASSIFY FAIL payload:", payload);
        alert(JSON.stringify(payload, null, 2));
        throw new Error(payload?.error || "Classification failed");
      }
  
      const classification = payload as Classification;
  
      // 3) Update same row
      const updated = await updateEntryClassification(insertedId, classification);
  
      // 4) Update UI
      onSubmit(updated);
      onClose();
      } catch (e: any) {
      console.error(e);
  
      // Roll back the DB row if we inserted but didn't successfully classify/update
      if (insertedId) {
        try {
          await deleteEntry(insertedId); // you'll add this to db.ts
        } catch {
          // swallow rollback errors; still show the original failure
        }
      }
  
      alert(e?.message || "Submit failed");
    } finally {
      setIsProcessing(false);
    }
  };
  
  

  const onPickFile = async (file: File) => {
    console.log("onPickFile fired", file?.name, file?.type, file?.size);
    setOcrError(null);
    setOcrLoading(true);
  
    // helper: small sleep for retry backoff
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  
    // helper: OCR with retries + robust parsing
    const ocrWithRetry = async (imageDataUrl: string) => {
      const maxAttempts = 3;
  
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000); // 90s
  
        try {
          console.log(`OCR: calling /api/ocr (attempt ${attempt}/${maxAttempts})`);
  
          const r = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl }),
            signal: controller.signal,
          });
  
          const contentType = r.headers.get("content-type") || "";
          const raw = await r.text();
  
          console.log("OCR: status", r.status, "content-type", contentType);
          console.log("OCR: raw head", raw.slice(0, 200));
  
          // Retry on transient HTTP errors
          const transient = [429, 500, 502, 503, 504].includes(r.status);
  
          if (!r.ok) {
            if (transient && attempt < maxAttempts) {
              await sleep(attempt === 1 ? 800 : 2000);
              continue;
            }
            throw new Error(
              `OCR failed (${r.status}). ${raw.slice(0, 200) || "No response body"}`
            );
          }
  
          // Even if status is 200, ensure JSON
          if (!contentType.includes("application/json")) {
            if (attempt < maxAttempts) {
              await sleep(attempt === 1 ? 800 : 2000);
              continue;
            }
            throw new Error(
              `OCR returned non-JSON (${contentType || "unknown"}). ${raw.slice(0, 200)}`
            );
          }
  
          // Parse JSON safely
          let j: any;
          try {
            j = JSON.parse(raw);
          } catch {
            if (attempt < maxAttempts) {
              await sleep(attempt === 1 ? 800 : 2000);
              continue;
            }
            throw new Error(`OCR returned invalid JSON. ${raw.slice(0, 200)}`);
          }
  
          // Your API contract: { text: string }
          return j;
        } catch (e: any) {
          const isAbort = e?.name === "AbortError";
          if (isAbort && attempt < maxAttempts) {
            await sleep(attempt === 1 ? 800 : 2000);
            continue;
          }
          if (attempt < maxAttempts) {
            await sleep(attempt === 1 ? 800 : 2000);
            continue;
          }
          throw e;
        } finally {
          clearTimeout(timeout);
        }
      }
  
      // Should be unreachable
      throw new Error("OCR failed after retries");
    };
  
    try {
      setImageFile(file);
  
      // Preview
      const dataUrl = await fileToDataUrl(file);
      setImagePreviewUrl(dataUrl);
  
      // Move to image screen only once we have a file
      setMode("image");
  
      // Placeholder while OCR runs
      setOcrText("Extracting text…");
  
      const j = await ocrWithRetry(dataUrl);
  
      console.log("OCR: response", j);
  
      const text = typeof j?.text === "string" ? j.text : "";
      setOcrText(text);
  
      // If OCR returns empty string, that’s a real “no text” case
      if (!text.trim()) {
        setOcrError("No text detected in image.");
        setOcrText("⚠️ No text detected — please type or paste manually.");
      }
    } catch (e: any) {
      console.error(e);
  
      // Important: don’t lie to the user. If it was a network/HTML error,
      // tell them OCR failed, not “no text detected”.
      setOcrText("⚠️ OCR failed — please retry, or type/paste manually.");
      setOcrError(e?.message || "OCR failed");
    } finally {
      setOcrLoading(false);
    }
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
          maxHeight: '100vh',
          overflow: 'hidden',
          borderRadius: 22,
          background: ui.panel,
          border: `1px solid ${ui.border}`,
          boxShadow: `0 15px 40px ${ui.shadow}`,
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

              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await onPickFile(f); // keep your existing handler
          }}
        />

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
                onClick={() => openFilePicker()}
                onMouseEnter={() => setHoveredTile("image")}
                onMouseLeave={() => setHoveredTile(null)}
                style={{
                  border: `1px solid ${
                    isImageHovered ? "rgba(255,215,120,0.55)" : "rgba(255,255,255,0.10)"
                  }`,
                  background: isImageHovered ? "rgba(255,215,120,0.06)" : "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 18,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: isImageHovered
                    ? "0 0 0 1px rgba(255,215,120,0.18), 0 5px 10px rgba(0,0,0,0.35)"
                    : "0 5px 10px rgba(0,0,0,0.35)",
                  minHeight: "20vh",
                  textAlign: "center",
                  transition: "all 180ms ease",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    border: `1px solid ${
                      isImageHovered ? "rgba(255,215,120,0.45)" : "rgba(255,255,255,0.10)"
                    }`,
                    background: isImageHovered ? "rgba(255,215,120,0.10)" : "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isImageHovered ? "#FFD778" : ui.fg,
                    boxShadow: isImageHovered ? "0 0 9px rgba(255,215,120,0.20)" : "none",
                    transition: "all 180ms ease",
                  }}
                >
                  <IconUpload />
                </div>

                <div style={{ fontWeight: 760, color: ui.fg, fontSize: 14 }}>
                  Upload Image
                </div>

                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 0, color: ui.fg2 }}>
                  OCR extracts text for editing
                </div>
              </div>


              <div
                onClick={() => setMode("text")}
                onMouseEnter={() => setHoveredTile("text")}
                onMouseLeave={() => setHoveredTile(null)}
                style={{
                  border: `1px solid ${
                    isTextHovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"
                  }`,
                  background: isTextHovered ? "rgba(255,255,255,0.055)" : ui.panel,
                  borderRadius: 18,
                  padding: 18,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: isTextHovered
                    ? "0 0 0 1px rgba(255,255,255,0.08), 0 5px 10px rgba(0,0,0,0.35)"
                    : "0 5px 10px rgba(0,0,0,0.35)",
                  minHeight: "20vh",
                  textAlign: "center",
                  transition: "all 180ms ease",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    border: `1px solid ${
                      isTextHovered ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.10)"
                    }`,
                    background: isTextHovered ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: ui.fg,
                    transition: "all 180ms ease",
                  }}
                >
                  <IconDoc /> {/* swap to whatever your text icon component is */}
                </div>

                <div style={{ fontWeight: 760, color: ui.fg, fontSize: 14 }}>
                  Paste Text
                </div>

                <div style={{ fontSize: 12, opacity: 0.75, color: ui.fg2 }}>
                  Copy from your journal or chatbot conversation
                </div>
              </div>

            </div>
          )}

          {mode === "image" && imagePreviewUrl && (
            <div
              style={{
                marginTop: 14,
                borderRadius: 18,
                background: ui.panel,
                border: `1px solid ${ui.border}`,
                padding: 14,
              }}
            >
              {/* Image preview card */}
              <div
                style={{
                  position: "relative",
                  borderRadius: 16,
                  border: `1px solid ${ui.border}`,
                  overflow: "hidden",
                  background: ui.panel,
                }}
              >
                {/* Top bar overlay */}
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    right: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      pointerEvents: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1px solid ${ui.border}`,
                      background: theme === "dark"
                        ? "rgba(10,12,16,0.72)"
                        : "rgba(255,255,255,0.72)",
                      color: ui.fg,
                      backdropFilter: "blur(10px)",
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    Image Source
                  </div>

                  <button
                    onClick={() => {
                      // back to pick, and clear image-related state
                      setMode("pick");
                      setImageFile(null);
                      setImagePreviewUrl(null);
                      setOcrText("");
                      // also clear file input so selecting same file again works
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    style={{
                      pointerEvents: "auto",
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      border: `1px solid ${ui.border}`,
                      background: theme === "dark"
                        ? "rgba(10,12,16,0.72)"
                        : "rgba(255,255,255,0.72)",
                      color: ui.fg,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      backdropFilter: "blur(10px)",
                    }}
                    aria-label="Remove image and go back"
                  >
                    <IconX />
                  </button>
                </div>

                <img
                  src={imagePreviewUrl}
                  alt="Preview"
                  style={{ width: "100%", display: "block", maxHeight: 260, objectFit: "cover" }}
                />
              </div>

              {/* Location */}
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                style={{
                  width: "100%",
                  height: 46,
                  marginTop: 12,
                  borderRadius: 16,
                  background: ui.panel,
                  border: `1px solid ${ui.border}`,
                  color: ui.fg,
                  padding: "0 12px",
                  fontSize: 13,
                  outline: "none",
                }}
              />

              {/* Extracted text */}
              {ocrError && (
                <div style={{ fontSize: 12, color: "tomato", marginTop: 6 }}>
                  {ocrError}
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8, color: ui.fg2 }}>
                Extracted Text (edit if needed)
              </div>

              <textarea
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                placeholder={"Extracting text…"}
                style={{
                  width: "100%",
                  minHeight: 200,
                  marginTop: 8,
                  borderRadius: 16,
                  background: ui.panel,
                  border: `1px solid ${ui.border}`,
                  color: ui.fg,
                  padding: 12,
                  fontSize: 13,
                  outline: "none",
                  resize: "vertical",
                }}
              />

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  onClick={() => {
                    setMode("pick");
                    setImageFile(null);
                    setImagePreviewUrl(null);
                    setOcrText("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isProcessing}
                  style={{
                    background: ui.panel,
                    border: `1px solid ${ui.border}`,
                    color: ui.fg,
                    borderRadius: 999,
                    padding: "8px 12px",
                    cursor: "pointer",
                    opacity: isProcessing ? 0.6 : 1,
                    fontSize: 13,
                  }}
                >
                  Back
                </button>

                <button
                  onClick={() => submitFromText(ocrText, imagePreviewUrl ?? undefined)}
                  disabled={!ocrText.trim() || isProcessing || ocrLoading}
                  style={{
                    background: ui.panel,
                    border: `1px solid ${ui.border}`,
                    color: ui.fg,
                    borderRadius: 999,
                    padding: "8px 12px",
                    cursor: "pointer",
                    opacity: !ocrText.trim() || isProcessing ? 0.6 : 1,
                    fontSize: 13,
                  }}
                >
                  {isProcessing ? "Processing" : ocrLoading ? "Extracting…" : "Submit"}
                </button>
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
                placeholder="Write or paste text here…"
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
                placeholder="Location"
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
                    fontSize: 13,
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
                    fontSize: 13,
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
