export type Classification = {
  emotion: string;
  valence: number; // -1..1
  arousal: number; // -1..1
  plutchikPrimary: string;
  confidence: number; // 0..1
};

export type EntrySource = 'image' | 'text';

export type Entry = {
  id: string;
  title: string;
  body: string;
  createdAt: string; // YYYY-MM-DD
  valence: number; // -1..1
  arousal: number; // -1..1
  emotion: string;
  location?: string;
  imageUrl?: string;
  source?: EntrySource;
  ocrText?: string;
  classification?: Classification;
};
