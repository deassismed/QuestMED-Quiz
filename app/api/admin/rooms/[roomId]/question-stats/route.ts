import { NextResponse } from "next/server";
import { getQuestionStats } from "../../../../../lib/online-server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const url = new URL(request.url);
    const questionId = url.searchParams.get("questionId") ?? "";
    const adminKey = url.searchParams.get("adminKey") ?? "";
    return NextResponse.json(await getQuestionStats(roomId, adminKey, questionId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar estatisticas." }, { status: 400 });
  }
}
