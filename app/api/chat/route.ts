import { getState, postChat } from "@/lib/store";

export async function GET() {
  return Response.json(getState().chat);
}

export async function POST(req: Request) {
  const { text, pasted } = (await req.json()) as { text?: string; pasted?: boolean };
  if (!text?.trim()) return Response.json({ error: "Message text is required." }, { status: 400 });
  return Response.json(postChat(text.trim(), Boolean(pasted)));
}
