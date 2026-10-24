import { reset } from "@/lib/store";

export async function POST() {
  return Response.json(reset());
}
