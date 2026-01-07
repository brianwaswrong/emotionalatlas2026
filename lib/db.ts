import { getSupabaseClient } from './supabase';
import type { Entry } from './types';

type DbRow = {
  id: string;
  created_at: string;

  source: 'text' | 'image';
  location: string | null;
  image_url: string | null;

  final_text: string;
  title: string;

  emotion: string;
  plutchik_primary: string;
  valence: number;
  arousal: number;
  confidence: number;
};

function rowToEntry(r: DbRow): Entry {
  return {
    id: r.id,
    createdAt: r.created_at.slice(0, 10),
    source: r.source,
    location: r.location ?? undefined,
    imageUrl: r.image_url ?? undefined,

    body: r.final_text,
    title: r.title,

    emotion: r.emotion,
    valence: r.valence,
    arousal: r.arousal,
    classification: {
      emotion: r.emotion,
      plutchikPrimary: r.plutchik_primary,
      valence: r.valence,
      arousal: r.arousal,
      confidence: r.confidence,
    },
  };
}

export async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as DbRow[]).map(rowToEntry);
}

export async function insertEntry(e: Entry): Promise<Entry> {
  const payload = {
    source: e.source ?? 'text',
    location: e.location ?? null,
    image_url: e.imageUrl ?? null,

    final_text: e.body,
    title: e.title,

    emotion: e.emotion,
    plutchik_primary: e.classification?.plutchikPrimary ?? e.emotion,
    valence: e.valence,
    arousal: e.arousal,
    confidence: e.classification?.confidence ?? 0.7,
  };

  const { data, error } = await supabase
    .from('entries')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return rowToEntry(data as DbRow);
}
