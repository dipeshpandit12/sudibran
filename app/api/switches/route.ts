import { getState, setSwitches } from "@/lib/store";
import type { DemoSwitches } from "@/lib/types";

export async function GET() {
  return Response.json(getState().switches);
}

export async function POST(req: Request) {
  const patch = (await req.json()) as Partial<DemoSwitches>;
  return Response.json(setSwitches(patch));
}
