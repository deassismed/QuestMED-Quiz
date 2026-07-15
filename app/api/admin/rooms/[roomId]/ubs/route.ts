import { NextResponse } from "next/server";
import { createRoomUbs } from "../../../../../lib/online-server";

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = (await request.json().catch(() => ({}))) as { adminKey?: string; ubsName?: string };
  try {
    return NextResponse.json(await createRoomUbs(roomId, body.adminKey ?? "", body.ubsName ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel adicionar a UBS." }, { status: 400 });
  }
}
