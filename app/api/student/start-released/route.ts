import { NextResponse } from "next/server";
import { acceptPendingReleases } from "../../../lib/online-server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { roomId?: string; studentId?: string };
  try {
    if (!body.roomId || !body.studentId) throw new Error("Dados incompletos.");
    return NextResponse.json(await acceptPendingReleases(body.roomId, body.studentId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel iniciar as questoes." }, { status: 400 });
  }
}
