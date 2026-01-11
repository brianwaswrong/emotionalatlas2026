import { supabase } from './supabase';
import type { Entry } from './types';
import type { Classification } from "./types";

type DbRow = {
  id: string;
  created_at: string;

  source: 'text' | 'image';
  location: string | null;
  image_url: string | null;

  final_text: string;
  title: string | null;

  emotion: string | null;
  plutchik_primary: string | null;
  valence: number | null;
  arousal: number | null;
  confidence: number | null;
};

function rowToEntry(r: DbRow): Entry {
  const hasClassification =
    r.title &&
    r.emotion &&
    r.plutchik_primary &&
    r.valence !== null &&
    r.arousal !== null &&
    r.confidence !== null;

  return {
    id: r.id,
    createdAt: r.created_at.slice(0, 10),
    source: r.source,
    location: r.location ?? undefined,
    imageUrl: r.image_url ?? undefined,

    body: r.final_text,

    // top-level convenience fields (optional now)
    title: r.title ?? undefined,
    emotion: r.emotion ?? undefined,
    valence: r.valence ?? undefined,
    arousal: r.arousal ?? undefined,

    classification: hasClassification
      ? {
          title: r.title!,
          emotion: r.emotion!,
          plutchikPrimary: r.plutchik_primary!,
          valence: r.valence!,
          arousal: r.arousal!,
          confidence: r.confidence!,
        }
      : undefined,
  };
}

type DbRowLight = Pick<
  DbRow,
  | "id"
  | "created_at"
  | "source"
  | "location"
  | "title"
  | "emotion"
  | "plutchik_primary"
  | "valence"
  | "arousal"
  | "confidence"
>;

function rowToEntryLight(r: DbRowLight): Entry {
  const hasClassification =
    r.title &&
    r.emotion &&
    r.plutchik_primary &&
    r.valence !== null &&
    r.arousal !== null &&
    r.confidence !== null;

  return {
    id: r.id,
    createdAt: r.created_at.slice(0, 10),
    source: r.source,
    location: r.location ?? undefined,

    // Not fetched in list mode:
    imageUrl: undefined,
    body: "",

    title: r.title ?? undefined,
    emotion: r.emotion ?? undefined,
    valence: r.valence ?? undefined,
    arousal: r.arousal ?? undefined,

    classification: hasClassification
      ? {
          title: r.title!,
          emotion: r.emotion!,
          plutchikPrimary: r.plutchik_primary!,
          valence: r.valence!,
          arousal: r.arousal!,
          confidence: r.confidence!,
        }
      : undefined,
  };
}

export async function fetchEntries(): Promise<Entry[]> {
  const t0 = performance.now();

  const { data, error } = await supabase
    .from("entries")
    .select("id,created_at,source,location,title,emotion,plutchik_primary,valence,arousal,confidence")
    .order("created_at", { ascending: false })
    .limit(200);

  const ms = Math.round(performance.now() - t0);
  console.log("SUPABASE fetchEntries", { ms, rows: data?.length ?? 0, error });

  if (error) throw error;
  return (data as any[]).map(rowToEntryLight);
}


export async function fetchEntryById(id: string): Promise<Entry> {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return rowToEntry(data as DbRow);
}

export async function insertEntry(e: Entry): Promise<Entry> {
  const payload = {
    source: e.source ?? 'text',
    location: e.location ?? null,
    image_url: e.imageUrl ?? null,

    final_text: e.body,

    // classification fields start null unless you already have them
    title: e.classification?.title ?? e.title ?? null,
    emotion: e.classification?.emotion ?? e.emotion ?? null,
    plutchik_primary: e.classification?.plutchikPrimary ?? null,
    valence: e.classification?.valence ?? e.valence ?? null,
    arousal: e.classification?.arousal ?? e.arousal ?? null,
    confidence: e.classification?.confidence ?? null,
  };

  const { data, error } = await supabase
    .from('entries')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return rowToEntry(data as DbRow);
}


export async function updateEntryClassification(
  entryId: string,
  c: Classification
): Promise<Entry> {
  const { data, error } = await supabase
    .from("entries")
    .update({
      title: c.title,
      emotion: c.emotion,
      plutchik_primary: c.plutchikPrimary,
      valence: c.valence,
      arousal: c.arousal,
      confidence: c.confidence,
    })
    .eq("id", entryId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToEntry(data as DbRow);
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}