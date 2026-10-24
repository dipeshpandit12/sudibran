import { decideApproval } from "@/lib/store";

export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const { id } = await ctx.params;
  const { action } = (await req.json()) as { action?: string };
  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "Action must be approve or reject." }, { status: 400 });
  }
  const out = decideApproval(id, action);
  if (!out) return Response.json({ error: `Approval ${id} isn't pending.` }, { status: 404 });
  return Response.json(out);
}
