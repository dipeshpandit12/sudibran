import attacks from "@/data/attacks.json";

export async function GET() {
  return Response.json(attacks);
}
