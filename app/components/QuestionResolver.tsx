"use client";

import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, FileText, RotateCcw, Trash2, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AvatarBadge } from "./AvatarBadge";
import { AVATAR_PRESETS, DEFAULT_AVATAR_ID } from "../lib/avatars";
import type { QuestionComment, QuestionOption, QuizQuestion } from "../types";

const RESOLVER_TABLE_KEY = "questmed-resolver-table";
export const LAST_RESOLVER_STUDENT_KEY = "questmed-resolver-last-student";
const QUESTION_TIME_LIMIT_SECONDS = 90;
const DISPLAY_OPTION_IDS = ["A", "B", "C", "D"] as const;
const UBS_OPTIONS = [
  "USF Felipe Camarao",
  "USF Amarante",
  "USF Cidade Praia",
  "USF Ronaldo Machado",
  "USF Cidade Nova",
  "USF Joao Maria",
  "USF Bela Parnamirim"
];

type ResolverStep = "resume" | "identify" | "quiz";
type AnswerStatus = "correct" | "incorrect" | "timeout";

type ResolverAnswer = {
  questionId: string;
  selectedOptionId: QuestionOption["id"] | "TIMEOUT";
  isCorrect: boolean;
  status: AnswerStatus;
  score: number;
  elapsedSeconds: number;
  answeredAt: string;
};

type ResolverStudent = {
  id: string;
  nickname: string;
  ubsName: string;
  avatarId: string;
  questionOrder: string[];
  currentIndex: number;
  answers: ResolverAnswer[];
  createdAt: string;
  updatedAt: string;
};

type ResolverTable = {
  students: ResolverStudent[];
};

type ResolverRankingItem = {
  id: string;
  nickname: string;
  ubsName: string;
  avatarId: string;
  answeredCount: number;
  averageScore: number;
  totalScore: number;
};

type ExistingResolverConfirmation = {
  student: ResolverStudent;
  answeredCount: number;
  totalScore: number;
};

function normalizeName(value: string) {
  return value.toLocaleUpperCase("pt-BR").replace(/[^\p{L}\p{N} .'-]/gu, "");
}

function getStudentKey(nickname: string, ubsName: string) {
  return `${normalizeName(nickname).trim()}::${ubsName.trim().toLocaleUpperCase("pt-BR")}`;
}

function createEmptyTable(): ResolverTable {
  return { students: [] };
}

function readResolverTable(): ResolverTable {
  if (typeof window === "undefined") return createEmptyTable();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESOLVER_TABLE_KEY) ?? "");
    if (parsed && Array.isArray(parsed.students)) return parsed as ResolverTable;
  } catch {
    return createEmptyTable();
  }
  return createEmptyTable();
}

function writeResolverTable(table: ResolverTable) {
  window.localStorage.setItem(RESOLVER_TABLE_KEY, JSON.stringify(table));
}

function getLastResolverStudent() {
  if (typeof window === "undefined") return null;
  const table = readResolverTable();
  const lastId = window.localStorage.getItem(LAST_RESOLVER_STUDENT_KEY);
  return table.students.find((item) => item.id === lastId) ?? [...table.students].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

async function requestResolverJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha ao sincronizar resolvedor.");
  return data;
}

function getLocalRanking(table: ResolverTable): ResolverRankingItem[] {
  return table.students
    .map((item) => {
      const totalScore = item.answers.reduce((sum, answer) => sum + answer.score, 0);
      return {
        id: item.id,
        nickname: item.nickname,
        ubsName: item.ubsName,
        avatarId: item.avatarId,
        answeredCount: item.answers.length,
        averageScore: item.answers.length ? totalScore / item.answers.length : 0,
        totalScore
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || b.answeredCount - a.answeredCount || a.nickname.localeCompare(b.nickname));
}

async function loadResolverRanking() {
  return requestResolverJson<{ ranking: ResolverRankingItem[] }>("/api/resolver/ranking");
}

async function syncResolverStudent(student: ResolverStudent) {
  return requestResolverJson<{ ranking: ResolverRankingItem[] }>("/api/resolver/sync", {
    method: "POST",
    body: JSON.stringify({ student })
  });
}

async function loadResolverStudent(nickname: string, ubsName: string) {
  const params = new URLSearchParams({ nickname, ubsName });
  return requestResolverJson<{ student: ResolverStudent | null }>(`/api/resolver/student?${params.toString()}`);
}

function calculateAnswerScore(isCorrect: boolean, elapsedSeconds: number) {
  if (!isCorrect) return 0;
  const clampedElapsed = Math.min(Math.max(elapsedSeconds, 0), QUESTION_TIME_LIMIT_SECONDS);
  const remainingRatio = Math.max(0, QUESTION_TIME_LIMIT_SECONDS - clampedElapsed) / QUESTION_TIME_LIMIT_SECONDS;
  return Number((10 * remainingRatio).toFixed(1));
}

function rankLabel(index: number) {
  return `${index + 1}o`;
}

function podiumRankLabel(rank: number) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  return "3rd";
}

function medalSrc(rank: number, small = false) {
  if (rank < 1 || rank > 3) return "";
  return `/leaderboard/medal-${rank}${small ? "-sm" : ""}.webp`;
}

function mergeQuestionOrder(...orders: string[][]) {
  const seen = new Set<string>();
  return orders.flat().filter((questionId) => {
    if (seen.has(questionId)) return false;
    seen.add(questionId);
    return true;
  });
}

function mergeResolverStudents(localStudent: ResolverStudent | undefined, serverStudent: ResolverStudent) {
  if (!localStudent) return serverStudent;
  const answersByQuestion = new Map(serverStudent.answers.map((answer) => [answer.questionId, answer]));
  for (const answer of localStudent.answers) {
    if (!answersByQuestion.has(answer.questionId)) answersByQuestion.set(answer.questionId, answer);
  }
  const answers = [...answersByQuestion.values()].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  return {
    ...serverStudent,
    avatarId: serverStudent.answers.length >= localStudent.answers.length ? serverStudent.avatarId : localStudent.avatarId,
    questionOrder: mergeQuestionOrder(serverStudent.questionOrder, localStudent.questionOrder, answers.map((answer) => answer.questionId)),
    currentIndex: Math.max(serverStudent.currentIndex, localStudent.currentIndex, answers.length > 0 ? answers.length - 1 : 0),
    answers,
    updatedAt: [serverStudent.updatedAt, localStudent.updatedAt].sort().at(-1) ?? serverStudent.updatedAt
  };
}

export function QuestionResolver({
  onBack,
  questionComments,
  questions
}: {
  onBack: () => void;
  questionComments: QuestionComment[];
  questions: QuizQuestion[];
}) {
  const [step, setStep] = useState<ResolverStep>("identify");
  const [resumeStudent, setResumeStudent] = useState<ResolverStudent | null>(null);
  const [nickname, setNickname] = useState("");
  const [ubsName, setUbsName] = useState("");
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [table, setTable] = useState<ResolverTable>(createEmptyTable);
  const [serverRanking, setServerRanking] = useState<ResolverRankingItem[]>([]);
  const [student, setStudent] = useState<ResolverStudent | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<QuestionOption["id"] | "">("");
  const [remainingSeconds, setRemainingSeconds] = useState(QUESTION_TIME_LIMIT_SECONDS);
  const [showResolution, setShowResolution] = useState(false);
  const [answerFlash, setAnswerFlash] = useState<{ isCorrect: boolean; score: number; timeout?: boolean } | null>(null);
  const [existingConfirmation, setExistingConfirmation] = useState<ExistingResolverConfirmation | null>(null);
  const [error, setError] = useState("");
  const timerStartedAtRef = useRef<number | null>(null);
  const timeoutQuestionRef = useRef("");
  const questionScrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const entryErrorRef = useRef<HTMLParagraphElement>(null);

  const commentsByQuestion = useMemo(
    () => new Map(questionComments.map((comment) => [comment.questionId, comment])),
    [questionComments]
  );
  const questionsById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const currentQuestionId = student?.questionOrder[student.currentIndex] ?? "";
  const currentQuestion = questionsById.get(currentQuestionId) ?? null;
  const currentAnswer = student?.answers.find((answer) => answer.questionId === currentQuestionId) ?? null;
  const answeredIds = useMemo(() => new Set(student?.answers.map((answer) => answer.questionId) ?? []), [student?.answers]);
  const completed = Boolean(student && student.answers.length >= questions.length);
  const questionNumber = student ? Math.min(student.currentIndex + 1, questions.length) : 0;
  const totalScore = student?.answers.reduce((sum, answer) => sum + answer.score, 0) ?? 0;
  const localRanking = useMemo(() => getLocalRanking(table), [table]);
  const savedStudents = useMemo(
    () => [...table.students].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [table.students]
  );
  const individualRanking = serverRanking.length > 0 ? serverRanking : localRanking;
  const podiumSlots = [
    { item: individualRanking[1], rank: 2 },
    { item: individualRanking[0], rank: 1 },
    { item: individualRanking[2], rank: 3 }
  ].filter((slot): slot is { item: ResolverRankingItem; rank: number } => Boolean(slot.item));
  const currentRank = student ? Math.max(1, individualRanking.findIndex((item) => item.id === student.id) + 1 || 1) : 1;

  useEffect(() => {
    const nextTable = readResolverTable();
    const lastStudent = getLastResolverStudent();
    setTable(nextTable);
    setResumeStudent(lastStudent);
    if (lastStudent) setStep("resume");
    void loadResolverRanking()
      .then((data) => setServerRanking(data.ranking))
      .catch(() => setServerRanking(getLocalRanking(nextTable)));
    const interval = window.setInterval(() => {
      void loadResolverRanking()
        .then((data) => setServerRanking(data.ranking))
        .catch(() => setServerRanking(getLocalRanking(readResolverTable())));
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!currentQuestion || currentAnswer || completed) {
      timerStartedAtRef.current = null;
      timeoutQuestionRef.current = "";
      setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
      return;
    }
    if (timerStartedAtRef.current === null) timerStartedAtRef.current = Date.now();
    const updateTimer = () => {
      const startedAt = timerStartedAtRef.current ?? Date.now();
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemainingSeconds(Math.max(0, QUESTION_TIME_LIMIT_SECONDS - elapsed));
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [completed, currentAnswer, currentQuestion?.id]);

  useEffect(() => {
    if (!student || !currentQuestion || currentAnswer || remainingSeconds > 0 || timeoutQuestionRef.current === currentQuestion.id) return;
    timeoutQuestionRef.current = currentQuestion.id;
    recordAnswer("TIMEOUT", true);
  }, [currentAnswer, currentQuestion, remainingSeconds, student]);

  useEffect(() => {
    if (!student || !currentAnswer) return;
    window.setTimeout(() => actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
  }, [currentAnswer?.questionId, student?.id]);

  useEffect(() => {
    if (step !== "identify" || !error) return;
    window.setTimeout(() => entryErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [error, step]);

  function saveStudentLocally(nextStudent: ResolverStudent) {
    const nextTable = readResolverTable();
    const existingIndex = nextTable.students.findIndex((item) => item.id === nextStudent.id);
    if (existingIndex >= 0) nextTable.students[existingIndex] = nextStudent;
    else nextTable.students.push(nextStudent);
    writeResolverTable(nextTable);
    window.localStorage.setItem(LAST_RESOLVER_STUDENT_KEY, nextStudent.id);
    setTable(nextTable);
    setStudent(nextStudent);
    return nextTable;
  }

  function persistStudent(nextStudent: ResolverStudent) {
    const nextTable = saveStudentLocally(nextStudent);
    void syncResolverStudent(nextStudent)
      .then((data) => setServerRanking(data.ranking))
      .catch(() => setServerRanking(getLocalRanking(nextTable)));
  }

  function askToResumeExisting(nextStudent: ResolverStudent) {
    setExistingConfirmation({
      student: nextStudent,
      answeredCount: nextStudent.answers.length,
      totalScore: nextStudent.answers.reduce((sum, answer) => sum + answer.score, 0)
    });
  }

  function confirmExistingStudent() {
    if (!existingConfirmation) return;
    saveStudentLocally(existingConfirmation.student);
    setExistingConfirmation(null);
    setStep("quiz");
  }

  function cancelExistingStudent() {
    setExistingConfirmation(null);
    setError("Altere o nome ou a UBS para criar outro usuario.");
  }

  async function submitIdentification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextNickname = normalizeName(nickname).trim();
    if (!nextNickname) {
      setError("Informe seu nome para continuar.");
      return;
    }
    if (!ubsName) {
      setError("Escolha sua UBS para continuar.");
      return;
    }
    setError("");
    const nextTable = readResolverTable();
    const key = getStudentKey(nextNickname, ubsName);
    const existing = nextTable.students.find((item) => getStudentKey(item.nickname, item.ubsName) === key);
    try {
      const serverData = await loadResolverStudent(nextNickname, ubsName);
      if (serverData.student) {
        askToResumeExisting(mergeResolverStudents(existing, serverData.student));
        return;
      }
    } catch {
      if (!existing) {
        setError("Nao foi possivel verificar se ja existe progresso salvo. Tente novamente antes de iniciar.");
        return;
      }
    }
    if (existing) {
      const updated = { ...existing, avatarId, updatedAt: new Date().toISOString() };
      askToResumeExisting(updated);
      return;
    }
    const now = new Date().toISOString();
    const nextStudent: ResolverStudent = {
      id: `resolver-${hashSeed(key).toString(36)}`,
      nickname: nextNickname,
      ubsName,
      avatarId,
      questionOrder: shuffleQuestions(questions.map((question) => question.id), `${nextNickname}:${ubsName}:${now}`),
      currentIndex: 0,
      answers: [],
      createdAt: now,
      updatedAt: now
    };
    persistStudent(nextStudent);
    setStep("quiz");
  }

  function resumeSavedStudent(nextStudent: ResolverStudent) {
    setNickname(nextStudent.nickname);
    setUbsName(nextStudent.ubsName);
    setAvatarId(nextStudent.avatarId);
    setStudent(nextStudent);
    window.localStorage.setItem(LAST_RESOLVER_STUDENT_KEY, nextStudent.id);
    setStep("quiz");
  }

  function createNewStudent() {
    window.localStorage.removeItem(LAST_RESOLVER_STUDENT_KEY);
    setResumeStudent(null);
    setNickname("");
    setUbsName("");
    setAvatarId(DEFAULT_AVATAR_ID);
    setStudent(null);
    setError("");
    setStep("identify");
  }

  function deleteLocalStudent(studentId: string) {
    const nextTable = readResolverTable();
    const nextStudents = nextTable.students.filter((item) => item.id !== studentId);
    const updatedTable = { students: nextStudents };
    writeResolverTable(updatedTable);
    if (window.localStorage.getItem(LAST_RESOLVER_STUDENT_KEY) === studentId) {
      window.localStorage.removeItem(LAST_RESOLVER_STUDENT_KEY);
    }
    setTable(updatedTable);
    if (resumeStudent?.id === studentId) setResumeStudent(null);
    if (student?.id === studentId) setStudent(null);
    if (nextStudents.length === 0) setStep("identify");
  }

  function goToMainEntry() {
    window.localStorage.removeItem(LAST_RESOLVER_STUDENT_KEY);
    onBack();
  }

  function recordAnswer(optionId: QuestionOption["id"] | "TIMEOUT", timeout = false) {
    if (!student || !currentQuestion || currentAnswer) return;
    const elapsedSeconds = timeout ? QUESTION_TIME_LIMIT_SECONDS : Math.min(QUESTION_TIME_LIMIT_SECONDS, Math.floor((Date.now() - (timerStartedAtRef.current ?? Date.now())) / 1000));
    const isCorrect = optionId === currentQuestion.correctOptionId;
    const score = calculateAnswerScore(isCorrect, elapsedSeconds);
    const answer: ResolverAnswer = {
      questionId: currentQuestion.id,
      selectedOptionId: optionId,
      isCorrect,
      status: timeout ? "timeout" : isCorrect ? "correct" : "incorrect",
      score,
      elapsedSeconds,
      answeredAt: new Date().toISOString()
    };
    const nextStudent = {
      ...student,
      answers: [...student.answers, answer],
      updatedAt: new Date().toISOString()
    };
    timerStartedAtRef.current = null;
    setAnswerFlash({ isCorrect, score, timeout });
    window.setTimeout(() => setAnswerFlash(null), 850);
    persistStudent(nextStudent);
  }

  function goToIndex(nextIndex: number) {
    if (!student || nextIndex < 0 || nextIndex >= student.questionOrder.length) return;
    const nextStudent = { ...student, currentIndex: nextIndex, updatedAt: new Date().toISOString() };
    setSelectedOptionId("");
    setShowResolution(false);
    timerStartedAtRef.current = null;
    persistStudent(nextStudent);
  }

  function scrollQuestionToTop() {
    window.setTimeout(() => questionScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 80);
  }

  function goToNextQuestion() {
    if (!student) return;
    const nextUnansweredIndex = student.questionOrder.findIndex((questionId, index) => index > student.currentIndex && !answeredIds.has(questionId));
    if (nextUnansweredIndex >= 0) {
      goToIndex(nextUnansweredIndex);
      scrollQuestionToTop();
      return;
    }
    const firstUnansweredIndex = student.questionOrder.findIndex((questionId) => !answeredIds.has(questionId));
    if (firstUnansweredIndex >= 0) {
      goToIndex(firstUnansweredIndex);
      scrollQuestionToTop();
    }
  }

  function restartBank() {
    if (!student) return;
    const confirmed = window.confirm("Tem certeza de que deseja recomecar? As respostas deste usuario neste dispositivo serao zeradas para iniciar novamente.");
    if (!confirmed) return;
    const now = new Date().toISOString();
    persistStudent({
      ...student,
      questionOrder: shuffleQuestions(questions.map((question) => question.id), `${student.nickname}:${student.ubsName}:${now}`),
      currentIndex: 0,
      answers: [],
      updatedAt: now
    });
    setSelectedOptionId("");
    setShowResolution(false);
    timerStartedAtRef.current = null;
  }

  function generateAnswersPdf() {
    if (!student || student.answers.length === 0) return;
    const html = buildResolverReportHtml({
      commentsByQuestion,
      questionsById,
      student,
      totalQuestions: questions.length,
      totalScore
    });
    const printWindow = window.open("about:blank", "_blank", "width=960,height=720");
    if (!printWindow) {
      window.alert("Nao foi possivel abrir a janela do PDF. Permita pop-ups para gerar o arquivo.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    let printed = false;
    const printReport = () => {
      if (printed || printWindow.closed) return;
      printed = true;
      printWindow.focus();
      printWindow.print();
    };
    printWindow.onload = printReport;
    window.setTimeout(printReport, 500);
  }

  if (step === "resume" && savedStudents.length > 0) {
    return (
      <main className="app-shell resolver-entry-shell">
        <section className="entry-panel resolver-entry-panel resolver-resume-panel">
          <span className="eyebrow">QuestMED Quiz</span>
          <h1>Reentrar?</h1>
          <div className="resolver-resume-list" aria-label="Perfis salvos">
            {savedStudents.map((savedStudent) => {
              const resumeAverage = savedStudent.answers.length
                ? savedStudent.answers.reduce((sum, answer) => sum + answer.score, 0) / savedStudent.answers.length
                : 0;
              return (
                <article className="resolver-resume-card" key={savedStudent.id}>
                  <button className="resolver-resume-open" onClick={() => resumeSavedStudent(savedStudent)} type="button">
                    <AvatarBadge avatarId={savedStudent.avatarId} className="rank-avatar" name={savedStudent.nickname} />
                    <div>
                      <strong>{savedStudent.nickname}</strong>
                      <span>{savedStudent.ubsName}</span>
                      <small>{savedStudent.answers.length}/{questions.length} respondidas</small>
                    </div>
                    <b>{resumeAverage.toFixed(1)}</b>
                  </button>
                  <button
                    aria-label={`Excluir perfil local de ${savedStudent.nickname}`}
                    className="resolver-delete-local"
                    onClick={() => deleteLocalStudent(savedStudent.id)}
                    title="Excluir deste dispositivo"
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
          </div>
          <div className="resolver-resume-actions">
            <button onClick={createNewStudent} type="button">Novo usuario</button>
            <button className="resolver-back-button" onClick={goToMainEntry} type="button">Tela principal</button>
          </div>
        </section>
      </main>
    );
  }

  if (step === "identify") {
    return (
      <main className="app-shell resolver-entry-shell">
        <section className="entry-panel resolver-entry-panel">
          <span className="eyebrow">QuestMED Quiz</span>
          <h1>Resolver questoes</h1>
          {error ? <p className="entry-error resolver-entry-error" ref={entryErrorRef} tabIndex={-1}>{error}</p> : null}
          <form className="entry-form stacked" onSubmit={submitIdentification}>
            <input
              autoFocus
              onChange={(event) => {
                setExistingConfirmation(null);
                setNickname(normalizeName(event.currentTarget.value));
              }}
              onInput={(event) => {
                setExistingConfirmation(null);
                setNickname(normalizeName(event.currentTarget.value));
              }}
              placeholder="SEU NOME"
              type="text"
              value={nickname}
            />
            <label className="resolver-select-label">
              <span>Escolha sua UBS</span>
              <select
                onChange={(event) => {
                  setExistingConfirmation(null);
                  setUbsName(event.currentTarget.value);
                }}
                value={ubsName}
              >
                <option value="">SELECIONE SUA UBS</option>
                {UBS_OPTIONS.map((ubs) => <option key={ubs} value={ubs}>{ubs}</option>)}
              </select>
            </label>
            {existingConfirmation ? (
              <section className="resolver-existing-warning" role="alert">
                <strong>Usuario ja existe nesta UBS</strong>
                <p>
                  Encontramos {existingConfirmation.student.nickname} vinculado a {existingConfirmation.student.ubsName} com {existingConfirmation.answeredCount}/{questions.length} questoes respondidas.
                </p>
                <p>Tem certeza de que e o mesmo usuario? Ao continuar, ele vai recomecar de onde parou da ultima vez.</p>
                <div>
                  <button onClick={confirmExistingStudent} type="button">Sim, continuar</button>
                  <button onClick={cancelExistingStudent} type="button">Nao, alterar</button>
                </div>
              </section>
            ) : null}
            <fieldset className="avatar-picker resolver-avatar-picker">
              <legend>Escolha seu avatar</legend>
              <div>
                {AVATAR_PRESETS.map((avatar) => (
                  <button
                    aria-pressed={avatarId === avatar.id}
                    className={avatarId === avatar.id ? "avatar-choice selected" : "avatar-choice"}
                    key={avatar.id}
                    onClick={() => setAvatarId(avatar.id)}
                    type="button"
                  >
                    <AvatarBadge avatarId={avatar.id} className="choice-avatar" name={nickname || avatar.label} />
                  </button>
                ))}
              </div>
            </fieldset>
            <button type="submit">Entrar</button>
            <button className="resolver-back-button" onClick={onBack} type="button">Voltar</button>
          </form>
        </section>
      </main>
    );
  }

  if (!student) return null;

  return (
    <main className="quiz-shell resolver-shell">
      <section className="phone-stage resolver-stage" aria-label="Resolver questoes">
        <button className="resolver-exit-button" onClick={goToMainEntry} type="button">
          Sair
        </button>
        <header className="topbar">
          <AvatarBadge avatarId={student.avatarId} className="player-avatar" name={student.nickname} />
          <div>
            <p className="eyebrow">{student.ubsName}</p>
            <h1>{student.nickname}</h1>
          </div>
          <div className="score-chip rank-chip">
            <span>{currentRank}o</span>
            <strong>{totalScore.toFixed(1)}</strong>
            <em className={remainingSeconds <= 15 && !currentAnswer ? "score-timer danger" : "score-timer"}>
              <Clock3 size={15} /> {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}
            </em>
          </div>
        </header>

        <div className="question-scroll" ref={questionScrollRef}>
          <div className="meta-row">
            <span className="id-pill">{currentQuestion?.id ?? "----"}</span>
            {currentAnswer ? <span className="answered-pill">Respondida</span> : null}
            <span className="progress-pill">{student.answers.length}/{questions.length}</span>
          </div>

          {completed ? (
            <section className="completion-panel resolver-completion">
              <span className="eyebrow">Banco concluido</span>
              <h2>Voce finalizou todas as questoes</h2>
              <div className="completion-summary">
                <div><span>Respondidas</span><strong>{student.answers.length}</strong></div>
                <div><span>Acertos</span><strong>{student.answers.filter((answer) => answer.isCorrect).length}</strong></div>
                <div><span>Pontuacao</span><strong>{totalScore.toFixed(1)}</strong></div>
              </div>
              <button className="resolver-primary-action" onClick={restartBank} type="button">
                <RotateCcw size={18} /> Recomecar
              </button>
              <button className="resolver-primary-action secondary" onClick={generateAnswersPdf} type="button">
                <FileText size={18} /> Gerar PDF
              </button>
            </section>
          ) : currentQuestion ? (
            <>
              <section className="question-card" key={currentQuestion.id}>
                <p>{currentQuestion.statement}</p>
              </section>

              <section className="options-list" aria-label="Alternativas">
                {getDisplayOptions(currentQuestion, student.id).map(({ option, displayId }) => {
                  const selected = selectedOptionId === option.id || currentAnswer?.selectedOptionId === option.id;
                  const correct = currentAnswer && option.id === currentQuestion.correctOptionId;
                  const wrong = currentAnswer && currentAnswer.selectedOptionId === option.id && !currentAnswer.isCorrect;
                  return (
                    <button
                      className={["option-button", selected ? "selected" : "", correct ? "correct" : "", wrong ? "incorrect" : ""].join(" ")}
                      disabled={Boolean(currentAnswer)}
                      key={option.id}
                      onClick={() => setSelectedOptionId(option.id)}
                      type="button"
                    >
                      <span className="option-letter">{displayId}</span>
                      <span>{option.text}</span>
                    </button>
                  );
                })}
              </section>

              {currentAnswer ? (
                <section className="feedback-zone resolver-actions">
                  <div className={currentAnswer.isCorrect ? "result-card correct" : "result-card incorrect"}>
                    <strong>{currentAnswer.status === "timeout" ? "TEMPO ESGOTADO" : currentAnswer.isCorrect ? "CORRETA" : "INCORRETA"}</strong>
                    <span>{currentAnswer.score.toFixed(1)} ponto(s)</span>
                  </div>
                  <div className="resolver-nav-actions" ref={actionsRef}>
                    <button disabled={student.currentIndex === 0} onClick={() => goToIndex(student.currentIndex - 1)} type="button">
                      <ChevronLeft size={18} /> Anterior
                    </button>
                    <button onClick={() => setShowResolution(true)} type="button">
                      <BookOpen size={18} /> Revisar
                    </button>
                    <button disabled={student.answers.length >= questions.length} onClick={goToNextQuestion} type="button">
                      Proxima <ChevronRight size={18} />
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>

        {currentQuestion && !currentAnswer && !completed ? (
          <button
            className={selectedOptionId ? "floating-confirm-button ready" : "floating-confirm-button"}
            disabled={!selectedOptionId || remainingSeconds === 0}
            onClick={() => selectedOptionId && recordAnswer(selectedOptionId)}
            type="button"
            aria-label="Confirmar resposta"
          >
            <Check size={28} />
          </button>
        ) : null}
        {answerFlash ? <AnswerFlash isCorrect={answerFlash.isCorrect} score={answerFlash.score} timeout={answerFlash.timeout} /> : null}
      </section>

      <aside className="resolver-ranking">
        <section className="scoreboard-panel game-board resolver-scoreboard-panel">
          <span className="eyebrow"><Trophy size={16} /> Ranking individual</span>
          {podiumSlots.length > 0 ? (
            <section className="podium-strip resolver-podium-strip" aria-label="Top 3 alunos">
              {podiumSlots.map(({ item, rank }) => (
                <article className={`podium-card podium-rank-${rank}`} key={item.id}>
                  <div className="podium-portrait">
                    <img className="podium-medal-image" alt={podiumRankLabel(rank)} src={medalSrc(rank)} />
                    <AvatarBadge avatarId={item.avatarId} className="podium-avatar" name={item.nickname} />
                  </div>
                  <strong>{item.nickname}</strong>
                  <span><i aria-hidden="true" />{item.totalScore.toFixed(1)}</span>
                  <small>{item.answeredCount} questoes</small>
                </article>
              ))}
            </section>
          ) : null}
          {individualRanking.length > 3 ? (
            <div className="game-section-title">
              <span />
              <strong>Top Ranking Alunos</strong>
              <span />
            </div>
          ) : null}
          {individualRanking.length === 0 ? <p className="empty-ranking">O ranking aparece apos a primeira resposta.</p> : null}
          {individualRanking.slice(3, 10).map((item, offset) => {
            const index = 3 + offset;
            return (
            <article className={item.id === student.id ? `broadcast-score-row resolver-score-row active rank-${Math.min(index + 1, 9)}` : `broadcast-score-row resolver-score-row rank-${Math.min(index + 1, 9)}`} key={item.id}>
              <AvatarBadge avatarId={item.avatarId} className="game-avatar small" name={item.nickname} />
              <div className="broadcast-team">
                <strong>{item.nickname}</strong>
                <span><i aria-hidden="true" /> {item.totalScore.toFixed(1)} pts</span>
                <small>{item.answeredCount} questoes resolvidas</small>
              </div>
              <div className="rank-laurel">
                <span>{rankLabel(index)}</span>
              </div>
            </article>
          )})}
        </section>
        <section className="scoreboard-panel compact game-board resolver-stats-panel">
          <span className="eyebrow">Seu desempenho</span>
          <div className="resolver-stat-grid">
            <div><span>Total</span><strong>{totalScore.toFixed(1)}</strong></div>
            <div><span>Questao</span><strong>{questionNumber}/{questions.length}</strong></div>
          </div>
        </section>
      </aside>

      {showResolution && currentQuestion ? (
        <ResolutionModal
          answer={currentAnswer}
          comment={commentsByQuestion.get(currentQuestion.id)}
          onClose={() => setShowResolution(false)}
          question={currentQuestion}
        />
      ) : null}
    </main>
  );
}

function ResolutionModal({
  answer,
  comment,
  onClose,
  question
}: {
  answer: ResolverAnswer | null;
  comment: QuestionComment | undefined;
  onClose: () => void;
  question: QuizQuestion;
}) {
  useEffect(() => {
    const closeOnKey = () => onClose();
    window.addEventListener("keydown", closeOnKey);
    return () => window.removeEventListener("keydown", closeOnKey);
  }, [onClose]);

  return (
    <div className="avatar-modal-backdrop resolver-resolution-backdrop" onClick={onClose} role="presentation">
      <section className="question-comment-modal resolver-resolution-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <span className="eyebrow">Resolucao {question.id}</span>
            <h2>Comentário da questão</h2>
          </div>
          <button onClick={onClose} type="button"><X size={22} /> Fechar</button>
        </header>
        <div className="resolver-resolution-content">
          <div className="resolution-summary">
            <strong>Gabarito: {comment?.correctOptionId ?? question.correctOptionId}</strong>
            <p>{comment?.correctOptionText ?? question.options.find((option) => option.id === question.correctOptionId)?.text}</p>
            {answer ? <span>Sua resposta: {answer.selectedOptionId === "TIMEOUT" ? "Tempo esgotado" : answer.selectedOptionId}</span> : null}
          </div>
          <article>
            <h3>Ponto-chave</h3>
            <p>{comment?.teachingPoint ?? question.explanation}</p>
          </article>
          <div className="resolution-options">
            {(comment?.alternativeComments ?? question.options.map((option) => ({
              optionId: option.id,
              optionText: option.text,
              isCorrect: option.id === question.correctOptionId,
              comment: option.id === question.correctOptionId ? question.explanation : "Revise a alternativa em comparacao com o gabarito."
            }))).map((alternative) => (
              <article className={alternative.isCorrect ? "resolution-option correct" : "resolution-option"} key={alternative.optionId}>
                <strong>{alternative.optionId}</strong>
                <p>{alternative.comment}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AnswerFlash({ isCorrect, score, timeout }: { isCorrect: boolean; score: number; timeout?: boolean }) {
  return (
    <div className={isCorrect ? "answer-flash correct" : "answer-flash incorrect"} role="status" aria-live="polite">
      <span>{isCorrect ? <Check size={56} /> : <X size={56} />}</span>
      <strong>{timeout ? "Tempo esgotado" : isCorrect ? "Correta" : "Incorreta"}</strong>
      <em>{score.toFixed(1)} pts</em>
    </div>
  );
}

function getDisplayOptions(question: QuizQuestion, studentId: string) {
  void studentId;
  return question.options.map((option, index) => ({
    option,
    displayId: DISPLAY_OPTION_IDS[index] ?? option.id
  }));
}

function buildResolverReportHtml({
  commentsByQuestion,
  questionsById,
  student,
  totalQuestions,
  totalScore
}: {
  commentsByQuestion: Map<string, QuestionComment>;
  questionsById: Map<string, QuizQuestion>;
  student: ResolverStudent;
  totalQuestions: number;
  totalScore: number;
}) {
  const answersByQuestion = new Map(student.answers.map((answer) => [answer.questionId, answer]));
  const answeredQuestions = student.questionOrder
    .map((questionId) => {
      const question = questionsById.get(questionId);
      const answer = answersByQuestion.get(questionId);
      if (!question || !answer) return null;
      return { answer, question };
    })
    .filter((item): item is { answer: ResolverAnswer; question: QuizQuestion } => Boolean(item));
  const correctCount = student.answers.filter((answer) => answer.isCorrect).length;
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date());

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>QuestMED - Respostas de ${escapeHtml(student.nickname)}</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      color: #172033;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      margin: 0;
    }
    header {
      border-bottom: 2px solid #1b8a5a;
      margin-bottom: 18px;
      padding-bottom: 14px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { color: #106642; font-size: 24px; margin-bottom: 6px; }
    h2 { color: #106642; font-size: 16px; margin-bottom: 8px; }
    h3 { font-size: 13px; margin-bottom: 4px; }
    .summary {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(4, 1fr);
      margin-top: 14px;
    }
    .summary div {
      border: 1px solid #d7e3df;
      border-radius: 6px;
      padding: 8px;
    }
    .summary span {
      color: #5b6677;
      display: block;
      font-size: 10px;
      text-transform: uppercase;
    }
    .summary strong { display: block; font-size: 15px; margin-top: 2px; }
    article {
      border: 1px solid #dfe7e4;
      border-radius: 8px;
      margin: 0 0 14px;
      padding: 14px;
      page-break-inside: avoid;
    }
    .meta {
      color: #5b6677;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .statement { font-size: 13px; margin-bottom: 10px; }
    .answer {
      background: #f4faf7;
      border-left: 4px solid #1b8a5a;
      margin: 10px 0;
      padding: 8px 10px;
    }
    .answer.incorrect { border-left-color: #cf3d3d; }
    .answer.timeout { border-left-color: #c27b16; }
    .option-list { margin: 8px 0 0; padding-left: 0; }
    .option-list li { list-style: none; margin: 0 0 5px; }
    .comment-block {
      background: #f7f9fb;
      border-radius: 6px;
      margin-top: 10px;
      padding: 10px;
    }
    .alternative-comment {
      border-top: 1px solid #dfe7e4;
      margin-top: 8px;
      padding-top: 8px;
    }
    .correct-label { color: #106642; font-weight: 700; }
    .muted { color: #5b6677; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header>
    <h1>QuestMED Quiz - Relatorio do resolvedor</h1>
    <p><strong>${escapeHtml(student.nickname)}</strong> - ${escapeHtml(student.ubsName)}</p>
    <p class="muted">Gerado em ${escapeHtml(generatedAt)}</p>
    <section class="summary" aria-label="Resumo">
      <div><span>Respondidas</span><strong>${student.answers.length}/${totalQuestions}</strong></div>
      <div><span>Acertos</span><strong>${correctCount}</strong></div>
      <div><span>Erros</span><strong>${student.answers.length - correctCount}</strong></div>
      <div><span>Pontuacao</span><strong>${totalScore.toFixed(1)}</strong></div>
    </section>
  </header>
  <main>
    ${answeredQuestions.map(({ answer, question }, index) => renderResolverReportQuestion(question, answer, commentsByQuestion.get(question.id), index)).join("")}
  </main>
</body>
</html>`;
}

function renderResolverReportQuestion(question: QuizQuestion, answer: ResolverAnswer, comment: QuestionComment | undefined, index: number) {
  const selectedOption = answer.selectedOptionId === "TIMEOUT"
    ? null
    : question.options.find((option) => option.id === answer.selectedOptionId);
  const answerClass = answer.status === "timeout" ? "timeout" : answer.isCorrect ? "" : "incorrect";
  const selectedLabel = answer.selectedOptionId === "TIMEOUT"
    ? "Tempo esgotado"
    : `${answer.selectedOptionId}) ${selectedOption?.text ?? "Alternativa nao localizada"}`;
  const fallbackAlternativeComments = question.options.map((option) => ({
    optionId: option.id,
    isCorrect: option.id === question.correctOptionId,
    comment: option.id === question.correctOptionId ? question.explanation : "Revise a alternativa em comparacao com o gabarito."
  }));
  const alternativeComments = comment?.alternativeComments ?? fallbackAlternativeComments;

  return `<article>
    <div class="meta">
      <span>Questao ${index + 1}</span>
      <span>${escapeHtml(question.id)}</span>
      <span>${escapeHtml(question.theme)}</span>
    </div>
    <p class="statement">${escapeHtml(question.statement)}</p>
    <ul class="option-list">
      ${question.options.map((option) => `<li><strong>${escapeHtml(option.id)})</strong> ${escapeHtml(option.text)}</li>`).join("")}
    </ul>
    <div class="answer ${answerClass}">
      <h3>Resposta do aluno</h3>
      <p>${escapeHtml(selectedLabel)}</p>
      <p><strong>${answer.status === "timeout" ? "Tempo esgotado" : answer.isCorrect ? "Correta" : "Incorreta"}</strong> - ${answer.score.toFixed(1)} ponto(s)</p>
    </div>
    <div class="comment-block">
      <h3>Explicacao</h3>
      <p><strong>Gabarito: ${escapeHtml(comment?.correctOptionId ?? question.correctOptionId)}</strong> - ${escapeHtml(comment?.correctOptionText ?? question.options.find((option) => option.id === question.correctOptionId)?.text ?? "")}</p>
      <p>${escapeHtml(comment?.teachingPoint ?? question.explanation)}</p>
      ${alternativeComments.map((alternative) => `<div class="alternative-comment">
        <p><strong class="${alternative.isCorrect ? "correct-label" : ""}">${escapeHtml(alternative.optionId)}</strong> ${alternative.isCorrect ? "<span class=\"correct-label\">correta</span>" : ""}</p>
        <p>${escapeHtml(alternative.comment)}</p>
      </div>`).join("")}
    </div>
  </article>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function shuffleQuestions(items: string[], seedText: string) {
  return seededShuffle(items, seedText);
}

function seededShuffle<T>(items: T[], seedText: string) {
  const nextItems = [...items];
  let seed = hashSeed(seedText);
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    seed = nextRandomSeed(seed);
    const swapIndex = seed % (index + 1);
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandomSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
