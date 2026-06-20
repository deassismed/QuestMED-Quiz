import { NextResponse } from "next/server";
import { getRoomPublicState } from "../../../lib/online-server";

export async function GET(_request: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    return NextResponse.json(await getRoomPublicState(roomCode));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sala nao encontrada." }, { status: 404 });
  }
}
