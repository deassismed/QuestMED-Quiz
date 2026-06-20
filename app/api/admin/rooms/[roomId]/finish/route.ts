import { NextResponse } from "next/server";
import { finishOnlineRoom } from "../../../../../lib/online-server";

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const body = (await request.json()) as { adminKey?: string };
    return NextResponse.json(await finishOnlineRoom(roomId, body.adminKey ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel encerrar a sala." }, { status: 400 });
  }
}
