import { NextResponse } from "next/server";
import { listPublicActiveRooms } from "../../lib/online-server";

export async function GET() {
  try {
    return NextResponse.json({ rooms: await listPublicActiveRooms() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel listar as salas.";
    const isConnectionError = /abort|timeout|fetch|network|econn|socket|522/i.test(message);
    return NextResponse.json(
      { error: isConnectionError ? "Supabase nao respondeu. Verifique se o projeto esta ativo e as chaves estao corretas." : message },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
