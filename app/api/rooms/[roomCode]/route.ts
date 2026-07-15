import { NextResponse } from "next/server";
import { getRoomPublicState } from "../../../lib/online-server";

export async function GET(_request: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    return NextResponse.json(await getRoomPublicState(roomCode));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sala nao encontrada.";
    const isConnectionError = /abort|timeout|fetch|network|econn|socket|522/i.test(message);
    return NextResponse.json(
      { error: isConnectionError ? "Supabase nao respondeu. Verifique se o projeto esta ativo e as chaves estao corretas." : message },
      { status: isConnectionError ? 503 : 404 }
    );
  }
}
