import { NextResponse } from "next/server";
import { getServerSupabase } from "../../../lib/supabase-server";

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

export async function GET() {
  try {
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

    return NextResponse.json({
      ranking: ((data ?? []) as ResolverStudentRankRow[])
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
        .slice(0, 100)
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar ranking." }, { status: 400 });
  }
}
