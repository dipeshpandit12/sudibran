import { hasScenario, run } from "@/lib/store";

const STORIES = ["normal_90", "above_threshold", "side_by_side_140"];

export async function POST(_req: Request, ctx: RouteContext<"/api/story/[id]">) {
  const { id } = await ctx.params;
  if (!STORIES.includes(id) || !hasScenario(id)) return Response.json({ error: `Unknown story ${id}.` }, { status: 404 });
  return Response.json(run(id));
}
