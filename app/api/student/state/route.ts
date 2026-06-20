import { NextResponse } from "next/server";
import { getStudentState } from "../../../lib/online-server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await getStudentState(url.searchParams.get("roomId") ?? "", url.searchParams.get("studentId") ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar aluno." }, { status: 400 });
  }
}
