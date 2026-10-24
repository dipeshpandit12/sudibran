import { hasScenario, run } from "@/lib/store";

export async function POST(_req: Request, ctx: RouteContext<"/api/attacks/[id]">) {
  const { id } = await ctx.params;
  if (!/^A[1-9]$/.test(id) || !hasScenario(id)) return Response.json({ error: `Unknown attack ${id}.` }, { status: 404 });
  return Response.json(run(id));
}
