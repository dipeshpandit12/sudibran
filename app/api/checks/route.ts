import { CHECKS } from "@/lib/store";

export async function GET() {
  return Response.json(CHECKS);
}
