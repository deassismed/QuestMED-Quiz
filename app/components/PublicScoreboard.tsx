"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarBadge } from "./AvatarBadge";
import { loadRoomState } from "../lib/online-client";
import { getBrowserSupabase } from "../lib/supabase-browser";
import type { RoomPublicState } from "../types";

function rankLabel(index: number) {
  return `${index + 1}o`;
}

function podiumRankLabel(rank: number) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  return "3rd";
}

export function PublicScoreboard({ initialState }: { initialState: RoomPublicState }) {
  const [state, setState] = useState(initialState);
  const teamRanking = useMemo(
    () => [...state.ubsTeams].sort((a, b) => b.averageScore - a.averageScore || b.memberCount - a.memberCount),
    [state.ubsTeams]
  );
  const studentRanking = useMemo(
    () => [...state.students].sort((a, b) => b.totalScore - a.totalScore || a.joinedAt.localeCompare(b.joinedAt)),
    [state.students]
  );
  const podiumSlots = [
    { item: studentRanking[1], rank: 2 },
    { item: studentRanking[0], rank: 1 },
    { item: studentRanking[2], rank: 3 }
  ].filter((slot) => slot.item);

  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) return;
    const reload = () => void loadRoomState(state.room.roomCode).then(setState).catch(() => undefined);
    const channel = client
      .channel(`qmq-score:${state.room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_rooms", filter: `id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_students", filter: `room_id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_ubs_teams", filter: `room_id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_answers", filter: `room_id=eq.${state.room.id}` }, reload)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [state.room.id, state.room.roomCode]);

  return (
    <main className="scoreboard-shell">
      <header className="scoreboard-header game-header">
        <span className="game-orbit" aria-hidden="true" />
        <div>
          <span className="scoreboard-live-label">{state.room.status === "active" ? "AO VIVO" : "RESULTADO FINAL"}</span>
          <h1>Leaderboard</h1>
          <p>{state.room.roomName || "QuestMED Quiz"} · Sala {state.room.roomCode}</p>
        </div>
        <span className={`room-state ${state.room.status}`}>{state.room.status === "active" ? "Online" : "Final"}</span>
      </header>

      <section className="scoreboard-grid game-scoreboard-grid">
        <div className="scoreboard-panel game-board">
          {podiumSlots.length > 0 ? (
            <section className="podium-strip" aria-label="Top 3 alunos">
              {podiumSlots.map(({ item: student, rank }) => (
                <article className={`podium-card podium-rank-${rank}`} key={student.id}>
                  <div className="podium-portrait">
                    <div className="podium-medal"><span>{podiumRankLabel(rank)}</span></div>
                    <AvatarBadge avatarId={student.avatarId} className="podium-avatar" name={student.nickname} />
                  </div>
                  <strong>{student.nickname}</strong>
                  <span><i aria-hidden="true" />{student.totalScore.toFixed(1)}</span>
                </article>
              ))}
            </section>
          ) : null}

          <div className="game-section-title">
            <span />
            <strong>Top Ranking Alunos</strong>
            <span />
          </div>

          {studentRanking.slice(3).map((student, offset) => {
            const index = 3 + offset;
            return (
            <article className={`broadcast-score-row rank-${Math.min(index + 1, 9)}`} key={student.id}>
              <AvatarBadge avatarId={student.avatarId} className="game-avatar" name={student.nickname} />
              <div className="broadcast-team">
                <strong>{student.nickname}</strong>
                <span><i aria-hidden="true" /> {student.totalScore.toFixed(1)} pts</span>
              </div>
              <div className="rank-laurel">
                <span>{rankLabel(index)}</span>
              </div>
            </article>
          )})}
          {studentRanking.length === 0 ? <p className="empty-ranking">Aguardando alunos.</p> : null}
        </div>

        <div className="scoreboard-panel compact game-board game-board-side">
          {teamRanking.map((team, index) => (
            <article className="individual-score-row" key={team.id}>
              <AvatarBadge className="game-avatar small" name={team.name} />
              <span>{team.name}</span>
              <b><i aria-hidden="true" />{team.averageScore.toFixed(1)}</b>
              <strong>{rankLabel(index)}</strong>
            </article>
          ))}
          {teamRanking.length === 0 ? <p className="empty-ranking">Aguardando UBS.</p> : null}
        </div>
      </section>
    </main>
  );
}
