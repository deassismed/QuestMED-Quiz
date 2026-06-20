"use client";

import { ArrowLeft, BarChart3, Copy, ExternalLink, Power, RefreshCw, Shuffle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { finishRoom, loadQuestionStats, loadRoomState, loadStudentStats, updateReleasedQuestions } from "../lib/online-client";
import { getBrowserSupabase } from "../lib/supabase-browser";
import type { QuestionStats, QuizQuestion, RoomPublicState, StudentStats } from "../types";

export function TeacherDashboard({
  adminKey,
  initialState,
  questions
}: {
  adminKey: string;
  initialState: RoomPublicState;
  questions: QuizQuestion[];
}) {
  const [state, setState] = useState(initialState);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [statsBusy, setStatsBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [selectedQuestionStats, setSelectedQuestionStats] = useState<QuestionStats | null>(null);
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [studentStatsBusy, setStudentStatsBusy] = useState("");
  const [releaseAmount, setReleaseAmount] = useState(5);
  const studentUrl = useMemo(() => (origin ? `${origin}/?sala=${state.room.roomCode}` : ""), [origin, state.room.roomCode]);
  const statusUrl = useMemo(() => (origin ? `${origin}/status/${state.room.roomCode}` : ""), [origin, state.room.roomCode]);
  const teamRanking = [...state.ubsTeams].sort((a, b) => b.averageScore - a.averageScore);
  const studentRanking = [...state.students].sort((a, b) => b.totalScore - a.totalScore);
  const releasedQuestionIds = new Set(state.room.releasedQuestionIds);
  const remainingQuestions = questions.filter((question) => !releasedQuestionIds.has(question.id));

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (remainingQuestions.length === 0) return;
    setReleaseAmount((current) => Math.max(1, Math.min(current, remainingQuestions.length)));
  }, [remainingQuestions.length]);
  useEffect(() => {
    if (!studentStats) return;
    const close = () => setStudentStats(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [studentStats]);
  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) return;
    const reload = () => void loadRoomState(state.room.roomCode).then(setState).catch(() => undefined);
    const channel = client
      .channel(`qmq-teacher:${state.room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_rooms", filter: `id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_students", filter: `room_id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_ubs_teams", filter: `room_id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_answers", filter: `room_id=eq.${state.room.id}` }, reload)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [state.room.id, state.room.roomCode]);

  async function releaseRandomQuestions() {
    setBusy(true);
    setError("");
    try {
      if (state.room.status === "finished") throw new Error("Esta sala ja foi encerrada.");
      if (remainingQuestions.length === 0) throw new Error("Todas as questoes ja foram liberadas.");

      const amount = Math.max(1, Math.min(releaseAmount, remainingQuestions.length));
      const shuffled = shuffleQuestions(remainingQuestions);
      const selectedIds = shuffled.slice(0, amount).map((question) => question.id);
      setState(await updateReleasedQuestions(state.room.id, [...state.room.releasedQuestionIds, ...selectedIds], adminKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel liberar questoes.");
    } finally {
      setBusy(false);
    }
  }

  async function openQuestionStats(questionId: string) {
    setSelectedQuestionId(questionId);
    setStatsBusy(questionId);
    setError("");
    try {
      setSelectedQuestionStats(await loadQuestionStats(state.room.id, questionId, adminKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel carregar estatisticas.");
    } finally {
      setStatsBusy("");
    }
  }

  async function openStudentStats(studentId: string) {
    setStudentStatsBusy(studentId);
    setError("");
    try {
      setStudentStats(await loadStudentStats(state.room.id, studentId, adminKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel carregar estatisticas do aluno.");
    } finally {
      setStudentStatsBusy("");
    }
  }

  async function closeRoom() {
    if (!window.confirm("Encerrar esta sala?")) return;
    setBusy(true);
    setError("");
    try {
      setState(await finishRoom(state.room.id, adminKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel encerrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Sala {state.room.status === "active" ? "ativa" : "encerrada"}</span>
          <p className="dashboard-room-name">{state.room.roomName || "QuestMED Quiz"}</p>
          <h1>{state.room.roomCode}</h1>
        </div>
        <div className="dashboard-actions">
          <a aria-label="Todas as salas" href="/professor" title="Todas as salas">
            <ArrowLeft size={19} />
            <span>Todas as salas</span>
          </a>
          <a aria-label="Abrir placar" href={statusUrl} rel="noreferrer" target="_blank" title="Abrir placar">
            <ExternalLink size={19} />
          </a>
          <button aria-label="Atualizar" onClick={() => void loadRoomState(state.room.roomCode).then(setState)} title="Atualizar" type="button">
            <RefreshCw size={19} />
          </button>
          <button className="danger-command" disabled={busy || state.room.status === "finished"} onClick={() => void closeRoom()} type="button">
            <Power size={18} /> Encerrar
          </button>
        </div>
      </header>

      <section className="teacher-overview">
        <div className="teacher-links">
          <div><span>Alunos</span><strong>{state.students.length}</strong></div>
          <div><span>UBS</span><strong>{state.ubsTeams.length}</strong></div>
          <div>
            <span>Link</span>
            <button onClick={() => void navigator.clipboard.writeText(studentUrl)} type="button"><Copy size={17} /> Copiar entrada</button>
          </div>
        </div>
        <a className="scoreboard-mini-link" href={statusUrl} target="_blank" rel="noreferrer">Placar publico</a>
      </section>

      {error ? <p className="entry-error">{error}</p> : null}

      <section className="groups-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Tempo real</span>
            <h2>UBS</h2>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>UBS</th><th>Alunos</th><th>Respostas</th><th>Media</th></tr></thead>
            <tbody>
              {teamRanking.map((team) => (
                <tr key={team.id}><td><strong>{team.name}</strong></td><td>{team.memberCount}</td><td>{team.answeredCount}</td><td><strong>{team.averageScore.toFixed(1)}</strong></td></tr>
              ))}
              {teamRanking.length === 0 ? <tr><td className="empty-table" colSpan={4}>Nenhuma UBS entrou na sala.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="groups-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Alunos</span>
            <h2>Ranking individual</h2>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Aluno</th><th>UBS</th><th>Respondidas</th><th>Pontos</th><th>Ultima atividade</th></tr></thead>
            <tbody>
              {studentRanking.map((student) => (
                <tr
                  className="clickable-row"
                  key={student.id}
                  onClick={() => void openStudentStats(student.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") void openStudentStats(student.id);
                  }}
                  tabIndex={0}
                >
                  <td><strong>{student.nickname}</strong></td>
                  <td>{state.ubsTeams.find((team) => team.id === student.ubsId)?.name ?? "-"}</td>
                  <td>{studentStatsBusy === student.id ? "..." : student.answeredCount}</td>
                  <td><strong>{student.totalScore.toFixed(1)}</strong></td>
                  <td>{new Date(student.lastActivityAt).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
              {studentRanking.length === 0 ? <tr><td className="empty-table" colSpan={5}>Nenhum aluno entrou na sala.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {studentStats ? <StudentStatsModal stats={studentStats} onClose={() => setStudentStats(null)} /> : null}

      <section className="teacher-cases-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Controle da atividade</span>
            <h2>Liberar questoes</h2>
          </div>
        </div>
        <div className="random-release-panel">
          <div>
            <span>Disponiveis</span>
            <strong>{remainingQuestions.length}</strong>
          </div>
          <label>
            <span>Quantidade para sortear</span>
            <input
              disabled={busy || state.room.status === "finished" || remainingQuestions.length === 0}
              max={Math.max(1, remainingQuestions.length)}
              min={1}
              onChange={(event) => setReleaseAmount(Number(event.currentTarget.value))}
              type="number"
              value={releaseAmount}
            />
          </label>
          <button
            className="primary-command"
            disabled={busy || state.room.status === "finished" || remainingQuestions.length === 0}
            onClick={() => void releaseRandomQuestions()}
            type="button"
          >
            <Shuffle size={18} /> Liberar aleatorias
          </button>
        </div>
        <div className="question-release-list">
          {questions.map((question) => {
            const released = releasedQuestionIds.has(question.id);
            return (
              <article
                className={[
                  released ? "release-card released" : "release-card",
                  selectedQuestionId === question.id ? "selected" : ""
                ].join(" ")}
                key={question.id}
                onClick={() => void openQuestionStats(question.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") void openQuestionStats(question.id);
                }}
              >
                <div>
                  <strong>{question.id}</strong>
                  <span>{question.area}</span>
                  <p>{question.theme}</p>
                </div>
                <span className={released ? "release-state released" : "release-state"}>{released ? "Liberada" : "Disponivel"}</span>
              </article>
            );
          })}
        </div>
        {selectedQuestionId ? (
          <QuestionStatsPanel
            question={questions.find((question) => question.id === selectedQuestionId)}
            stats={selectedQuestionStats}
            busy={statsBusy === selectedQuestionId}
          />
        ) : null}
      </section>
    </main>
  );
}

function shuffleQuestions(items: QuizQuestion[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function StudentStatsModal({ onClose, stats }: { onClose: () => void; stats: StudentStats }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="student-stats-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <span className="eyebrow">Estatisticas do aluno</span>
            <h2>{stats.student.nickname}</h2>
            <p>{stats.ubsName}</p>
          </div>
          <strong>{stats.totalScore.toFixed(1)} pts</strong>
        </header>

        <div className="stats-summary-grid">
          <div><span>Respondidas</span><strong>{stats.answeredCount}/{stats.totalQuestions}</strong></div>
          <div><span>Acertos</span><strong>{stats.correctCount}</strong></div>
          <div><span>Erros</span><strong>{stats.incorrectCount}</strong></div>
          <div><span>Timeout</span><strong>{stats.timeoutCount}</strong></div>
        </div>

        <div className="student-answer-list">
          {stats.answers.map((answer) => (
            <article className={answer.isCorrect ? "student-answer correct" : "student-answer"} key={answer.questionId}>
              <strong>{answer.questionId}</strong>
              <span>{answer.theme}</span>
              <b>{answer.selectedOptionId === "TIMEOUT" ? "Tempo esgotado" : `Marcada ${answer.selectedOptionId}`}</b>
              <small>Gabarito {answer.correctOptionId}</small>
              <em>{answer.score.toFixed(1)} pts</em>
            </article>
          ))}
          {stats.answers.length === 0 ? <p className="empty-room-list">Nenhuma questao respondida.</p> : null}
        </div>
      </section>
    </div>
  );
}

function QuestionStatsPanel({
  busy,
  question,
  stats
}: {
  busy: boolean;
  question?: QuizQuestion;
  stats: QuestionStats | null;
}) {
  if (!question) return null;
  return (
    <section className="question-stats-panel">
      <div className="question-stats-heading">
        <div>
          <span className="eyebrow">Estatisticas</span>
          <h3>{question.id}</h3>
          <p>{question.theme}</p>
        </div>
        <BarChart3 size={26} />
      </div>

      {busy || !stats ? (
        <p className="empty-room-list">Carregando estatisticas...</p>
      ) : (
        <>
          <div className="stats-summary-grid">
            <div><span>Respostas</span><strong>{stats.totalAnswers}</strong></div>
            <div><span>Acertos</span><strong>{stats.correctCount}</strong></div>
            <div><span>Erros</span><strong>{stats.incorrectCount}</strong></div>
            <div><span>Tempo esgotado</span><strong>{stats.timeoutCount}</strong></div>
          </div>
          <div className="option-stats-list">
            {stats.options.map((option) => {
              const optionText =
                option.optionId === "TIMEOUT"
                  ? "Tempo esgotado"
                  : question.options.find((item) => item.id === option.optionId)?.text ?? option.optionId;
              return (
                <div className={option.isCorrect ? "option-stat correct" : "option-stat"} key={option.optionId}>
                  <strong>{option.optionId === "TIMEOUT" ? "T" : option.optionId}</strong>
                  <span>{optionText}</span>
                  <div className="option-stat-bar"><i style={{ width: `${option.percent}%` }} /></div>
                  <b>{option.count} ({option.percent.toFixed(1)}%)</b>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
