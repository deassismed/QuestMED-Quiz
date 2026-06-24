"use client";

import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, RotateCcw, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { AvatarBadge } from "./AvatarBadge";
import { AVATAR_PRESETS, DEFAULT_AVATAR_ID } from "../lib/avatars";
import type { QuestionComment, QuestionOption, QuizQuestion } from "../types";

const RESOLVER_TABLE_KEY = "questmed-resolver-table";
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

type ResolverStep = "identify" | "quiz";
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

function calculateAnswerScore(isCorrect: boolean, elapsedSeconds: number) {
  if (!isCorrect) return 0;
  const clampedElapsed = Math.min(Math.max(elapsedSeconds, 0), QUESTION_TIME_LIMIT_SECONDS);
  const remainingRatio = Math.max(0, QUESTION_TIME_LIMIT_SECONDS - clampedElapsed) / QUESTION_TIME_LIMIT_SECONDS;
  return Number((10 * remainingRatio).toFixed(1));
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
  const [nickname, setNickname] = useState("");
  const [ubsName, setUbsName] = useState(UBS_OPTIONS[0]);
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [table, setTable] = useState<ResolverTable>(createEmptyTable);
  const [student, setStudent] = useState<ResolverStudent | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<QuestionOption["id"] | "">("");
  const [remainingSeconds, setRemainingSeconds] = useState(QUESTION_TIME_LIMIT_SECONDS);
  const [showResolution, setShowResolution] = useState(false);
  const [answerFlash, setAnswerFlash] = useState<{ isCorrect: boolean; score: number; timeout?: boolean } | null>(null);
  const [error, setError] = useState("");
  const timerStartedAtRef = useRef<number | null>(null);
  const timeoutQuestionRef = useRef("");

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
  const averageScore = student?.answers.length ? (student.answers.reduce((sum, answer) => sum + answer.score, 0) / student.answers.length) : 0;
  const totalScore = student?.answers.reduce((sum, answer) => sum + answer.score, 0) ?? 0;
  const individualRanking = useMemo(() => {
    return [...table.students]
      .filter((item) => item.answers.length > 0)
      .map((item) => ({
        ...item,
        averageScore: item.answers.reduce((sum, answer) => sum + answer.score, 0) / item.answers.length
      }))
      .sort((a, b) => b.averageScore - a.averageScore || b.answers.length - a.answers.length || a.nickname.localeCompare(b.nickname));
  }, [table.students]);
  const currentRank = student ? Math.max(1, individualRanking.findIndex((item) => item.id === student.id) + 1 || 1) : 1;

  useEffect(() => {
    setTable(readResolverTable());
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

  function persistStudent(nextStudent: ResolverStudent) {
    const nextTable = readResolverTable();
    const existingIndex = nextTable.students.findIndex((item) => item.id === nextStudent.id);
    if (existingIndex >= 0) nextTable.students[existingIndex] = nextStudent;
    else nextTable.students.push(nextStudent);
    writeResolverTable(nextTable);
    setTable(nextTable);
    setStudent(nextStudent);
  }

  function submitIdentification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextNickname = normalizeName(nickname).trim();
    if (!nextNickname) {
      setError("Informe seu nome para continuar.");
      return;
    }
    setError("");
    const nextTable = readResolverTable();
    const key = getStudentKey(nextNickname, ubsName);
    const existing = nextTable.students.find((item) => getStudentKey(item.nickname, item.ubsName) === key);
    if (existing) {
      const updated = { ...existing, avatarId, updatedAt: new Date().toISOString() };
      persistStudent(updated);
      setStep("quiz");
      return;
    }
    const now = new Date().toISOString();
    const nextStudent: ResolverStudent = {
      id: `resolver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  function goToNextQuestion() {
    if (!student) return;
    const nextUnansweredIndex = student.questionOrder.findIndex((questionId, index) => index > student.currentIndex && !answeredIds.has(questionId));
    if (nextUnansweredIndex >= 0) {
      goToIndex(nextUnansweredIndex);
      return;
    }
    const firstUnansweredIndex = student.questionOrder.findIndex((questionId) => !answeredIds.has(questionId));
    if (firstUnansweredIndex >= 0) goToIndex(firstUnansweredIndex);
  }

  function restartBank() {
    if (!student) return;
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

  if (step === "identify") {
    return (
      <main className="app-shell resolver-entry-shell">
        <section className="entry-panel resolver-entry-panel">
          <span className="eyebrow">QuestMED Quiz</span>
          <h1>Resolver questoes</h1>
          <form className="entry-form stacked" onSubmit={submitIdentification}>
            <input
              autoFocus
              onChange={(event) => setNickname(normalizeName(event.currentTarget.value))}
              onInput={(event) => setNickname(normalizeName(event.currentTarget.value))}
              placeholder="SEU NOME"
              type="text"
              value={nickname}
            />
            <label className="resolver-select-label">
              <span>Escolha sua UBS</span>
              <select onChange={(event) => setUbsName(event.currentTarget.value)} value={ubsName}>
                {UBS_OPTIONS.map((ubs) => <option key={ubs} value={ubs}>{ubs}</option>)}
              </select>
            </label>
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
          {error ? <p className="entry-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  if (!student) return null;

  return (
    <main className="quiz-shell resolver-shell">
      <section className="phone-stage resolver-stage" aria-label="Resolver questoes">
        <header className="topbar">
          <AvatarBadge avatarId={student.avatarId} className="player-avatar" name={student.nickname} />
          <div>
            <p className="eyebrow">{student.ubsName}</p>
            <h1>{student.nickname}</h1>
          </div>
          <div className="score-chip rank-chip">
            <span>{currentRank}o</span>
            <strong>{averageScore.toFixed(1)}</strong>
            <em className={remainingSeconds <= 15 && !currentAnswer ? "score-timer danger" : "score-timer"}>
              <Clock3 size={15} /> {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}
            </em>
          </div>
        </header>

        <div className="question-scroll">
          <div className="meta-row">
            <span className="id-pill">{currentQuestion?.id ?? "----"}</span>
            <span className="area-pill">{currentQuestion?.theme ?? "Banco de questoes"}</span>
            <span className="progress-pill">{student.answers.length}/{questions.length}</span>
          </div>

          {completed ? (
            <section className="completion-panel resolver-completion">
              <span className="eyebrow">Banco concluido</span>
              <h2>Voce finalizou todas as questoes</h2>
              <div className="completion-summary">
                <div><span>Respondidas</span><strong>{student.answers.length}</strong></div>
                <div><span>Acertos</span><strong>{student.answers.filter((answer) => answer.isCorrect).length}</strong></div>
                <div><span>Media</span><strong>{averageScore.toFixed(1)}</strong></div>
              </div>
              <button className="resolver-primary-action" onClick={restartBank} type="button">
                <RotateCcw size={18} /> Recomecar
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
                  <div className="resolver-nav-actions">
                    <button disabled={student.currentIndex === 0} onClick={() => goToIndex(student.currentIndex - 1)} type="button">
                      <ChevronLeft size={18} /> Anterior
                    </button>
                    <button onClick={() => setShowResolution(true)} type="button">
                      <BookOpen size={18} /> Resolucao
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

      <aside className="live-panel resolver-ranking">
        <section>
          <span className="eyebrow"><Trophy size={16} /> Ranking individual</span>
          {individualRanking.length === 0 ? <p className="empty-ranking">O ranking aparece apos a primeira resposta.</p> : null}
          {individualRanking.slice(0, 10).map((item, index) => (
            <div className={item.id === student.id ? "rank-row active" : "rank-row"} key={item.id}>
              <strong>{index + 1}</strong>
              <span>{item.nickname}<small>{item.ubsName} · {item.answers.length} resp.</small></span>
              <b>{item.averageScore.toFixed(1)}</b>
            </div>
          ))}
        </section>
        <section>
          <span className="eyebrow">Seu desempenho</span>
          <div className="resolver-stat-grid">
            <div><span>Media</span><strong>{averageScore.toFixed(1)}</strong></div>
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
  return (
    <div className="avatar-modal-backdrop" onClick={onClose} role="presentation">
      <section className="question-comment-modal resolver-resolution-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <span className="eyebrow">Resolucao {question.id}</span>
            <h2>{question.theme}</h2>
          </div>
          <button onClick={onClose} type="button" aria-label="Fechar"><X size={22} /></button>
        </header>
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
