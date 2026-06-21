import { NextResponse } from "next/server";
import { updateStudentAvatar } from "../../../lib/online-server";

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { roomId?: string; studentId?: string; avatarId?: string };
  try {
    if (!body.roomId || !body.studentId || !body.avatarId) throw new Error("Dados incompletos.");
    return NextResponse.json(await updateStudentAvatar(body.roomId, body.studentId, body.avatarId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel alterar o avatar." }, { status: 400 });
  }
}
