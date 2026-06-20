import { NextResponse } from "next/server";
import { setReleasedQuestions } from "../../../../../lib/online-server";

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const body = (await request.json()) as { adminKey?: string; releasedQuestionIds?: string[] };
    return NextResponse.json(await setReleasedQuestions(roomId, body.adminKey ?? "", body.releasedQuestionIds ?? []));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel liberar questoes." }, { status: 400 });
  }
}
