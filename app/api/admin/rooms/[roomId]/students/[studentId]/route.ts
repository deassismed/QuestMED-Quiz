import { NextResponse } from "next/server";
import { deleteRoomStudent } from "../../../../../../lib/online-server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string; studentId: string }> }
) {
  const { roomId, studentId } = await params;
  const body = (await request.json().catch(() => ({}))) as { adminKey?: string };
  try {
    return NextResponse.json(await deleteRoomStudent(roomId, body.adminKey ?? "", studentId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel excluir o aluno." }, { status: 400 });
  }
}
