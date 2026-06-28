import { NextResponse } from "next/server";
import { getServerSupabase } from "../../../lib/supabase-server";
import { validateProfessorPassword } from "../../../lib/online-server";
import type { QuestionOption } from "../../../types";

type ResolverStudentRow = {
  id: string;
  nickname: string;
  ubs_name: string;
  avatar_id: string;
  total_score: number | string;
  answered_count: number;
  average_score: number | string;
  created_at: string;
  updated_at: string;
};

type ResolverAnswerRow = {
  student_id: string;
  question_id: string;
  selected_option_id: QuestionOption["id"] | "TIMEOUT";
  is_correct: boolean;
  status: "correct" | "incorrect" | "timeout";
  score: number | string;
  elapsed_seconds: number;
  answered_at: string;
};

async function loadResolverAdminState() {
  const supabase = getServerSupabase();
  const { data: studentsData, error: studentsError } = await supabase
    .from("qmq_resolver_students")
    .select("id,nickname,ubs_name,avatar_id,total_score,answered_count,average_score,created_at,updated_at")
    .order("total_score", { ascending: false })
    .order("answered_count", { ascending: false })
    .order("nickname", { ascending: true });
  if (studentsError) throw studentsError;

  const { data: answersData, error: answersError } = await supabase
    .from("qmq_resolver_answers")
    .select("student_id,question_id,selected_option_id,is_correct,status,score,elapsed_seconds,answered_at")
    .order("answered_at", { ascending: true });
  if (answersError) throw answersError;

  const answers = ((answersData ?? []) as ResolverAnswerRow[]).map((answer) => ({
    studentId: answer.student_id,
    questionId: answer.question_id,
    selectedOptionId: answer.selected_option_id,
    isCorrect: answer.is_correct,
    status: answer.status,
    score: Number(answer.score ?? 0),
    elapsedSeconds: answer.elapsed_seconds,
    answeredAt: answer.answered_at
  }));
  const answersByStudent = new Map<string, typeof answers>();
  for (const answer of answers) {
    const list = answersByStudent.get(answer.studentId) ?? [];
    list.push(answer);
    answersByStudent.set(answer.studentId, list);
  }

  const students = ((studentsData ?? []) as ResolverStudentRow[]).map((student) => ({
    id: student.id,
    nickname: student.nickname,
    ubsName: student.ubs_name,
    avatarId: student.avatar_id,
    totalScore: Number(student.total_score ?? 0),
    answeredCount: student.answered_count,
    averageScore: Number(student.average_score ?? 0),
    createdAt: student.created_at,
    updatedAt: student.updated_at,
    answers: answersByStudent.get(student.id) ?? []
  }));

  const ubsTeams = Array.from(new Set(students.map((student) => student.ubsName)))
    .map((ubsName) => {
      const members = students.filter((student) => student.ubsName === ubsName);
      const totalScore = members.reduce((sum, student) => sum + student.totalScore, 0);
      return {
        name: ubsName,
        memberCount: members.length,
        answeredCount: members.reduce((sum, student) => sum + student.answeredCount, 0),
        averageScore: members.length ? Number((totalScore / members.length).toFixed(1)) : 0
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore);

  const questionStats = Array.from(new Set(answers.map((answer) => answer.questionId))).sort().map((questionId) => {
    const rows = answers.filter((answer) => answer.questionId === questionId);
    const totalAnswers = rows.length;
    const correctCount = rows.filter((answer) => answer.isCorrect).length;
    const timeoutCount = rows.filter((answer) => answer.selectedOptionId === "TIMEOUT").length;
    return {
      questionId,
      totalAnswers,
      correctCount,
      incorrectCount: totalAnswers - correctCount - timeoutCount,
      timeoutCount
    };
  });

  const lastActivityAt = students.map((student) => student.updatedAt).sort((a, b) => b.localeCompare(a))[0] ?? null;
  const averageScore = students.length
    ? Number((students.reduce((sum, student) => sum + student.totalScore, 0) / students.length).toFixed(1))
    : 0;

  return {
    students,
    ubsTeams,
    questionStats,
    summary: {
      studentCount: students.length,
      ubsCount: ubsTeams.length,
      answerCount: answers.length,
      averageScore,
      lastActivityAt
    }
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    return NextResponse.json(await loadResolverAdminState());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar o resolvedor." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    const { error } = await getServerSupabase().from("qmq_resolver_students").delete().neq("id", "");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel limpar o resolvedor." }, { status: 400 });
  }
}
