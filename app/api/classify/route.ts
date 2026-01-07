import { NextResponse } from 'next/server';

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

const EMOTIONS_24 = [
  'Joy',
  'Gratitude',
  'Hope',
  'Acceptance',
  'Calm',
  'Love',
  'Pride',
  'Relief',
  'Sadness',
  'Loneliness',
  'Grief',
  'Disappointment',
  'Anger',
  'Frustration',
  'Resentment',
  'Fear',
  'Anxiety',
  'Insecurity',
  'Shame',
  'Guilt',
  'Embarrassment',
  'Awe',
  'Curiosity',
  'Determination',
] as const;

const PLUTCHIK_8 = [
  'Joy',
  'Trust',
  'Fear',
  'Surprise',
  'Sadness',
  'Disgust',
  'Anger',
  'Anticipation',
] as const;

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
  if (!raw || typeof raw !== 'object') return null;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const emotion = typeof raw.emotion === 'string' ? raw.emotion.trim() : '';
  const plutchikPrimary =
    typeof raw.plutchikPrimary === 'string' ? raw.plutchikPrimary.trim() : '';

  const valence =
    typeof raw.valence === 'number' ? raw.valence : Number(raw.valence);
  const arousal =
    typeof raw.arousal === 'number' ? raw.arousal : Number(raw.arousal);
  const confidence =
    typeof raw.confidence === 'number'
      ? raw.confidence
      : Number(raw.confidence);

  if (!title || !emotion || !plutchikPrimary) return null;
  if (
    !Number.isFinite(valence) ||
    !Number.isFinite(arousal) ||
    !Number.isFinite(confidence)
  )
    return null;

  // enforce ranges
  const v = clamp(valence, -1, 1);
  const a = clamp(arousal, -1, 1);
  const c = clamp(confidence, 0, 1);

  // enforce allowed labels (softly: if not, reject)
  if (!(EMOTIONS_24 as readonly string[]).includes(emotion)) return null;
  if (!(PLUTCHIK_8 as readonly string[]).includes(plutchikPrimary)) return null;

  return {
    title,
    emotion,
    plutchikPrimary,
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
You classify a journal entry into:
- emotion: choose exactly ONE from this list: ${EMOTIONS_24.join(', ')}
- plutchikPrimary: choose exactly ONE from: ${PLUTCHIK_8.join(', ')}
- valence: number in [-1, 1] (negative to positive)
- arousal: number in [-1, 1] (low energy to high energy)
- title: short title (<= 64 chars) capturing the entry
- confidence: number in [0, 1]
Return ONLY valid JSON with keys: title, emotion, plutchikPrimary, valence, arousal, confidence.
No markdown, no extra text.
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
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      // keep it deterministic-ish
      temperature: 0.2,
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
      { error: 'Model returned invalid JSON', raw: textOut.slice(0, 500) },
      { status: 502 }
    );
  }

  return NextResponse.json(normalized);
}
