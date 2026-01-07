import type { Classification, Entry } from './types';
import { clamp, pickFrom, uid } from './utils';

export const EMOTIONS = [
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

export const PLUTCHIK = [
  'Joy',
  'Trust',
  'Fear',
  'Surprise',
  'Sadness',
  'Disgust',
  'Anger',
  'Anticipation',
] as const;

export const LOCATIONS = [
  'Berlin',
  'New York',
  'Los Angeles',
  'Montreal',
  'London',
  'Tokyo',
  'Paris',
  'Lisbon',
  'Mexico City',
  'Seoul',
  'Bali',
  'San Francisco',
] as const;

export function seededScoreFromText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 2000) / 1000 - 1;
  const b = (((h >>> 11) >>> 0) % 2000) / 1000 - 1;
  return { valence: clamp(a, -1, 1), arousal: clamp(b, -1, 1) };
}

export function simulateOCR(file: File) {
  const name = file.name || 'image';
  const base = `Simulated OCR from ${name}.\n\n`;
  const filler =
    'Today I felt a mix of things. There was a specific moment that stuck with me, and I keep replaying it. I want to be honest about what I’m feeling and what I’m avoiding.';
  return base + filler;
}

export function simulateClassification(
  text: string
): { title: string } & Classification {
  const { valence, arousal } = seededScoreFromText(text);
  const pleasant = valence >= 0;
  const high = arousal >= 0;

  let emotion = 'Acceptance';
  if (pleasant && high)
    emotion = pickFrom(['Joy', 'Pride', 'Awe', 'Determination', 'Curiosity']);
  if (pleasant && !high)
    emotion = pickFrom(['Calm', 'Gratitude', 'Love', 'Relief', 'Hope']);
  if (!pleasant && high)
    emotion = pickFrom([
      'Anger',
      'Frustration',
      'Anxiety',
      'Fear',
      'Embarrassment',
    ]);
  if (!pleasant && !high)
    emotion = pickFrom([
      'Sadness',
      'Loneliness',
      'Grief',
      'Disappointment',
      'Guilt',
    ]);

  const plutchikPrimary =
    emotion === 'Anger' || emotion === 'Frustration' || emotion === 'Resentment'
      ? 'Anger'
      : emotion === 'Fear' || emotion === 'Anxiety' || emotion === 'Insecurity'
      ? 'Fear'
      : emotion === 'Sadness' ||
        emotion === 'Loneliness' ||
        emotion === 'Grief' ||
        emotion === 'Disappointment' ||
        emotion === 'Guilt'
      ? 'Sadness'
      : emotion === 'Joy' ||
        emotion === 'Love' ||
        emotion === 'Gratitude' ||
        emotion === 'Relief' ||
        emotion === 'Hope' ||
        emotion === 'Pride'
      ? 'Joy'
      : pickFrom([...PLUTCHIK]);

  const title = text.trim().split(/\n+/)[0].slice(0, 64) || `${emotion} entry`;

  return {
    title,
    emotion,
    valence,
    arousal,
    plutchikPrimary,
    confidence: 0.72,
  };
}

export function makeMockEntries(n = 200): Entry[] {
  const entries: Entry[] = [];

  const base: Record<string, [number, number]> = {
    Joy: [0.7, 0.5],
    Gratitude: [0.6, 0.1],
    Hope: [0.5, 0.3],
    Acceptance: [0.25, -0.2],
    Calm: [0.4, -0.6],
    Love: [0.7, 0.1],
    Pride: [0.6, 0.4],
    Relief: [0.3, -0.3],
    Sadness: [-0.6, -0.3],
    Loneliness: [-0.7, -0.4],
    Grief: [-0.8, -0.2],
    Disappointment: [-0.5, -0.1],
    Anger: [-0.6, 0.7],
    Frustration: [-0.4, 0.6],
    Resentment: [-0.5, 0.4],
    Fear: [-0.7, 0.6],
    Anxiety: [-0.6, 0.4],
    Insecurity: [-0.5, 0.2],
    Shame: [-0.6, 0.1],
    Guilt: [-0.5, 0.0],
    Embarrassment: [-0.3, 0.2],
    Awe: [0.4, 0.4],
    Curiosity: [0.2, 0.5],
    Determination: [0.2, 0.6],
  };

  const jitter = () => (Math.random() - 0.5) * 0.22;

  for (let i = 0; i < n; i++) {
    const emotion = EMOTIONS[i % EMOTIONS.length];
    const [v0, a0] = base[emotion] ?? [0, 0];

    const valence = clamp(v0 + jitter(), -1, 1);
    const arousal = clamp(a0 + jitter(), -1, 1);

    entries.push({
      id: uid(),
      title: `${emotion} entry #${i + 1}`,
      body: 'Sample journal text. Replace with OCR/LLM body later.',
      createdAt: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      valence,
      arousal,
      emotion,
      location: pickFrom([...LOCATIONS]),
      imageUrl:
        i % 7 === 0 ? 'https://picsum.photos/seed/emotion/1200/900' : undefined,
      source: i % 7 === 0 ? 'image' : 'text',
      classification: {
        emotion,
        valence,
        arousal,
        plutchikPrimary: pickFrom([...PLUTCHIK]),
        confidence: 0.62,
      },
    });
  }

  return entries;
}
