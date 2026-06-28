"use client";

import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { QuizQuestion } from "../types";
import { AvatarBadge } from "./AvatarBadge";

type ResolverAnswer = {
  questionId: string;
  selectedOptionId: "A" | "B" | "C" | "D" | "TIMEOUT";
  isCorrect: boolean;
  status: "correct" | "incorrect" | "timeout";
  score: number;
  elapsedSeconds: number;
  answeredAt: string;
};

type ResolverAdminStudent = {
  id: string;
  nickname: string;
  ubsName: string;
  avatarId: string;
  totalScore: number;
  answeredCount: number;
  averageScore: number;
  createdAt: string;
  updatedAt: string;
  answers: ResolverAnswer[];
};

type ResolverAdminState = {
  students: ResolverAdminStudent[];
  ubsTeams: Array<{ name: string; memberCount: number; answeredCount: number; averageScore: number }>;
  questionStats: Array<{ questionId: string; totalAnswers: number; correctCount: number; incorrectCount: number; timeoutCount: number }>;
  summary: { studentCount: number; ubsCount: number; answerCount: number; averageScore: number; lastActivityAt: string | null };
};

async function requestResolverAdmin(password: string, method: "POST" | "DELETE" = "POST") {
  const response = await fetch("/api/resolver/admin", {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const data = (await response.json()) as ResolverAdminState & { error?: string; ok?: true };
  if (!response.ok) throw new Error(data.error ?? "Falha ao carregar o resolvedor.");
  return data;
}

export function ResolverAdminDashboard({ questions }: { questions: QuizQuestion[] }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ResolverAdminState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<ResolverAdminStudent | null>(null);
  const questionsById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const studentRanking = [...(state?.students ?? [])].sort((a, b) => b.totalScore - a.totalScore || b.answeredCount - a.answeredCount);

  useEffect(() => {
    const savedPassword = window.sessionStorage.getItem("questmed-professor-password") ?? "";
    if (!savedPassword) return;
    setPassword(savedPassword);
    void load(savedPassword);
  }, []);

  async function load(currentPassword = password) {
    setBusy(true);
    setError("");
    try {
      const next = await requestResolverAdmin(currentPassword);
      window.sessionStorage.setItem("questmed-professor-password", currentPassword);
      setState(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel carregar o resolvedor.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(password);
  }

  async function clearResolver() {
    if (!window.confirm("Limpar todas as respostas e alunos do resolvedor?")) return;
    setBusy(true);
    setError("");
    try {
      await requestResolverAdmin(password, "DELETE");
      setState(null);
      setSelectedStudent(null);
      await load(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel limpar o resolvedor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Resolvedor</span>
          <p className="dashboard-room-name">Controle das respostas livres</p>
          <h1>RESOLVEDOR</h1>
        </div>
        <div className="dashboard-actions">
          <a aria-label="Todas as salas" href="/professor" title="Todas as salas">
            <ArrowLeft size={19} />
            <span>Todas as salas</span>
          </a>
          <button aria-label="Atualizar" disabled={busy || !password} onClick={() => void load()} title="Atualizar" type="button">
            {busy ? <Loader2 className="spin" size={19} /> : <RefreshCw size={19} />}
          </button>
          <button className="danger-command" disabled={busy || !state} onClick={() => void clearResolver()} type="button">
            <Trash2 size={18} /> Limpar
          </button>
        </div>
      </header>

      {!state ? (
        <section className="create-room-panel">
          <form className="create-room-controls" onSubmit={submitPassword}>
            <label>Senha do professor</label>
            <input onChange={(event) => setPassword(event.currentTarget.value)} placeholder="Senha" type="password" value={password} />
            <button className="primary-command" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={18} /> : null} Entrar no resolvedor
            </button>
          </form>
        </section>
      ) : null}

      {error ? <p className="entry-error">{error}</p> : null}

      {state ? (
        <>
          <section className="teacher-overview resolver-admin-overview">
            <div className="teacher-links">
              <div><span>Alunos</span><strong>{state.summary.studentCount}</strong></div>
              <div><span>UBS</span><strong>{state.summary.ubsCount}</strong></div>
              <div><span>Respostas</span><strong>{state.summary.answerCount}</strong></div>
            </div>
            <div className="resolver-admin-average">
              <span>Media geral</span>
              <strong>{state.summary.averageScore.toFixed(1)}</strong>
              <small>{state.summary.lastActivityAt ? new Date(state.summary.lastActivityAt).toLocaleString("pt-BR") : "Sem atividade"}</small>
            </div>
          </section>

          <section className="groups-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">UBS</span>
                <h2>Resumo por equipe</h2>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>UBS</th><th>Alunos</th><th>Respostas</th><th>Media</th></tr></thead>
                <tbody>
                  {state.ubsTeams.map((team) => (
                    <tr key={team.name}>
                      <td><strong>{team.name}</strong></td>
                      <td>{team.memberCount}</td>
                      <td>{team.answeredCount}</td>
                      <td><strong>{team.averageScore.toFixed(1)}</strong></td>
                    </tr>
                  ))}
                  {state.ubsTeams.length === 0 ? <tr><td className="empty-table" colSpan={4}>Nenhuma UBS no resolvedor.</td></tr> : null}
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
                    <tr className="clickable-row" key={student.id} onClick={() => setSelectedStudent(student)} tabIndex={0}>
                      <td><span className="resolver-admin-student"><AvatarBadge avatarId={student.avatarId} name={student.nickname} /> <strong>{student.nickname}</strong></span></td>
                      <td>{student.ubsName}</td>
                      <td>{student.answeredCount}</td>
                      <td><strong>{student.totalScore.toFixed(1)}</strong></td>
                      <td>{new Date(student.updatedAt).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                  {studentRanking.length === 0 ? <tr><td className="empty-table" colSpan={5}>Nenhum aluno sincronizou o resolvedor.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="teacher-cases-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Questoes</span>
                <h2>Desempenho no resolvedor</h2>
              </div>
            </div>
            <div className="released-performance-list">
              {state.questionStats.map((stats) => {
                const question = questionsById.get(stats.questionId);
                const misses = stats.incorrectCount + stats.timeoutCount;
                const missPercent = stats.totalAnswers ? Number(((misses / stats.totalAnswers) * 100).toFixed(1)) : 0;
                return (
                  <div className="released-performance-card resolver-admin-question" key={stats.questionId}>
                    <strong>{stats.questionId}</strong>
                    <span>{question?.theme ?? "Questao"}</span>
                    <b>{missPercent.toFixed(1)}% erraram</b>
                    <small>{misses} erro(s) / {stats.correctCount} acerto(s) / {stats.totalAnswers} resposta(s)</small>
                  </div>
                );
              })}
              {state.questionStats.length === 0 ? <p className="empty-room-list">Nenhuma questao respondida.</p> : null}
            </div>
          </section>
        </>
      ) : null}

      {selectedStudent ? (
        <div className="modal-backdrop" onClick={() => setSelectedStudent(null)} role="presentation">
          <section className="student-stats-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <header>
              <div>
                <span className="eyebrow">Respostas do resolvedor</span>
                <h2>{selectedStudent.nickname}</h2>
                <p>{selectedStudent.ubsName}</p>
              </div>
              <strong>{selectedStudent.totalScore.toFixed(1)} pts</strong>
            </header>
            <div className="stats-summary-grid">
              <div><span>Respondidas</span><strong>{selectedStudent.answeredCount}</strong></div>
              <div><span>Acertos</span><strong>{selectedStudent.answers.filter((answer) => answer.isCorrect).length}</strong></div>
              <div><span>Erros</span><strong>{selectedStudent.answers.filter((answer) => !answer.isCorrect && answer.selectedOptionId !== "TIMEOUT").length}</strong></div>
              <div><span>Timeout</span><strong>{selectedStudent.answers.filter((answer) => answer.selectedOptionId === "TIMEOUT").length}</strong></div>
            </div>
            <div className="student-answer-list">
              {selectedStudent.answers.map((answer) => {
                const question = questionsById.get(answer.questionId);
                return (
                  <article className={answer.isCorrect ? "student-answer correct" : "student-answer"} key={answer.questionId}>
                    <strong>{answer.questionId}</strong>
                    <span>{question?.theme ?? "Questao"}</span>
                    <b>{answer.selectedOptionId === "TIMEOUT" ? "Tempo esgotado" : `Marcada ${answer.selectedOptionId}`}</b>
                    <small>Gabarito {question?.correctOptionId ?? "-"}</small>
                    <em>{answer.score.toFixed(1)} pts</em>
                  </article>
                );
              })}
              {selectedStudent.answers.length === 0 ? <p className="empty-room-list">Nenhuma questao respondida.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
