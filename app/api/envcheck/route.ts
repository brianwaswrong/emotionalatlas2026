// app/api/envcheck/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";          // avoid Edge weirdness on StackBlitz
export const dynamic = "force-dynamic";   // no caching

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openai = process.env.OPENAI_API_KEY;

  return NextResponse.json({
    hasUrl: !!url,
    hasAnon: !!anon,
    hasOpenAI: !!openai,

    // debug without leaking secrets:
    urlPrefix: url ? url.slice(0, 20) : null,
    anonPrefix: anon ? anon.slice(0, 8) : null,
  });
}
