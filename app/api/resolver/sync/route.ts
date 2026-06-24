import { NextResponse } from "next/server";
import { getServerSupabase } from "../../../lib/supabase-server";
import type { QuestionOption } from "../../../types";

type ResolverAnswerInput = {
  questionId: string;
  selectedOptionId: QuestionOption["id"] | "TIMEOUT";
  isCorrect: boolean;
  status: "correct" | "incorrect" | "timeout";
  score: number;
  elapsedSeconds: number;
  answeredAt: string;
};

type ResolverStudentInput = {
  id: string;
  nickname: string;
  ubsName: string;
  avatarId: string;
  questionOrder: string[];
  currentIndex: number;
  answers: ResolverAnswerInput[];
  createdAt: string;
  updatedAt: string;
};

type ResolverStudentRankRow = {
  id: string;
  nickname: string;
  ubs_name: string;
  avatar_id: string;
  total_score: number | string;
  answered_count: number;
  average_score: number | string;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR").replace(/[^\p{L}\p{N} .'-]/gu, "");
}

async function loadRanking() {
  const { data, error } = await getServerSupabase()
    .from("qmq_resolver_students")
    .select("id,nickname,ubs_name,avatar_id,total_score,answered_count,average_score")
    .order("total_score", { ascending: false })
    .order("answered_count", { ascending: false })
    .order("nickname", { ascending: true })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as ResolverStudentRankRow[]).map((row) => ({
    id: row.id,
    nickname: row.nickname,
    ubsName: row.ubs_name,
    avatarId: row.avatar_id,
    totalScore: Number(row.total_score ?? 0),
    answeredCount: row.answered_count,
    averageScore: Number(row.average_score ?? 0)
  }));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { student?: ResolverStudentInput };
    const student = body.student;
    if (!student?.id) throw new Error("Aluno invalido.");
    const totalScore = Number(student.answers.reduce((sum, answer) => sum + Number(answer.score ?? 0), 0).toFixed(1));
    const answeredCount = student.answers.length;
    const averageScore = answeredCount ? Number((totalScore / answeredCount).toFixed(1)) : 0;
    const supabase = getServerSupabase();

    const { error: studentError } = await supabase.from("qmq_resolver_students").upsert({
      id: student.id,
      nickname: normalizeName(student.nickname),
      nickname_normalized: normalizeName(student.nickname),
      ubs_name: student.ubsName,
      avatar_id: student.avatarId,
      question_order: student.questionOrder,
      current_index: student.currentIndex,
      total_score: totalScore,
      answered_count: answeredCount,
      average_score: averageScore,
      created_at: student.createdAt,
      updated_at: student.updatedAt
    });
    if (studentError) throw studentError;

    if (student.answers.length > 0) {
      const { error: answersError } = await supabase.from("qmq_resolver_answers").upsert(
        student.answers.map((answer) => ({
          student_id: student.id,
          question_id: answer.questionId,
          selected_option_id: answer.selectedOptionId,
          is_correct: answer.isCorrect,
          status: answer.status,
          score: answer.score,
          elapsed_seconds: answer.elapsedSeconds,
          answered_at: answer.answeredAt
        })),
        { onConflict: "student_id,question_id" }
      );
      if (answersError) throw answersError;
    }

    return NextResponse.json({ ranking: await loadRanking() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao sincronizar resolvedor." }, { status: 400 });
  }
}
