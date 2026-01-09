import { NextResponse } from "next/server";

type OcrRequest = {
  imageDataUrl: string; // data:image/...;base64,...
};

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as OcrRequest | null;
  const imageDataUrl = body?.imageDataUrl;

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "Missing imageDataUrl" }, { status: 400 });
  }

  if (!imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl must be a data:image/... URL" }, { status: 400 });
  }

  const system = `
You are an OCR engine. Extract ALL readable text from the image.

Rules:
- Return ONLY the extracted text (no markdown, no JSON).
- Preserve line breaks when they seem meaningful.
- Do NOT add commentary or interpretation.
- If a word is unclear, make your best guess.
  `.trim();

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Extract the text from this journal entry image." },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return NextResponse.json(
      { error: "OpenAI OCR request failed", details: t.slice(0, 800) },
      { status: 502 }
    );
  }

  const data = await r.json();
  const text =
  (data?.output_text ??
    data?.output
      ?.flatMap((o: any) => o?.content ?? [])
      ?.map((c: any) => c?.text)
      ?.filter(Boolean)
      ?.join("\n"))?.trim?.() || "";

  return NextResponse.json({ text });

}
