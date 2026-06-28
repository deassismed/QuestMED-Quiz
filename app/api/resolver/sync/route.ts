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

type ResolverAnswerRankRow = {
  student_id: string;
  score: number | string;
};

type ResolverStudentRow = {
  id: string;
  created_at: string;
  question_order: string[];
  current_index: number;
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

async function loadRanking() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("qmq_resolver_students")
    .select("id,nickname,ubs_name,avatar_id,total_score,answered_count,average_score")
    .order("nickname", { ascending: true });
  if (error) throw error;

  const { data: answerData, error: answerError } = await supabase
    .from("qmq_resolver_answers")
    .select("student_id,score");
  if (answerError) throw answerError;

  const answersByStudent = new Map<string, ResolverAnswerRankRow[]>();
  for (const answer of (answerData ?? []) as ResolverAnswerRankRow[]) {
    const answers = answersByStudent.get(answer.student_id) ?? [];
    answers.push(answer);
    answersByStudent.set(answer.student_id, answers);
  }

  return ((data ?? []) as ResolverStudentRankRow[])
    .map((row) => {
      const answers = answersByStudent.get(row.id) ?? [];
      const answeredCount = answers.length;
      const totalScore = answeredCount
        ? Number(answers.reduce((sum, answer) => sum + Number(answer.score ?? 0), 0).toFixed(1))
        : Number(row.total_score ?? 0);
      return {
        id: row.id,
        nickname: row.nickname,
        ubsName: row.ubs_name,
        avatarId: row.avatar_id,
        totalScore,
        answeredCount,
        averageScore: answeredCount ? Number((totalScore / answeredCount).toFixed(1)) : Number(row.average_score ?? 0)
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || b.answeredCount - a.answeredCount || a.nickname.localeCompare(b.nickname, "pt-BR"))
    .slice(0, 100);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { student?: ResolverStudentInput };
    const student = body.student;
    if (!student?.id) throw new Error("Aluno invalido.");
    const supabase = getServerSupabase();
    const { data: existingStudent, error: existingStudentError } = await supabase
      .from("qmq_resolver_students")
      .select("id,created_at,question_order,current_index")
      .eq("id", student.id)
      .maybeSingle();
    if (existingStudentError) throw existingStudentError;

    const { data: existingAnswers, error: existingAnswersError } = await supabase
      .from("qmq_resolver_answers")
      .select("question_id,selected_option_id,is_correct,status,score,elapsed_seconds,answered_at")
      .eq("student_id", student.id);
    if (existingAnswersError) throw existingAnswersError;

    const existingAnswersByQuestion = new Map(
      ((existingAnswers ?? []) as ResolverAnswerRow[]).map((answer) => [answer.question_id, answer])
    );
    const newAnswers = student.answers.filter((answer) => !existingAnswersByQuestion.has(answer.questionId));
    const mergedAnswers = [
      ...((existingAnswers ?? []) as ResolverAnswerRow[]).map((answer) => ({
        questionId: answer.question_id,
        selectedOptionId: answer.selected_option_id,
        isCorrect: answer.is_correct,
        status: answer.status,
        score: Number(answer.score ?? 0),
        elapsedSeconds: answer.elapsed_seconds,
        answeredAt: answer.answered_at
      })),
      ...newAnswers
    ];
    const totalScore = Number(mergedAnswers.reduce((sum, answer) => sum + Number(answer.score ?? 0), 0).toFixed(1));
    const answeredCount = mergedAnswers.length;
    const averageScore = answeredCount ? Number((totalScore / answeredCount).toFixed(1)) : 0;
    const existing = existingStudent as ResolverStudentRow | null;
    const questionOrder = existing?.question_order?.length && existing.question_order.length >= student.questionOrder.length
      ? existing.question_order
      : student.questionOrder;
    const currentIndex = Math.max(existing?.current_index ?? 0, student.currentIndex, answeredCount > 0 ? answeredCount - 1 : 0);

    const { error: studentError } = await supabase.from("qmq_resolver_students").upsert({
      id: student.id,
      nickname: normalizeName(student.nickname),
      nickname_normalized: normalizeName(student.nickname),
      ubs_name: student.ubsName,
      avatar_id: student.avatarId,
      question_order: questionOrder,
      current_index: currentIndex,
      total_score: totalScore,
      answered_count: answeredCount,
      average_score: averageScore,
      created_at: existing?.created_at ?? student.createdAt,
      updated_at: student.updatedAt
    });
    if (studentError) throw studentError;

    if (newAnswers.length > 0) {
      const { error: answersError } = await supabase.from("qmq_resolver_answers").insert(
        newAnswers.map((answer) => ({
          student_id: student.id,
          question_id: answer.questionId,
          selected_option_id: answer.selectedOptionId,
          is_correct: answer.isCorrect,
          status: answer.status,
          score: answer.score,
          elapsed_seconds: answer.elapsedSeconds,
          answered_at: answer.answeredAt
        }))
      );
      if (answersError) throw answersError;
    }

    return NextResponse.json({ ranking: await loadRanking() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao sincronizar resolvedor." }, { status: 400 });
  }
}
