import { NextResponse } from 'next/server';
import { EMOTIONS_32, PLUTCHIK_8, TIER1_BY_TIER2 } from "@/lib/emotions";

type ClassifyRequest = {
  text: string;
};

type ClassifyResponse = {
  title: string;
  emotion: string;
  plutchikPrimary: string;
  valence: number; // -1..1
  arousal: number; // -1..1
  confidence: number; // 0..1
};

// const EMOTIONS_24 = [
//   'Joy',
//   'Gratitude',
//   'Hope',
//   'Acceptance',
//   'Calm',
//   'Love',
//   'Pride',
//   'Relief',
//   'Sadness',
//   'Loneliness',
//   'Grief',
//   'Disappointment',
//   'Anger',
//   'Frustration',
//   'Resentment',
//   'Fear',
//   'Anxiety',
//   'Insecurity',
//   'Shame',
//   'Guilt',
//   'Embarrassment',
//   'Awe',
//   'Curiosity',
//   'Determination',
// ] as const;

// const PLUTCHIK_8 = [
//   'Joy',
//   'Trust',
//   'Fear',
//   'Surprise',
//   'Sadness',
//   'Disgust',
//   'Anger',
//   'Anticipation',
// ] as const;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeOutput(raw: any): ClassifyResponse | null {
  if (!raw || typeof raw !== "object") return null;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const emotion =
    typeof raw.emotion === "string" ? raw.emotion.trim().replace(/\s+/g, " ") : "";

  const valence = typeof raw.valence === "number" ? raw.valence : Number(raw.valence);
  const arousal = typeof raw.arousal === "number" ? raw.arousal : Number(raw.arousal);
  const confidence =
    typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence);

  if (!title || !emotion) return null;

  if (!Number.isFinite(valence) || !Number.isFinite(arousal) || !Number.isFinite(confidence))
    return null;

  const v = clamp(valence, -1, 1);
  const a = clamp(arousal, -1, 1);
  const c = clamp(confidence, 0, 1);

  // allowed labels
  if (!(EMOTIONS_32 as readonly string[]).includes(emotion)) return null;

  // compute tier relationship deterministically
  const expectedPrimary = TIER1_BY_TIER2[emotion];
  if (!expectedPrimary) return null;

  // optional: sanity check the mapping output is one of the 8
  if (!(PLUTCHIK_8 as readonly string[]).includes(expectedPrimary)) return null;

  return {
    title,
    emotion,
    plutchikPrimary: expectedPrimary,
    valence: v,
    arousal: a,
    confidence: c,
  };
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'Missing OPENAI_API_KEY' },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as ClassifyRequest | null;
  const text = body?.text?.trim();

  if (!text) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  }

  const system = `
Classify a journal entry.
- emotion: choose exactly ONE from: ${EMOTIONS_32.join(", ")}. Do not invent new labels.
- valence: number in [-1, 1], based on felt positivity/negativity (not objective outcome). Use hundredths / 2 decimal point granularity. 
- arousal: number in [-1, 1], based on emotional intensity/activation (not length or drama). Use hundredths / 2 decimal point granularity.
- title: A sharp, hook excerpt from the entry. If there isn't one, create one based on the context.
  Prefer blunt, natural language over summaries.
  Fragments or imperatives are OK.
- confidence: number in [0, 1] re: your assessment of emotion.

Return ONLY valid JSON with keys:
title, emotion, valence, arousal, confidence.
No markdown. No extra text.
`.trim();

  

  const user = `
  Journal entry:
  ${text}
  `.trim();

  // NOTE: uses OpenAI Responses API via fetch (no SDK dependency)
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      text: {
        format: {
          type: "json_schema",
          name: "journal_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "emotion", "valence", "arousal", "confidence"],
            properties: {
              title: { type: "string" },
              emotion: { type: "string", enum: [...EMOTIONS_32] },
              valence: { type: "number", minimum: -1, maximum: 1 },
              arousal: { type: "number", minimum: -1, maximum: 1 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },      
    }),       
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return NextResponse.json(
      { error: 'OpenAI request failed', details: t.slice(0, 500) },
      { status: 502 }
    );
  }

  const data = await r.json();

  // Responses API: try to extract text content
  const textOut =
    data?.output_text ?? data?.output?.[0]?.content?.[0]?.text ?? '';

    const parsed = safeJsonParse<any>(textOut);
    const normalized = normalizeOutput(parsed);
    
    if (!normalized) {
      return NextResponse.json(
        {
          error: "Model returned invalid output (labels/shape)",
          raw: textOut.slice(0, 2000),
          parsedType: typeof parsed,
          parsed,
        },
        { status: 502 }
      );
    }
  
    return NextResponse.json(normalized);
}
