import { saveIntent } from "@/lib/store";

export async function POST(req: Request) {
  const { text, threshold_usd } = (await req.json()) as { text?: string; threshold_usd?: number };
  if (!text?.trim() || typeof threshold_usd !== "number" || threshold_usd <= 0) {
    return Response.json({ error: "Intent text and a positive threshold are required." }, { status: 400 });
  }
  return Response.json(saveIntent(text.trim(), threshold_usd));
}
