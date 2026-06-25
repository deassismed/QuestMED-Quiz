import { NextResponse } from "next/server";
import { getServerSupabase } from "../../../lib/supabase-server";
import type { QuestionOption } from "../../../types";

type ResolverStudentRow = {
  id: string;
  nickname: string;
  ubs_name: string;
  avatar_id: string;
  question_order: string[];
  current_index: number;
  created_at: string;
  updated_at: string;
};

type ResolverAnswerRow = {
  question_id: string;
  selected_option_id: QuestionOption["id"] | "TIMEOUT";
  is_correct: boolean;
  status: "correct" | "incorrect" | "timeout";
  score: number | string;
  elapsed_seconds: number;
  answered_at: string;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR").replace(/[^\p{L}\p{N} .'-]/gu, "");
}

function mergeQuestionOrder(questionOrder: string[], answeredIds: string[]) {
  const seen = new Set<string>();
  return [...questionOrder, ...answeredIds].filter((questionId) => {
    if (seen.has(questionId)) return false;
    seen.add(questionId);
    return true;
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const nickname = normalizeName(url.searchParams.get("nickname") ?? "");
    const ubsName = url.searchParams.get("ubsName")?.trim() ?? "";
    if (!nickname || !ubsName) throw new Error("Informe nome e UBS.");

    const supabase = getServerSupabase();
    const { data: student, error: studentError } = await supabase
      .from("qmq_resolver_students")
      .select("id,nickname,ubs_name,avatar_id,question_order,current_index,created_at,updated_at")
      .eq("nickname_normalized", nickname)
      .eq("ubs_name", ubsName)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return NextResponse.json({ student: null });

    const row = student as ResolverStudentRow;
    const { data: answers, error: answersError } = await supabase
      .from("qmq_resolver_answers")
      .select("question_id,selected_option_id,is_correct,status,score,elapsed_seconds,answered_at")
      .eq("student_id", row.id)
      .order("answered_at", { ascending: true });
    if (answersError) throw answersError;

    const mappedAnswers = ((answers ?? []) as ResolverAnswerRow[]).map((answer) => ({
      questionId: answer.question_id,
      selectedOptionId: answer.selected_option_id,
      isCorrect: answer.is_correct,
      status: answer.status,
      score: Number(answer.score ?? 0),
      elapsedSeconds: answer.elapsed_seconds,
      answeredAt: answer.answered_at
    }));

    return NextResponse.json({
      student: {
        id: row.id,
        nickname: row.nickname,
        ubsName: row.ubs_name,
        avatarId: row.avatar_id,
        questionOrder: mergeQuestionOrder(row.question_order ?? [], mappedAnswers.map((answer) => answer.questionId)),
        currentIndex: row.current_index,
        answers: mappedAnswers,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar aluno do resolvedor." }, { status: 400 });
  }
}
