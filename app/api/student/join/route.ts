import { NextResponse } from "next/server";
import { joinOnlineRoom } from "../../../lib/online-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomCode?: string;
      nickname?: string;
      ubsName?: string;
      avatarId?: string;
      confirmReconnect?: boolean;
    };
    return NextResponse.json(
      await joinOnlineRoom(body.roomCode ?? "", body.nickname ?? "", body.ubsName ?? "", body.avatarId, Boolean(body.confirmReconnect))
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao entrar na sala." }, { status: 400 });
  }
}
