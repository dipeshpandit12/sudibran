import { classifyInjection } from "@/lib/scenarios";
import { run } from "@/lib/store";

// Free-text injection from the dashboard: matched to the closest known attack.
export async function POST(req: Request) {
  const { text } = (await req.json()) as { text?: string };
  const injection = text?.trim();
  if (!injection) return Response.json({ error: "Type an injection to send, or pick a preset." }, { status: 400 });
  if (injection.length > 600) return Response.json({ error: "Keep the injection under 600 characters." }, { status: 400 });
  return Response.json(run(classifyInjection(injection), { injection }));
}
