import { evidence } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/evidence/[runId]">) {
  const { runId } = await ctx.params;
  const report = evidence(runId);
  if (!report) return Response.json({ error: `No run called ${runId} in this session. Runs clear on Reset.` }, { status: 404 });
  return Response.json(report);
}
