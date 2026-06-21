import { NextResponse } from "next/server";
import { deleteRoomStudent, updateRoomStudentUbs } from "../../../../../../lib/online-server";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomId: string; studentId: string }> }
) {
  const { roomId, studentId } = await params;
  const body = (await request.json().catch(() => ({}))) as { adminKey?: string; ubsId?: string };
  try {
    return NextResponse.json(await updateRoomStudentUbs(roomId, body.adminKey ?? "", studentId, body.ubsId ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel alterar a UBS do aluno." }, { status: 400 });
  }
}
