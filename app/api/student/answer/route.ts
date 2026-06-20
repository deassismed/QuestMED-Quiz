import { NextResponse } from "next/server";
import { submitAnswer } from "../../../lib/online-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      studentId?: string;
      questionId?: string;
      selectedOptionId?: string;
    };
    return NextResponse.json(
      await submitAnswer({
        roomId: body.roomId ?? "",
        studentId: body.studentId ?? "",
        questionId: body.questionId ?? "",
        selectedOptionId: body.selectedOptionId ?? ""
      })
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao responder." }, { status: 400 });
  }
}
