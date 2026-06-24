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

export async function GET() {
  try {
    const { data, error } = await getServerSupabase()
      .from("qmq_resolver_students")
      .select("id,nickname,ubs_name,avatar_id,total_score,answered_count,average_score")
      .order("total_score", { ascending: false })
      .order("answered_count", { ascending: false })
      .order("nickname", { ascending: true })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({
      ranking: ((data ?? []) as ResolverStudentRankRow[]).map((row) => ({
        id: row.id,
        nickname: row.nickname,
        ubsName: row.ubs_name,
        avatarId: row.avatar_id,
        totalScore: Number(row.total_score ?? 0),
        answeredCount: row.answered_count,
        averageScore: Number(row.average_score ?? 0)
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar ranking." }, { status: 400 });
  }
}
