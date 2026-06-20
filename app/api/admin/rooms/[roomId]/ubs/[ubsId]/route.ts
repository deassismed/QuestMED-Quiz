import { NextResponse } from "next/server";
import { deleteRoomUbs } from "../../../../../../lib/online-server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string; ubsId: string }> }
) {
  const { roomId, ubsId } = await params;
  const body = (await request.json().catch(() => ({}))) as { adminKey?: string };
  try {
    return NextResponse.json(await deleteRoomUbs(roomId, body.adminKey ?? "", ubsId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel excluir a UBS." }, { status: 400 });
  }
}
