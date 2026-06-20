import { NextResponse } from "next/server";
import { getStudentStats } from "../../../../../lib/online-server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId") ?? "";
    const adminKey = url.searchParams.get("adminKey") ?? "";
    return NextResponse.json(await getStudentStats(roomId, adminKey, studentId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar estatisticas do aluno." }, { status: 400 });
  }
}
