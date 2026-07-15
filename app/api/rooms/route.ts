import { NextResponse } from "next/server";
import { listPublicActiveRooms } from "../../lib/online-server";

export async function GET() {
  try {
    return NextResponse.json({ rooms: await listPublicActiveRooms() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel listar as salas." }, { status: 500 });
  }
}
