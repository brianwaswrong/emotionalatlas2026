import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    `Supabase env missing.
NEXT_PUBLIC_SUPABASE_URL present? ${!!url}
NEXT_PUBLIC_SUPABASE_ANON_KEY present? ${!!anon}

Fix: StackBlitz -> Project Settings -> Environment Variables, then RESTART dev server.`
  );
}

export const supabase = createClient(url, anon);
