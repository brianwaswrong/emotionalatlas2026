export type Classification = {
  title: string;
  emotion: string;
  valence: number; // -1..1
  arousal: number; // -1..1
  plutchikPrimary: string;
  confidence: number; // 0..1
};

export type EntrySource = 'image' | 'text';

export type Entry = {
  id: string;

  // Make these optional/nullable because they may be unknown at insert time
  title?: string;
  emotion?: string;
  valence?: number;
  arousal?: number;

  // Your existing field name for the text content:
  body: string;

  createdAt: string; // keep as-is for now

  location?: string;
  imageUrl?: string;
  source?: EntrySource;
  ocrText?: string;

  // The canonical structured output from OpenAI
  classification?: Classification;
};
