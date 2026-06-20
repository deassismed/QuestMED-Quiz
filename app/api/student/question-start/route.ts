import { NextResponse } from "next/server";
import { ensureQuestionTimer } from "../../../lib/online-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      studentId?: string;
      questionId?: string;
    };
    return NextResponse.json(
      await ensureQuestionTimer({
        roomId: body.roomId ?? "",
        studentId: body.studentId ?? "",
        questionId: body.questionId ?? ""
      })
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao iniciar cronometro." }, { status: 400 });
  }
}
